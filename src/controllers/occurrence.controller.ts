import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { parsePagination, parseCoordinates } from "../utils/queryParsers.js";

// --- Shared occurrence select
const occurrenceSelect = {
  id: true,
  plant: {
    select: {
      id: true,
      scientificName: true,
      commonName: true,
      family: true,
      conservationStatus: true,
    },
  },
  region: { select: { id: true, name: true, code: true } },
  latitude: true,
  longitude: true,
  recordedDate: true,
  basisOfRecord: true,
  dataProvider: true,
  externalId: true,
  createdAt: true,
};

const findFullOccurrence = async (id: string) => {
  return prisma.occurrence.findUnique({
    where: { id },
    select: occurrenceSelect,
  });
};

const mapRawOccurrence = (r: any) => ({
  id: r.id,
  plant: {
    id: r.plant_id,
    scientificName: r.scientific_name,
    commonName: r.common_name,
    family: r.family,
    conservationStatus: r.conservation_status ?? null,
  },
  region: r.region_id ? { id: r.region_id, name: r.name ?? null, code: r.code ?? null } : null,
  latitude: r.latitude,
  longitude: r.longitude,
  recordedDate: r.recorded_date ?? null,
  basisOfRecord: r.basis_of_record ?? null,
  dataProvider: r.data_provider ?? null,
  externalId: r.external_id ?? null,
  createdAt: r.created_at,
  ...(r.distance_km !== undefined && { distance_km: Number(r.distance_km) }),
});

// --- Helper: match regionId from regionCode
const resolveRegionId = async (regionCode: string | undefined): Promise<string | null> => {
  if (!regionCode) return null;

  const region = await prisma.region.findFirst({
    where: { code: { equals: regionCode, mode: "insensitive" } },
  });

  if (!region) {
    throw new Error("Region not found");
  }

  return region.id;
};

// --- Get all occurences with pagination and filtering options

export const getAllOccurrences = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { page, limit, skip } = parsePagination(req, 20);
    const plantId = req.query.plantId as string | undefined;
    const regionId = req.query.regionId as string | undefined;

    // Check plant and region exist
    if (plantId) {
      const plant = await prisma.plant.findUnique({
        where: { id: plantId },
      });
      if (!plant) {
        res.status(404).json({ error: "Plant not found" });
        return;
      }
    }
    if (regionId) {
      const region = await prisma.region.findUnique({
        where: { id: regionId },
      });
      if (!region) {
        res.status(404).json({ error: "Region not found" });
        return;
      }
    }

    const where = {
      ...(plantId && { plantId }),
      ...(regionId && { regionId }),
    };

    const [occurrences, total] = await prisma.$transaction([
      prisma.occurrence.findMany({
        where,
        skip,
        take: limit,
        orderBy: { recordedDate: "desc" },
        select: occurrenceSelect,
      }),
      prisma.occurrence.count({ where }),
    ]);

    res.json({
      total,
      pagination: { page, limit, totalPages: Math.ceil(total / limit) },
      data: occurrences,
    });
  } catch (err) {
    next(err);
  }
};

// --- Get all occurences of a specific plant

export const getOccurrencesByPlant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { plantId } = req.params;
    const { page, limit, skip } = parsePagination(req, 20);

    const plant = await prisma.plant.findUnique({ where: { id: plantId as string } });
    if (!plant) {
      res.status(404).json({ error: "Plant not found" });
      return;
    }

    const where = { plantId: plantId as string };
    const [occurrences, total] = await prisma.$transaction([
      prisma.occurrence.findMany({
        where,
        skip,
        take: limit,
        orderBy: { recordedDate: "desc" },
        select: occurrenceSelect,
      }),
      prisma.occurrence.count({ where }),
    ]);

    res.json({
      total,
      pagination: { page, limit, totalPages: Math.ceil(total / limit) },
      data: occurrences,
    });
  } catch (err) {
    next(err);
  }
};

// --- Get nearby occurrences of a coordinate (latitude, longitude)

export const getNearbyOccurrences = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { lat, lng, radiusKm, error } = parseCoordinates(req);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    const radiusMetres = radiusKm * 1000;

    const results: Array<any> = await prisma.$queryRaw`
      SELECT
        o.id,
        o.plant_id,
        p.scientific_name,
        p.common_name,
        p.family,
        p.conservation_status,
        o.region_id,
        r.name,
        r.code,
        o.latitude,
        o.longitude,
        o.recorded_date,
        o.basis_of_record,
        o.data_provider,
        o.external_id,
        o.created_at,
        -- calculate the distance between the specified location and the occurence (in km)
        ROUND(
          (ST_Distance(
            o.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) / 1000)::numeric,
          2
        ) AS distance_km
      FROM occurrences o
      JOIN plants p ON p.id = o.plant_id
      JOIN regions r ON r.id = o.region_id
      -- check if the specified location falls within the radius
      WHERE ST_DWithin(
        o.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMetres}
      )
      ORDER BY distance_km ASC
      LIMIT 50
    `;

    const data = results.map(mapRawOccurrence);

    res.json({
      total: data.length,
      meta: {
        lat,
        lng,
        radiusKm,
      },
      data,
    });
  } catch (err) {
    next(err);
  }
};

// --- Get occurrences in bounding box

export const getOccurrencesInBbox = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const minLng = Number.parseFloat(req.query.minLng as string);
    const minLat = Number.parseFloat(req.query.minLat as string);
    const maxLng = Number.parseFloat(req.query.maxLng as string);
    const maxLat = Number.parseFloat(req.query.maxLat as string);

    if ([minLng, minLat, maxLng, maxLat].some(Number.isNaN)) {
      res.status(400).json({ error: "minLng, minLat, maxLng, maxLat are all required" });
      return;
    }

    const results: Array<any> = await prisma.$queryRaw`
      SELECT
        o.id,
        o.plant_id,
        p.scientific_name,
        p.common_name,
        p.family,
        p.conservation_status,
        o.region_id,
        r.name,
        r.code,
        o.latitude,
        o.longitude,
        o.recorded_date,
        o.basis_of_record,
        o.data_provider,
        o.external_id,
        o.created_at
      FROM occurrences o
      JOIN plants p ON p.id = o.plant_id
      JOIN regions r ON r.id = o.region_id
      -- check if the specified location falls within the bounding box
      WHERE o.location && ST_MakeEnvelope( -- create the rectangular bounding box
        ${minLng}, -- left edge
        ${minLat}, -- bottom edge
        ${maxLng}, -- right edge
        ${maxLat}, -- top edge
        4326
      )::geography
      ORDER BY o.recorded_date DESC
      LIMIT 100
    `;

    res.json({ data: results.map(mapRawOccurrence) });
  } catch (err) {
    next(err);
  }
};

// --- Create an occurence

export const createOccurrence = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      plantId,
      latitude,
      longitude,
      recordedDate,
      basisOfRecord,
      dataProvider,
      externalId,
      regionCode,
    } = req.body;

    if (!plantId || latitude === undefined || longitude === undefined) {
      res.status(400).json({ error: "plantId, latitude and longitude are required" });
      return;
    }

    const plant = await prisma.plant.findUnique({ where: { id: plantId } });
    if (!plant) {
      res.status(404).json({ error: "Plant not found" });
      return;
    }

    let regionId: string | null = null;
    try {
      regionId = await resolveRegionId(regionCode);
    } catch (err) {
      res.status(404).json({ error: "Region not found" });
      return;
    }

    // 1 - create the row (all fields except location)
    const occurrence = await prisma.occurrence.create({
      data: {
        plantId,
        latitude,
        longitude,
        regionId,
        recordedDate: recordedDate ? new Date(recordedDate) : null,
        basisOfRecord,
        dataProvider,
        externalId,
      },
    });

    // 2 - update the PostGIS location column
    await prisma.$executeRaw`
      UPDATE occurrences
      SET location = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      WHERE id = ${occurrence.id}
    `;

    // 3 - fetch the full occurrence with plant and region data
    const fullOccurrence = await findFullOccurrence(occurrence.id);
    res.status(201).json({ data: fullOccurrence });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "An occurrence with that externalId already exists" });
      return;
    }
    next(err);
  }
};

// --- Update an occurence (without updating the plant)

export const updateOccurrence = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      plantId,
      latitude,
      longitude,
      recordedDate,
      basisOfRecord,
      dataProvider,
      externalId,
      regionCode,
    } = req.body;

    const existingOccurrence = await prisma.occurrence.findUnique({ where: { id: id as string } });
    if (!existingOccurrence) {
      res.status(404).json({ error: "Occurrence not found" });
      return;
    }

    if (plantId !== undefined && plantId !== existingOccurrence.plantId) {
      res.status(400).json({ error: "Cannot change plantId for an occurrence" });
      return;
    }

    let regionId: string | null | undefined = undefined;
    if (regionCode !== undefined) {
      try {
        regionId = await resolveRegionId(regionCode);
      } catch (err) {
        res.status(404).json({ error: "Region not found" });
        return;
      }
    }

    const occurrence = await prisma.occurrence.update({
      where: { id: id as string },
      data: {
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude }),
        ...(recordedDate !== undefined && {
          recordedDate: recordedDate ? new Date(recordedDate) : null,
        }),
        ...(basisOfRecord !== undefined && { basisOfRecord }),
        ...(dataProvider !== undefined && { dataProvider }),
        ...(externalId !== undefined && { externalId }),
        ...(regionId !== undefined && { regionId }),
      },
    });

    if (latitude !== undefined || longitude !== undefined) {
      await prisma.$executeRaw`
        UPDATE occurrences
        SET location = ST_SetSRID(ST_MakePoint(${occurrence.longitude}, ${occurrence.latitude}), 4326)::geography
        WHERE id = ${occurrence.id}
      `;
    }

    // Fetch the full occurrence with plant and region data
    const fullOccurrence = await findFullOccurrence(occurrence.id);
    res.json({ data: fullOccurrence });
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Occurrence not found" });
      return;
    }
    if (err.code === "P2002") {
      res.status(409).json({ error: "An occurrence with that externalId already exists" });
      return;
    }
    next(err);
  }
};

// --- Delete an occurence

export const deleteOccurrence = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.occurrence.delete({ where: { id: id as string } });

    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Occurrence not found" });
      return;
    }
    next(err);
  }
};

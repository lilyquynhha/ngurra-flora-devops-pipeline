import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { ConservationStatus } from "../prisma/generated/prisma/enums.js";
import { TransactionClient } from "../prisma/generated/prisma/internal/prismaNamespace.js";

// --- Get all plants with filtering options and pagination

export const getAllPlants = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Get the query params for pagination
    let page = Number.parseInt(req.query.page as string) || 1;
    let limit = Number.parseInt(req.query.limit as string) || 20;

    // Validate positive integers
    if (page < 1 || !Number.isInteger(page)) page = 1;
    if (limit < 1 || !Number.isInteger(limit)) limit = 20;

    const skip = (page - 1) * limit;

    // Get the query params for filtering options
    const regionId = req.query.region as string | undefined;
    const tagId = req.query.tag as string | undefined;
    const status = req.query.status as ConservationStatus | undefined;
    const search = req.query.search as string | undefined;

    // Filtering options
    const where = {
      ...(status && { conservationStatus: status }),
      ...(search && {
        OR: [
          { scientificName: { contains: search, mode: "insensitive" as const } },
          { commonName: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(regionId && {
        plantRegions: { some: { regionId } },
      }),
      ...(tagId && {
        plantTags: { some: { tagId } },
      }),
    };

    const plants = await prisma.plant.findMany({
      where,
      skip,
      take: limit,
      orderBy: { scientificName: "asc" },
      include: {
        plantRegions: {
          select: { region: { select: { id: true, name: true, code: true } } },
        },
        plantTags: {
          select: { tag: { select: { id: true, name: true } } },
        },
        _count: { select: { occurrences: true } },
      },
    });

    res.json({
      total: plants.length,
      data: plants,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(plants.length / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// --- Get an existing plant by ID

export const getPlantById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const plant = await prisma.plant.findUnique({
      where: { id: id as string },
      include: {
        plantRegions: {
          select: { region: { select: { id: true, name: true, code: true } } },
        },
        plantTags: {
          select: { tag: { select: { id: true, name: true } } },
        },
        occurrences: {
          take: 10,
          orderBy: { recordedDate: "desc" },
          select: {
            id: true,
            latitude: true,
            longitude: true,
            recordedDate: true,
            basisOfRecord: true,
            dataProvider: true,
          },
        },
      },
    });

    if (!plant) {
      res.status(404).json({ error: "Plant not found" });
      return;
    }

    res.json({ data: plant });
  } catch (err) {
    next(err);
  }
};

// --- Get distinct plants observed near a coordinate

export const getNearbyPlants = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const lat = Number.parseFloat(req.query.lat as string);
    const lng = Number.parseFloat(req.query.lng as string);
    const radiusKm = Number.parseFloat(req.query.radius as string) || 50;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      res.status(400).json({ error: "lat and lng are required numeric values" });
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: "lat must be -90 to 90, lng must be -180 to 180" });
      return;
    }

    const radiusMetres = radiusKm * 1000;

    const results: Array<{
      id: string;
      scientific_name: string;
      common_name: string | null;
      family: string | null;
      conservation_status: string;
      occurrence_count: number;
      nearest_sighting_km: number;
    }> = await prisma.$queryRaw`
      SELECT
        p.id,
        p.scientific_name,
        p.common_name,
        p.family,
        p.conservation_status,
        -- count number of occurences per plant
        COUNT(o.id)::int AS occurrence_count,
        -- get the closest occurence
        ROUND(
          (MIN(ST_Distance(
            o.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          )) / 1000)::numeric,
          2
        ) AS nearest_sighting_km
      FROM plants p
      JOIN occurrences o ON o.plant_id = p.id
      WHERE ST_DWithin(
        o.location,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMetres}
      )
      GROUP BY p.id, p.scientific_name, p.common_name, p.family,
               p.conservation_status
      ORDER BY nearest_sighting_km ASC
      LIMIT 30
    `;

    res.json({
      total: results.length,
      data: results,
      meta: { lat, lng, radiusKm },
    });
  } catch (err) {
    next(err);
  }
};

// --- Create a new plant

export const createPlant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const {
      scientificName,
      commonName,
      family,
      genus,
      author,
      conservationStatus,
      description,
      imageUrl,
      externalId,
      regionIds,
      tagIds,
    } = req.body;

    if (!scientificName) {
      res.status(400).json({ error: "scientificName is required" });
      return;
    }

    const plant = await prisma.plant.create({
      data: {
        scientificName,
        commonName,
        family,
        genus,
        author,
        conservationStatus,
        description,
        imageUrl,
        externalId,
        createdById: req.user!.userId,
        ...(regionIds?.length && {
          plantRegions: {
            create: regionIds.map((regionId: string) => ({ regionId })),
          },
        }),
        ...(tagIds?.length && {
          plantTags: {
            create: tagIds.map((tagId: string) => ({ tagId })),
          },
        }),
      },
      include: {
        plantRegions: { select: { region: { select: { id: true, name: true, code: true } } } },
        plantTags: { select: { tag: { select: { id: true, name: true } } } },
      },
    });

    res.status(201).json({ data: plant });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "A plant with the same scientific name already exists" });
      return;
    }
    if (err.code === "P2003") {
      res.status(400).json({ error: "Invalid region ID(s) or tag ID(s)" });
      return;
    }
    next(err);
  }
};

// --- Update an existing plant

export const updatePlant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      scientificName,
      commonName,
      family,
      genus,
      author,
      conservationStatus,
      description,
      imageUrl,
      regionIds,
      tagIds,
    } = req.body;

    const plant = await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.plant.update({
        where: { id: id as string },
        data: {
          ...(scientificName && { scientificName }),
          ...(commonName !== undefined && { commonName }),
          ...(family !== undefined && { family }),
          ...(genus !== undefined && { genus }),
          ...(author !== undefined && { author }),
          ...(conservationStatus && { conservationStatus }),
          ...(description !== undefined && { description }),
          ...(imageUrl !== undefined && { imageUrl }),
        },
      });

      // Replace region associations if regionIds was passed
      if (regionIds !== undefined) {
        await tx.plantRegion.deleteMany({ where: { plantId: id as string } });

        if (regionIds.length > 0) {
          await tx.plantRegion.createMany({
            data: regionIds.map((regionId: string) => ({
              plantId: id as string,
              regionId,
            })),
          });
        }
      }

      // Replace tag associations if tagIds was passed
      if (tagIds !== undefined) {
        await tx.plantTag.deleteMany({ where: { plantId: id as string } });

        if (tagIds.length > 0) {
          await tx.plantTag.createMany({
            data: tagIds.map((tagId: string) => ({
              plantId: id as string,
              tagId,
            })),
          });
        }
      }

      return tx.plant.findUnique({
        where: { id: id as string },
        include: {
          plantRegions: {
            select: { region: { select: { id: true, name: true, code: true } } },
          },
          plantTags: {
            select: { tag: { select: { id: true, name: true } } },
          },
        },
      });
    });

    res.json({ data: plant });
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Plant not found" });
      return;
    }
    if (err.code === "P2003") {
      res.status(400).json({ error: "Invalid region ID(s) or tag ID(s)" });
      return;
    }
    next(err);
  }
};

// --- Delete an existing plant

export const deletePlant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.plant.delete({ where: { id: id as string } });

    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Plant not found" });
      return;
    }
    next(err);
  }
};

// --- Link a plant to a region

export const linkPlantToRegion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, regionId } = req.params;

    await prisma.plantRegion.create({
      data: { plantId: id as string, regionId: regionId as string },
    });

    res.status(201).json({ data: { plantId: id, regionId } });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Plant already linked to this region" });
      return;
    }
    if (err.code === "P2003") {
      res.status(404).json({ error: "Plant or region not found" });
      return;
    }
    next(err);
  }
};

// --- Unlink a plant from a region

export const unlinkPlantFromRegion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, regionId } = req.params;

    const plant = await prisma.plant.findUnique({
      where: { id: id as string },
    });

    if (!plant) {
      res.status(404).json({ error: "Plant not found" });
      return;
    }

    const region = await prisma.region.findUnique({
      where: { id: regionId as string },
    });

    if (!region) {
      res.status(404).json({ error: "Region not found" });
      return;
    }

    await prisma.plantRegion.delete({
      where: { plantId_regionId: { plantId: id as string, regionId: regionId as string } },
    });

    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Plant not linked to this region" });
      return;
    }
    next(err);
  }
};

// --- Link plant to a tag

export const linkPlantToTag = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, tagId } = req.params;

    await prisma.plantTag.create({
      data: { plantId: id as string, tagId: tagId as string },
    });

    res.status(201).json({ data: { plantId: id, tagId } });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Tag already linked to this plant" });
      return;
    }
    if (err.code === "P2003") {
      res.status(404).json({ error: "Plant or tag not found" });
      return;
    }
    next(err);
  }
};

// --- Unlink plant from a tag

export const unlinkPlantFromTag = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id, tagId } = req.params;

    const plant = await prisma.plant.findUnique({
      where: { id: id as string },
    });

    if (!plant) {
      res.status(404).json({ error: "Plant not found" });
      return;
    }

    const tag = await prisma.tag.findUnique({
      where: { id: tagId as string },
    });

    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    await prisma.plantTag.delete({
      where: { plantId_tagId: { plantId: id as string, tagId: tagId as string } },
    });

    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Plant not linked to this tag" });
      return;
    }
    next(err);
  }
};

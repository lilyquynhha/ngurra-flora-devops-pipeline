import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
// --- Get all regions

export const getAllRegions = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const regions = await prisma.region.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { plantRegions: true, occurrences: true } },
      },
    });

    res.json({ data: regions });
  } catch (err) {
    next(err);
  }
};

// --- Get region by ID
export const getRegionById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const region = await prisma.region.findUnique({
      where: { id: id as string },
      include: {
        plantRegions: {
          include: {
            plant: {
              select: {
                id: true,
                scientificName: true,
                commonName: true,
                family: true,
                conservationStatus: true,
              },
            },
          },
        },
        _count: { select: { occurrences: true } },
      },
    });

    if (!region) {
      res.status(404).json({ error: "Region not found" });
      return;
    }

    const { plantRegions, ...regionData } = region;
    res.json({
      data: {
        ...regionData,
        plantsCount: plantRegions.length,
        plants: plantRegions.map((pr: any) => pr.plant),
      },
    });
  } catch (err) {
    next(err);
  }
};

// --- Create a new region

export const createRegion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { name, code } = req.body;

    if (!name || !code) {
      res.status(400).json({ error: "Name and code are required" });
      return;
    }

    const region = await prisma.region.create({
      data: { name, code: code.toUpperCase() },
    });

    res.status(201).json({ data: region });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Region name or code already exists" });
      return;
    }
    next(err);
  }
};

// --- Update an existing region

export const updateRegion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, code } = req.body;

    const region = await prisma.region.update({
      where: { id: id as string },
      data: {
        ...(name && { name }),
        ...(code && { code: code.toUpperCase() }),
      },
    });

    res.json({ data: region });
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Region not found" });
      return;
    }
    if (err.code == "P2002") {
      res.status(409).json({ error: "Another region with the same name already exists" });
      return;
    }
    next(err);
  }
};

// --- Delete an existing region

export const deleteRegion = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.region.delete({ where: { id: id as string } });

    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Region not found" });
      return;
    }
    next(err);
  }
};

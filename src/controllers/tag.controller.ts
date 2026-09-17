import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";

// --- Get all tags

export const getAllTags = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { plantTags: true } },
      },
    });

    res.json({ data: tags });
  } catch (err) {
    next(err);
  }
};

// --- Get an existing tag by ID

export const getTagById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const tag = await prisma.tag.findUnique({
      where: { id: id as string },
      include: {
        plantTags: {
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
      },
    });

    if (!tag) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    const { plantTags, ...tagData } = tag;
    res.json({
      data: {
        ...tagData,
        plants: plantTags.map((pt: any) => pt.plant),
      },
    });
  } catch (err) {
    next(err);
  }
};

// --- Create a new tag

export const createTag = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const tag = await prisma.tag.create({
      data: { name: name.toLowerCase().trim() },
    });

    res.status(201).json({ data: tag });
  } catch (err: any) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Tag already exists" });
      return;
    }
    next(err);
  }
};

// --- Update an existing tag

export const updateTag = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const tag = await prisma.tag.update({
      where: { id: id as string },
      data: {
        ...(name && { name }),
      },
    });

    res.json({ data: tag });
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
    if (err.code == "P2002") {
      res.status(409).json({ error: "Another tag with the same name already exists" });
      return;
    }
    next(err);
  }
};

// --- Delete an existing tag

export const deleteTag = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.tag.delete({ where: { id: id as string } });

    res.status(204).send();
  } catch (err: any) {
    if (err.code === "P2025") {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
    next(err);
  }
};

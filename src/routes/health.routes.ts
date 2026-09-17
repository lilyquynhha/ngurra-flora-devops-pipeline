import { Request, Response } from "express";
import { Router } from "express";
import prisma from "../lib/prisma.js";
const router = Router();

router.get("/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "connected" });
  } catch (err) {
    // 503: service unavailale
    res.status(503).json({ status: "unhealthy", db: "unreachable" });
  }
});

export default router;

import { Request, Response, NextFunction } from "express";
import { Role } from "../prisma/generated/prisma/enums.js";

// Check if the user has the required role(s)
export const requireRole = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorised" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
};
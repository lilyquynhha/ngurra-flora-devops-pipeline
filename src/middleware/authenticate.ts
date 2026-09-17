import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "../prisma/generated/prisma/enums.js";

const JWT_SECRET = process.env.JWT_SECRET as string;

interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

// Validate the JWT
export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed token" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};
import { Request } from "express";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(req: Request, defaultLimit = 20): PaginationParams {
  let page = Number.parseInt(req.query.page as string, 10) || 1;
  let limit = Number.parseInt(req.query.limit as string, 10) || defaultLimit;

  if (page < 1 || !Number.isInteger(page)) page = 1;
  if (limit < 1 || !Number.isInteger(limit)) limit = defaultLimit;

  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function parseCoordinates(req: Request): {
  lat: number;
  lng: number;
  radiusKm: number;
  error?: string;
} {
  const lat = Number.parseFloat(req.query.lat as string);
  const lng = Number.parseFloat(req.query.lng as string);
  const radiusKm = Number.parseFloat(req.query.radius as string) || 50;

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { lat, lng, radiusKm, error: "lat and lng are required numeric values" };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { lat, lng, radiusKm, error: "lat must be -90 to 90, lng must be -180 to 180" };
  }

  return { lat, lng, radiusKm };
}

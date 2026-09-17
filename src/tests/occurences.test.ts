import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import app from "../index.js";
import prisma from "../lib/prisma.js";

const request = supertest(app);

let adminToken: string;
let contributorToken: string;
let viewerToken: string;
let plantId: string;
let regionId: string;
let occurrenceId: string;

// --- Create shared resources for all test
beforeAll(async () => {
  // Register users and get tokens
  await request
    .post("/auth/register")
    .send({ email: "occ_admin@test.com", password: "password123", role: "ADMIN" });
  await request
    .post("/auth/register")
    .send({ email: "occ_contributor@test.com", password: "password123", role: "CONTRIBUTOR" });
  await request
    .post("/auth/register")
    .send({ email: "occ_viewer@test.com", password: "password123", role: "VIEWER" });

  adminToken = (
    await request.post("/auth/login").send({ email: "occ_admin@test.com", password: "password123" })
  ).body.token;

  contributorToken = (
    await request
      .post("/auth/login")
      .send({ email: "occ_contributor@test.com", password: "password123" })
  ).body.token;

  viewerToken = (
    await request
      .post("/auth/login")
      .send({ email: "occ_viewer@test.com", password: "password123" })
  ).body.token;

  // plant
  const plant = await request
    .post("/plants")
    .set("Authorization", `Bearer ${contributorToken}`)
    .send({ scientificName: "Scientific Name", commonName: "Common Name" });

  plantId = plant.body.data.id;

  // region
  const region = await request
    .post("/regions")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "Queensland", code: "QLD" });

  regionId = region.body.data.id;
});

// Clear the occurrences table before each test
beforeEach(async () => {
  await prisma.occurrence.deleteMany();
});

describe("GET /occurrences", () => {
  it("returns 200 with paginated data", async () => {
    const res = await request.get("/occurrences");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("pagination");
    expect(res.body.pagination).toHaveProperty("page");
    expect(res.body.pagination).toHaveProperty("limit");
    expect(res.body.pagination).toHaveProperty("totalPages");
  });

  it("returns occurrences with nested plant and region data", async () => {
    await request.post("/occurrences").set("Authorization", `Bearer ${contributorToken}`).send({
      plantId,
      latitude: -27.4705,
      longitude: 153.026,
      regionCode: "QLD",
    });

    const res = await request.get("/occurrences");
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty("plant");
    expect(res.body.data[0].plant).toHaveProperty("scientificName");
    expect(res.body.data[0]).toHaveProperty("region");
  });

  it("filters by plantId", async () => {
    await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026 });

    const res = await request.get(`/occurrences?plantId=${plantId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((o: any) => o.plant.id === plantId)).toBe(true);
  });

  it("filters by regionId", async () => {
    await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026, regionCode: "QLD" });

    const res = await request.get(`/occurrences?regionId=${regionId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((o: any) => o.region.id === regionId)).toBe(true);
  });
});

describe("GET /occurrences/plant/:plantId", () => {
  it("returns occurrences for a known plant", async () => {
    await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026 });

    const res = await request.get(`/occurrences/plant/${plantId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("returns empty array when plant has no occurrences", async () => {
    const res = await request.get(`/occurrences/plant/${plantId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBe(0);
  });

  it("returns 404 for unknown plantId", async () => {
    const res = await request.get("/occurrences/plant/nonexistent-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Plant not found");
  });
});

describe("POST /occurrences", () => {
  it("creates an occurrence", async () => {
    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026 });

    expect(res.status).toBe(201);
    expect(res.body.data.plant.id).toBe(plantId);
    expect(res.body.data.latitude).toBe(-27.4705);
    expect(res.body.data.longitude).toBe(153.026);
    expect(res.body.data).toHaveProperty("plant");
    expect(res.body.data).toHaveProperty("region");
    occurrenceId = res.body.data.id;
  });

  it("resolves regionCode to regionId automatically", async () => {
    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026, regionCode: "QLD" });

    expect(res.status).toBe(201);
    expect(res.body.data.region.id).toBe(regionId);
  });

  it("returns 404 when regionCode does not match any region", async () => {
    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({
        plantId,
        latitude: -27.4705,
        longitude: 153.026,
        regionCode: "Nonexistent State",
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Region not found");
  });

  it("returns 400 when plantId is missing", async () => {
    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ latitude: -27.4705, longitude: 153.026 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 400 when latitude is missing", async () => {
    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, longitude: 153.026 });

    expect(res.status).toBe(400);
  });

  it("returns 400 when longitude is missing", async () => {
    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705 });

    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown plantId", async () => {
    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId: "nonexistent-id", latitude: -27.4705, longitude: 153.026 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 409 on duplicate externalId", async () => {
    await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026, externalId: "ala-id-001" });

    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -33.86, longitude: 151.2, externalId: "ala-id-001" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("An occurrence with that externalId already exists");
  });

  it("updates an occurrence as CONTRIBUTOR", async () => {
    const created = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026, basisOfRecord: "OBSERVATION" });

    const res = await request
      .patch(`/occurrences/${created.body.data.id}`)
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ latitude: -33.86, longitude: 151.2, regionCode: "QLD" });

    expect(res.status).toBe(200);
    expect(res.body.data.latitude).toBe(-33.86);
    expect(res.body.data.longitude).toBe(151.2);
    expect(res.body.data.region.id).toBe(regionId);
    expect(res.body.data).toHaveProperty("plant");
    expect(res.body.data).toHaveProperty("region");
  });

  it("returns 400 when plantId is different", async () => {
    const created = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026 });

    const otherPlant = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Other Scientific Name", commonName: "Other Common Name" });

    const res = await request
      .patch(`/occurrences/${created.body.data.id}`)
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId: otherPlant.body.data.id, latitude: -33.86, longitude: 151.2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Cannot change plantId for an occurrence");
  });

  it("returns 404 for unknown occurrence id", async () => {
    const res = await request
      .patch("/occurrences/nonexistent-id")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ latitude: -33.86, longitude: 151.2 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Occurrence not found");
  });

  it("returns 404 when regionCode does not match any region during update", async () => {
    const created = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026 });

    const res = await request
      .patch(`/occurrences/${created.body.data.id}`)
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ regionCode: "Nonexistent State" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Region not found");
  });

  it("returns 403 for VIEWER role", async () => {
    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026 });

    expect(res.status).toBe(403);
  });
});

describe("GET /occurrences/nearby", () => {
  beforeEach(async () => {
    // Seed an occurrence with a region so the spatial query can join successfully
    await request.post("/occurrences").set("Authorization", `Bearer ${contributorToken}`).send({
      plantId,
      latitude: -27.4705,
      longitude: 153.026,
      regionCode: "QLD",
    });
  });

  it("returns occurrences within the given radius", async () => {
    const res = await request.get("/occurrences/nearby?lat=-27.4705&lng=153.026&radius=10");

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.meta.lat).toBe(-27.4705);
    expect(res.body.meta.lng).toBe(153.026);
    expect(res.body.meta.radiusKm).toBe(10);
    expect(res.body).toHaveProperty("total");
  });

  it("returns empty data when no occurrences are within radius", async () => {
    const res = await request.get("/occurrences/nearby?lat=-31.9505&lng=115.8605&radius=10");

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it("returns 400 when lat is missing", async () => {
    const res = await request.get("/occurrences/nearby?lng=153.026&radius=50");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("lat and lng are required numeric values");
  });

  it("returns 400 when lng is missing", async () => {
    const res = await request.get("/occurrences/nearby?lat=-27.4705&radius=50");
    expect(res.status).toBe(400);
  });

  it("returns 400 for out-of-range coordinates", async () => {
    const res = await request.get("/occurrences/nearby?lat=200&lng=153.026&radius=50");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("lat must be -90 to 90, lng must be -180 to 180");
  });
});

describe("GET /occurrences/bbox", () => {
  beforeEach(async () => {
    // Seed an occurrence
    await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026, regionCode: "QLD" });
  });

  it("returns occurrences within the bounding box", async () => {
    const res = await request.get("/occurrences/bbox?minLng=152&minLat=-28&maxLng=154&maxLat=-27");

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("returns empty data when no occurrences are in the box", async () => {
    const res = await request.get("/occurrences/bbox?minLng=114&minLat=-33&maxLng=117&maxLat=-30");

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  it("returns 400 when any bbox parameter is missing", async () => {
    const res = await request.get("/occurrences/bbox?minLng=152&minLat=-28&maxLng=154");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("minLng, minLat, maxLng, maxLat are all required");
  });

  it("returns 400 when bbox parameters are non-numeric", async () => {
    const res = await request.get("/occurrences/bbox?minLng=abc&minLat=-28&maxLng=154&maxLat=-27");

    expect(res.status).toBe(400);
  });
});

describe("DELETE /occurrences/:id", () => {
  beforeEach(async () => {
    const res = await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId, latitude: -27.4705, longitude: 153.026 });

    occurrenceId = res.body.data.id;
  });

  it("deletes an occurrence as ADMIN", async () => {
    const res = await request
      .delete(`/occurrences/${occurrenceId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 after deletion", async () => {
    await request
      .delete(`/occurrences/${occurrenceId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await request
      .delete(`/occurrences/${occurrenceId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Occurrence not found");
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request
      .delete("/occurrences/nonexistent-id")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 403 for CONTRIBUTOR role", async () => {
    const res = await request
      .delete(`/occurrences/${occurrenceId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 403 for VIEWER role", async () => {
    const res = await request
      .delete(`/occurrences/${occurrenceId}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});

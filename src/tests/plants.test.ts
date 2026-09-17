import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import app from "../index.js";
import prisma from "../lib/prisma.js";

const request = supertest(app);

let adminToken: string;
let contributorToken: string;
let viewerToken: string;
let regionId: string;
let plantId: string;
let tagId: string;

// --- Create shared resources for use in all tests
beforeAll(async () => {
  // Register users and get tokens
  adminToken = (
    await request
      .post("/auth/register")
      .send({ email: "plant_admin@test.com", password: "password123", role: "ADMIN" })
  ).body.token;

  contributorToken = (
    await request
      .post("/auth/register")
      .send({ email: "plant_contributor@test.com", password: "password123", role: "CONTRIBUTOR" })
  ).body.token;

  viewerToken = (
    await request
      .post("/auth/register")
      .send({ email: "plant_viewer@test.com", password: "password123", role: "VIEWER" })
  ).body.token;

  // Create a region for use in test
  const res = await request
    .post("/regions")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "Test Region", code: "TST" });

  regionId = res.body.data.id;

  // Create a tag for use in test
  const tagRes = await request
    .post("/tags")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ name: "native" });

  tagId = tagRes.body.data.id;
});

describe("GET /plants", () => {
  it("returns 200 with paginated data", async () => {
    const res = await request.get("/plants");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body).toHaveProperty("total");
  });
});

describe("POST /plants", () => {
  // Wipe plants between tests
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.plantRegion.deleteMany();
    await prisma.occurrence.deleteMany();
    await prisma.plant.deleteMany();
  });

  it("creates a plant as CONTRIBUTOR", async () => {
    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({
        scientificName: "Acacia pycnantha",
        commonName: "Golden Wattle",
        conservationStatus: "LEAST_CONCERN",
        regionIds: [regionId],
        tagIds: [tagId],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.scientificName).toBe("Acacia pycnantha");
    expect(res.body.data.plantRegions).toBeInstanceOf(Array);
    expect(res.body.data.plantRegions.length).toBe(1);
    expect(res.body.data.plantRegions[0].region.id).toBe(regionId);
    expect(res.body.data.plantTags).toBeInstanceOf(Array);
    expect(res.body.data.plantTags.length).toBe(1);
    expect(res.body.data.plantTags[0].tag.id).toBe(tagId);
    plantId = res.body.data.id;
  });

  it("returns 401 without token", async () => {
    const res = await request.post("/plants").send({ scientificName: "Test plant" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER role", async () => {
    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ scientificName: "Test plant" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when scientificName is missing", async () => {
    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ commonName: "No scientific name" });
    expect(res.status).toBe(400);
  });
});

describe("GET /plants/:id", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.plantRegion.deleteMany();
    await prisma.occurrence.deleteMany();
    await prisma.plant.deleteMany();

    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Eucalyptus globulus", commonName: "Blue Gum" });

    plantId = res.body.data.id;
  });

  it("returns plant with nested regions and tags", async () => {
    const res = await request.get(`/plants/${plantId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("plantRegions");
    expect(res.body.data).toHaveProperty("plantTags");
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request.get("/plants/nonexistent-id");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /plants/:id", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.plantRegion.deleteMany();
    await prisma.occurrence.deleteMany();
    await prisma.plant.deleteMany();

    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Eucalyptus globulus", commonName: "Blue Gum" });

    plantId = res.body.data.id;
  });

  it("updates a plant scientific name as ADMIN", async () => {
    const res = await request
      .patch(`/plants/${plantId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scientificName: "Updated" });

    expect(res.status).toBe(200);
    expect(res.body.data.scientificName).toBe("Updated");
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request
      .patch("/plants/nonexistent-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ scientificName: "Updated" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Plant not found");
  });
});

describe("GET /plants/nearby", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.plantRegion.deleteMany();
    await prisma.occurrence.deleteMany();
    await prisma.plant.deleteMany();

    // Create a plant near the test coordinate
    const nearRes = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Near Plant", commonName: "Near" });

    // Create a plant far away
    const farRes = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Far Plant", commonName: "Far" });

    const nearPlantId = nearRes.body.data.id;
    const farPlantId = farRes.body.data.id;

    // Create an occurrence near Sydney (should be within small radius)
    await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId: nearPlantId, latitude: -33.865143, longitude: 151.2099 });

    // Create an occurrence in Melbourne (far away)
    await request
      .post("/occurrences")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ plantId: farPlantId, latitude: -37.8136, longitude: 144.9631 });
  });

  it("returns nearby plants within radius", async () => {
    const res = await request
      .get("/plants/nearby")
      .query({ lat: -33.865143, lng: 151.2099, radius: 50 });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);

    const names = res.body.data.map((p: any) => p.scientific_name);
    expect(names).toContain("Near Plant");
    expect(names).not.toContain("Far Plant");
  });

  it("returns 400 when lat/lng are missing or invalid", async () => {
    const res = await request.get("/plants/nearby");
    expect(res.status).toBe(400);
  });
});

describe("DELETE /plants/:id", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.plantRegion.deleteMany();
    await prisma.occurrence.deleteMany();
    await prisma.plant.deleteMany();

    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Banksia serrata", commonName: "Old Man Banksia" });

    plantId = res.body.data.id;
  });

  it("returns 403 for CONTRIBUTOR role", async () => {
    const res = await request
      .delete(`/plants/${plantId}`)
      .set("Authorization", `Bearer ${contributorToken}`);
    expect(res.status).toBe(403);
  });

  it("deletes plant as ADMIN", async () => {
    const res = await request
      .delete(`/plants/${plantId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});

describe("POST /plants/:id/regions/:regionId - link plant to region", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.plantRegion.deleteMany();
    await prisma.occurrence.deleteMany();
    await prisma.plant.deleteMany();

    // Create a plant to use for linking
    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Scientific Name", commonName: "Common Name" });

    plantId = res.body.data.id;
  });

  it("links a plant to a region as CONTRIBUTOR", async () => {
    const res = await request
      .post(`/plants/${plantId}/regions/${regionId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.plantId).toBe(plantId);
    expect(res.body.data.regionId).toBe(regionId);
  });

  it("returns 409 if region already linked", async () => {
    await request
      .post(`/plants/${plantId}/regions/${regionId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    const res = await request
      .post(`/plants/${plantId}/regions/${regionId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(409);
  });

  it("returns 404 for unknown regionId", async () => {
    const res = await request
      .post(`/plants/${plantId}/regions/nonexistent-id`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 403 for VIEWER role", async () => {
    const res = await request
      .post(`/plants/${plantId}/regions/${regionId}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});

describe("DELETE /plants/:id/regions/:regionId - unlink plant from region", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.plantRegion.deleteMany();
    await prisma.occurrence.deleteMany();
    await prisma.plant.deleteMany();

    // Create a plant to use for linking
    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Scientific Name", commonName: "Common Name" });

    plantId = res.body.data.id;

    // Link the plant to a region first
    await request
      .post(`/plants/${plantId}/regions/${regionId}`)
      .set("Authorization", `Bearer ${contributorToken}`);
  });

  it("unlinks a plant from a region as ADMIN", async () => {
    const res = await request
      .delete(`/plants/${plantId}/regions/${regionId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 if region was not linked", async () => {
    await request
      .delete(`/plants/${plantId}/regions/${regionId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    // Try to unlink again
    const res = await request
      .delete(`/plants/${plantId}/regions/${regionId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 403 for CONTRIBUTOR role", async () => {
    const res = await request
      .delete(`/plants/${plantId}/regions/${regionId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(403);
  });
});

describe("POST /plants/:id/tags/:tagId - link plant to tag", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.plantRegion.deleteMany();
    await prisma.occurrence.deleteMany();
    await prisma.plant.deleteMany();

    // Create a plant to use for linking
    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Scientific Name", commonName: "Common Name" });

    plantId = res.body.data.id;
  });

  it("links a tag to a plant as CONTRIBUTOR", async () => {
    const res = await request
      .post(`/plants/${plantId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.plantId).toBe(plantId);
    expect(res.body.data.tagId).toBe(tagId);
  });

  it("returns 409 if tag already linked", async () => {
    await request
      .post(`/plants/${plantId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    const res = await request
      .post(`/plants/${plantId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(409);
  });

  it("returns 404 for unknown tagId", async () => {
    const res = await request
      .post(`/plants/${plantId}/tags/nonexistent-id`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 403 for VIEWER role", async () => {
    const res = await request
      .post(`/plants/${plantId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});

describe("DELETE /plants/:id/tags/:tagId - unlink plant from tag", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.plantRegion.deleteMany();
    await prisma.occurrence.deleteMany();
    await prisma.plant.deleteMany();

    // Create a plant to use for linking
    const res = await request
      .post("/plants")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ scientificName: "Scientific Name", commonName: "Common Name" });

    plantId = res.body.data.id;

    // Link the plant to a tag first
    await request
      .post(`/plants/${plantId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${contributorToken}`);
  });

  it("unlinks a tag from a plant as ADMIN", async () => {
    const res = await request
      .delete(`/plants/${plantId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 if tag was not linked", async () => {
    await request
      .delete(`/plants/${plantId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const res = await request
      .delete(`/plants/${plantId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it("returns 403 for CONTRIBUTOR role", async () => {
    const res = await request
      .delete(`/plants/${plantId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(403);
  });
});

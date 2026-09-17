import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import supertest from "supertest";
import app from "../index.js";
import prisma from "../lib/prisma.js";

const request = supertest(app);

let adminToken: string;
let contributorToken: string;
let viewerToken: string;
let regionId: string;
let plantId: string;

// --- Create shared users for use in all tests
beforeAll(async () => {
  // Register users and get tokens
  adminToken = (
    await request
      .post("/auth/register")
      .send({ email: "region_admin@test.com", password: "password123", role: "ADMIN" })
  ).body.token;

  contributorToken = (
    await request
      .post("/auth/register")
      .send({ email: "region_contributor@test.com", password: "password123", role: "CONTRIBUTOR" })
  ).body.token;

  viewerToken = (
    await request
      .post("/auth/register")
      .send({ email: "region_viewer@test.com", password: "password123", role: "VIEWER" })
  ).body.token;
});

beforeEach(async () => {
  await prisma.region.deleteMany();
});

describe("GET /regions", () => {
  it("returns 200 with a list of regions", async () => {
    const res = await request.get("/regions");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it("returns regions with plant and occurrence counts", async () => {
    await prisma.region.create({
      data: { name: "Queensland", code: "QLD" },
    });

    const res = await request.get("/regions");
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty("_count");
    expect(res.body.data[0]._count).toHaveProperty("plantRegions");
    expect(res.body.data[0]._count).toHaveProperty("occurrences");
  });
});

describe("GET /regions/:id", () => {
  beforeEach(async () => {
    const region = await prisma.region.create({
      data: { name: "Queensland", code: "QLD" },
    });
    regionId = region.id;
  });

  it("returns a region by ID with counts", async () => {
    const res = await request.get(`/regions/${regionId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(regionId);
    expect(res.body.data.name).toBe("Queensland");
    expect(res.body.data._count).toHaveProperty("occurrences");
    expect(res.body.data.plants).toBeInstanceOf(Array);
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request.get("/regions/nonexistent-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Region not found");
  });
});

describe("POST /regions", () => {
  it("creates a region as ADMIN", async () => {
    const res = await request
      .post("/regions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Queensland", code: "qld" });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Queensland");
    expect(res.body.data.code).toBe("QLD");
  });

  it("returns 409 on duplicate name or code", async () => {
    await request
      .post("/regions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Queensland", code: "QLD" });

    const res = await request
      .post("/regions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Queensland", code: "QLD" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Region name or code already exists");
  });

  it("returns 400 when name is missing", async () => {
    const res = await request
      .post("/regions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code: "QLD" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 400 when code is missing", async () => {
    const res = await request
      .post("/regions")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Queensland" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 403 for CONTRIBUTOR role", async () => {
    const res = await request
      .post("/regions")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "Queensland", code: "QLD" });

    expect(res.status).toBe(403);
  });

  it("returns 403 for VIEWER role", async () => {
    const res = await request
      .post("/regions")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "Queensland", code: "QLD" });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /regions/:id", () => {
  beforeEach(async () => {
    const region = await prisma.region.create({
      data: { name: "Queensland", code: "QLD" },
    });
    regionId = region.id;
  });

  it("updates a region name as ADMIN", async () => {
    const res = await request
      .patch(`/regions/${regionId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Updated Queensland" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated Queensland");
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request
      .patch("/regions/nonexistent-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Updated" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Region not found");
  });

  it("returns 403 for CONTRIBUTOR role", async () => {
    const res = await request
      .patch(`/regions/${regionId}`)
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "Updated" });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /regions/:id", () => {
  beforeEach(async () => {
    const region = await prisma.region.create({
      data: { name: "Queensland", code: "QLD" },
    });
    regionId = region.id;
  });

  it("deletes a region as ADMIN", async () => {
    const res = await request
      .delete(`/regions/${regionId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 after deletion", async () => {
    await request.delete(`/regions/${regionId}`).set("Authorization", `Bearer ${adminToken}`);

    const res = await request.get(`/regions/${regionId}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request
      .delete("/regions/nonexistent-id")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Region not found");
  });

  it("returns 403 for CONTRIBUTOR role", async () => {
    const res = await request
      .delete(`/regions/${regionId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 403 for VIEWER role", async () => {
    const res = await request
      .delete(`/regions/${regionId}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});

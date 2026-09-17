import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import app from "../index.js";
import prisma from "../lib/prisma.js";

const request = supertest(app);

let adminToken: string;
let contributorToken: string;
let viewerToken: string;
let tagId: string;
let plantId: string;

// --- Create shared resources for all tests
beforeAll(async () => {
  await request
    .post("/auth/register")
    .send({ email: "tag_admin@test.com", password: "password123", role: "ADMIN" });
  await request
    .post("/auth/register")
    .send({ email: "tag_contributor@test.com", password: "password123", role: "CONTRIBUTOR" });
  await request
    .post("/auth/register")
    .send({ email: "tag_viewer@test.com", password: "password123", role: "VIEWER" });

  adminToken = (
    await request.post("/auth/login").send({ email: "tag_admin@test.com", password: "password123" })
  ).body.token;

  contributorToken = (
    await request
      .post("/auth/login")
      .send({ email: "tag_contributor@test.com", password: "password123" })
  ).body.token;

  viewerToken = (
    await request
      .post("/auth/login")
      .send({ email: "tag_viewer@test.com", password: "password123" })
  ).body.token;

  // Create a plant to use for testing
  const plantRes = await request
    .post("/plants")
    .set("Authorization", `Bearer ${contributorToken}`)
    .send({ scientificName: "Scientific Name", commonName: "Common Name" });

  plantId = plantRes.body.data.id;
});

describe("GET /tags", () => {
  it("returns 200 with a list of tags", async () => {
    const res = await request.get("/tags");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it("returns tags with plant count", async () => {
    await request
      .post("/tags")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "count-test" });

    const res = await request.get("/tags");
    expect(res.body.data[0]).toHaveProperty("_count");
    expect(res.body.data[0]._count).toHaveProperty("plantTags");
  });
});

describe("GET /tags/:id", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.tag.deleteMany();

    const res = await request
      .post("/tags")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "edible" });

    tagId = res.body.data.id;
  });

  it("returns a tag by ID with its plants", async () => {
    const res = await request.get(`/tags/${tagId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(tagId);
    expect(res.body.data.name).toBe("edible");
    expect(res.body.data).toHaveProperty("plants");
    expect(res.body.data.plants).toBeInstanceOf(Array);
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request.get("/tags/nonexistent-id");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Tag not found");
  });
});

describe("PATCH /tags/:id", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.tag.deleteMany();

    const res = await request
      .post("/tags")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "edible" });

    tagId = res.body.data.id;
  });

  it("updates a tag name as ADMIN", async () => {
    const res = await request
      .patch(`/tags/${tagId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Updated name" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated name");
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request
      .patch("/tags/nonexistent-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Updated" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Tag not found");
  });

  it("returns 403 for CONTRIBUTOR role", async () => {
    const res = await request
      .patch(`/tags/${tagId}`)
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "Updated" });

    expect(res.status).toBe(403);
  });
});

describe("POST /tags", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.tag.deleteMany();
  });

  it("creates a tag as CONTRIBUTOR", async () => {
    const res = await request
      .post("/tags")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "native" });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("native");
  });

  it("returns 409 on duplicate tag name", async () => {
    await request
      .post("/tags")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "edible" });

    const res = await request
      .post("/tags")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "edible" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Tag already exists");
  });

  it("returns 400 when name is missing", async () => {
    const res = await request
      .post("/tags")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 403 for VIEWER role", async () => {
    const res = await request
      .post("/tags")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "edible" });

    expect(res.status).toBe(403);
  });
});

describe("DELETE /tags/:id", () => {
  beforeEach(async () => {
    await prisma.plantTag.deleteMany();
    await prisma.tag.deleteMany();

    const res = await request
      .post("/tags")
      .set("Authorization", `Bearer ${contributorToken}`)
      .send({ name: "edible" });

    tagId = res.body.data.id;
  });

  it("deletes a tag as ADMIN", async () => {
    const res = await request.delete(`/tags/${tagId}`).set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
  });

  it("returns 404 after deletion", async () => {
    await request.delete(`/tags/${tagId}`).set("Authorization", `Bearer ${adminToken}`);

    const res = await request.get(`/tags/${tagId}`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown ID", async () => {
    const res = await request
      .delete("/tags/nonexistent-id")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Tag not found");
  });

  it("returns 403 for CONTRIBUTOR role", async () => {
    const res = await request
      .delete(`/tags/${tagId}`)
      .set("Authorization", `Bearer ${contributorToken}`);

    expect(res.status).toBe(403);
  });

  it("returns 403 for VIEWER role", async () => {
    const res = await request
      .delete(`/tags/${tagId}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});

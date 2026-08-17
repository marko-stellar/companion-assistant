import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../app";

describe("GET /api/healthz", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});

describe("GET /api/tablet/ping", () => {
  it("returns 200 with tablet area", async () => {
    const res = await request(app).get("/api/tablet/ping");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, area: "tablet" });
  });
});

describe("GET /api/admin/ping", () => {
  it("returns 200 with admin area", async () => {
    const res = await request(app).get("/api/admin/ping");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, area: "admin" });
  });
});

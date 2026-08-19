import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";

describe("GET /api/healthz", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});

describe("GET /api/readyz", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 ready when the DB answers and object storage responds", async () => {
    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [] } as never);
    vi.spyOn(
      ObjectStorageService.prototype,
      "checkAvailability",
    ).mockResolvedValueOnce(true);
    const res = await request(app).get("/api/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ready",
      checks: { database: "ok", objectStorage: "ok" },
    });
  });

  it("returns 503 when the database is unreachable", async () => {
    vi.spyOn(pool, "query").mockRejectedValueOnce(
      new Error("connection refused") as never,
    );
    vi.spyOn(
      ObjectStorageService.prototype,
      "checkAvailability",
    ).mockResolvedValueOnce(true);
    const res = await request(app).get("/api/readyz");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.checks.database).toBe("failed");
    expect(res.body.checks.objectStorage).toBe("ok");
    expect(JSON.stringify(res.body)).not.toContain("connection refused");
  });

  it("returns 503 when the object storage probe fails or times out", async () => {
    vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [] } as never);
    vi.spyOn(
      ObjectStorageService.prototype,
      "checkAvailability",
    ).mockResolvedValueOnce(false);
    const res = await request(app).get("/api/readyz");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.checks.database).toBe("ok");
    expect(res.body.checks.objectStorage).toBe("failed");
  });

  it("never leaks connection details", async () => {
    vi.spyOn(pool, "query").mockRejectedValueOnce(
      new Error("postgres://user:password@host/db") as never,
    );
    vi.spyOn(
      ObjectStorageService.prototype,
      "checkAvailability",
    ).mockResolvedValueOnce(false);
    const res = await request(app).get("/api/readyz");
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/postgres:\/\//i);
    expect(text).not.toMatch(/password/i);
  });
});

describe("ObjectStorageService.checkAvailability", () => {
  it("returns false instead of throwing when configuration is missing", async () => {
    vi.stubEnv("PRIVATE_OBJECT_DIR", "");
    const ok = await new ObjectStorageService().checkAvailability(100);
    vi.unstubAllEnvs();
    expect(ok).toBe(false);
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

import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();

const objectStorage = new ObjectStorageService();

/** Liveness: process is up and serving requests. */
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Readiness: dependencies required to serve real traffic.
 * - database: a trivial round-trip query against PostgreSQL
 * - objectStorage: a bounded, non-destructive probe that the configured
 *   private bucket actually answers (photo upload/display depend on it)
 * Returns 200 when everything is ready, 503 otherwise. Never leaks
 * connection strings or provider error details.
 */
router.get("/readyz", async (_req, res) => {
  const [dbOk, storageOk] = await Promise.all([
    pool
      .query("SELECT 1")
      .then(() => true)
      .catch(() => false),
    objectStorage.checkAvailability(),
  ]);

  const checks = {
    database: dbOk ? "ok" : "failed",
    objectStorage: storageOk ? "ok" : "failed",
  } as const;

  const ready = dbOk && storageOk;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    checks,
  });
});

export default router;

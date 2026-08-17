import { Router } from "express";

/**
 * Tablet API route group — /api/tablet/*
 * All routes here serve the tablet-facing React app.
 * Authentication: persistent tablet session (one senior per device).
 * TODO: add session middleware when auth is implemented.
 */
const router = Router();

// Ping — useful for tablet connectivity checks
router.get("/ping", (_req, res) => {
  res.json({ ok: true, area: "tablet" });
});

export default router;

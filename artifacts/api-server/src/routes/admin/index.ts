import { Router } from "express";

/**
 * Admin API route group — /api/admin/*
 * All routes here serve the admin React app.
 * Authentication: email/password session.
 * TODO: add admin auth middleware when auth is implemented.
 */
const router = Router();

// Ping — sanity check for admin API connectivity
router.get("/ping", (_req, res) => {
  res.json({ ok: true, area: "admin" });
});

export default router;

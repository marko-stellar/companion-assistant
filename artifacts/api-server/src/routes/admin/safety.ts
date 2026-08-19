/**
 * Admin safety routes — safety-event visibility, resolution, and a
 * protected test-SMS mechanism.
 *
 * All routes require a valid admin session (requireAdmin middleware).
 * Trigger text is sensitive conversation evidence — access is limited to
 * authorised admin staff and is never written to server logs.
 *
 * Routes:
 *   GET  /admin/users/:id/safety-events   — list events for a senior user
 *   GET  /admin/safety-events/:id         — single event detail
 *   POST /admin/safety-events/:id/resolve — mark reviewed/resolved
 *   POST /admin/safety/test-sms           — send a clearly labelled test SMS
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, users, safetyEvents } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requireUuidParam } from "../../middlewares/validateParam";
import { safetyService } from "../../domains/safety";

const router = Router();

// ── List safety events for a senior user ──────────────────────────────────

router.get(
  "/users/:id/safety-events",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const userId = String(req.params.id);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const events = await safetyService.listForUser(userId);
    res.json({ events });
  },
);

// ── Single event detail ────────────────────────────────────────────────────

router.get(
  "/safety-events/:id",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);
    const [event] = await db
      .select()
      .from(safetyEvents)
      .where(eq(safetyEvents.id, id))
      .limit(1);

    if (!event) {
      res.status(404).json({ error: "Safety event not found" });
      return;
    }
    res.json({ event });
  },
);

// ── Resolve (mark reviewed) ────────────────────────────────────────────────

router.post(
  "/safety-events/:id/resolve",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);
    const updated = await safetyService.resolve(id);
    if (!updated) {
      res.status(404).json({ error: "Safety event not found" });
      return;
    }
    res.json({ event: updated });
  },
);

// ── Protected test-SMS mechanism ───────────────────────────────────────────
// Sends a clearly labelled TEST message to a designated test number.
// Creates no safety event and never claims to be a real alert.

const PHONE_RE = /^\+?[0-9 ()\-]{6,20}$/;

router.post("/safety/test-sms", requireAdmin, async (req, res): Promise<void> => {
  const { phone, language } = req.body as { phone?: string; language?: string };

  if (!phone || typeof phone !== "string" || !PHONE_RE.test(phone.trim())) {
    res.status(400).json({ error: "A valid phone number is required" });
    return;
  }
  if (language !== undefined && language !== "hr" && language !== "en") {
    res.status(400).json({ error: "language must be 'hr' or 'en'" });
    return;
  }

  const result = await safetyService.sendTestSMS({
    phone: phone.trim(),
    language,
  });

  // Delivery failures and simulated (dev mock) delivery are reported
  // honestly, never masked as a real successful send
  res.json({
    success: result.success,
    ...(result.simulated ? { simulated: true } : {}),
    ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
    ...(result.error ? { error: result.error } : {}),
  });
});

export default router;

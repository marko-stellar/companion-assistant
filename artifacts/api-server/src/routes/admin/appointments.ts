/**
 * Admin appointment routes.
 *
 * Routes:
 *   GET    /admin/users/:id/appointments   — list (active only by default; ?active=all)
 *   POST   /admin/users/:id/appointments   — create
 *   GET    /admin/appointments/:id         — single
 *   PATCH  /admin/appointments/:id         — update
 *   DELETE /admin/appointments/:id         — soft-deactivate (isActive = false)
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requireUuidParam } from "../../middlewares/validateParam";
import { appointmentsService } from "../../domains/appointments";

const router = Router();

interface AppointmentBody {
  title?: unknown;
  details?: unknown;
  location?: unknown;
  startsAtUtc?: unknown;
  endsAtUtc?: unknown;
  reminderMinutesBefore?: unknown;
  isActive?: unknown;
}

function parseDate(value: unknown): Date | null | "invalid" {
  if (value == null) return null;
  if (typeof value !== "string" && typeof value !== "number") return "invalid";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

// ── List appointments for a user ──────────────────────────────────────────
router.get(
  "/users/:id/appointments",
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

    const includeInactive = req.query.active === "all";
    const rows = await appointmentsService.getForUser(userId, {
      includeInactive,
    });
    res.json({ appointments: rows, total: rows.length });
  },
);

// ── Create appointment ────────────────────────────────────────────────────
router.post(
  "/users/:id/appointments",
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

    const body = (req.body ?? {}) as AppointmentBody;
    if (typeof body.title !== "string" || !body.title.trim()) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const startsAt = parseDate(body.startsAtUtc);
    if (startsAt === null || startsAt === "invalid") {
      res
        .status(400)
        .json({ error: "startsAtUtc is required (ISO timestamp)" });
      return;
    }
    const endsAt = parseDate(body.endsAtUtc);
    if (endsAt === "invalid") {
      res.status(400).json({ error: "endsAtUtc must be a valid timestamp" });
      return;
    }

    const appointment = await appointmentsService.create({
      userId,
      title: body.title.trim(),
      details: body.details == null ? null : String(body.details),
      location: body.location == null ? null : String(body.location),
      startsAtUtc: startsAt,
      endsAtUtc: endsAt,
      ...(typeof body.reminderMinutesBefore === "number"
        ? { reminderMinutesBefore: body.reminderMinutesBefore }
        : {}),
    });

    req.log.info({ appointmentId: appointment.id, userId }, "Appointment created");
    res.status(201).json({ appointment });
  },
);

// ── Single appointment ────────────────────────────────────────────────────
router.get(
  "/appointments/:id",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const appointment = await appointmentsService.getById(
      String(req.params.id),
    );
    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    res.json({ appointment });
  },
);

// ── Update appointment ────────────────────────────────────────────────────
router.patch(
  "/appointments/:id",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);
    const existing = await appointmentsService.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    const body = (req.body ?? {}) as AppointmentBody;
    const patch: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        res.status(400).json({ error: "title must be a non-empty string" });
        return;
      }
      patch.title = body.title.trim();
    }
    if (body.details !== undefined)
      patch.details = body.details == null ? null : String(body.details);
    if (body.location !== undefined)
      patch.location = body.location == null ? null : String(body.location);
    if (body.startsAtUtc !== undefined) {
      const d = parseDate(body.startsAtUtc);
      if (d === null || d === "invalid") {
        res.status(400).json({ error: "startsAtUtc must be a valid timestamp" });
        return;
      }
      patch.startsAtUtc = d;
    }
    if (body.endsAtUtc !== undefined) {
      const d = parseDate(body.endsAtUtc);
      if (d === "invalid") {
        res.status(400).json({ error: "endsAtUtc must be a valid timestamp" });
        return;
      }
      patch.endsAtUtc = d;
    }
    if (typeof body.reminderMinutesBefore === "number")
      patch.reminderMinutesBefore = body.reminderMinutesBefore;
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;

    const appointment = await appointmentsService.update(id, patch);
    req.log.info({ appointmentId: id }, "Appointment updated");
    res.json({ appointment });
  },
);

// ── Soft-deactivate appointment ───────────────────────────────────────────
router.delete(
  "/appointments/:id",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);
    const existing = await appointmentsService.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }
    await appointmentsService.deactivate(id);
    req.log.info({ appointmentId: id }, "Appointment deactivated");
    res.json({ ok: true });
  },
);

export default router;

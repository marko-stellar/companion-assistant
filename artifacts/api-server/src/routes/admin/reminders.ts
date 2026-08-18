/**
 * Admin reminder routes.
 *
 * Routes:
 *   GET    /admin/users/:id/reminders          — list (optional ?type= filter)
 *   POST   /admin/users/:id/reminders          — create
 *   GET    /admin/reminders/:id                — single
 *   PATCH  /admin/reminders/:id                — update
 *   DELETE /admin/reminders/:id                — soft-deactivate
 *   GET    /admin/reminders/:id/occurrences    — next 7 upcoming occurrences
 */
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, users, REMINDER_TYPES, WEEKDAYS } from "@workspace/db";
import type { Weekday } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";
import { requireUuidParam } from "../../middlewares/validateParam";
import { remindersService } from "../../domains/reminders";

const router = Router();

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ReminderBody {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  medicationName?: unknown;
  localTime?: unknown;
  recurrenceDays?: unknown;
  localDate?: unknown;
  isActive?: unknown;
}

/** Validate body fields; returns error string or null. */
function validateFields(body: ReminderBody, partial: boolean): string | null {
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim())
      return "title is required";
  }
  if (!partial || body.localTime !== undefined) {
    if (typeof body.localTime !== "string" || !HHMM_RE.test(body.localTime))
      return "localTime must be HH:MM (24h)";
  }
  if (body.type !== undefined) {
    if (!REMINDER_TYPES.includes(body.type as (typeof REMINDER_TYPES)[number]))
      return `type must be one of ${REMINDER_TYPES.join(", ")}`;
  }
  if (body.recurrenceDays !== undefined) {
    if (
      !Array.isArray(body.recurrenceDays) ||
      !body.recurrenceDays.every((d) => WEEKDAYS.includes(d as Weekday))
    )
      return `recurrenceDays must be an array of ${WEEKDAYS.join(", ")}`;
  }
  if (body.localDate !== undefined && body.localDate !== null) {
    if (typeof body.localDate !== "string" || !DATE_RE.test(body.localDate))
      return "localDate must be YYYY-MM-DD";
  }
  return null;
}

function pickFields(body: ReminderBody) {
  const out: Record<string, unknown> = {};
  if (body.title !== undefined) out.title = String(body.title).trim();
  if (body.description !== undefined)
    out.description = body.description == null ? null : String(body.description);
  if (body.type !== undefined) out.type = body.type;
  if (body.medicationName !== undefined)
    out.medicationName =
      body.medicationName == null ? null : String(body.medicationName);
  if (body.localTime !== undefined) out.localTime = body.localTime;
  if (body.recurrenceDays !== undefined)
    out.recurrenceDays = body.recurrenceDays;
  if (body.localDate !== undefined) out.localDate = body.localDate;
  if (typeof body.isActive === "boolean") out.isActive = body.isActive;
  return out;
}

// ── List reminders for a user ─────────────────────────────────────────────
router.get(
  "/users/:id/reminders",
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

    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const rows = await remindersService.getForUser(userId, { type });
    res.json({ reminders: rows, total: rows.length });
  },
);

// ── Create reminder ───────────────────────────────────────────────────────
router.post(
  "/users/:id/reminders",
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

    const body = (req.body ?? {}) as ReminderBody;
    const err = validateFields(body, false);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }

    const fields = pickFields(body);
    const recurrenceDays = (fields.recurrenceDays as Weekday[]) ?? [];
    if (recurrenceDays.length === 0 && !fields.localDate) {
      res
        .status(400)
        .json({ error: "One-time reminders require localDate (YYYY-MM-DD)" });
      return;
    }

    const reminder = await remindersService.createReminder({
      userId,
      title: fields.title as string,
      description: (fields.description as string | null) ?? null,
      type: (fields.type as string) ?? "GENERAL",
      medicationName: (fields.medicationName as string | null) ?? null,
      localTime: fields.localTime as string,
      recurrenceDays,
      localDate: (fields.localDate as string | null) ?? null,
    });

    req.log.info({ reminderId: reminder.id, userId }, "Reminder created");
    res.status(201).json({ reminder });
  },
);

// ── Single reminder ───────────────────────────────────────────────────────
router.get(
  "/reminders/:id",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const reminder = await remindersService.getById(String(req.params.id));
    if (!reminder) {
      res.status(404).json({ error: "Reminder not found" });
      return;
    }
    res.json({ reminder });
  },
);

// ── Update reminder ───────────────────────────────────────────────────────
router.patch(
  "/reminders/:id",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);
    const existing = await remindersService.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Reminder not found" });
      return;
    }

    const body = (req.body ?? {}) as ReminderBody;
    const err = validateFields(body, true);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }

    // Validate the MERGED schedule (existing + patch): a recurring reminder
    // patched to recurrenceDays: [] must still resolve to a valid one-time
    // reminder with a localDate.
    const fields = pickFields(body);
    const mergedRecurrence =
      (fields.recurrenceDays as string[] | undefined) ??
      existing.recurrenceDays ??
      [];
    const mergedLocalDate =
      fields.localDate !== undefined
        ? (fields.localDate as string | null)
        : existing.localDate;
    if (mergedRecurrence.length === 0 && !mergedLocalDate) {
      res
        .status(400)
        .json({ error: "One-time reminders require localDate (YYYY-MM-DD)" });
      return;
    }

    const reminder = await remindersService.updateReminder(id, fields);
    req.log.info({ reminderId: id }, "Reminder updated");
    res.json({ reminder });
  },
);

// ── Soft-deactivate reminder ──────────────────────────────────────────────
router.delete(
  "/reminders/:id",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);
    const existing = await remindersService.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Reminder not found" });
      return;
    }
    await remindersService.deactivateReminder(id);
    req.log.info({ reminderId: id }, "Reminder deactivated");
    res.json({ ok: true });
  },
);

// ── Next upcoming occurrences ─────────────────────────────────────────────
router.get(
  "/reminders/:id/occurrences",
  requireUuidParam("id"),
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = String(req.params.id);
    const existing = await remindersService.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Reminder not found" });
      return;
    }
    const occurrences = await remindersService.getUpcomingOccurrences(
      id,
      new Date(),
      7,
    );
    res.json({ occurrences });
  },
);

export default router;

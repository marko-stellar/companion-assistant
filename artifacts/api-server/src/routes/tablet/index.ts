import crypto from "crypto";
import { Router } from "express";
import { eq, and, isNull, isNotNull, gt } from "drizzle-orm";
import { db, deviceSetupCodes, deviceSessions, users, companions, dndPeriods, routineDeviations } from "@workspace/db";
import { requireDevice } from "../../middlewares/requireDevice";
import { remindersService } from "../../domains/reminders";
import { routineService } from "../../domains/routine";
import { scheduleService } from "../../services/schedule.service";
import conversationRouter from "./conversation";

/**
 * Tablet API route group — /api/tablet/*
 * Authentication: persistent Bearer token stored in device localStorage.
 */
const router = Router();

// Ping — useful for tablet connectivity checks
router.get("/ping", (_req, res) => {
  res.json({ ok: true, area: "tablet" });
});

// POST /tablet/setup — consume one-time code, create device session
router.post("/setup", async (req, res): Promise<void> => {
  const raw = req.body?.code;
  if (typeof raw !== "string" || !raw.trim()) {
    res.status(400).json({ error: "Setup code is required" });
    return;
  }

  const code = raw.trim().toUpperCase();
  const now = new Date();

  // Find valid, unused, unexpired code
  const [setupCode] = await db
    .select()
    .from(deviceSetupCodes)
    .where(
      and(
        eq(deviceSetupCodes.code, code),
        isNull(deviceSetupCodes.usedAt),
        gt(deviceSetupCodes.expiresAt, now)
      )
    )
    .limit(1);

  if (!setupCode) {
    res.status(400).json({ error: "Invalid or expired setup code" });
    return;
  }

  // Mark code as used
  await db
    .update(deviceSetupCodes)
    .set({ usedAt: now })
    .where(eq(deviceSetupCodes.id, setupCode.id));

  // Revoke any existing active sessions for this user
  await db
    .update(deviceSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(deviceSessions.userId, setupCode.userId),
        isNull(deviceSessions.revokedAt)
      )
    );

  // Create new device session
  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(deviceSessions).values({
    userId: setupCode.userId,
    token,
    lastSeenAt: now,
  });

  // Load user + companion
  const [row] = await db
    .select({ user: users, companion: companions })
    .from(users)
    .leftJoin(companions, eq(users.companionId, companions.id))
    .where(eq(users.id, setupCode.userId))
    .limit(1);

  if (!row) {
    res.status(500).json({ error: "User not found after setup" });
    return;
  }

  const { tabletPinHash, setupCompletedAt, ...userFields } = row.user;

  req.log.info({ userId: setupCode.userId }, "Tablet device assigned via setup code");
  res.json({ token, user: userFields, companion: row.companion });
});

// GET /tablet/me — validate token, return user + companion + active DND
router.get("/me", requireDevice, async (req, res): Promise<void> => {
  const userId = req.deviceUserId!;

  const [row] = await db
    .select({ user: users, companion: companions })
    .from(users)
    .leftJoin(companions, eq(users.companionId, companions.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [dnd] = await db
    .select()
    .from(dndPeriods)
    .where(and(eq(dndPeriods.userId, userId), eq(dndPeriods.isActive, true)))
    .limit(1);

  const { tabletPinHash, setupCompletedAt, ...userFields } = row.user;

  res.json({
    user: userFields,
    companion: row.companion,
    dnd: dnd ?? null,
  });
});

// GET /tablet/today — today's real reminder occurrences + appointments,
// sorted by local time in the user's timezone, plus upcoming appointment alerts
// that may span the local day boundary (e.g. a midnight appointment checked at 23:50).
router.get("/today", requireDevice, async (req, res): Promise<void> => {
  const userId = req.deviceUserId!;
  const [items, upcomingAlerts] = await Promise.all([
    scheduleService.getTodayItems(userId),
    scheduleService.getUpcomingAlerts(userId),
  ]);
  res.json({ items, upcomingAlerts });
});

// POST /tablet/occurrences/:id/respond — medication confirmation
router.post(
  "/occurrences/:id/respond",
  requireDevice,
  async (req, res): Promise<void> => {
    const userId = req.deviceUserId!;
    const occurrenceId = String(req.params.id);

    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(occurrenceId)) {
      res.status(404).json({ error: "Occurrence not found" });
      return;
    }

    const response = req.body?.response;
    if (response !== "YES" && response !== "NO" && response !== "UNKNOWN") {
      res
        .status(400)
        .json({ error: "response must be YES, NO, or UNKNOWN" });
      return;
    }

    const row = await remindersService.getOccurrenceWithReminder(occurrenceId);
    if (!row || row.reminder.userId !== userId) {
      res.status(404).json({ error: "Occurrence not found" });
      return;
    }
    if (row.reminder.type !== "MEDICATION") {
      res
        .status(400)
        .json({ error: "Only medication reminders take a confirmation" });
      return;
    }

    // Atomic: only triggered, unanswered occurrences can transition.
    const updated = await remindersService.respond(occurrenceId, response);
    if (!updated) {
      res.status(409).json({
        error:
          "Occurrence is not awaiting a response (not yet triggered, or already answered)",
      });
      return;
    }
    req.log.info(
      { occurrenceId, response, reminderId: row.reminder.id },
      "Reminder occurrence response recorded",
    );
    res.json({ ok: true });
  },
);

// GET /tablet/pending-checkin — first unacknowledged routine check-in for this user
router.get("/pending-checkin", requireDevice, async (req, res): Promise<void> => {
  const userId = req.deviceUserId!;
  const pending = await db
    .select({
      id: routineDeviations.id,
      checkInText: routineDeviations.checkInText,
      detectedAtUtc: routineDeviations.detectedAtUtc,
    })
    .from(routineDeviations)
    .where(
      and(
        eq(routineDeviations.userId, userId),
        isNull(routineDeviations.checkInTriggeredAt),
        isNull(routineDeviations.resolvedAtUtc),
        isNotNull(routineDeviations.checkInText),
      ),
    )
    .orderBy(routineDeviations.detectedAtUtc)
    .limit(1);

  if (!pending.length || !pending[0]!.checkInText) {
    res.json({ pending: false });
    return;
  }
  res.json({ pending: true, id: pending[0]!.id, text: pending[0]!.checkInText });
});

// POST /tablet/pending-checkin/:id/acknowledge — mark check-in as spoken
router.post(
  "/pending-checkin/:id/acknowledge",
  requireDevice,
  async (req, res): Promise<void> => {
    const userId = req.deviceUserId!;
    const id = String(req.params.id);
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) { res.status(404).json({ error: "Not found" }); return; }
    const ok = await routineService.acknowledgeCheckIn(id, new Date());
    if (!ok) { res.status(404).json({ error: "Check-in not found or already acknowledged" }); return; }
    req.log.info({ userId, deviationId: id }, "Routine check-in acknowledged");
    res.json({ ok: true });
  },
);

// Voice conversation loop — POST /tablet/converse
router.use(conversationRouter);

export default router;

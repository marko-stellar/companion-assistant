import crypto from "crypto";
import { Router } from "express";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db, deviceSetupCodes, deviceSessions, users, companions, dndPeriods } from "@workspace/db";
import { requireDevice } from "../../middlewares/requireDevice";
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

// GET /tablet/today — today's schedule items (placeholder until reminders/appointments are built)
router.get("/today", requireDevice, async (req, res): Promise<void> => {
  const userId = req.deviceUserId!;

  const [user] = await db
    .select({ language: users.language })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const hr = user?.language === "hr";

  const items = [
    {
      id: "ph-1",
      type: "reminder" as const,
      title: hr ? "Jutarnji lijekovi" : "Morning medication",
      time: "09:00",
      done: false,
    },
    {
      id: "ph-2",
      type: "appointment" as const,
      title: hr ? "Telefonski poziv s obitelji" : "Phone call with family",
      time: "11:00",
      done: false,
    },
    {
      id: "ph-3",
      type: "reminder" as const,
      title: hr ? "Ručak" : "Lunch",
      time: "13:00",
      done: false,
    },
    {
      id: "ph-4",
      type: "reminder" as const,
      title: hr ? "Večernji lijekovi" : "Evening medication",
      time: "19:00",
      done: false,
    },
  ];

  res.json({ items });
});

// Voice conversation loop — POST /tablet/converse
router.use(conversationRouter);

export default router;

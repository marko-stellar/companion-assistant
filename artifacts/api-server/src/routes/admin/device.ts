import crypto from "crypto";
import { Router } from "express";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db, deviceSetupCodes, deviceSessions, users } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";

const router = Router();

/** Unambiguous alphanumeric charset — no 0/O or 1/I confusion */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = crypto.randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

// GET /admin/users/:id/device-status
router.get(
  "/users/:id/device-status",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = req.params.id;

    const [session] = await db
      .select({ lastSeenAt: deviceSessions.lastSeenAt })
      .from(deviceSessions)
      .where(
        and(eq(deviceSessions.userId, id), isNull(deviceSessions.revokedAt))
      )
      .orderBy(desc(deviceSessions.createdAt))
      .limit(1);

    const [code] = await db
      .select({ expiresAt: deviceSetupCodes.expiresAt })
      .from(deviceSetupCodes)
      .where(
        and(eq(deviceSetupCodes.userId, id), isNull(deviceSetupCodes.usedAt))
      )
      .orderBy(desc(deviceSetupCodes.createdAt))
      .limit(1);

    const hasPendingCode = !!code && code.expiresAt > new Date();

    res.json({
      hasActiveSession: !!session,
      lastSeenAt: session?.lastSeenAt ?? null,
      hasPendingCode,
      codeExpiresAt: hasPendingCode ? code!.expiresAt : null,
    });
  }
);

// POST /admin/users/:id/device-code
router.post(
  "/users/:id/device-code",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = req.params.id;

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Expire any existing unused codes for this user
    await db
      .update(deviceSetupCodes)
      .set({ usedAt: new Date() })
      .where(
        and(eq(deviceSetupCodes.userId, id), isNull(deviceSetupCodes.usedAt))
      );

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

    await db.insert(deviceSetupCodes).values({ userId: id, code, expiresAt });

    req.log.info({ userId: id }, "Device setup code generated");
    res.json({ code, expiresAt });
  }
);

// DELETE /admin/users/:id/device-session
router.delete(
  "/users/:id/device-session",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = req.params.id;

    const result = await db
      .update(deviceSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(deviceSessions.userId, id), isNull(deviceSessions.revokedAt))
      )
      .returning({ id: deviceSessions.id });

    if (result.length === 0) {
      res.status(404).json({ error: "No active device session found" });
      return;
    }

    req.log.info({ userId: id }, "Device session revoked");
    res.json({ message: "Device session revoked" });
  }
);

export default router;

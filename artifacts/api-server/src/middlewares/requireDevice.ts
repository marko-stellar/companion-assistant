import { type Request, type Response, type NextFunction } from "express";
import { eq, isNull } from "drizzle-orm";
import { db, deviceSessions } from "@workspace/db";

/**
 * Middleware that validates a long-lived device token from
 * the Authorization: Bearer header.
 *
 * On success, attaches `req.deviceUserId` and `req.deviceSessionId`.
 * Returns 401 if the token is missing, not found, or revoked.
 */
export async function requireDevice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Device not assigned" });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "Device not assigned" });
    return;
  }

  const [session] = await db
    .select({ id: deviceSessions.id, userId: deviceSessions.userId, revokedAt: deviceSessions.revokedAt })
    .from(deviceSessions)
    .where(eq(deviceSessions.token, token));

  if (!session || session.revokedAt !== null) {
    res.status(401).json({ error: "Device session invalid or revoked" });
    return;
  }

  req.deviceUserId = session.userId;
  req.deviceSessionId = session.id;

  // Fire-and-forget lastSeenAt update
  db.update(deviceSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(deviceSessions.id, session.id))
    .catch(() => {});

  next();
}

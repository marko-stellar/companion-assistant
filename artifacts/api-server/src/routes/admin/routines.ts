/**
 * Admin API — routines and activity events for a user.
 *
 * GET /api/admin/users/:userId/routines       — list inferred routines + recent deviations
 * GET /api/admin/users/:userId/activity-events — recent activity events for debugging
 */

import { Router, type IRouter } from "express";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import { db, routines, routineDeviations, activityEvents } from "@workspace/db";
import { requireAdmin } from "../../middlewares/requireAdmin";

const router: IRouter = Router();

router.get(
  "/users/:userId/routines",
  requireAdmin,
  async (req, res): Promise<void> => {
    const userId = String(req.params.userId);
    const since = new Date(Date.now() - 30 * 86_400_000); // last 30 days

    const userRoutines = await db
      .select()
      .from(routines)
      .where(eq(routines.userId, userId))
      .orderBy(desc(routines.updatedAt));

    if (userRoutines.length === 0) {
      res.json({ routines: [] });
      return;
    }

    const routineIds = userRoutines.map(r => r.id);

    const deviations = await db
      .select()
      .from(routineDeviations)
      .where(
        and(
          inArray(routineDeviations.routineId, routineIds),
          gte(routineDeviations.detectedAtUtc, since),
        ),
      )
      .orderBy(desc(routineDeviations.detectedAtUtc));

    const deviationsByRoutine = new Map<string, typeof deviations>();
    for (const d of deviations) {
      const list = deviationsByRoutine.get(d.routineId) ?? [];
      list.push(d);
      deviationsByRoutine.set(d.routineId, list);
    }

    const result = userRoutines.map(r => ({
      ...r,
      recentDeviations: deviationsByRoutine.get(r.id) ?? [],
    }));

    res.json({ routines: result });
  },
);

router.get(
  "/users/:userId/activity-events",
  requireAdmin,
  async (req, res): Promise<void> => {
    const userId = String(req.params.userId);
    const limit = Math.min(200, parseInt(String(req.query.limit ?? "50"), 10));
    const eventType = req.query.eventType as string | undefined;
    const since = new Date(Date.now() - 30 * 86_400_000);

    const conditions = [
      eq(activityEvents.userId, userId),
      gte(activityEvents.occurredAtUtc, since),
    ];
    if (eventType) conditions.push(eq(activityEvents.eventType, eventType));

    const events = await db
      .select()
      .from(activityEvents)
      .where(and(...conditions))
      .orderBy(desc(activityEvents.occurredAtUtc))
      .limit(limit);

    res.json({ events });
  },
);

export default router;

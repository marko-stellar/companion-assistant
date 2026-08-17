import { db } from "@workspace/db";
import {
  routines,
  routineDeviations,
  activityEvents,
  type Routine,
  type InsertRoutine,
} from "@workspace/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";

/**
 * Routine domain — tracks interaction patterns and detects deviations.
 *
 * CRITICAL CONSTRAINT:
 * Detecting a routine deviation must NEVER directly trigger an emergency SMS.
 * Deviations are recorded and may cause a proactive check-in conversation,
 * but only the safety domain (via independent conversation classification)
 * can authorise SMS notification.
 */
export class RoutineService {
  async create(data: InsertRoutine): Promise<Routine> {
    const [routine] = await db.insert(routines).values(data).returning();
    return routine;
  }

  async getForUser(userId: string): Promise<Routine[]> {
    return db
      .select()
      .from(routines)
      .where(and(eq(routines.userId, userId), eq(routines.isActive, true)));
  }

  async recordActivityEvent(
    userId: string,
    eventType: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(activityEvents).values({
      userId,
      eventType,
      metadata,
      occurredAtUtc: new Date(),
    });
  }

  /**
   * Check all active routines for deviations.
   * Called by the scheduler; records deviations but does NOT send SMS.
   * TODO: implement detection logic using activityEvents.
   */
  async detectDeviations(_nowUtc: Date): Promise<void> {
    // Stub — will query activityEvents and compare against routine expectations
  }

  async getRecentDeviations(userId: string, sinceUtc: Date) {
    return db
      .select()
      .from(routineDeviations)
      .where(
        and(
          eq(routineDeviations.userId, userId),
          gte(routineDeviations.detectedAtUtc, sinceUtc),
        ),
      )
      .orderBy(desc(routineDeviations.detectedAtUtc));
  }
}

export const routineService = new RoutineService();

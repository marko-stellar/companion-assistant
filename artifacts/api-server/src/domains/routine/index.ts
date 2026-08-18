/**
 * Routine domain — detects deviations from inferred interaction patterns.
 *
 * CRITICAL CONSTRAINT:
 * A routine deviation must NEVER directly trigger emergency SMS.
 * The maximum action a deviation causes is one proactive check-in message.
 * Only the SafetyService (via independent conversation classification) can
 * authorise SMS to an emergency contact.
 */

import { eq, and, gte, isNotNull, isNull, inArray } from "drizzle-orm";
import {
  db,
  users,
  routines,
  routineDeviations,
  activityEvents,
} from "@workspace/db";
import { ianaZoneOrUtc, localDayBoundsUtc, hhmmToMinutes } from "../../lib/local-time";
import { logger } from "../../lib/logger";

const GRACE_PERIOD_MINUTES = parseInt(
  process.env.ROUTINE_GRACE_PERIOD_MINUTES ?? "90",
  10,
);

export type RoutineCheckIn = {
  userId: string;
  routineId: string;
  deviationId: string;
  checkInText: string;
};

export class RoutineService {
  /**
   * Check all active routines for missed expected patterns.
   * Called by the scheduler every tick; idempotent — one deviation per routine per day.
   * Stores check-in text in the deviation immediately; the tablet polls for pending check-ins.
   * NEVER triggers SMS directly.
   */
  async detectDeviations(nowUtc: Date): Promise<RoutineCheckIn[]> {
    const activeRoutines = await db
      .select({
        routine: routines,
        timezone: users.timezone,
        language: users.language,
      })
      .from(routines)
      .innerJoin(users, eq(routines.userId, users.id))
      .where(
        and(
          eq(routines.isActive, true),
          isNotNull(routines.expectedTime),
        ),
      );

    const checkIns: RoutineCheckIn[] = [];

    for (const { routine, timezone, language } of activeRoutines) {
      try {
        const result = await this.checkOneRoutine(
          routine,
          timezone ?? "UTC",
          language ?? "en",
          nowUtc,
        );
        if (result) checkIns.push(result);
      } catch (err) {
        logger.error({ err, routineId: routine.id }, "Error checking routine deviation");
      }
    }

    return checkIns;
  }

  private async checkOneRoutine(
    routine: typeof routines.$inferSelect,
    timezone: string,
    language: string,
    nowUtc: Date,
  ): Promise<RoutineCheckIn | null> {
    const tz = ianaZoneOrUtc(timezone);
    const { start: dayStart } = localDayBoundsUtc(tz, nowUtc);

    // Deadline = expectedTime + half-window + grace period
    const expectedMins = hhmmToMinutes(routine.expectedTime!);
    const halfWindow = Math.floor(routine.detectionWindowMinutes / 2);
    const deadlineMins = expectedMins + halfWindow + GRACE_PERIOD_MINUTES;

    // Minutes elapsed in the local calendar day
    const elapsedMins = Math.floor((nowUtc.getTime() - dayStart.getTime()) / 60_000);
    if (elapsedMins < deadlineMins) return null;

    // Idempotency: only one deviation per routine per local calendar day
    const existingToday = await db
      .select({ id: routineDeviations.id })
      .from(routineDeviations)
      .where(
        and(
          eq(routineDeviations.routineId, routine.id),
          gte(routineDeviations.detectedAtUtc, dayStart),
        ),
      )
      .limit(1);

    if (existingToday.length > 0) return null;

    // Has the expected event type already occurred today?
    const sourceTypes =
      routine.sourceEventTypes.length > 0
        ? routine.sourceEventTypes
        : ["USER_STARTED_CONVERSATION"];

    const eventToday = await db
      .select({ id: activityEvents.id })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.userId, routine.userId),
          gte(activityEvents.occurredAtUtc, dayStart),
          inArray(activityEvents.eventType, sourceTypes),
        ),
      )
      .limit(1);

    if (eventToday.length > 0) return null; // Pattern present — no deviation

    // Build the check-in text now (before writing) so it's stored immediately
    const checkInText = this.buildCheckInText(routine.routineType, routine.name, language);

    const [deviation] = await db
      .insert(routineDeviations)
      .values({
        routineId: routine.id,
        userId: routine.userId,
        detectedAtUtc: nowUtc,
        notes: `No ${routine.routineType} event by ${routine.expectedTime} + ${GRACE_PERIOD_MINUTES}min grace.`,
        checkInText, // stored immediately; tablet polls for this
      })
      .returning({ id: routineDeviations.id });

    if (!deviation) return null;

    logger.info(
      {
        routineId: routine.id,
        routineType: routine.routineType,
        userId: routine.userId,
        deviationId: deviation.id,
      },
      "Routine deviation detected — check-in pending",
    );

    return { userId: routine.userId, routineId: routine.id, deviationId: deviation.id, checkInText };
  }

  /**
   * Mark a deviation's check-in as acknowledged by the tablet.
   * Called via POST /api/tablet/pending-checkin/:id/acknowledge.
   */
  async acknowledgeCheckIn(deviationId: string, nowUtc: Date): Promise<boolean> {
    const rows = await db
      .update(routineDeviations)
      .set({ checkInTriggeredAt: nowUtc })
      .where(
        and(
          eq(routineDeviations.id, deviationId),
          isNull(routineDeviations.checkInTriggeredAt),
        ),
      )
      .returning({ id: routineDeviations.id });
    return rows.length > 0;
  }

  /**
   * Resolve open deviations for a user (they were heard from).
   * Called when user starts a conversation.
   */
  async resolveOpenDeviations(userId: string, nowUtc: Date): Promise<void> {
    await db
      .update(routineDeviations)
      .set({ resolvedAtUtc: nowUtc })
      .where(
        and(
          eq(routineDeviations.userId, userId),
          isNull(routineDeviations.resolvedAtUtc),
          isNotNull(routineDeviations.checkInText),
        ),
      );
  }

  async getForUser(userId: string) {
    return db
      .select()
      .from(routines)
      .where(eq(routines.userId, userId));
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
      );
  }

  // ── Legacy helper kept for backward compat ────────────────────────────────

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

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildCheckInText(routineType: string, routineName: string, language: string): string {
    const hr = language === "hr" || language.startsWith("hr");

    switch (routineType) {
      case "MORNING_CONVERSATION":
        return hr
          ? "Obično se čujemo ranije. Je li sve u redu?"
          : "We usually talk earlier in the day. Is everything alright?";

      case "MEDICATION_CONFIRMATION":
        return hr
          ? "Nisam primio potvrdu za lijekove danas. Jeste li ih uzeli?"
          : "I haven't heard from you about your medication today. Have you taken it?";

      case "REPORTED_ACTIVITY":
        return hr
          ? `Niste mi rekli kako je prošlo s aktivnošću danas. Je li sve u redu?`
          : `You haven't mentioned how ${routineName} went today. Is everything alright?`;

      default:
        return hr
          ? "Nisam vas čuo danas. Je li sve u redu?"
          : "I haven't heard from you today. Is everything alright?";
    }
  }
}

export const routineService = new RoutineService();

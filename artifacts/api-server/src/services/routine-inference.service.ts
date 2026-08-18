/**
 * RoutineInferenceService — rule-based routine detection from activity events.
 *
 * No machine-learning. Three rule families:
 *
 *   MORNING_CONVERSATION
 *     Evidence: USER_STARTED_CONVERSATION events before MORNING_CUTOFF_HOUR
 *     local time, over the past LOOKBACK_DAYS days.
 *     Established when: ≥ MIN_EVIDENCE_COUNT distinct calendar days observed.
 *     Baseline: average local minute-of-day and std deviation.
 *
 *   MEDICATION_CONFIRMATION
 *     Evidence: MEDICATION_CONFIRMED_TAKEN events, grouped by reminderId.
 *     Established when: ≥ MIN_EVIDENCE_COUNT events for same reminder.
 *     Baseline: average local minute-of-day.
 *
 *   REPORTED_ACTIVITY
 *     Evidence: USER_REPORTED_ACTIVITY events, grouped by activityName in metadata.
 *     Established when: ≥ MIN_EVIDENCE_COUNT events with same activityName.
 *
 * All detected routines are upserted (matched by userId + routineType + name).
 * Confidence grows as sqrt(evidenceCount / (MIN_EVIDENCE * 3)), capped at 1.0.
 */

import { eq, and, gte, inArray } from "drizzle-orm";
import {
  db,
  activityEvents,
  routines,
  users,
  type ActivityEvent,
  type InsertRoutine,
} from "@workspace/db";
import { getLocalParts, ianaZoneOrUtc } from "../lib/local-time";
import { logger } from "../lib/logger";

// ── Config (overridable via env) ─────────────────────────────────────────────

const MIN_EVIDENCE_COUNT = parseInt(
  process.env.ROUTINE_MIN_EVIDENCE_COUNT ?? "5",
  10,
);
const LOOKBACK_DAYS = parseInt(
  process.env.ROUTINE_LOOKBACK_DAYS ?? "30",
  10,
);
const MORNING_CUTOFF_HOUR = parseInt(
  process.env.ROUTINE_MORNING_CUTOFF_HOUR ?? "12",
  10,
);
const MAX_SPREAD_MINUTES = parseInt(
  process.env.ROUTINE_MAX_SPREAD_MINUTES ?? "120",
  10,
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function minutesSinceMidnight(date: Date, timezone: string): number {
  const p = getLocalParts(date, timezone);
  return p.hour * 60 + p.minute;
}

function localDateStr(date: Date, timezone: string): string {
  return getLocalParts(date, timezone).dateStr;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function computeConfidence(evidenceCount: number, minEvidence: number): number {
  return Math.min(1.0, Math.sqrt(evidenceCount / (minEvidence * 3)));
}

function avgOf(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class RoutineInferenceService {
  /**
   * Run inference for all active users. Called by the scheduler (rate-limited).
   */
  async inferForAllUsers(): Promise<void> {
    const userRows = await db
      .select({ id: users.id, timezone: users.timezone })
      .from(users)
      .where(eq(users.isActive, true));

    for (const user of userRows) {
      await this.inferForUser(user.id, user.timezone ?? "UTC").catch(err => {
        logger.error({ err, userId: user.id }, "Routine inference failed for user");
      });
    }
  }

  async inferForUser(userId: string, timezone: string): Promise<void> {
    const tz = ianaZoneOrUtc(timezone);
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

    const events: ActivityEvent[] = await db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.userId, userId),
          gte(activityEvents.occurredAtUtc, since),
          inArray(activityEvents.eventType, [
            "USER_STARTED_CONVERSATION",
            "MEDICATION_CONFIRMED_TAKEN",
            "USER_REPORTED_ACTIVITY",
          ]),
        ),
      );

    await Promise.all([
      this.inferMorningConversation(userId, tz, events),
      this.inferMedicationConfirmation(userId, tz, events),
      this.inferReportedActivity(userId, tz, events),
    ]);
  }

  // ── Morning conversation ──────────────────────────────────────────────────

  private async inferMorningConversation(
    userId: string,
    timezone: string,
    events: ActivityEvent[],
  ): Promise<void> {
    const morningEvents = events.filter(e => {
      if (e.eventType !== "USER_STARTED_CONVERSATION") return false;
      const p = getLocalParts(e.occurredAtUtc, timezone);
      return p.hour < MORNING_CUTOFF_HOUR;
    });

    // One observation per calendar day (earliest event of that day)
    const byDay = new Map<string, number>();
    for (const e of morningEvents) {
      const dateStr = localDateStr(e.occurredAtUtc, timezone);
      const mins = minutesSinceMidnight(e.occurredAtUtc, timezone);
      const existing = byDay.get(dateStr);
      if (existing === undefined || mins < existing) byDay.set(dateStr, mins);
    }

    const observedDays = [...byDay.keys()];
    const minuteValues = [...byDay.values()];

    if (minuteValues.length < MIN_EVIDENCE_COUNT) return;

    const avgMins = avgOf(minuteValues);
    const spread = stdDev(minuteValues);
    if (spread > MAX_SPREAD_MINUTES) return; // too scattered to be a routine

    await this.upsertRoutine({
      userId,
      routineType: "MORNING_CONVERSATION",
      name: "Morning conversation",
      description: `Typically starts a morning conversation around ${toHHMM(avgMins)} local time.`,
      expectedTime: toHHMM(avgMins),
      detectionWindowMinutes: Math.max(30, Math.ceil(spread * 2)),
      evidenceCount: minuteValues.length,
      confidence: computeConfidence(minuteValues.length, MIN_EVIDENCE_COUNT),
      sourceEventTypes: ["USER_STARTED_CONVERSATION"],
      baselineMetrics: {
        avgMinutesSinceMidnight: Math.round(avgMins),
        stdDevMinutes: Math.round(spread),
        observedDays: observedDays.slice(-30),
        lastObservedAt: morningEvents.at(-1)?.occurredAtUtc.toISOString(),
      },
    });
  }

  // ── Medication confirmation ───────────────────────────────────────────────

  private async inferMedicationConfirmation(
    userId: string,
    timezone: string,
    events: ActivityEvent[],
  ): Promise<void> {
    const medEvents = events.filter(e => e.eventType === "MEDICATION_CONFIRMED_TAKEN");
    if (medEvents.length === 0) return;

    const byReminder = new Map<string, ActivityEvent[]>();
    for (const e of medEvents) {
      const meta = e.metadata as Record<string, unknown> | null;
      const reminderId = String(meta?.reminderId ?? "unknown");
      const title = String(meta?.reminderTitle ?? "Medication");
      const key = `${reminderId}|${title}`;
      const list = byReminder.get(key) ?? [];
      list.push(e);
      byReminder.set(key, list);
    }

    for (const [key, evts] of byReminder) {
      if (evts.length < MIN_EVIDENCE_COUNT) continue;
      const [, title = "Medication"] = key.split("|");
      const minuteValues = evts.map(e => minutesSinceMidnight(e.occurredAtUtc, timezone));
      const avgMins = avgOf(minuteValues);
      const spread = stdDev(minuteValues);

      await this.upsertRoutine({
        userId,
        routineType: "MEDICATION_CONFIRMATION",
        name: `${title} confirmation`,
        description: `Typically confirms taking ${title} around ${toHHMM(avgMins)} local time.`,
        expectedTime: toHHMM(avgMins),
        detectionWindowMinutes: Math.max(30, Math.ceil(spread * 2)),
        evidenceCount: evts.length,
        confidence: computeConfidence(evts.length, MIN_EVIDENCE_COUNT),
        sourceEventTypes: ["MEDICATION_CONFIRMED_TAKEN"],
        baselineMetrics: {
          avgMinutesSinceMidnight: Math.round(avgMins),
          stdDevMinutes: Math.round(spread),
          lastObservedAt: evts.at(-1)?.occurredAtUtc.toISOString(),
        },
      });
    }
  }

  // ── Reported activity ─────────────────────────────────────────────────────

  private async inferReportedActivity(
    userId: string,
    timezone: string,
    events: ActivityEvent[],
  ): Promise<void> {
    const actEvts = events.filter(e => e.eventType === "USER_REPORTED_ACTIVITY");
    if (actEvts.length === 0) return;

    const byActivity = new Map<string, ActivityEvent[]>();
    for (const e of actEvts) {
      const meta = e.metadata as Record<string, unknown> | null;
      const name = String(meta?.activityName ?? "").toLowerCase().trim();
      if (!name) continue;
      const list = byActivity.get(name) ?? [];
      list.push(e);
      byActivity.set(name, list);
    }

    for (const [activityName, evts] of byActivity) {
      if (evts.length < MIN_EVIDENCE_COUNT) continue;
      const minuteValues = evts.map(e => minutesSinceMidnight(e.occurredAtUtc, timezone));
      const avgMins = avgOf(minuteValues);
      const spread = stdDev(minuteValues);
      const expectedTime = toHHMM(avgMins);

      await this.upsertRoutine({
        userId,
        routineType: "REPORTED_ACTIVITY",
        name: `${activityName} activity`,
        description: `Regularly reports ${activityName} around ${expectedTime} local time.`,
        expectedTime,
        detectionWindowMinutes: Math.max(60, Math.ceil(spread * 2)),
        evidenceCount: evts.length,
        confidence: computeConfidence(evts.length, MIN_EVIDENCE_COUNT),
        sourceEventTypes: ["USER_REPORTED_ACTIVITY"],
        baselineMetrics: {
          avgMinutesSinceMidnight: Math.round(avgMins),
          stdDevMinutes: Math.round(spread),
          lastObservedAt: evts.at(-1)?.occurredAtUtc.toISOString(),
        },
      });
    }
  }

  // ── Upsert helper ─────────────────────────────────────────────────────────

  private async upsertRoutine(data: {
    userId: string;
    routineType: string;
    name: string;
    description: string;
    expectedTime: string;
    detectionWindowMinutes: number;
    evidenceCount: number;
    confidence: number;
    sourceEventTypes: string[];
    baselineMetrics: Record<string, unknown>;
  }): Promise<void> {
    const existing = await db
      .select({ id: routines.id })
      .from(routines)
      .where(
        and(
          eq(routines.userId, data.userId),
          eq(routines.routineType, data.routineType),
          eq(routines.name, data.name),
        ),
      )
      .limit(1);

    const values: InsertRoutine = {
      userId: data.userId,
      name: data.name,
      description: data.description,
      routineType: data.routineType,
      expectedTime: data.expectedTime,
      expectedDays: [],
      detectionWindowMinutes: data.detectionWindowMinutes,
      evidenceCount: data.evidenceCount,
      confidence: data.confidence,
      sourceEventTypes: data.sourceEventTypes,
      baselineMetrics: data.baselineMetrics,
      isActive: true,
    };

    if (existing.length > 0) {
      const { userId: _u, ...updateData } = values;
      void _u;
      await db
        .update(routines)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(routines.id, existing[0]!.id));
    } else {
      await db.insert(routines).values(values);
    }

    logger.debug(
      {
        userId: data.userId,
        routineType: data.routineType,
        name: data.name,
        evidence: data.evidenceCount,
      },
      "Routine upserted",
    );
  }
}

export const routineInferenceService = new RoutineInferenceService();

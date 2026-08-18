import { eq, and, inArray, gt, lte } from "drizzle-orm";
import { db, users, reminders, dndPeriods, temporaryDnd } from "@workspace/db";
import type { Reminder, DndPeriod, Weekday } from "@workspace/db";
import { logger } from "../lib/logger";
import { remindersService } from "../domains/reminders";
import { routineService } from "../domains/routine";
import { proactivityService } from "../domains/proactivity";
import {
  ianaZoneOrUtc,
  getLocalParts,
  localToUtc,
  isInDndWindow,
} from "../lib/local-time";

const GENERATION_WINDOW_DAYS = 7;

/**
 * AppScheduler — in-process minute-tick scheduler.
 *
 * Runs inside the always-on Reserved VM backend. Do NOT use Replit
 * Scheduled Deployments for minute-level reminder checks — those are
 * separate deployments better suited for periodic cleanup jobs.
 *
 * Each tick:
 *   1. Generates reminder occurrences 7 days ahead (idempotent via the
 *      unique (reminder_id, scheduled_for_utc) constraint + ON CONFLICT).
 *   2. Triggers due occurrences, respecting DND for GENERAL reminders
 *      (skipped ones are recorded as response = NOT_REQUIRED).
 *
 * CONSTRAINT: Routine deviation detection (tick) must NEVER directly
 * trigger an emergency SMS. Only SafetyService may authorise SMS.
 */
export class AppScheduler {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly TICK_INTERVAL_MS = 60_000; // one minute
  private isRunning = false;

  start(): void {
    if (this.intervalHandle) {
      logger.warn("AppScheduler already running — ignoring duplicate start");
      return;
    }
    this.intervalHandle = setInterval(
      () => void this.tick(),
      this.TICK_INTERVAL_MS,
    );
    // Run one tick immediately so restarts don't wait a full minute
    void this.tick();
    logger.info({ tickIntervalMs: this.TICK_INTERVAL_MS }, "AppScheduler started");
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info("AppScheduler stopped");
    }
  }

  async tick(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Scheduler tick skipped — previous tick still running");
      return;
    }
    this.isRunning = true;
    const nowUtc = new Date();

    try {
      await Promise.allSettled([
        this.checkReminders(nowUtc),
        this.checkRoutines(nowUtc),
        this.checkProactivity(nowUtc),
        this.cleanExpiredTemporaryDnd(nowUtc),
      ]);
    } finally {
      this.isRunning = false;
    }
  }

  /** Generation pass + trigger pass, in order. */
  async checkReminders(nowUtc: Date): Promise<void> {
    try {
      await this.generateOccurrences(nowUtc);
      await this.processDueOccurrences(nowUtc);
    } catch (err) {
      logger.error({ err }, "Error checking reminders");
    }
  }

  /**
   * Materialise occurrences for the next 7 days for every active reminder.
   * localTime + recurrenceDays (or localDate for one-time) are converted
   * to UTC using the owning user's timezone. Idempotent via
   * ON CONFLICT DO NOTHING on (reminder_id, scheduled_for_utc).
   */
  private async generateOccurrences(nowUtc: Date): Promise<void> {
    const rows = await db
      .select({ reminder: reminders, timezone: users.timezone })
      .from(reminders)
      .innerJoin(users, eq(reminders.userId, users.id))
      .where(eq(reminders.isActive, true));

    for (const { reminder, timezone } of rows) {
      const occurrences = this.computeUpcomingOccurrences(
        reminder,
        ianaZoneOrUtc(timezone),
        nowUtc,
      );
      if (occurrences.length > 0) {
        await remindersService.upsertUpcomingOccurrences(
          reminder.id,
          occurrences,
        );
      }
    }
  }

  /** UTC instants of a reminder's occurrences within the next 7 days. */
  computeUpcomingOccurrences(
    reminder: Reminder,
    timezone: string,
    nowUtc: Date,
  ): Date[] {
    const out: Date[] = [];
    const horizon = nowUtc.getTime() + GENERATION_WINDOW_DAYS * 86_400_000;
    const recurrence = (reminder.recurrenceDays ?? []) as Weekday[];

    for (let i = 0; i <= GENERATION_WINDOW_DAYS; i++) {
      // Walk local calendar days starting today
      const probe = new Date(nowUtc.getTime() + i * 86_400_000);
      const p = getLocalParts(probe, timezone);

      const matches =
        recurrence.length > 0
          ? recurrence.includes(p.weekday as Weekday)
          : reminder.localDate === p.dateStr;
      if (!matches) continue;

      const utc = localToUtc(p.dateStr, reminder.localTime, timezone);
      // Skip past instants (never re-create old occurrences) and cap horizon.
      // A 10-minute grace window lets occurrences whose time just passed
      // (e.g. reminder created moments after its localTime) still fire.
      if (utc.getTime() < nowUtc.getTime() - 10 * 60_000) continue;
      if (utc.getTime() > horizon) continue;
      out.push(utc);
    }
    return out;
  }

  /**
   * Trigger due occurrences. GENERAL reminders inside a DND window are
   * recorded as NOT_REQUIRED instead of firing. MEDICATION reminders
   * always fire. All updates are idempotent.
   */
  private async processDueOccurrences(nowUtc: Date): Promise<void> {
    const due = await remindersService.getDueOccurrences(nowUtc);
    if (due.length === 0) return;

    // Load owning reminders + user timezones in one pass
    const reminderIds = [...new Set(due.map((o) => o.reminderId))];
    const reminderRows = await db
      .select({ reminder: reminders, timezone: users.timezone })
      .from(reminders)
      .innerJoin(users, eq(reminders.userId, users.id))
      .where(inArray(reminders.id, reminderIds));
    const byId = new Map(
      reminderRows.map((r) => [r.reminder.id, r]),
    );

    // DND periods per involved user
    const userIds = [...new Set(reminderRows.map((r) => r.reminder.userId))];
    const dndRows: DndPeriod[] = userIds.length
      ? await db
          .select()
          .from(dndPeriods)
          .where(
            and(
              inArray(dndPeriods.userId, userIds),
              eq(dndPeriods.isActive, true),
            ),
          )
      : [];
    const dndByUser = new Map<string, DndPeriod[]>();
    for (const dnd of dndRows) {
      const list = dndByUser.get(dnd.userId) ?? [];
      list.push(dnd);
      dndByUser.set(dnd.userId, list);
    }

    for (const occurrence of due) {
      const row = byId.get(occurrence.reminderId);
      if (!row) continue;
      const { reminder, timezone } = row;
      const tz = ianaZoneOrUtc(timezone);

      // DND is evaluated at the occurrence's SCHEDULED instant, not the
      // tick time — a reminder delayed past a tick boundary or downtime
      // keeps the semantics of its configured schedule.
      const inDnd = (dndByUser.get(reminder.userId) ?? []).some((dnd) =>
        isInDndWindow(
          occurrence.scheduledForUtc,
          dnd.startTime,
          dnd.endTime,
          dnd.recurrenceDays ?? [],
          tz,
        ),
      );

      if (inDnd && reminder.type !== "MEDICATION") {
        await remindersService.markNotRequired(occurrence.id, nowUtc);
        logger.info(
          { occurrenceId: occurrence.id, reminderId: reminder.id },
          "Reminder occurrence skipped (DND) — recorded NOT_REQUIRED",
        );
        continue;
      }

      await remindersService.markTriggered(occurrence.id, nowUtc);
      logger.info(
        {
          occurrenceId: occurrence.id,
          reminderId: reminder.id,
          userId: reminder.userId,
          type: reminder.type,
          title: reminder.title,
        },
        "Reminder occurrence triggered",
        // Delivery to the tablet is poll-based for now; WebSocket push is a
        // future concern.
      );
    }
  }

  private async checkRoutines(nowUtc: Date): Promise<void> {
    try {
      // IMPORTANT: detectDeviations records deviations only.
      // It does NOT trigger SMS — that is the safety domain's responsibility.
      await routineService.detectDeviations(nowUtc);
    } catch (err) {
      logger.error({ err }, "Error checking routines");
    }
  }

  /**
   * Remove expired temporary DND overrides — cleanup only, no side-effects.
   * Rows where endsAt < now are stale; new reads in context service ignore
   * them via the endsAt > now condition, but pruning keeps the table lean.
   */
  private async cleanExpiredTemporaryDnd(nowUtc: Date): Promise<void> {
    try {
      await db.delete(temporaryDnd).where(lte(temporaryDnd.endsAt, nowUtc));
    } catch (err) {
      logger.error({ err }, "Error cleaning expired temporary DND");
    }
  }

  private async checkProactivity(nowUtc: Date): Promise<void> {
    try {
      const triggers = await proactivityService.checkTriggers(nowUtc);
      if (triggers.length > 0) {
        logger.info({ count: triggers.length }, "Proactivity triggers pending");
        // TODO: dispatch to active sessions
      }
    } catch (err) {
      logger.error({ err }, "Error checking proactivity");
    }
  }
}

export const scheduler = new AppScheduler();

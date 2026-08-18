/**
 * ScheduleService — today's reminders + appointments for a user,
 * used by the tablet /today endpoint and the conversation context layer.
 *
 * All items are resolved against the user's local calendar day
 * (derived from user.timezone).
 */
import { eq, and, gte, lte, gt } from "drizzle-orm";
import {
  db,
  users,
  reminders,
  reminderOccurrences,
  appointments,
} from "@workspace/db";
import {
  ianaZoneOrUtc,
  localDayBoundsUtc,
  formatLocalHHMM,
} from "../lib/local-time";

/**
 * Pure helper — exported for unit testing.
 * Returns true when `now` is within the reminder window: the appointment has
 * not yet started AND the gap is within the configured lead-time.
 */
export function isInAlertWindow(
  startsAtMs: number,
  reminderMinutesBefore: number,
  nowMs: number,
): boolean {
  const minutesUntil = (startsAtMs - nowMs) / 60_000;
  return minutesUntil > 0 && minutesUntil <= reminderMinutesBefore;
}

export interface AppointmentAlertItem {
  id: string;
  title: string;
  /** ISO UTC timestamp of the appointment start */
  startsAtUtc: string;
  /** The configured reminder window (minutes) */
  reminderMinutesBefore: number;
}

export interface TodayItem {
  id: string;
  type: "reminder" | "medication" | "appointment";
  title: string;
  /** Local HH:MM in the user's timezone */
  time: string;
  done: boolean;
  occurrenceId?: string;
  /** Minutes before start to surface a pre-alert (appointments only) */
  reminderMinutesBefore?: number;
  /** ISO UTC timestamp of appointment start (appointments only) */
  startsAtUtc?: string;
}

export class ScheduleService {
  /** Structured list of today's items, sorted by local time. */
  async getTodayItems(userId: string): Promise<TodayItem[]> {
    const [user] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const timezone = ianaZoneOrUtc(user?.timezone);
    const { start, end } = localDayBoundsUtc(timezone);

    const [occRows, apptRows] = await Promise.all([
      db
        .select({ occurrence: reminderOccurrences, reminder: reminders })
        .from(reminderOccurrences)
        .innerJoin(reminders, eq(reminderOccurrences.reminderId, reminders.id))
        .where(
          and(
            eq(reminders.userId, userId),
            eq(reminders.isActive, true),
            gte(reminderOccurrences.scheduledForUtc, start),
            lte(reminderOccurrences.scheduledForUtc, end),
          ),
        ),
      db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.userId, userId),
            eq(appointments.isActive, true),
            gte(appointments.startsAtUtc, start),
            lte(appointments.startsAtUtc, end),
          ),
        ),
    ]);

    const items: (TodayItem & { _sort: number })[] = [];

    for (const { occurrence, reminder } of occRows) {
      const isMedication = reminder.type === "MEDICATION";
      const done =
        occurrence.response !== null
          ? true
          : !isMedication && occurrence.triggeredAt !== null;
      items.push({
        id: reminder.id,
        type: isMedication ? "medication" : "reminder",
        title: reminder.title,
        time: formatLocalHHMM(occurrence.scheduledForUtc, timezone),
        done,
        occurrenceId: occurrence.id,
        _sort: occurrence.scheduledForUtc.getTime(),
      });
    }

    for (const appt of apptRows) {
      items.push({
        id: appt.id,
        type: "appointment",
        title: appt.title,
        time: formatLocalHHMM(appt.startsAtUtc, timezone),
        done: appt.startsAtUtc.getTime() < Date.now(),
        _sort: appt.startsAtUtc.getTime(),
        startsAtUtc: appt.startsAtUtc.toISOString(),
        ...(appt.reminderMinutesBefore !== null
          ? { reminderMinutesBefore: appt.reminderMinutesBefore }
          : {}),
      });
    }

    return items
      .sort((a, b) => a._sort - b._sort)
      .map(({ _sort: _s, ...rest }) => rest);
  }

  /**
   * Reminder-alert candidates: upcoming appointments (next 24 h, crossing
   * day boundaries) that have a reminder configured — INCLUDING those whose
   * window hasn't opened yet. Clients evaluate the window locally on a fast
   * timer (see isInAlertWindow), so short windows that open and close
   * between fetches are still caught.
   */
  async getUpcomingAlerts(userId: string): Promise<AppointmentAlertItem[]> {
    const now = new Date();
    // Look ahead up to 24 h — the maximum reminder window allowed by the admin form
    const ceiling = new Date(now.getTime() + 24 * 60 * 60 * 1_000);

    const rows = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.userId, userId),
          eq(appointments.isActive, true),
          gt(appointments.startsAtUtc, now),
          lte(appointments.startsAtUtc, ceiling),
        ),
      );

    return rows
      // Skip appointments with no reminder configured. Appointments whose
      // reminder window hasn't opened yet are INCLUDED — clients re-evaluate
      // the window locally on a fast timer, so a short reminder window that
      // opens and closes between fetches is still caught and spoken/shown.
      .filter((appt) => appt.reminderMinutesBefore != null)
      .map((appt) => ({
        id: appt.id,
        title: appt.title,
        startsAtUtc: appt.startsAtUtc.toISOString(),
        reminderMinutesBefore: appt.reminderMinutesBefore!,
      }));
  }

  /**
   * Formatted string of today's schedule for LLM system prompt injection.
   * Returns "" when nothing is scheduled.
   */
  async getTodaySchedule(userId: string): Promise<string> {
    const items = await this.getTodayItems(userId);
    if (items.length === 0) return "";
    return items
      .map(
        (i) =>
          `  • ${i.time}  ${i.title}  (${i.type}${i.done ? ", done" : ""})`,
      )
      .join("\n");
  }
}

export const scheduleService = new ScheduleService();

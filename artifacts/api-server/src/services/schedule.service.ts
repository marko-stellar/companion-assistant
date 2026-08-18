/**
 * ScheduleService — today's reminders + appointments for a user,
 * used by the tablet /today endpoint and the conversation context layer.
 *
 * All items are resolved against the user's local calendar day
 * (derived from user.timezone).
 */
import { eq, and, gte, lte } from "drizzle-orm";
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

export interface TodayItem {
  id: string;
  type: "reminder" | "medication" | "appointment";
  title: string;
  /** Local HH:MM in the user's timezone */
  time: string;
  done: boolean;
  occurrenceId?: string;
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
      });
    }

    return items
      .sort((a, b) => a._sort - b._sort)
      .map(({ _sort: _s, ...rest }) => rest);
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

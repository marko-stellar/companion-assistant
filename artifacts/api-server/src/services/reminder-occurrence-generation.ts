import type { Reminder, Weekday } from "@workspace/db";
import { getLocalParts, localToUtc } from "../lib/local-time";

export const REMINDER_GENERATION_WINDOW_DAYS = 7;

/**
 * Compute the upcoming UTC occurrences for a reminder in its owner's local
 * timezone. Kept separate from the scheduler so reminder create/edit flows can
 * materialize their schedule immediately instead of waiting for the next tick.
 */
export function computeUpcomingReminderOccurrences(
  reminder: Reminder,
  timezone: string,
  nowUtc: Date,
): Date[] {
  const occurrences: Date[] = [];
  const horizon = nowUtc.getTime() + REMINDER_GENERATION_WINDOW_DAYS * 86_400_000;
  const recurrence = (reminder.recurrenceDays ?? []) as Weekday[];

  for (let i = 0; i <= REMINDER_GENERATION_WINDOW_DAYS; i++) {
    const probe = new Date(nowUtc.getTime() + i * 86_400_000);
    const localDay = getLocalParts(probe, timezone);
    const matches =
      recurrence.length > 0
        ? recurrence.includes(localDay.weekday as Weekday)
        : reminder.localDate === localDay.dateStr;
    if (!matches) continue;

    const scheduledForUtc = localToUtc(
      localDay.dateStr,
      reminder.localTime,
      timezone,
    );

    // Keep the existing ten-minute grace period for reminders created just
    // after their intended time, but never recreate genuinely missed events.
    if (scheduledForUtc.getTime() < nowUtc.getTime() - 10 * 60_000) continue;
    if (scheduledForUtc.getTime() > horizon) continue;
    occurrences.push(scheduledForUtc);
  }

  return occurrences;
}
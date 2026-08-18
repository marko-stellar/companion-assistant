import type { AppointmentAlert } from "@workspace/api-client-react";

export interface AppointmentAlertItem {
  id: string;
  title: string;
  minutesUntil: number;
}

/**
 * Filters server-provided alerts to those still in-window right now and
 * attaches a live minutesUntil countdown. The server already did the heavy
 * lifting (cross-day boundary check included); we re-check here so the
 * banner disappears promptly when the window closes between fetches.
 */
export function getActiveAlerts(
  alerts: AppointmentAlert[],
  now: Date,
): AppointmentAlertItem[] {
  const results: AppointmentAlertItem[] = [];
  for (const alert of alerts) {
    const minutesUntil =
      (new Date(alert.startsAtUtc).getTime() - now.getTime()) / 60_000;
    if (minutesUntil > 0 && minutesUntil <= alert.reminderMinutesBefore) {
      results.push({
        id: alert.id,
        title: alert.title,
        minutesUntil: Math.ceil(minutesUntil),
      });
    }
  }
  return results;
}

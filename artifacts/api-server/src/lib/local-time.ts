/**
 * Local-time ↔ UTC helpers for the scheduler and today endpoints.
 * All conversions are Intl-based (no external tz library).
 */

export const WEEKDAY_CODES = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

/** Guard against unknown/invalid timezone strings. */
export function ianaZoneOrUtc(timezone: string | null | undefined): string {
  if (!timezone) return "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

/** Read y/m/d h:m:s + weekday of a UTC instant as seen in `timezone`. */
export function getLocalParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ianaZoneOrUtc(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const num = (type: string) => parseInt(get(type), 10) || 0;

  const hour = num("hour") % 24; // some Intl impls emit "24"
  const weekday = get("weekday").slice(0, 3).toUpperCase() as WeekdayCode;

  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
    hour,
    minute: num("minute"),
    second: num("second"),
    weekday,
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${String(hour).padStart(2, "0")}:${get("minute")}`,
  };
}

/**
 * Convert a local wall-clock date+time in `timezone` to the UTC instant.
 * dateStr: "YYYY-MM-DD", timeStr: "HH:MM".
 * Iterative offset correction handles DST transitions.
 */
export function localToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string,
): Date {
  const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  const [hh, mm] = timeStr.split(":").map((v) => parseInt(v, 10));

  // Initial guess: treat the wall-clock values as if they were UTC.
  let guess = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);

  for (let i = 0; i < 3; i++) {
    const p = getLocalParts(new Date(guess), timezone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
    const want = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
    const diff = want - seen;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** Format a UTC Date as "HH:MM" in the given timezone. */
export function formatLocalHHMM(date: Date, timezone: string): string {
  const p = getLocalParts(date, timezone);
  return p.hhmm;
}

/**
 * UTC instants bracketing the current local calendar day in `timezone`.
 */
export function localDayBoundsUtc(
  timezone: string,
  now: Date = new Date(),
): { start: Date; end: Date; dateStr: string } {
  const p = getLocalParts(now, timezone);
  const start = localToUtc(p.dateStr, "00:00", timezone);
  // End = next local calendar midnight − 1ms. Computed via timezone
  // conversion (not start + 24h) so DST days of 23h/25h stay correct.
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const nextDateStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  const end = new Date(
    localToUtc(nextDateStr, "00:00", timezone).getTime() - 1,
  );
  return { start, end, dateStr: p.dateStr };
}

/** "HH:MM" → minutes since local midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Is `nowUtc` inside a DND window defined by local start/end HH:MM strings
 * (interpreted in `timezone`)? Handles overnight windows (start > end).
 * `days` uses "Mon"/"MON" style prefixes; empty = every day.
 */
export function isInDndWindow(
  nowUtc: Date,
  startTime: string,
  endTime: string,
  days: string[],
  timezone: string,
): boolean {
  const p = getLocalParts(nowUtc, timezone);
  const nowMin = p.hour * 60 + p.minute;
  const startMin = hhmmToMinutes(startTime);
  const endMin = hhmmToMinutes(endTime);

  const dayMatches = (weekday: WeekdayCode) =>
    days.length === 0 ||
    days.some((d) => d.slice(0, 3).toUpperCase() === weekday);

  if (startMin <= endMin) {
    // Same-day window
    return dayMatches(p.weekday) && nowMin >= startMin && nowMin < endMin;
  }

  // Overnight window (e.g. 22:00–08:00)
  if (nowMin >= startMin) {
    // Evening part — belongs to today's window
    return dayMatches(p.weekday);
  }
  if (nowMin < endMin) {
    // Morning part — belongs to yesterday's window
    const prevIdx =
      (WEEKDAY_CODES.indexOf(p.weekday) + 6) % 7;
    return dayMatches(WEEKDAY_CODES[prevIdx]);
  }
  return false;
}

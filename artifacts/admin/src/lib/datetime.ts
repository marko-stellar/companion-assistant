/**
 * Shared date/time helpers for the admin scheduling tabs.
 *
 * - `datetime-local` inputs work in the *admin's* browser-local time.
 * - The API stores UTC ISO strings.
 * - Display values are shown in the *senior user's* timezone when provided.
 */

/** Convert a `datetime-local` input value (browser-local) to a UTC ISO string. */
export function datetimeLocalToUtcIso(value: string): string {
  return new Date(value).toISOString();
}

/** Convert a UTC ISO string to a `datetime-local` input value (browser-local). */
export function utcIsoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Format a UTC ISO string as a readable date+time in the given IANA timezone. */
export function formatInTimezone(iso: string, timezone?: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    // Invalid timezone string — fall back to browser-local
    return new Date(iso).toLocaleString();
  }
}

/** Format a UTC ISO string as a short time (e.g. "8:30 AM") in the given timezone. */
export function formatTimeInTimezone(iso: string, timezone?: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(iso).toLocaleTimeString();
  }
}

/** Format an "HH:MM" 24h local-time string as a friendly 12h time. */
export function formatLocalHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

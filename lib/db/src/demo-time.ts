/**
 * Timezone helpers for the fictional demo seed. Pure functions — the clock
 * is injected so DST and rerun behavior are unit-testable.
 */

export interface LocalParts {
  y: number;
  mo: number; // 1-12
  d: number;
  hh: number;
  mm: number;
}

/**
 * Convert a wall-clock time in an IANA timezone to the UTC instant,
 * DST-correct, using only Intl (no extra dependency in this package).
 */
export function zonedLocalToUtc(
  timezone: string,
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
): Date {
  const guess = Date.UTC(y, mo - 1, d, hh, mm, 0, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(
    dtf.formatToParts(new Date(guess)).map((x) => [x.type, x.value]),
  );
  const asLocal = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return new Date(guess - (asLocal - guess));
}

/** Wall-clock parts of an instant in a timezone. */
export function partsInZone(timezone: string, now: Date): LocalParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(
    dtf.formatToParts(now).map((x) => [x.type, x.value]),
  );
  return {
    y: Number(p.year),
    mo: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour) % 24,
    mm: Number(p.minute),
  };
}

/**
 * Compute the demo appointment instant: TODAY in the given timezone (so it
 * always appears on the tablet Today list), at 17:30 local — or, when the
 * local clock is already past 16:30, at the next half hour that is at least
 * 90 minutes ahead (capped at 23:30 the same local day).
 */
export function computeDemoAppointmentUtc(
  timezone: string,
  now: Date = new Date(),
): Date {
  const local = partsInZone(timezone, now);
  let hh = 17;
  let mm = 30;
  if (local.hh > 16 || (local.hh === 16 && local.mm >= 30)) {
    let minutes = local.hh * 60 + local.mm + 90;
    minutes = Math.ceil(minutes / 30) * 30;
    minutes = Math.min(minutes, 23 * 60 + 30); // stay on today's local date
    hh = Math.floor(minutes / 60);
    mm = minutes % 60;
  }
  return zonedLocalToUtc(timezone, local.y, local.mo, local.d, hh, mm);
}

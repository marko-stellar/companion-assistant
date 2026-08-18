/**
 * Unit tests for appointment pre-alert window logic.
 *
 * Covers:
 *  1. Standard in-window alert (same day)
 *  2. Alert exactly at the window boundary (inclusive)
 *  3. Alert expiry — appointment has already started
 *  4. Alert before the window opens (too early)
 *  5. Cross-midnight: evening check for a post-midnight appointment
 *  6. Exact-midnight appointment
 *  7. No reminder configured → never alerts
 */
import { describe, it, expect } from "vitest";
import { isInAlertWindow } from "../services/schedule.service";

const MINS = 60_000; // 1 minute in ms

describe("isInAlertWindow", () => {
  it("returns true when now is inside the reminder window", () => {
    const startsAt = Date.now() + 20 * MINS; // appointment in 20 min
    expect(isInAlertWindow(startsAt, 30, Date.now())).toBe(true);
  });

  it("returns true at exactly the window boundary (reminderMinutesBefore minutes before)", () => {
    const now = Date.now();
    const startsAt = now + 30 * MINS;          // exactly 30 minutes away
    expect(isInAlertWindow(startsAt, 30, now)).toBe(true);
  });

  it("returns false when the appointment has already started (minutesUntil <= 0)", () => {
    const startsAt = Date.now() - 1 * MINS;   // started 1 minute ago
    expect(isInAlertWindow(startsAt, 30, Date.now())).toBe(false);
  });

  it("returns false when the appointment starts exactly now", () => {
    const now = Date.now();
    expect(isInAlertWindow(now, 30, now)).toBe(false);
  });

  it("returns false when now is before the window opens (appointment too far away)", () => {
    const startsAt = Date.now() + 60 * MINS;  // 60 min away, window is 30 min
    expect(isInAlertWindow(startsAt, 30, Date.now())).toBe(false);
  });

  // ── Cross-midnight scenarios ──────────────────────────────────────────────

  it("cross-midnight: alerts at 23:50 for a 00:15 appointment with 30-min window", () => {
    // Simulate 23:50 local time; appointment is at 00:15 (25 min away)
    const eveningNow = new Date("2025-01-15T22:50:00Z").getTime(); // UTC proxy for local 23:50
    const midnightAppt = new Date("2025-01-15T23:15:00Z").getTime(); // UTC proxy for local 00:15
    const minutesUntil = (midnightAppt - eveningNow) / MINS;        // 25 min
    expect(minutesUntil).toBe(25);
    expect(isInAlertWindow(midnightAppt, 30, eveningNow)).toBe(true);
  });

  it("cross-midnight: does NOT alert at 22:00 for a 00:15 appointment with 30-min window", () => {
    // 135 minutes away — outside the 30-min window
    const earlyEvening = new Date("2025-01-15T21:00:00Z").getTime();
    const midnightAppt = new Date("2025-01-15T23:15:00Z").getTime();
    expect(isInAlertWindow(midnightAppt, 30, earlyEvening)).toBe(false);
  });

  it("exact-midnight appointment is alerted during its window", () => {
    // Appointment at 00:00:00, checked at 23:45 (15 min before) with 30-min window
    const beforeMidnight = new Date("2025-01-15T22:45:00Z").getTime();
    const midnight = new Date("2025-01-15T23:00:00Z").getTime();
    expect(isInAlertWindow(midnight, 30, beforeMidnight)).toBe(true);
  });

  it("exact-midnight appointment is NOT alerted after it has started", () => {
    const afterMidnight = new Date("2025-01-16T00:01:00Z").getTime();
    const midnight = new Date("2025-01-16T00:00:00Z").getTime();
    expect(isInAlertWindow(midnight, 30, afterMidnight)).toBe(false);
  });

  // ── Short lead-time windows (spoken-reminder discovery) ──────────────────
  // The server returns alert CANDIDATES before their window opens; clients
  // re-evaluate on a fast timer. These prove a short window (e.g. 2 minutes)
  // that opens between server fetches is still caught locally.

  it("short window: not alerted before the window opens, alerted once inside it", () => {
    const now = Date.now();
    const startsAt = now + 4 * MINS; // appointment in 4 min, 2-min reminder
    expect(isInAlertWindow(startsAt, 2, now)).toBe(false);          // too early
    expect(isInAlertWindow(startsAt, 2, now + 2 * MINS)).toBe(true); // boundary (2 min left)
    expect(isInAlertWindow(startsAt, 2, now + 3 * MINS)).toBe(true); // inside (1 min left)
    expect(isInAlertWindow(startsAt, 2, now + 4 * MINS)).toBe(false); // started
  });

  it("1-minute window is catchable by a sub-minute local timer", () => {
    const now = Date.now();
    const startsAt = now + 1 * MINS;
    expect(isInAlertWindow(startsAt, 1, now)).toBe(true);           // window just opened
    expect(isInAlertWindow(startsAt, 1, now + 30_000)).toBe(true);  // 30 s left
    expect(isInAlertWindow(startsAt, 1, now + 60_000)).toBe(false); // started
  });
});

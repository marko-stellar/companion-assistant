import { describe, it, expect } from "vitest";
import { getActiveAlerts } from "../alerts";
import type { AppointmentAlert } from "@workspace/api-client-react";

/** Build a minimal AppointmentAlert for test purposes. */
function makeAlert(
  overrides: Partial<AppointmentAlert> & { minutesFromNow: number },
  now: Date,
): AppointmentAlert {
  const startsAt = new Date(now.getTime() + overrides.minutesFromNow * 60_000);
  return {
    id: overrides.id ?? "alert-1",
    title: overrides.title ?? "Doctor visit",
    startsAtUtc: startsAt.toISOString(),
    reminderMinutesBefore: overrides.reminderMinutesBefore ?? 30,
  };
}

describe("getActiveAlerts", () => {
  const NOW = new Date("2026-08-18T10:00:00Z");

  it("shows an alert when the appointment is within the reminder window", () => {
    const alert = makeAlert({ minutesFromNow: 15, reminderMinutesBefore: 30 }, NOW);
    const result = getActiveAlerts([alert], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("alert-1");
    expect(result[0].minutesUntil).toBe(15);
  });

  it("shows no alert when the appointment window has already passed (minutesUntil ≤ 0)", () => {
    // Appointment is 10 minutes in the past
    const alert = makeAlert({ minutesFromNow: -10, reminderMinutesBefore: 30 }, NOW);
    const result = getActiveAlerts([alert], NOW);
    expect(result).toHaveLength(0);
  });

  it("shows no alert when the appointment is outside the reminder window (too far ahead)", () => {
    // Appointment is 60 minutes away but window is only 30 minutes
    const alert = makeAlert({ minutesFromNow: 60, reminderMinutesBefore: 30 }, NOW);
    const result = getActiveAlerts([alert], NOW);
    expect(result).toHaveLength(0);
  });

  it("shows no alert when reminderMinutesBefore is 0", () => {
    // Server should never send this, but guard against it
    const alert = makeAlert({ minutesFromNow: 5, reminderMinutesBefore: 0 }, NOW);
    const result = getActiveAlerts([alert], NOW);
    expect(result).toHaveLength(0);
  });

  it("shows no alert when the appointment starts exactly now (minutesUntil is 0, not > 0)", () => {
    const alert = makeAlert({ minutesFromNow: 0, reminderMinutesBefore: 30 }, NOW);
    const result = getActiveAlerts([alert], NOW);
    expect(result).toHaveLength(0);
  });

  it("filters multiple appointments and only returns in-window ones", () => {
    const alerts: AppointmentAlert[] = [
      makeAlert({ id: "a1", minutesFromNow: 10, reminderMinutesBefore: 30 }, NOW),  // in window ✓
      makeAlert({ id: "a2", minutesFromNow: -5, reminderMinutesBefore: 30 }, NOW),  // past ✗
      makeAlert({ id: "a3", minutesFromNow: 90, reminderMinutesBefore: 30 }, NOW),  // too far ✗
      makeAlert({ id: "a4", minutesFromNow: 25, reminderMinutesBefore: 30 }, NOW),  // in window ✓
    ];
    const result = getActiveAlerts(alerts, NOW);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["a1", "a4"]);
  });

  it("rounds minutesUntil up to the nearest whole minute", () => {
    // 14.3 minutes away → should show 15
    const startsAt = new Date(NOW.getTime() + 14.3 * 60_000);
    const alert: AppointmentAlert = {
      id: "a-frac",
      title: "Physio",
      startsAtUtc: startsAt.toISOString(),
      reminderMinutesBefore: 30,
    };
    const result = getActiveAlerts([alert], NOW);
    expect(result).toHaveLength(1);
    expect(result[0].minutesUntil).toBe(15);
  });

  it("handles an empty alert list", () => {
    expect(getActiveAlerts([], NOW)).toEqual([]);
  });
});

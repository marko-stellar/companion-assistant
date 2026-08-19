import { describe, it, expect } from "vitest";
import {
  zonedLocalToUtc,
  partsInZone,
  computeDemoAppointmentUtc,
} from "@workspace/db/demo-time";

const ZG = "Europe/Zagreb";

describe("zonedLocalToUtc", () => {
  it("converts Zagreb winter time (CET, UTC+1)", () => {
    const d = zonedLocalToUtc(ZG, 2026, 1, 15, 17, 30);
    expect(d.toISOString()).toBe("2026-01-15T16:30:00.000Z");
  });

  it("converts Zagreb summer time (CEST, UTC+2)", () => {
    const d = zonedLocalToUtc(ZG, 2026, 8, 19, 17, 30);
    expect(d.toISOString()).toBe("2026-08-19T15:30:00.000Z");
  });

  it("handles the day of the spring-forward DST transition", () => {
    // 2026-03-29 is the CET→CEST switch in Europe/Zagreb.
    const d = zonedLocalToUtc(ZG, 2026, 3, 29, 17, 30);
    expect(d.toISOString()).toBe("2026-03-29T15:30:00.000Z");
  });
});

describe("computeDemoAppointmentUtc", () => {
  it("targets today 17:30 local when seeded in the morning", () => {
    const now = zonedLocalToUtc(ZG, 2026, 8, 19, 9, 0);
    const appt = computeDemoAppointmentUtc(ZG, now);
    expect(partsInZone(ZG, appt)).toMatchObject({
      y: 2026,
      mo: 8,
      d: 19,
      hh: 17,
      mm: 30,
    });
  });

  it("stays on TODAY even when seeded late, moving to the next half hour ≥90min ahead", () => {
    const now = zonedLocalToUtc(ZG, 2026, 8, 19, 18, 10);
    const appt = computeDemoAppointmentUtc(ZG, now);
    const local = partsInZone(ZG, appt);
    expect(local.d).toBe(19); // same local day — visible on Today list
    expect(local.hh * 60 + local.mm).toBeGreaterThanOrEqual(18 * 60 + 10 + 90);
  });

  it("caps at 23:30 local so the appointment never crosses midnight", () => {
    const now = zonedLocalToUtc(ZG, 2026, 8, 19, 23, 0);
    const appt = computeDemoAppointmentUtc(ZG, now);
    expect(partsInZone(ZG, appt)).toMatchObject({ d: 19, hh: 23, mm: 30 });
  });

  it("is rerun-stable: recomputing on a later day lands on that day", () => {
    const day1 = computeDemoAppointmentUtc(ZG, zonedLocalToUtc(ZG, 2026, 8, 19, 9, 0));
    const day2 = computeDemoAppointmentUtc(ZG, zonedLocalToUtc(ZG, 2026, 8, 20, 9, 0));
    expect(partsInZone(ZG, day1).d).toBe(19);
    expect(partsInZone(ZG, day2).d).toBe(20);
  });
});

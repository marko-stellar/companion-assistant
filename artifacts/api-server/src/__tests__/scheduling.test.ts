/**
 * Targeted scheduling-backend tests (DB-backed).
 *
 * Covers the occurrence lifecycle rules:
 *  1. respond() is restricted to triggered, unanswered occurrences and
 *     never overwrites a recorded answer.
 *  2. Schedule edits wipe pending occurrences (reconciliation).
 *  3. DND is evaluated at the occurrence's scheduled instant, not tick time.
 *  4. Occurrence generation is idempotent across re-runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, users, dndPeriods, reminderOccurrences } from "@workspace/db";
import { eq } from "drizzle-orm";
import { AppScheduler } from "../jobs/scheduler";
import { remindersService } from "../domains/reminders";
import { isInDndWindow, localDayBoundsUtc } from "../lib/local-time";

const TZ = "Europe/Zagreb";
const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

let userId: string;
const scheduler = new AppScheduler();

const hhmmAgo = (minutesAgo: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(Date.now() - minutesAgo * 60_000));

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({ displayName: "Scheduling Test User", timezone: TZ })
    .returning();
  userId = u.id;
});

afterAll(async () => {
  // Cascades reminders, occurrences, dnd periods
  await db.delete(users).where(eq(users.id, userId));
});

describe("occurrence generation", () => {
  it("generates ~7 days ahead and is idempotent on re-run", async () => {
    const rem = await remindersService.createReminder({
      userId,
      title: "Gen test",
      type: "GENERAL",
      localTime: "23:59",
      recurrenceDays: [...ALL_DAYS],
    });
    await scheduler.checkReminders(new Date());
    const first = await db
      .select()
      .from(reminderOccurrences)
      .where(eq(reminderOccurrences.reminderId, rem.id));
    expect(first.length).toBeGreaterThanOrEqual(7);

    await scheduler.checkReminders(new Date());
    const second = await db
      .select()
      .from(reminderOccurrences)
      .where(eq(reminderOccurrences.reminderId, rem.id));
    expect(second.length).toBe(first.length);
    await remindersService.deactivateReminder(rem.id);
  });
});

describe("respond lifecycle", () => {
  it("rejects responses on untriggered occurrences and never overwrites an answer", async () => {
    const rem = await remindersService.createReminder({
      userId,
      title: "Meds",
      type: "MEDICATION",
      localTime: hhmmAgo(2),
      recurrenceDays: [...ALL_DAYS],
    });
    await scheduler.checkReminders(new Date());
    const occ = await db
      .select()
      .from(reminderOccurrences)
      .where(eq(reminderOccurrences.reminderId, rem.id));

    const future = occ.find((o) => !o.triggeredAt);
    const fired = occ.find((o) => o.triggeredAt);
    expect(fired).toBeDefined();
    expect(future).toBeDefined();

    // Future/unfired occurrence cannot be answered
    expect(await remindersService.respond(future!.id, "YES")).toBe(false);

    // Triggered occurrence can be answered exactly once
    expect(await remindersService.respond(fired!.id, "NO")).toBe(true);
    expect(await remindersService.respond(fired!.id, "YES")).toBe(false);

    const after = await remindersService.getOccurrenceWithReminder(fired!.id);
    expect(after?.occurrence.response).toBe("NO");
    await remindersService.deactivateReminder(rem.id);
  });
});

describe("schedule-edit reconciliation", () => {
  it("wipes pending occurrences when localTime changes and on deactivation", async () => {
    const rem = await remindersService.createReminder({
      userId,
      title: "Recon",
      type: "GENERAL",
      localTime: "23:00",
      recurrenceDays: [...ALL_DAYS],
    });
    await scheduler.checkReminders(new Date());
    const before = await db
      .select()
      .from(reminderOccurrences)
      .where(eq(reminderOccurrences.reminderId, rem.id));
    expect(before.length).toBeGreaterThan(0);

    await remindersService.updateReminder(rem.id, { localTime: "22:00" });
    const wiped = await db
      .select()
      .from(reminderOccurrences)
      .where(eq(reminderOccurrences.reminderId, rem.id));
    expect(wiped.length).toBe(0);

    await scheduler.checkReminders(new Date());
    await remindersService.deactivateReminder(rem.id);
    const gone = await db
      .select()
      .from(reminderOccurrences)
      .where(eq(reminderOccurrences.reminderId, rem.id));
    expect(gone.length).toBe(0);
  });
});

describe("DND evaluated at the scheduled instant", () => {
  it("skips a GENERAL occurrence whose scheduled time fell in DND, even when processed later", async () => {
    // DND window that covered the scheduled time (30 min ago) but NOT "now".
    const start = hhmmAgo(45);
    const end = hhmmAgo(15);
    await db.insert(dndPeriods).values({
      userId,
      startTime: start,
      endTime: end,
      recurrenceDays: [],
    });

    const scheduledInstant = new Date(Date.now() - 30 * 60_000);
    expect(isInDndWindow(scheduledInstant, start, end, [], TZ)).toBe(true);
    expect(isInDndWindow(new Date(), start, end, [], TZ)).toBe(false);

    const rem = await remindersService.createReminder({
      userId,
      title: "DND general",
      type: "GENERAL",
      localTime: hhmmAgo(30),
      recurrenceDays: [...ALL_DAYS],
    });
    // Insert the overdue occurrence directly (30 min ago is outside the
    // scheduler's generation grace window).
    await remindersService.upsertUpcomingOccurrences(rem.id, [
      scheduledInstant,
    ]);

    await scheduler.checkReminders(new Date());
    const occ = await db
      .select()
      .from(reminderOccurrences)
      .where(eq(reminderOccurrences.reminderId, rem.id));
    const processed = occ.find(
      (o) => o.scheduledForUtc.getTime() === scheduledInstant.getTime(),
    );
    expect(processed?.response).toBe("NOT_REQUIRED");
    expect(processed?.triggeredAt).toBeNull();

    await db.delete(dndPeriods).where(eq(dndPeriods.userId, userId));
    await remindersService.deactivateReminder(rem.id);
  });
});

describe("local day bounds", () => {
  it("handles 23h/25h DST days", () => {
    const spring = localDayBoundsUtc(TZ, new Date("2026-03-29T10:00:00Z"));
    expect((spring.end.getTime() + 1 - spring.start.getTime()) / 3_600_000).toBe(23);
    const fall = localDayBoundsUtc(TZ, new Date("2026-10-25T10:00:00Z"));
    expect((fall.end.getTime() + 1 - fall.start.getTime()) / 3_600_000).toBe(25);
  });
});

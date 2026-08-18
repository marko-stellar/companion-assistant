/**
 * Fixture test for the legacy-reminder backfill in migration
 * lib/db/migrations/20260818112241_quick_marauders.sql.
 *
 * Recreates the LEGACY reminders/users shape (remind_at_utc +
 * recurrence_rule) in a scratch PG schema, executes the migration's
 * BACKFILL block against it, and asserts that one-time and recurring
 * reminders keep their intended local schedule.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const MIGRATION = path.resolve(
  __dirname,
  "../../../../lib/db/migrations/20260818112241_quick_marauders.sql",
);

function extractBlock(marker: string): string {
  const text = fs.readFileSync(MIGRATION, "utf8");
  const m = text.match(
    new RegExp(`-- ${marker}:BEGIN[^\\n]*\\n([\\s\\S]*?)-- ${marker}:END`),
  );
  if (!m) throw new Error(`${marker} block not found in migration`);
  // Strip drizzle statement-breakpoint markers so the block runs as plain SQL
  return m[1].replaceAll("--> statement-breakpoint", "");
}

const SCHEMA = "mig_backfill_test";

beforeAll(async () => {
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`));
  await db.execute(sql.raw(`CREATE SCHEMA ${SCHEMA}`));
});

afterAll(async () => {
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`));
});

describe("legacy reminder backfill", () => {
  it("derives local_time/local_date/recurrence_days from remind_at_utc + recurrence_rule", async () => {
    const backfill = extractBlock("BACKFILL");

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL search_path TO ${SCHEMA}`));

      // Legacy-shaped tables (new columns present as after the ADDs,
      // legacy columns not yet dropped — exactly the migration midpoint).
      await tx.execute(
        sql.raw(`
        CREATE TABLE users (id uuid PRIMARY KEY, timezone text NOT NULL DEFAULT 'UTC');
        CREATE TABLE reminders (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL REFERENCES users(id),
          title text NOT NULL,
          remind_at_utc timestamp,
          recurrence_rule text,
          local_time text NOT NULL DEFAULT '09:00',
          recurrence_days jsonb NOT NULL DEFAULT '[]'::jsonb,
          local_date text
        );
        INSERT INTO users VALUES
          ('00000000-0000-4000-8000-000000000001', 'Europe/Zagreb'),
          ('00000000-0000-4000-8000-000000000002', 'America/New_York'),
          ('00000000-0000-4000-8000-000000000003', 'Not/AZone');
        INSERT INTO reminders (id, user_id, title, remind_at_utc, recurrence_rule) VALUES
          -- one-time: 2026-06-15 07:30 UTC = 09:30 Zagreb (CEST)
          ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','one-time','2026-06-15 07:30:00',NULL),
          -- daily: 18:00 UTC = 14:00 New York (EDT)
          ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','daily','2026-06-15 18:00:00','FREQ=DAILY'),
          -- weekly BYDAY
          ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','weekly','2026-06-15 07:30:00','FREQ=WEEKLY;BYDAY=MO,TH'),
          -- weekly without BYDAY: 2026-06-15 is a Monday (07:30 UTC = 09:30 Zagreb, still Monday)
          ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','weekly-implicit','2026-06-15 07:30:00','FREQ=WEEKLY'),
          -- unsupported rule → preserved as one-time at original local date/time
          ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','monthly','2026-06-15 07:30:00','FREQ=MONTHLY'),
          -- invalid timezone → falls back to UTC wall time
          ('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000003','badtz','2026-06-15 07:30:00',NULL);
      `),
      );

      await tx.execute(sql.raw(backfill));

      const res = await tx.execute(
        sql.raw(
          `SELECT title, local_time, local_date, recurrence_days::text AS days FROM reminders ORDER BY title`,
        ),
      );
      return res.rows as {
        title: string;
        local_time: string;
        local_date: string | null;
        days: string;
      }[];
    });

    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));

    // One-time in Zagreb: 07:30 UTC → 09:30 local, one-time date kept
    expect(byTitle["one-time"].local_time).toBe("09:30");
    expect(byTitle["one-time"].local_date).toBe("2026-06-15");
    expect(JSON.parse(byTitle["one-time"].days)).toEqual([]);

    // Daily in New York: 18:00 UTC → 14:00 local, all 7 days
    expect(byTitle["daily"].local_time).toBe("14:00");
    expect(JSON.parse(byTitle["daily"].days)).toHaveLength(7);
    expect(byTitle["daily"].local_date).toBeNull();

    // Weekly BYDAY=MO,TH
    expect(JSON.parse(byTitle["weekly"].days)).toEqual(["MON", "THU"]);
    expect(byTitle["weekly"].local_time).toBe("09:30");

    // Weekly without BYDAY → weekday of the original local instant (Monday)
    expect(JSON.parse(byTitle["weekly-implicit"].days)).toEqual(["MON"]);

    // Unsupported rule → one-time at the original local date/time
    expect(byTitle["monthly"].local_time).toBe("09:30");
    expect(byTitle["monthly"].local_date).toBe("2026-06-15");
    expect(JSON.parse(byTitle["monthly"].days)).toEqual([]);

    // Invalid timezone → UTC wall time preserved
    expect(byTitle["badtz"].local_time).toBe("07:30");
    expect(byTitle["badtz"].local_date).toBe("2026-06-15");
  });

  it("maps legacy occurrence lifecycle state so completed/past occurrences never re-trigger", async () => {
    const occBackfill = extractBlock("BACKFILL_OCC");

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL search_path TO ${SCHEMA}`));
      await tx.execute(
        sql.raw(`
        DROP TABLE IF EXISTS reminder_occurrences;
        CREATE TABLE reminder_occurrences (
          id uuid PRIMARY KEY,
          reminder_id uuid NOT NULL,
          scheduled_for_utc timestamp NOT NULL,
          fired_at_utc timestamp,
          acknowledged_at timestamp,
          skipped boolean NOT NULL DEFAULT false,
          triggered_at timestamp,
          response text,
          responded_at timestamp,
          created_at timestamp NOT NULL DEFAULT now()
        );
        INSERT INTO reminder_occurrences (id, reminder_id, scheduled_for_utc, fired_at_utc, acknowledged_at, skipped) VALUES
          -- fired only
          ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001', now() - interval '2 days', now() - interval '2 days', NULL, false),
          -- fired + acknowledged
          ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001', now() - interval '3 days', now() - interval '3 days', now() - interval '3 days', false),
          -- skipped
          ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001', now() - interval '4 days', NULL, NULL, true),
          -- past-due pending (never fired) — must be closed out, not re-triggered
          ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001', now() - interval '1 day', NULL, NULL, false),
          -- future pending — must remain eligible
          ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001', now() + interval '1 day', NULL, NULL, false),
          -- legacy duplicates of one slot: fired copy must be kept, pending copies dropped
          ('20000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002', timestamp '2026-01-01 08:00:00', timestamp '2026-01-01 08:00:05', NULL, false),
          ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000002', timestamp '2026-01-01 08:00:00', NULL, NULL, false),
          ('20000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000002', timestamp '2026-01-01 08:00:00', NULL, NULL, false);
      `),
      );

      await tx.execute(sql.raw(occBackfill));

      const res = await tx.execute(
        sql.raw(`
        SELECT id, triggered_at IS NOT NULL AS has_triggered, response,
               (scheduled_for_utc <= now() AND triggered_at IS NULL AND response IS NULL) AS still_due
        FROM reminder_occurrences ORDER BY id
      `),
      );
      return res.rows as {
        id: string;
        has_triggered: boolean;
        response: string | null;
        still_due: boolean;
      }[];
    });

    const [fired, acked, skipped, pastPending, futurePending] = rows;
    // Fired → triggered_at backfilled, not due
    expect(fired.has_triggered).toBe(true);
    expect(fired.still_due).toBe(false);
    // Acknowledged → answered
    expect(acked.response).toBe("YES");
    expect(acked.still_due).toBe(false);
    // Skipped → NOT_REQUIRED
    expect(skipped.response).toBe("NOT_REQUIRED");
    expect(skipped.still_due).toBe(false);
    // Past-due pending → closed out as NOT_REQUIRED (no stale prompts)
    expect(pastPending.response).toBe("NOT_REQUIRED");
    expect(pastPending.still_due).toBe(false);
    // Future pending → untouched and eligible when its time comes
    expect(futurePending.has_triggered).toBe(false);
    expect(futurePending.response).toBeNull();

    // Duplicate slot → exactly one row kept, and it is the fired one, so the
    // unique (reminder_id, scheduled_for_utc) constraint can be added safely.
    const dupes = rows.filter((r) =>
      [
        "20000000-0000-4000-8000-000000000006",
        "20000000-0000-4000-8000-000000000007",
        "20000000-0000-4000-8000-000000000008",
      ].includes(r.id),
    );
    expect(dupes).toHaveLength(1);
    expect(dupes[0].id).toBe("20000000-0000-4000-8000-000000000006");
    expect(dupes[0].has_triggered).toBe(true);
  });
});

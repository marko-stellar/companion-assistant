-- Memories evolution + scheduling backend migration.
-- Written to be idempotent: dev databases that already received these
-- changes via lib/db/scripts/migrate-memories.ts / migrate-scheduling.ts
-- can run this migration safely (no-ops), while fresh databases get the
-- full transformation (including the content -> fact data-preserving rename).

-- ── memories ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='memories' AND column_name='content')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='memories' AND column_name='fact') THEN
    ALTER TABLE "memories" RENAME COLUMN "content" TO "fact";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN IF EXISTS "importance";--> statement-breakpoint
ALTER TABLE "memories" DROP COLUMN IF EXISTS "tags";--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'EPISODIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "subject" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "confidence" real DEFAULT 0.7 NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "source_type" text DEFAULT 'conversation' NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "source_message_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "emotional_context" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "supersedes_memory_id" uuid;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN IF NOT EXISTS "last_referenced_at" timestamp;--> statement-breakpoint
ALTER TABLE "memories" DROP CONSTRAINT IF EXISTS "memories_source_conversation_id_conversations_id_fk";--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "memories" ADD CONSTRAINT "memories_source_message_id_conversation_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "memories" ADD CONSTRAINT "memories_supersedes_memory_id_memories_id_fk" FOREIGN KEY ("supersedes_memory_id") REFERENCES "public"."memories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_type_idx" ON "memories" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memories_is_active_idx" ON "memories" USING btree ("is_active");--> statement-breakpoint

-- ── reminders ─────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "reminders_remind_at_utc_idx";--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='reminders' AND column_name='remind_at_utc') THEN
    ALTER TABLE "reminders" ALTER COLUMN "remind_at_utc" DROP NOT NULL;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'GENERAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "medication_name" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "local_time" text DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recurrence_days" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "local_date" text;--> statement-breakpoint

-- BACKFILL:BEGIN — derive local_time / local_date / recurrence_days from the
-- legacy remind_at_utc + recurrence_rule columns (dropped in the next
-- migration) using each owner's timezone. Runs only while the legacy
-- columns still exist; no-op on databases already migrated.
DO $$
DECLARE
  rec RECORD;
  tz text;
  loc timestamp;
  days jsonb;
  rule text;
  byday text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='reminders' AND column_name='remind_at_utc') THEN
    RETURN;
  END IF;

  FOR rec IN
    EXECUTE 'SELECT r.id, r.remind_at_utc, r.recurrence_rule, u.timezone
             FROM reminders r JOIN users u ON u.id = r.user_id
             WHERE r.remind_at_utc IS NOT NULL'
  LOOP
    tz := COALESCE(rec.timezone, 'UTC');
    BEGIN
      loc := (rec.remind_at_utc AT TIME ZONE 'UTC') AT TIME ZONE tz;
    EXCEPTION WHEN OTHERS THEN
      loc := rec.remind_at_utc; -- invalid timezone string: keep UTC wall time
    END;

    rule := upper(COALESCE(rec.recurrence_rule, ''));
    IF rule LIKE '%FREQ=DAILY%' THEN
      days := '["MON","TUE","WED","THU","FRI","SAT","SUN"]'::jsonb;
    ELSIF rule LIKE '%FREQ=WEEKLY%' THEN
      byday := substring(rule from 'BYDAY=([A-Z,]+)');
      IF byday IS NULL THEN
        -- Weekly without BYDAY: recur on the weekday of the original instant
        days := jsonb_build_array(
          (ARRAY['SUN','MON','TUE','WED','THU','FRI','SAT'])[extract(dow FROM loc)::int + 1]);
      ELSE
        SELECT COALESCE(jsonb_agg(CASE d
                 WHEN 'MO' THEN 'MON' WHEN 'TU' THEN 'TUE' WHEN 'WE' THEN 'WED'
                 WHEN 'TH' THEN 'THU' WHEN 'FR' THEN 'FRI' WHEN 'SA' THEN 'SAT'
                 WHEN 'SU' THEN 'SUN' END)
               FILTER (WHERE d IN ('MO','TU','WE','TH','FR','SA','SU')), '[]'::jsonb)
          INTO days
          FROM unnest(string_to_array(byday, ',')) AS d;
      END IF;
    ELSE
      -- Null or unsupported rule (e.g. MONTHLY): preserve as a one-time
      -- reminder at the original local date/time rather than guessing.
      days := '[]'::jsonb;
    END IF;

    UPDATE reminders SET
      local_time = to_char(loc, 'HH24:MI'),
      recurrence_days = days,
      local_date = CASE WHEN days = '[]'::jsonb THEN to_char(loc, 'YYYY-MM-DD') ELSE NULL END
    WHERE id = rec.id;
  END LOOP;
END $$;
-- BACKFILL:END--> statement-breakpoint

-- ── reminder_occurrences ──────────────────────────────────────────────
ALTER TABLE "reminder_occurrences" ADD COLUMN IF NOT EXISTS "triggered_at" timestamp;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD COLUMN IF NOT EXISTS "response" text;--> statement-breakpoint
ALTER TABLE "reminder_occurrences" ADD COLUMN IF NOT EXISTS "responded_at" timestamp;--> statement-breakpoint

-- BACKFILL_OCC:BEGIN — map legacy occurrence lifecycle state
-- (fired_at_utc / acknowledged_at / skipped) onto the new fields so
-- completed or skipped historical occurrences can never re-trigger.
-- Pending rows already past due at migration time are closed out as
-- NOT_REQUIRED rather than firing stale (possibly medication) prompts.
-- Deduplicate legacy occurrence rows before the unique constraint below.
-- The legacy schema had no uniqueness on (reminder_id, scheduled_for_utc);
-- keep the most-progressed row per slot (answered > triggered/fired > by
-- earliest creation) deterministically and drop the rest.
DELETE FROM reminder_occurrences ro
  USING reminder_occurrences keeper
  WHERE ro.reminder_id = keeper.reminder_id
    AND ro.scheduled_for_utc = keeper.scheduled_for_utc
    AND ro.id <> keeper.id
    AND keeper.id = (
      SELECT k.id FROM reminder_occurrences k
      WHERE k.reminder_id = ro.reminder_id
        AND k.scheduled_for_utc = ro.scheduled_for_utc
      ORDER BY (k.response IS NOT NULL) DESC,
               (COALESCE(k.triggered_at, k.fired_at_utc) IS NOT NULL) DESC,
               k.created_at ASC,
               k.id ASC
      LIMIT 1
    );--> statement-breakpoint
UPDATE reminder_occurrences
  SET triggered_at = fired_at_utc
  WHERE fired_at_utc IS NOT NULL AND triggered_at IS NULL;--> statement-breakpoint
UPDATE reminder_occurrences
  SET response = 'YES', responded_at = acknowledged_at
  WHERE acknowledged_at IS NOT NULL AND response IS NULL;--> statement-breakpoint
UPDATE reminder_occurrences
  SET response = 'NOT_REQUIRED', responded_at = now()
  WHERE skipped = true AND response IS NULL;--> statement-breakpoint
UPDATE reminder_occurrences
  SET response = 'NOT_REQUIRED', responded_at = now()
  WHERE scheduled_for_utc < now() AND triggered_at IS NULL AND response IS NULL;--> statement-breakpoint
-- BACKFILL_OCC:END--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "reminder_occurrences" ADD CONSTRAINT "reminder_occurrences_reminder_scheduled_uq" UNIQUE("reminder_id","scheduled_for_utc");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- ── appointments ──────────────────────────────────────────────────────
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;

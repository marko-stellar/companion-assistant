---
name: COMPANION scheduling lessons
description: Durable rules for the reminder/appointment scheduler and drizzle migration workflow
---

# Scheduling lessons

- **Reconcile materialized occurrences on schedule edits.** The scheduler pre-generates occurrences days ahead, so any change to a reminder's time/recurrence (or deactivation) must delete pending (untriggered, unanswered) occurrences, or stale ones keep firing at the old times. **Why:** pre-materialised rows are an independent copy of the schedule — editing the source without reconciling delivers obsolete/duplicate reminders. **How to apply:** any new field that affects when a reminder fires must be added to the "schedule changed → wipe pending occurrences" check.

- **Local-day bounds must use next local midnight, not start+24h.** DST days are 23h/25h; computing end-of-day as start+24h leaks or drops an hour. Convert "tomorrow 00:00 local" to UTC instead.

- **Migrations must be in the drizzle chain, not just manual scripts.** Manual tsx scripts fix the dev DB but leave prod (which runs the drizzle migrate command) broken. Checked-in migrations should be idempotent (IF NOT EXISTS / DO $$ guards) so already-patched dev DBs re-apply cleanly, and must backfill/transform legacy data (schedules AND lifecycle state) before dropping the columns that hold it.

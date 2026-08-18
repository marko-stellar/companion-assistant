import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { reminders } from "./reminders";

export const OCCURRENCE_RESPONSES = [
  "YES",
  "NO",
  "UNKNOWN",
  "NOT_REQUIRED",
] as const;
export type OccurrenceResponse = (typeof OCCURRENCE_RESPONSES)[number];

/**
 * Each scheduled firing of a reminder.
 * The scheduler generates upcoming occurrences (idempotent via the unique
 * constraint on reminder_id + scheduled_for_utc) and marks them here.
 *
 * Lifecycle: created → triggeredAt set when fired (or response=NOT_REQUIRED
 * when skipped due to DND) → response/respondedAt set on user confirmation.
 *
 * firedAtUtc / acknowledgedAt / skipped are legacy columns.
 */
export const reminderOccurrences = pgTable(
  "reminder_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => reminders.id, { onDelete: "cascade" }),
    scheduledForUtc: timestamp("scheduled_for_utc").notNull(),
    /** When the scheduler actually fired this occurrence */
    triggeredAt: timestamp("triggered_at"),
    /** YES | NO | UNKNOWN | NOT_REQUIRED */
    response: text("response"),
    respondedAt: timestamp("responded_at"),
    // ── legacy columns (kept for compatibility) ──
    firedAtUtc: timestamp("fired_at_utc"),
    acknowledgedAt: timestamp("acknowledged_at"),
    skipped: boolean("skipped").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("reminder_occurrences_reminder_id_idx").on(t.reminderId),
    index("reminder_occurrences_scheduled_for_utc_idx").on(t.scheduledForUtc),
    unique("reminder_occurrences_reminder_scheduled_uq").on(
      t.reminderId,
      t.scheduledForUtc,
    ),
  ],
);

export type ReminderOccurrence = typeof reminderOccurrences.$inferSelect;
export type InsertReminderOccurrence =
  typeof reminderOccurrences.$inferInsert;

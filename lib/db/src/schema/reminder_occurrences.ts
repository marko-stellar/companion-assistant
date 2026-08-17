import {
  pgTable,
  uuid,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { reminders } from "./reminders";

/**
 * Each scheduled firing of a reminder.
 * The scheduler generates upcoming occurrences and marks them here.
 */
export const reminderOccurrences = pgTable(
  "reminder_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => reminders.id, { onDelete: "cascade" }),
    scheduledForUtc: timestamp("scheduled_for_utc").notNull(),
    firedAtUtc: timestamp("fired_at_utc"),
    acknowledgedAt: timestamp("acknowledged_at"),
    skipped: boolean("skipped").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("reminder_occurrences_reminder_id_idx").on(t.reminderId),
    index("reminder_occurrences_scheduled_for_utc_idx").on(t.scheduledForUtc),
  ],
);

export type ReminderOccurrence = typeof reminderOccurrences.$inferSelect;
export type InsertReminderOccurrence =
  typeof reminderOccurrences.$inferInsert;

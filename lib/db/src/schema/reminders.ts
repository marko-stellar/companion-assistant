import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const REMINDER_TYPES = ["GENERAL", "MEDICATION"] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

/** Weekday codes used for reminder recurrence. */
export const WEEKDAYS = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Recurring or one-off reminders (e.g. medication, hydration).
 * Times are LOCAL (localTime HH:MM in user.timezone); the scheduler
 * converts to UTC when generating reminder_occurrences.
 * recurrenceDays: ["MON",...] — empty array means one-time (uses localDate).
 */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** GENERAL | MEDICATION */
    type: text("type").notNull().default("GENERAL"),
    /** Medication name (only for type = MEDICATION) */
    medicationName: text("medication_name"),
    /** Local time "HH:MM" in the user's timezone */
    localTime: text("local_time").notNull(),
    /** ["MON","TUE",...] — empty = one-time reminder */
    recurrenceDays: jsonb("recurrence_days")
      .$type<Weekday[]>()
      .notNull()
      .default([]),
    /** "YYYY-MM-DD" local date for one-time reminders (recurrenceDays empty) */
    localDate: text("local_date"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("reminders_user_id_idx").on(t.userId)],
);

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = typeof reminders.$inferInsert;

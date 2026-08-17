import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Recurring or one-off reminders (e.g. medication, hydration).
 * reminder_occurrences tracks each individual firing.
 * Times are stored in UTC; the scheduler converts using user.timezone.
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
    /** UTC timestamp of first (or only) occurrence */
    remindAtUtc: timestamp("remind_at_utc").notNull(),
    /** iCalendar RRULE string for recurrence, null = one-off */
    recurrenceRule: text("recurrence_rule"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("reminders_user_id_idx").on(t.userId),
    index("reminders_remind_at_utc_idx").on(t.remindAtUtc),
  ],
);

export type Reminder = typeof reminders.$inferSelect;
export type InsertReminder = typeof reminders.$inferInsert;

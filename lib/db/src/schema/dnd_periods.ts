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
 * Do-Not-Disturb windows. Times are local HH:MM strings;
 * the scheduler interprets them in user.timezone.
 * recurrenceDays: ["Mon","Tue",...] or empty = every day.
 */
export const dndPeriods = pgTable(
  "dnd_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),
    /** Local time in HH:MM, e.g. "22:00" */
    startTime: text("start_time").notNull(),
    /** Local time in HH:MM, e.g. "08:00" */
    endTime: text("end_time").notNull(),
    /** ["Mon","Tue",...] — empty array means every day */
    recurrenceDays: text("recurrence_days").array().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("dnd_periods_user_id_idx").on(t.userId)],
);

export type DndPeriod = typeof dndPeriods.$inferSelect;
export type InsertDndPeriod = typeof dndPeriods.$inferInsert;

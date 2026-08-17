import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Learned or configured interaction routines (e.g. "morning chat ~08:30").
 * expectedTime is local HH:MM; scheduler interprets in user.timezone.
 * Deviations are recorded in routine_deviations but alone never trigger SMS.
 */
export const routines = pgTable(
  "routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Local HH:MM, e.g. "08:30" */
    expectedTime: text("expected_time"),
    /** ["Mon","Tue",...] — empty = every day */
    expectedDays: text("expected_days").array().notNull().default([]),
    /** How many minutes around expectedTime counts as on-schedule */
    detectionWindowMinutes: integer("detection_window_minutes")
      .notNull()
      .default(60),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("routines_user_id_idx").on(t.userId)],
);

export type Routine = typeof routines.$inferSelect;
export type InsertRoutine = typeof routines.$inferInsert;

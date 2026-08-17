import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { routines } from "./routines";
import { users } from "./users";

/**
 * Recorded instances where a routine was not followed.
 * IMPORTANT: routine deviation alone must NEVER trigger emergency SMS.
 * SMS may only be sent if conversation content independently warrants it.
 */
export const routineDeviations = pgTable(
  "routine_deviations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    detectedAtUtc: timestamp("detected_at_utc").notNull(),
    resolvedAtUtc: timestamp("resolved_at_utc"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("routine_deviations_routine_id_idx").on(t.routineId),
    index("routine_deviations_user_id_idx").on(t.userId),
    index("routine_deviations_detected_at_utc_idx").on(t.detectedAtUtc),
  ],
);

export type RoutineDeviation = typeof routineDeviations.$inferSelect;
export type InsertRoutineDeviation = typeof routineDeviations.$inferInsert;

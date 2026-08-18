import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Inferred interaction routines — rule-based, not ML.
 *
 * Routines are created by the inference engine when sufficient evidence
 * (activity events) establishes a stable pattern. The scheduler checks
 * deviations every tick and may trigger a proactive check-in.
 *
 * CONSTRAINT: routine deviation alone must NEVER trigger emergency SMS.
 */
export const routines = pgTable(
  "routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** MORNING_CONVERSATION | MEDICATION_CONFIRMATION | REPORTED_ACTIVITY | MANUAL */
    routineType: text("routine_type").notNull().default("MANUAL"),
    /** Local HH:MM centre of the expected window, e.g. "08:30" */
    expectedTime: text("expected_time"),
    /** ["MON","TUE",...] — empty = every day */
    expectedDays: text("expected_days").array().notNull().default([]),
    /** Half-width of the detection window in minutes around expectedTime */
    detectionWindowMinutes: integer("detection_window_minutes")
      .notNull()
      .default(60),
    /** Number of distinct observations that support this routine */
    evidenceCount: integer("evidence_count").notNull().default(0),
    /** 0.0–1.0 — grows with evidence, shrinks with spread */
    confidence: real("confidence").notNull().default(0),
    /** Which event types were the source of inference */
    sourceEventTypes: text("source_event_types").array().notNull().default([]),
    /**
     * JSON object with per-routine computed metrics:
     * { avgMinutesSinceMidnight, stdDevMinutes, observedDays[], lastObservedAt }
     */
    baselineMetrics: jsonb("baseline_metrics"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("routines_user_id_idx").on(t.userId),
    index("routines_routine_type_idx").on(t.routineType),
  ],
);

export type Routine = typeof routines.$inferSelect;
export type InsertRoutine = typeof routines.$inferInsert;

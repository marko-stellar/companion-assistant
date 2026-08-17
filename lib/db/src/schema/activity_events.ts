import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Fine-grained interaction events for routine detection.
 * event_type examples: 'conversation_started', 'wake_word_detected',
 * 'reminder_acknowledged', 'photo_shared'.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata"),
    occurredAtUtc: timestamp("occurred_at_utc").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("activity_events_user_id_idx").on(t.userId),
    index("activity_events_occurred_at_utc_idx").on(t.occurredAtUtc),
    index("activity_events_event_type_idx").on(t.eventType),
  ],
);

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = typeof activityEvents.$inferInsert;

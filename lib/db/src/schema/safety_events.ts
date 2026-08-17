import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { conversations } from "./conversations";

/**
 * Safety classification results from the independent safety classifier.
 * Safety classification runs in a separate call from the conversational
 * LLM response — these two must never be merged into one request.
 *
 * IMPORTANT constraints:
 * - No medical diagnosis. The system flags concern; it does not diagnose.
 * - Routine deviation alone never triggers an SMS (smsSource must never
 *   be 'routine_deviation' alone).
 */
export const safetyEvents = pgTable(
  "safety_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(
      () => conversations.id,
    ),
    /** Output of the safety classifier */
    classification: text("classification").notNull(),
    /** 'low' | 'medium' | 'high' */
    severity: text("severity").notNull(),
    /** The user text that triggered the classification */
    triggerText: text("trigger_text"),
    smsSent: boolean("sms_sent").notNull().default(false),
    smsSentAt: timestamp("sms_sent_at"),
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("safety_events_user_id_idx").on(t.userId),
    index("safety_events_created_at_idx").on(t.createdAt),
    index("safety_events_severity_idx").on(t.severity),
  ],
);

export type SafetyEvent = typeof safetyEvents.$inferSelect;
export type InsertSafetyEvent = typeof safetyEvents.$inferInsert;

import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
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
    /**
     * Category of urgent concern:
     * 'FALL' | 'CHEST_PAIN' | 'BREATHING' | 'SELF_HARM' | 'OTHER_URGENT'
     */
    category: text("category").notNull().default("OTHER_URGENT"),
    /** 'low' | 'medium' | 'high' */
    severity: text("severity").notNull(),
    /** Classifier confidence 0.0–1.0 */
    confidence: real("confidence"),
    /** Short internal reasoning/evidence summary from the classifier */
    reasoning: text("reasoning"),
    /**
     * Where the evidence came from. Always 'CONVERSATION' for the MVP —
     * routine deviations must NEVER create safety events or SMS.
     */
    source: text("source").notNull().default("CONVERSATION"),
    /** The user text that triggered the classification (bounded evidence) */
    triggerText: text("trigger_text"),
    /** 'NONE' | 'PENDING' | 'SENDING' | 'SENT' | 'SIMULATED' | 'FAILED' */
    alertStatus: text("alert_status").notNull().default("NONE"),
    /** Snapshot of the emergency contact the alert was addressed to */
    recipientName: text("recipient_name"),
    recipientPhone: text("recipient_phone"),
    /** Delivery provider result (e.g. Twilio message SID) */
    providerMessageId: text("provider_message_id"),
    /** Last delivery error, kept visible — never silently marked sent */
    providerError: text("provider_error"),
    /** Bounded idempotent retry accounting */
    smsAttempts: integer("sms_attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at"),
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

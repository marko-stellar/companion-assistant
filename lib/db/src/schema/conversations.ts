import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * A single conversation session. Transcript messages live in
 * conversation_messages. Structured memories are extracted separately
 * into the memories table. These two are intentionally kept apart.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Primary language detected in this session ('hr' | 'en') */
    language: text("language"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    /** Short LLM-generated summary written when threshold is reached */
    summary: text("summary"),
    /** Cached total message count (user + assistant) — used for summary threshold */
    messageCount: integer("message_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("conversations_user_id_idx").on(t.userId),
    index("conversations_started_at_idx").on(t.startedAt),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

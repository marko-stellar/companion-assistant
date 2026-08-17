import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { conversations } from "./conversations";

/**
 * Individual transcript turns. Role is 'user' (senior's speech) or
 * 'assistant' (companion's spoken response). This table is raw transcript
 * storage only — structured knowledge lives in memories.
 */
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** 'user' | 'assistant' */
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Object key in persistent storage for the TTS/STT audio file */
    audioObjectKey: text("audio_object_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("conversation_messages_conversation_id_idx").on(t.conversationId),
    index("conversation_messages_created_at_idx").on(t.createdAt),
  ],
);

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type InsertConversationMessage =
  typeof conversationMessages.$inferInsert;

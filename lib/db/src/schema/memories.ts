import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { conversations } from "./conversations";
import { vector } from "../types/vector";

/**
 * Structured long-term memories extracted from conversations.
 * Separate from raw transcripts (conversation_messages).
 * The embedding column requires the pgvector extension.
 */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    /** 1536-dim embedding (OpenAI text-embedding-3-small or compatible) */
    embedding: vector("embedding", { dimensions: 1536 }),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
    ),
    /** 1 (low) – 10 (high). Used to prioritise context window inclusion. */
    importance: integer("importance").notNull().default(5),
    tags: text("tags").array(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("memories_user_id_idx").on(t.userId),
    index("memories_created_at_idx").on(t.createdAt),
  ],
);

export type Memory = typeof memories.$inferSelect;
export type InsertMemory = typeof memories.$inferInsert;

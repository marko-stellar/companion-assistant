import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { conversations } from "./conversations";

/** Provider/model metadata stored per message turn. */
export interface ConversationMessageMeta {
  sttModel?: string;
  ttsModel?: string;
  voiceId?: string;
  /** Milliseconds for STT phase (user messages) */
  sttLatencyMs?: number;
  /** Milliseconds for LLM phase (assistant messages) */
  llmLatencyMs?: number;
  /** Milliseconds for TTS phase (assistant messages) */
  ttsLatencyMs?: number;
  /** Token usage from the LLM (assistant messages) */
  tokens?: { promptTokens: number; completionTokens: number };
}

/**
 * Individual transcript turns. Role is 'user' (senior's speech) or
 * 'assistant' (companion's spoken response). This table is raw transcript
 * storage only — structured knowledge lives in memories.
 *
 * Transcripts are sensitive. Do not log content in ordinary server logs.
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
    /** Detected / used IANA language code for this turn ('hr' | 'en') */
    language: text("language"),
    /**
     * Latency in milliseconds:
     *   user messages:     STT transcription time
     *   assistant messages: full round-trip (STT + LLM + TTS)
     */
    latencyMs: integer("latency_ms"),
    /** Model/provider metadata — sttModel, ttsModel, voiceId, token counts, etc. */
    providerMeta: jsonb("provider_meta").$type<ConversationMessageMeta>(),
    /** Object key in persistent storage for the TTS/STT audio file (future use) */
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

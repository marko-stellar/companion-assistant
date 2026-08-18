import {
  pgTable,
  uuid,
  text,
  real,
  boolean,
  timestamp,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { conversations } from "./conversations";
import { conversationMessages } from "./conversation_messages";
import { vector } from "../types/vector";

/**
 * Canonical list of memory categories. Stored as plain text for flexibility.
 *
 *  PROFILE           — who the user is (name, age, occupation)
 *  RELATIONSHIP      — people they mention and their relation
 *  PREFERENCE        — likes/dislikes (food, music, habits)
 *  BIOGRAPHICAL      — past events and life history
 *  EPISODIC          — things that happened recently in their life
 *  ROUTINE           — regular activities and schedules
 *  HEALTH_CONTEXT    — general health background (NOT diagnoses)
 *  PHOTO_MEMORY      — facts linked to a photo
 *  CONVERSATION_SUMMARY — periodically generated conversation digests
 */
export const MEMORY_TYPES = [
  "PROFILE",
  "RELATIONSHIP",
  "PREFERENCE",
  "BIOGRAPHICAL",
  "EPISODIC",
  "ROUTINE",
  "HEALTH_CONTEXT",
  "PHOTO_MEMORY",
  "CONVERSATION_SUMMARY",
] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

/**
 * Long-term memories extracted from conversations.
 *
 * Privacy rules:
 *  - confidence < 0.5 = ambiguous/inferred; do NOT treat as fact in LLM prompts
 *  - source provenance is always retained (never silently erased)
 *  - corrections create a new memory and deactivate the old one; both rows persist
 *  - raw transcripts are NOT duplicated here — see conversation_messages
 */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // ── Classification ────────────────────────────────────────────────────
    type: text("type").notNull().default("EPISODIC"),
    /** Who or what the memory is about ("Petra", "kava", "posao") */
    subject: text("subject"),
    /** The stated fact, written as a neutral third-person statement */
    fact: text("fact").notNull(),
    /**
     * Extraction confidence: 0.0–1.0.
     * ≥ 0.8 = explicit statement; 0.5–0.8 = clear implication; < 0.5 = ambiguous.
     * Only memories with confidence ≥ 0.5 are injected into LLM context.
     */
    confidence: real("confidence").notNull().default(0.7),

    // ── Source provenance ─────────────────────────────────────────────────
    /** "conversation" | "admin" | "voice_correction" | "photo" */
    sourceType: text("source_type").notNull().default("conversation"),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    sourceMessageId: uuid("source_message_id").references(
      () => conversationMessages.id,
      { onDelete: "set null" },
    ),

    // ── Enrichment ────────────────────────────────────────────────────────
    emotionalContext: text("emotional_context"),

    // ── Correction / audit trail ──────────────────────────────────────────
    /**
     * Points to the memory this record supersedes (replaces after a correction).
     * The old record is deactivated (is_active = false) but kept for audit.
     * Never NULL on correction records; NULL on first-time extractions.
     */
    supersedesMemoryId: uuid("supersedes_memory_id").references(
      (): AnyPgColumn => memories.id,
      { onDelete: "set null" },
    ),

    // ── Semantic embedding ────────────────────────────────────────────────
    /** 1536-dim vector (OpenAI text-embedding-3-small). NULL when no embedding key. */
    embedding: vector("embedding", { dimensions: 1536 }),

    // ── Lifecycle ─────────────────────────────────────────────────────────
    isActive: boolean("is_active").notNull().default(true),
    /** Updated each time this memory is retrieved and injected into a prompt */
    lastReferencedAt: timestamp("last_referenced_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("memories_user_id_idx").on(t.userId),
    index("memories_type_idx").on(t.type),
    index("memories_is_active_idx").on(t.isActive),
    index("memories_created_at_idx").on(t.createdAt),
  ],
);

export type Memory = typeof memories.$inferSelect;
export type InsertMemory = typeof memories.$inferInsert;

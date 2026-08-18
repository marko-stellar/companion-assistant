/**
 * MemoryRetrievalService — retrieves the most relevant active memories for a user turn.
 *
 * Strategy:
 *   1. If an embedding can be computed for the current user message (OPENAI_API_KEY set):
 *      → pgvector cosine similarity search, filtered to is_active memories.
 *   2. Fallback (no embedding key):
 *      → Return recently referenced + highest-confidence active memories.
 *
 * Retrieved memories are injected into the LLM context prompt and their
 * last_referenced_at timestamp is updated in the background.
 */

import { eq, and, desc, sql, isNotNull } from "drizzle-orm";
import { db, memories } from "@workspace/db";
import type { Memory } from "@workspace/db";
import { embeddingProvider } from "../providers/embedding.provider";
import { logger } from "../lib/logger";

const DEFAULT_TOP_K = parseInt(process.env.MEMORY_RETRIEVAL_TOP_K ?? "5", 10);
/** Only memories above this confidence are surfaced in the LLM prompt */
const MIN_CONFIDENCE = parseFloat(process.env.MEMORY_MIN_CONFIDENCE ?? "0.5");

export class MemoryRetrievalService {
  /**
   * Retrieve the top-k most relevant memories for the current user turn.
   * Updates last_referenced_at for retrieved records (fire-and-forget).
   *
   * @param userId  — senior user
   * @param query   — current user transcript (used for semantic matching)
   * @param topK    — max memories to return
   */
  async retrieveForTurn(params: {
    userId: string;
    query: string;
    topK?: number;
  }): Promise<Memory[]> {
    const { userId, query, topK = DEFAULT_TOP_K } = params;

    try {
      const queryEmbedding = await embeddingProvider.embed(query);

      let retrieved: Memory[];

      if (queryEmbedding) {
        retrieved = await this.vectorSearch(userId, queryEmbedding, topK);
      } else {
        retrieved = await this.keywordFallback(userId, topK);
      }

      // Fire-and-forget: update last_referenced_at for retrieved memories
      if (retrieved.length > 0) {
        const ids = retrieved.map(m => m.id);
        void db
          .update(memories)
          .set({ lastReferencedAt: new Date(), updatedAt: new Date() })
          .where(
            sql`${memories.id} = ANY(${sql.raw(`ARRAY[${ids.map(id => `'${id}'`).join(",")}]::uuid[]`)})`,
          )
          .catch(err => logger.warn({ err }, "Failed to update lastReferencedAt"));
      }

      return retrieved;
    } catch (err) {
      logger.error({ err, userId }, "Memory retrieval failed — returning empty set");
      return [];
    }
  }

  // ── Vector search (pgvector cosine distance) ─────────────────────────────

  private async vectorSearch(
    userId: string,
    queryEmbedding: number[],
    topK: number,
  ): Promise<Memory[]> {
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Use raw SQL for vector similarity — Drizzle does not have built-in <=> operator
    const rows = await db.execute<Memory & { distance: number }>(sql`
      SELECT *
      FROM memories
      WHERE user_id = ${userId}
        AND is_active = true
        AND confidence >= ${MIN_CONFIDENCE}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${topK}
    `);

    return rows.rows as Memory[];
  }

  // ── Keyword / recency fallback ────────────────────────────────────────────

  private async keywordFallback(userId: string, topK: number): Promise<Memory[]> {
    return db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.isActive, true),
          sql`${memories.confidence} >= ${MIN_CONFIDENCE}`,
        ),
      )
      .orderBy(
        desc(memories.lastReferencedAt),
        desc(memories.confidence),
        desc(memories.createdAt),
      )
      .limit(topK);
  }

  /**
   * Format retrieved memories as a compact bullet list for the system prompt.
   * Only type and fact are included — subject and emotional context are optional.
   */
  formatForPrompt(retrieved: Memory[]): string {
    if (retrieved.length === 0) {
      return "[No relevant memories found.]";
    }

    return retrieved
      .map(m => {
        const subjectPart = m.subject ? ` (${m.subject})` : "";
        const confidenceTag = m.confidence < 0.7 ? " [unconfirmed]" : "";
        return `• [${m.type}]${subjectPart} ${m.fact}${confidenceTag}`;
      })
      .join("\n");
  }
}

export const memoryRetrievalService = new MemoryRetrievalService();

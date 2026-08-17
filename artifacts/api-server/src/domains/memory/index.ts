import { db } from "@workspace/db";
import {
  memories,
  type Memory,
  type InsertMemory,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";

/**
 * Memory domain — structured long-term knowledge about the user.
 * Completely separate from conversation transcripts (conversation_messages).
 *
 * Semantic vector search requires pgvector. That path is stubbed here
 * and will be implemented when LLMProvider is wired up.
 */
export class MemoryService {
  async create(data: InsertMemory): Promise<Memory> {
    const [memory] = await db.insert(memories).values(data).returning();
    return memory;
  }

  async getForUser(userId: string, limit = 50): Promise<Memory[]> {
    return db
      .select()
      .from(memories)
      .where(and(eq(memories.userId, userId), eq(memories.isActive, true)))
      .orderBy(desc(memories.importance), desc(memories.createdAt))
      .limit(limit);
  }

  async deactivate(id: string): Promise<void> {
    await db
      .update(memories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(memories.id, id));
  }

  /**
   * Semantic similarity search via pgvector.
   * TODO: implement when LLMProvider embedding is wired.
   */
  async searchSimilar(
    _userId: string,
    _embedding: number[],
    _limit = 5,
  ): Promise<Memory[]> {
    throw new Error("Vector search not yet implemented — requires LLMProvider");
  }
}

export const memoryService = new MemoryService();

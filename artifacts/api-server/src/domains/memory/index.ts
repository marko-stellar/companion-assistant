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
 * For full memory operations (extraction, retrieval, correction) see:
 *   - services/memory-extraction.service.ts
 *   - services/memory-retrieval.service.ts
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
      .orderBy(desc(memories.confidence), desc(memories.createdAt))
      .limit(limit);
  }

  async deactivate(id: string): Promise<void> {
    await db
      .update(memories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(memories.id, id));
  }
}

export const memoryService = new MemoryService();

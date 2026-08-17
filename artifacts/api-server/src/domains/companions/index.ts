import { db } from "@workspace/db";
import { companions, type Companion, type InsertCompanion } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

/**
 * Companions domain — manages the four AI companion personas.
 * Companions are pre-seeded and rarely change after setup.
 * Personality config includes voice_id and system_prompt_text.
 * NOTE: Business rules must be enforced in service code, not only in prompts.
 */
export class CompanionsService {
  async getAll(): Promise<Companion[]> {
    return db.select().from(companions).where(eq(companions.isActive, true));
  }

  async getById(id: string): Promise<Companion | undefined> {
    const [companion] = await db
      .select()
      .from(companions)
      .where(eq(companions.id, id));
    return companion;
  }

  async create(data: InsertCompanion): Promise<Companion> {
    const [companion] = await db.insert(companions).values(data).returning();
    return companion;
  }
}

export const companionsService = new CompanionsService();

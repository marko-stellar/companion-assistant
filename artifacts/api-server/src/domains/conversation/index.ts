import { db } from "@workspace/db";
import {
  conversations,
  conversationMessages,
  type Conversation,
  type ConversationMessage,
  type InsertConversation,
  type InsertConversationMessage,
} from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * Conversation domain — manages conversation sessions and raw transcripts.
 * Transcript storage is intentionally separate from structured memory storage.
 * Do not merge these concerns.
 *
 * Real AI response generation is not implemented here yet.
 * When implemented, safety classification MUST run as a separate LLM call.
 */
export class ConversationService {
  async startConversation(userId: string): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values({ userId })
      .returning();
    return conversation;
  }

  async endConversation(
    id: string,
    summary?: string,
  ): Promise<Conversation | undefined> {
    const [conversation] = await db
      .update(conversations)
      .set({ endedAt: new Date(), summary, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation;
  }

  async getRecentConversations(
    userId: string,
    limit = 10,
  ): Promise<Conversation[]> {
    return db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.startedAt))
      .limit(limit);
  }

  async addMessage(
    data: InsertConversationMessage,
  ): Promise<ConversationMessage> {
    const [message] = await db
      .insert(conversationMessages)
      .values(data)
      .returning();
    return message;
  }

  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    return db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(conversationMessages.createdAt);
  }
}

export const conversationService = new ConversationService();

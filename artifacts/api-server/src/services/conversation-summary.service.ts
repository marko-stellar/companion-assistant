/**
 * ConversationSummaryService — generates and persists a concise conversation summary.
 *
 * A summary is generated (or updated) whenever the conversation's message count
 * reaches a configured multiple of CONVERSATION_SUMMARY_THRESHOLD (default 10).
 *
 * Summary generation is:
 *   - Provider-agnostic (uses the LLMProvider interface)
 *   - Non-blocking (errors are logged, never propagated to the voice route)
 *   - Idempotent (re-running updates the existing summary field)
 */

import { eq } from "drizzle-orm";
import { db, conversations, conversationMessages } from "@workspace/db";
import { llmProvider } from "../providers/registry";
import { logger } from "../lib/logger";

const SUMMARY_THRESHOLD = parseInt(
  process.env.CONVERSATION_SUMMARY_THRESHOLD ?? "10",
  10,
);

export class ConversationSummaryService {
  /**
   * Generate a summary if `totalMessageCount` is a non-zero multiple of the threshold.
   * Fire-and-forget: call with `void` from the conversation route.
   */
  async maybeSummarize(
    conversationId: string,
    totalMessageCount: number,
  ): Promise<void> {
    if (
      totalMessageCount === 0 ||
      totalMessageCount % SUMMARY_THRESHOLD !== 0
    ) {
      return;
    }

    try {
      const summary = await this.generateSummary(conversationId);
      if (!summary) return;

      await db
        .update(conversations)
        .set({ summary, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      logger.info(
        { conversationId, messageCount: totalMessageCount },
        "Conversation summary updated",
      );
    } catch (err) {
      // Summary failures must never crash the voice route
      logger.error(
        { err, conversationId },
        "Failed to generate conversation summary",
      );
    }
  }

  /**
   * Unconditionally generate a summary for a conversation.
   * Returns the summary text, or null if the conversation is empty.
   */
  async generateSummary(conversationId: string): Promise<string | null> {
    const messages = await db
      .select({ role: conversationMessages.role, content: conversationMessages.content })
      .from(conversationMessages)
      .where(eq(conversationMessages.conversationId, conversationId))
      .orderBy(conversationMessages.createdAt);

    if (messages.length === 0) return null;

    // Build a plain transcript — content is only sent to the LLM, never logged
    const transcript = messages
      .map(m => `${m.role === "user" ? "Senior" : "Companion"}: ${m.content}`)
      .join("\n");

    const { content } = await llmProvider.respond({
      messages: [
        {
          role: "system",
          content:
            "You are a conversation summarizer for a senior care application. " +
            "Produce a concise 2–3 sentence summary of the conversation between " +
            "a senior and their digital companion. Focus on: topics discussed, " +
            "emotional tone, and any notable personal details mentioned. " +
            "Be factual, neutral, and do not include medical advice.",
        },
        {
          role: "user",
          content: `CONVERSATION:\n${transcript}\n\nSUMMARY:`,
        },
      ],
      maxTokens: 200,
    });

    return content.trim() || null;
  }
}

export const conversationSummaryService = new ConversationSummaryService();

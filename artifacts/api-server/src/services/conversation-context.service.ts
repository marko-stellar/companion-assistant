/**
 * ConversationContextService — assembles a bounded, structured prompt for each LLM call.
 *
 * A full historical transcript is NEVER dumped into a single LLM call.
 * The window is controlled by CONVERSATION_CONTEXT_WINDOW (default 10 messages).
 *
 * Sections assembled:
 *   1. Companion identity / personality
 *   2. User profile (name, timezone)
 *   3. Language instruction (Croatian or English)
 *   4. Today's reminders and appointments (if any)
 *   5. DND state (if active)
 *   6. Relevant retrieved memories (top-k via semantic search or recency fallback)
 *   7. Behavioural rules
 *
 * Then returns the bounded recent-message window for the message list.
 */

import { eq, desc, and } from "drizzle-orm";
import {
  db,
  users,
  companions,
  conversationMessages,
  dndPeriods,
} from "@workspace/db";
import type { Memory } from "@workspace/db";
import type { Message } from "../providers/llm.provider";
import { memoryRetrievalService } from "./memory-retrieval.service";
import { scheduleService, type TodayItem } from "./schedule.service";

const CONTEXT_WINDOW = parseInt(
  process.env.CONVERSATION_CONTEXT_WINDOW ?? "10",
  10,
);

export interface ConversationContext {
  systemPrompt: string;
  recentMessages: Message[];
}

export class ConversationContextService {
  /**
   * Build the full context for one LLM turn.
   * @param userId         — authenticated senior user
   * @param companion      — companion row (may be null if unassigned)
   * @param conversationId — current session ID (used to load recent messages)
   * @param language       — effective language for this turn ("hr" | "en")
   * @param userTranscript — current user message (used for memory retrieval query)
   * @param maxMessages    — max recent messages to include (defaults to env var)
   */
  async buildContext(params: {
    userId: string;
    companion: typeof companions.$inferSelect | null;
    conversationId: string;
    language: string;
    userTranscript?: string;
    maxMessages?: number;
  }): Promise<ConversationContext> {
    const {
      userId,
      companion,
      conversationId,
      language,
      userTranscript,
      maxMessages = CONTEXT_WINDOW,
    } = params;

    // Fetch user first so we have their timezone for schedule queries
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then(r => r[0] ?? null);

    const timezone = user?.timezone ?? "UTC";

    // Parallelise remaining independent DB queries + memory retrieval
    const [todaySchedule, activeDnd, recentRows, relevantMemories] =
      await Promise.all([
        scheduleService.getTodayItems(userId),
        db
          .select()
          .from(dndPeriods)
          .where(
            and(eq(dndPeriods.userId, userId), eq(dndPeriods.isActive, true)),
          )
          .limit(1)
          .then(r => r[0] ?? null),
        db
          .select({
            role: conversationMessages.role,
            content: conversationMessages.content,
          })
          .from(conversationMessages)
          .where(eq(conversationMessages.conversationId, conversationId))
          .orderBy(desc(conversationMessages.createdAt))
          .limit(maxMessages)
          .then(rows => rows.reverse()),
        // Retrieve memories — uses the current user transcript as the query
        memoryRetrievalService.retrieveForTurn({
          userId,
          query: userTranscript ?? "",
        }),
      ]);

    const recentMessages: Message[] = recentRows.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const systemPrompt = this.buildSystemPrompt({
      companion,
      user,
      language,
      todaySchedule,
      activeDnd,
      relevantMemories,
    });

    return { systemPrompt, recentMessages };
  }

  private buildSystemPrompt(params: {
    companion: typeof companions.$inferSelect | null;
    user: typeof users.$inferSelect | null;
    language: string;
    todaySchedule: TodayItem[];
    activeDnd: typeof dndPeriods.$inferSelect | null;
    relevantMemories: Memory[];
  }): string {
    const { companion, user, language, todaySchedule, activeDnd, relevantMemories } = params;
    const parts: string[] = [];

    // ── 1. Companion identity ──────────────────────────────────────────────
    if (companion) {
      parts.push(companion.personalityConfig.systemPromptText);
    } else {
      parts.push(
        "You are a caring and friendly digital companion for an elderly person.",
      );
    }

    // ── 2. User profile ───────────────────────────────────────────────────
    if (user) {
      const address =
        user.preferredFormOfAddress ||
        user.firstName ||
        user.displayName;
      const timezone = user.timezone ?? "UTC";
      const localNow = this.formatLocalTime(new Date(), timezone);
      parts.push(
        `\nUSER PROFILE:\nThe person you are speaking with is called ${address}.`,
      );
      parts.push(`The current local time is ${localNow}.`);
      if (user.timezone && user.timezone !== "UTC") {
        parts.push(`Their local timezone is ${user.timezone}.`);
      }
    }

    // ── 3. Language instruction ───────────────────────────────────────────
    const langInstruction =
      language === "hr"
        ? "Speak exclusively in standard Croatian (hrvatska standardna). Use Latin script. Avoid Serbianisms and Bosnian variants. Do not translate proper names unnecessarily."
        : "Speak in English.";
    parts.push(`\nLANGUAGE:\n${langInstruction}`);

    // ── 4. Today's schedule ───────────────────────────────────────────────
    if (todaySchedule.length > 0) {
      const lines = todaySchedule
        .map(s => `  • ${s.time}  ${s.title}  (${s.type}${s.done ? ", done" : ""})`)
        .join("\n");
      parts.push(
        `\nTODAY'S SCHEDULE:\n${lines}\nYou may mention these naturally if they come up, but do not read the list aloud unprompted.`,
      );
    } else {
      parts.push(
        "\nTODAY'S SCHEDULE:\nNo reminders or appointments found for today.",
      );
    }

    // ── 5. DND state ──────────────────────────────────────────────────────
    if (activeDnd) {
      parts.push(
        `\nDO NOT DISTURB:\nA quiet period is scheduled from ${activeDnd.startTime} to ${activeDnd.endTime}. Gently acknowledge this if the conversation runs long.`,
      );
    }

    // ── 6. Relevant memories (top-k, bounded) ─────────────────────────────
    // Only high-confidence memories (≥ 0.5) are injected; lower ones are skipped.
    // The full memory store is never dumped — only what's retrieved for this turn.
    const memoriesText = memoryRetrievalService.formatForPrompt(relevantMemories);
    parts.push(`\nRELEVANT MEMORIES:\n${memoriesText}`);

    // ── 7. Behavioural rules ──────────────────────────────────────────────
    parts.push(`\nRULES:
- You are speaking with an older person (65–75 years old). Be warm, patient, and clear.
- Keep replies to 1–3 sentences. Never ramble or lecture.
- Never claim to be human. Describe yourself as their companion or digital friend if asked.
- Never give medical advice or diagnoses. If health concerns arise, gently suggest consulting a doctor.
- Do not start your reply by echoing the user's words verbatim as a filler opener.
- If the user states something that contradicts what you know from memory, gently note the discrepancy rather than blindly accepting the new claim.`);

    return parts.join("\n");
  }

  /** Format a UTC Date as HH:MM in the given IANA timezone. */
  private formatLocalTime(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: this.ianaZoneOrUtc(timezone),
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  /** Guard against unknown/invalid timezone strings. */
  private ianaZoneOrUtc(timezone: string): string {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return timezone;
    } catch {
      return "UTC";
    }
  }

  /**
   * Formatted today-schedule for external callers (LLM context layer).
   * Delegates to ScheduleService, which owns the real reminders/appointments
   * queries.
   */
  async getTodaySchedule(userId: string): Promise<string> {
    return scheduleService.getTodaySchedule(userId);
  }
}

export const conversationContextService = new ConversationContextService();

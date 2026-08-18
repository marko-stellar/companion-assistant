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
 *   7. Photo being discussed (when activePhotoId is provided)
 *   8. Available photos (short list for LLM to reference in show_photo tool)
 *   9. Behavioural rules
 *
 * Then returns the bounded recent-message window for the message list.
 */

import { eq, desc, and, gt } from "drizzle-orm";
import {
  db,
  users,
  companions,
  conversationMessages,
  dndPeriods,
  temporaryDnd,
  photos,
  memories,
} from "@workspace/db";
import type { Memory, Photo } from "@workspace/db";
import type { Message } from "../providers/llm.provider";
import { memoryRetrievalService } from "./memory-retrieval.service";
import { scheduleService, type TodayItem } from "./schedule.service";

const CONTEXT_WINDOW = parseInt(
  process.env.CONVERSATION_CONTEXT_WINDOW ?? "10",
  10,
);

/** Photo currently being discussed in the conversation. */
export interface ActivePhotoContext {
  photo: Photo;
  photoMemories: Memory[];
}

export interface ConversationContext {
  systemPrompt: string;
  recentMessages: Message[];
}

export class ConversationContextService {
  /**
   * Build the full context for one LLM turn.
   * @param userId           — authenticated senior user
   * @param companion        — companion row (may be null if unassigned)
   * @param conversationId   — current session ID (used to load recent messages)
   * @param language         — effective language for this turn ("hr" | "en")
   * @param userTranscript   — current user message (used for memory retrieval query)
   * @param maxMessages      — max recent messages to include (defaults to env var)
   * @param activePhotoContext — photo currently visible on the tablet (if any)
   * @param availablePhotos  — all photos for this user (for AVAILABLE PHOTOS list)
   */
  async buildContext(params: {
    userId: string;
    companion: typeof companions.$inferSelect | null;
    conversationId: string;
    language: string;
    userTranscript?: string;
    maxMessages?: number;
    activePhotoContext?: ActivePhotoContext;
    availablePhotos?: Photo[];
  }): Promise<ConversationContext> {
    const {
      userId,
      companion,
      conversationId,
      language,
      userTranscript,
      maxMessages = CONTEXT_WINDOW,
      activePhotoContext,
      availablePhotos,
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
    const now = new Date();
    const [todaySchedule, activeDnd, activeTemporaryDnd, recentRows, relevantMemories] =
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
          .select()
          .from(temporaryDnd)
          .where(
            and(eq(temporaryDnd.userId, userId), gt(temporaryDnd.endsAt, now)),
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
      activeTemporaryDnd,
      relevantMemories,
      activePhotoContext,
      availablePhotos: availablePhotos ?? [],
    });

    return { systemPrompt, recentMessages };
  }

  private buildSystemPrompt(params: {
    companion: typeof companions.$inferSelect | null;
    user: typeof users.$inferSelect | null;
    language: string;
    todaySchedule: TodayItem[];
    activeDnd: typeof dndPeriods.$inferSelect | null;
    activeTemporaryDnd: typeof temporaryDnd.$inferSelect | null;
    relevantMemories: Memory[];
    activePhotoContext?: ActivePhotoContext;
    availablePhotos: Photo[];
  }): string {
    const {
      companion, user, language, todaySchedule, activeDnd, activeTemporaryDnd,
      relevantMemories, activePhotoContext, availablePhotos,
    } = params;
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
      const tz = user.timezone ?? "UTC";
      const localNow = this.formatLocalTime(new Date(), tz);
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
        .map(s => {
          const occPart = s.type === "medication" && s.occurrenceId
            ? `  occurrenceId: ${s.occurrenceId}`
            : "";
          return `  • ${s.time}  ${s.title}  (${s.type}${s.done ? ", done" : ""})${occPart}`;
        })
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
    if (activeTemporaryDnd) {
      const endsLocal = this.formatLocalTime(activeTemporaryDnd.endsAt, user?.timezone ?? "UTC");
      parts.push(
        `\nDO NOT DISTURB (TEMPORARY):\nThe user requested quiet until ${endsLocal}. ` +
        `Do not initiate proactive conversation. You may still respond fully if spoken to.`,
      );
    } else if (activeDnd) {
      parts.push(
        `\nDO NOT DISTURB:\nA quiet period is scheduled from ${activeDnd.startTime} to ${activeDnd.endTime}. Gently acknowledge this if the conversation runs long.`,
      );
    }

    // ── 6. Relevant memories ──────────────────────────────────────────────
    const memoriesText = memoryRetrievalService.formatForPrompt(relevantMemories);
    parts.push(`\nRELEVANT MEMORIES:\n${memoriesText}`);

    // ── 7. Active photo context ───────────────────────────────────────────
    if (activePhotoContext) {
      const { photo, photoMemories: pMems } = activePhotoContext;
      const metaParts = [
        photo.title ? `Title: ${photo.title}` : null,
        photo.approxDate ? `Approximate date: ${photo.approxDate}` : null,
        photo.location ? `Location: ${photo.location}` : null,
        photo.notes ? `Admin notes: ${photo.notes}` : null,
      ].filter(Boolean).join("\n");

      parts.push(
        `\nPHOTO CURRENTLY ON SCREEN:\n` +
        `${metaParts}\n` +
        (photo.visionDescription ? `Vision description: ${photo.visionDescription}` : "Vision description: not yet available.") +
        `\n\n⚠️  IDENTITY RULE: Do NOT identify, name, or infer the identity of any person visible in this photo based on their appearance alone. ` +
        `Identity may ONLY come from the admin notes above or from what the user explicitly tells you during this conversation. ` +
        `If asked who someone is, say you are not sure and ask the user to tell you.`,
      );

      if (pMems.length > 0) {
        const memLines = pMems.map(m => `  • ${m.fact}`).join("\n");
        parts.push(`\nWHAT THE USER HAS SHARED ABOUT THIS PHOTO:\n${memLines}`);
      }
    }

    // ── 8. Available photos ───────────────────────────────────────────────
    if (availablePhotos.length > 0) {
      const photoLines = availablePhotos.slice(0, 20).map(p => {
        const meta = [
          p.title ? `"${p.title}"` : "(untitled)",
          p.approxDate ?? null,
          p.location ?? null,
        ].filter(Boolean).join(" | ");
        return `  • ID: ${p.id}  ${meta}`;
      }).join("\n");
      parts.push(
        `\nAVAILABLE PHOTOS (use show_photo tool to display one):\n${photoLines}`,
      );
    }

    // ── 9. Behavioural rules ──────────────────────────────────────────────
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
   * Delegates to ScheduleService, which owns the real reminders/appointments queries.
   */
  async getTodaySchedule(userId: string): Promise<string> {
    return scheduleService.getTodaySchedule(userId);
  }
}

export const conversationContextService = new ConversationContextService();

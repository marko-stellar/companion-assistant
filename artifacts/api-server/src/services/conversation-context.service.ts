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
 *   6. [Placeholder] Relevant retrieved memories
 *   7. Behavioural rules
 *
 * Then returns the bounded recent-message window for the message list.
 */

import { eq, desc, and, gte, lte } from "drizzle-orm";
import {
  db,
  users,
  companions,
  conversationMessages,
  reminders,
  appointments,
  dndPeriods,
} from "@workspace/db";
import type { Message } from "../providers/llm.provider";

const CONTEXT_WINDOW = parseInt(
  process.env.CONVERSATION_CONTEXT_WINDOW ?? "10",
  10,
);

export interface ConversationContext {
  systemPrompt: string;
  recentMessages: Message[];
}

interface ScheduleItem {
  type: "reminder" | "appointment";
  title: string;
  time: string;
}

export class ConversationContextService {
  /**
   * Build the full context for one LLM turn.
   * @param userId         — authenticated senior user
   * @param companion      — companion row (may be null if unassigned)
   * @param conversationId — current session ID (used to load recent messages)
   * @param language       — effective language for this turn ("hr" | "en")
   * @param maxMessages    — max recent messages to include (defaults to env var)
   */
  async buildContext(params: {
    userId: string;
    companion: typeof companions.$inferSelect | null;
    conversationId: string;
    language: string;
    maxMessages?: number;
  }): Promise<ConversationContext> {
    const {
      userId,
      companion,
      conversationId,
      language,
      maxMessages = CONTEXT_WINDOW,
    } = params;

    // Parallelise independent DB queries
    const [user, todaySchedule, activeDnd, recentRows] = await Promise.all([
      db.select().from(users).where(eq(users.id, userId)).limit(1).then(r => r[0]),
      this.getTodaySchedule(userId),
      db
        .select()
        .from(dndPeriods)
        .where(and(eq(dndPeriods.userId, userId), eq(dndPeriods.isActive, true)))
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
    ]);

    const recentMessages: Message[] = recentRows.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const systemPrompt = this.buildSystemPrompt({
      companion,
      user: user ?? null,
      language,
      todaySchedule,
      activeDnd,
    });

    return { systemPrompt, recentMessages };
  }

  private buildSystemPrompt(params: {
    companion: typeof companions.$inferSelect | null;
    user: typeof users.$inferSelect | null;
    language: string;
    todaySchedule: ScheduleItem[];
    activeDnd: typeof dndPeriods.$inferSelect | null;
  }): string {
    const { companion, user, language, todaySchedule, activeDnd } = params;
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
      parts.push(
        `\nUSER PROFILE:\nThe person you are speaking with is called ${address}.`,
      );
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
        .map(s => `  • ${s.time}  ${s.title}  (${s.type})`)
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

    // ── 6. Memories placeholder ───────────────────────────────────────────
    // Future: inject top-k retrieved memories from the memories table here.
    parts.push(
      "\nRELEVANT MEMORIES:\n[No memories retrieved for this conversation yet. This section will be populated in a future milestone.]",
    );

    // ── 7. Behavioural rules ──────────────────────────────────────────────
    parts.push(`\nRULES:
- You are speaking with an older person (65–75 years old). Be warm, patient, and clear.
- Keep replies to 1–3 sentences. Never ramble or lecture.
- Never claim to be human. Describe yourself as their companion or digital friend if asked.
- Never give medical advice or diagnoses. If health concerns arise, gently suggest consulting a doctor.
- Do not start your reply by echoing the user's words verbatim as a filler opener.`);

    return parts.join("\n");
  }

  private async getTodaySchedule(userId: string): Promise<ScheduleItem[]> {
    const now = new Date();
    // UTC bounds for the current calendar day (server clock).
    // For production: convert using the user's timezone.
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0, 0, 0,
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23, 59, 59,
    );

    const [todayReminders, todayAppointments] = await Promise.all([
      db
        .select({ title: reminders.title, remindAt: reminders.remindAtUtc })
        .from(reminders)
        .where(
          and(
            eq(reminders.userId, userId),
            eq(reminders.isActive, true),
            gte(reminders.remindAtUtc, startOfDay),
            lte(reminders.remindAtUtc, endOfDay),
          ),
        ),
      db
        .select({ title: appointments.title, startsAt: appointments.startsAtUtc })
        .from(appointments)
        .where(
          and(
            eq(appointments.userId, userId),
            gte(appointments.startsAtUtc, startOfDay),
            lte(appointments.startsAtUtc, endOfDay),
          ),
        ),
    ]);

    const items: (ScheduleItem & { _sort: Date })[] = [
      ...todayReminders.map(r => ({
        type: "reminder" as const,
        title: r.title,
        time: r.remindAt.toISOString().slice(11, 16), // HH:MM UTC
        _sort: r.remindAt,
      })),
      ...todayAppointments.map(a => ({
        type: "appointment" as const,
        title: a.title,
        time: a.startsAt.toISOString().slice(11, 16),
        _sort: a.startsAt,
      })),
    ];

    return items
      .sort((a, b) => a._sort.getTime() - b._sort.getTime())
      .map(({ _sort: _s, ...rest }) => rest);
  }
}

export const conversationContextService = new ConversationContextService();

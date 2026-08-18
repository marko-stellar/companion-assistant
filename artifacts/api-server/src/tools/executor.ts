/**
 * Tool executor — validates LLM-proposed tool arguments, executes the
 * business operation, and records an audit entry.
 *
 * Security invariant: userId is ALWAYS sourced from the authenticated
 * device session. No tool argument can override it.
 */

import { z } from "zod";
import { db, auditLogs, memories, temporaryDnd } from "@workspace/db";
import { eq, and, ilike, sql, gt } from "drizzle-orm";
import { remindersService } from "../domains/reminders";
import { appointmentsService } from "../domains/appointments";
import { scheduleService } from "../services/schedule.service";
import { embeddingProvider } from "../providers/embedding.provider";
import { localToUtc, ianaZoneOrUtc } from "../lib/local-time";
import { logger } from "../lib/logger";
import type { ToolCallRequest, ToolCallResult, ToolAuditEntry } from "./types";

// ── Argument schemas ─────────────────────────────────────────────────────────

const WEEKDAY = z.enum(["MON","TUE","WED","THU","FRI","SAT","SUN"]);
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:MM (e.g. 09:00)");
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateReminderArgs = z.object({
  title: z.string().min(1).max(120),
  type: z.enum(["GENERAL", "MEDICATION"]).default("GENERAL"),
  medicationName: z.string().optional(),
  localTime: HHMM,
  recurrenceDays: z.array(WEEKDAY).optional(),
  localDate: DATE.optional(),
  details: z.string().optional(),
}).refine(
  d => !(d.type === "MEDICATION" && !d.medicationName),
  { message: "medicationName is required for MEDICATION reminders" }
).refine(
  d => !(!d.recurrenceDays?.length && !d.localDate),
  { message: "localDate is required for one-time reminders (when recurrenceDays is empty or omitted)" }
);

const CreateAppointmentArgs = z.object({
  title: z.string().min(1).max(120),
  localDate: DATE,
  localTime: HHMM,
  endLocalTime: HHMM.optional(),
  location: z.string().optional(),
  details: z.string().optional(),
});

const SetTemporaryDndArgs = z.object({
  endsAtLocalTime: HHMM,
  reason: z.string().optional(),
});

const GetTodayScheduleArgs = z.object({}).passthrough();

const ConfirmMedicationArgs = z.object({
  occurrenceId: z.string().regex(UUID_PATTERN, "Must be a valid UUID"),
  response: z.enum(["YES", "NO", "UNKNOWN"]),
});

const CorrectMemoryArgs = z.object({
  subject: z.string().min(1),
  correctedFact: z.string().min(1),
  supersedesFactLike: z.string().optional(),
});

// ── Executor ─────────────────────────────────────────────────────────────────

export class ToolExecutor {
  async execute(
    request: ToolCallRequest,
    context: { userId: string; timezone: string; conversationId: string },
  ): Promise<ToolCallResult> {
    const { userId, timezone, conversationId } = context;

    try {
      switch (request.tool) {
        case "create_reminder":      return await this.createReminder(request.args, userId, timezone, conversationId);
        case "create_appointment":   return await this.createAppointment(request.args, userId, timezone, conversationId);
        case "set_temporary_dnd":    return await this.setTemporaryDnd(request.args, userId, timezone, conversationId);
        case "get_today_schedule":   return await this.getTodaySchedule(userId, conversationId);
        case "confirm_medication":   return await this.confirmMedication(request.args, userId, conversationId);
        case "correct_memory":       return await this.correctMemory(request.args, userId, conversationId);
        default:
          return { ok: false, error: `Unknown tool: ${request.tool}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.audit({ tool: request.tool, userId, argsRedacted: this.redact(request.args), outcome: "execution_error", error: message }, conversationId);
      logger.error({ err, tool: request.tool, userId }, "Tool execution error");
      return { ok: false, error: "An error occurred while processing your request. Please try again." };
    }
  }

  // ── create_reminder ────────────────────────────────────────────────────────

  private async createReminder(
    rawArgs: Record<string, unknown>,
    userId: string,
    timezone: string,
    conversationId: string,
  ): Promise<ToolCallResult> {
    const parsed = CreateReminderArgs.safeParse(rawArgs);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join("; ");
      await this.audit({ tool: "create_reminder", userId, argsRedacted: this.redact(rawArgs), outcome: "validation_error", error: msg }, conversationId);
      return { ok: false, error: msg };
    }
    const args = parsed.data;

    const reminder = await remindersService.createReminder({
      userId,
      title: args.title,
      type: args.type,
      medicationName: args.medicationName ?? null,
      localTime: args.localTime,
      recurrenceDays: args.recurrenceDays?.length ? args.recurrenceDays : [],
      localDate: args.localDate ?? null,
      description: args.details ?? null,
      isActive: true,
    });

    await this.audit({
      tool: "create_reminder",
      userId,
      argsRedacted: this.redact(rawArgs),
      outcome: "success",
      entityType: "reminder",
      entityId: reminder.id,
    }, conversationId);

    const isRecurring = (args.recurrenceDays?.length ?? 0) > 0;
    const when = isRecurring
      ? `every ${args.recurrenceDays!.join(", ")} at ${args.localTime}`
      : `on ${args.localDate} at ${args.localTime}`;

    return {
      ok: true,
      data: { reminderId: reminder.id, title: args.title, localTime: args.localTime, localDate: args.localDate, recurrenceDays: args.recurrenceDays },
      confirmationHint: `Reminder "${args.title}" created for ${when} (${ianaZoneOrUtc(timezone)}).`,
    };
  }

  // ── create_appointment ─────────────────────────────────────────────────────

  private async createAppointment(
    rawArgs: Record<string, unknown>,
    userId: string,
    timezone: string,
    conversationId: string,
  ): Promise<ToolCallResult> {
    const parsed = CreateAppointmentArgs.safeParse(rawArgs);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join("; ");
      await this.audit({ tool: "create_appointment", userId, argsRedacted: this.redact(rawArgs), outcome: "validation_error", error: msg }, conversationId);
      return { ok: false, error: msg };
    }
    const args = parsed.data;

    const tz = ianaZoneOrUtc(timezone);
    const startsAtUtc = localToUtc(args.localDate, args.localTime, tz);
    const endsAtUtc = args.endLocalTime ? localToUtc(args.localDate, args.endLocalTime, tz) : null;

    // Guard: appointment must be in the future
    if (startsAtUtc.getTime() < Date.now() - 60_000) {
      return { ok: false, error: `The appointment time ${args.localDate} ${args.localTime} is in the past. Please confirm the correct date and time.` };
    }

    const appt = await appointmentsService.create({
      userId,
      title: args.title,
      details: args.details ?? null,
      location: args.location ?? null,
      startsAtUtc,
      endsAtUtc,
      isActive: true,
    });

    await this.audit({
      tool: "create_appointment",
      userId,
      argsRedacted: this.redact(rawArgs),
      outcome: "success",
      entityType: "appointment",
      entityId: appt.id,
    }, conversationId);

    return {
      ok: true,
      data: { appointmentId: appt.id, title: args.title, startsAt: startsAtUtc.toISOString() },
      confirmationHint: `Appointment "${args.title}" scheduled for ${args.localDate} at ${args.localTime} (${tz}).`,
    };
  }

  // ── set_temporary_dnd ──────────────────────────────────────────────────────

  private async setTemporaryDnd(
    rawArgs: Record<string, unknown>,
    userId: string,
    timezone: string,
    conversationId: string,
  ): Promise<ToolCallResult> {
    const parsed = SetTemporaryDndArgs.safeParse(rawArgs);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join("; ");
      await this.audit({ tool: "set_temporary_dnd", userId, argsRedacted: rawArgs, outcome: "validation_error", error: msg }, conversationId);
      return { ok: false, error: msg };
    }
    const { endsAtLocalTime, reason } = parsed.data;
    const tz = ianaZoneOrUtc(timezone);

    // Compute today's date in the user's timezone, then resolve the end time
    const now = new Date();
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    let endsAt = localToUtc(todayStr, endsAtLocalTime, tz);

    // If the resolved time is already in the past (e.g. user said "until 2pm" at 3pm), use tomorrow
    if (endsAt.getTime() <= now.getTime()) {
      const [y, m, d] = todayStr.split("-").map(Number);
      const tomorrow = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + 1));
      const tomorrowStr = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
      endsAt = localToUtc(tomorrowStr, endsAtLocalTime, tz);
    }

    // Deactivate any existing temporary DND for this user
    // (we simply let them coexist; the expiry check in the scheduler uses `ends_at > now`)
    await db.insert(temporaryDnd).values({
      userId,
      startsAt: now,
      endsAt,
      reason: reason ?? null,
    });

    await this.audit({
      tool: "set_temporary_dnd",
      userId,
      argsRedacted: rawArgs,
      outcome: "success",
      entityType: "temporary_dnd",
    }, conversationId);

    return {
      ok: true,
      data: { endsAt: endsAt.toISOString(), endsAtLocalTime },
      confirmationHint: `Do-not-disturb set until ${endsAtLocalTime} (${tz}). I'll stay quiet until then. You can still talk to me any time by pressing the button.`,
    };
  }

  // ── get_today_schedule ─────────────────────────────────────────────────────

  private async getTodaySchedule(
    userId: string,
    conversationId: string,
  ): Promise<ToolCallResult> {
    await this.audit({ tool: "get_today_schedule", userId, argsRedacted: {}, outcome: "success" }, conversationId);
    const scheduleText = await scheduleService.getTodaySchedule(userId);
    return {
      ok: true,
      data: { schedule: scheduleText || "No items scheduled for today." },
      confirmationHint: scheduleText || "No items scheduled for today.",
    };
  }

  // ── confirm_medication ─────────────────────────────────────────────────────

  private async confirmMedication(
    rawArgs: Record<string, unknown>,
    userId: string,
    conversationId: string,
  ): Promise<ToolCallResult> {
    const parsed = ConfirmMedicationArgs.safeParse(rawArgs);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join("; ");
      await this.audit({ tool: "confirm_medication", userId, argsRedacted: this.redact(rawArgs), outcome: "validation_error", error: msg }, conversationId);
      return { ok: false, error: msg };
    }
    const { occurrenceId, response } = parsed.data;

    // Ownership check: ensure the occurrence belongs to this user
    const row = await remindersService.getOccurrenceWithReminder(occurrenceId);
    if (!row || row.reminder.userId !== userId) {
      return { ok: false, error: "That reminder occurrence was not found." };
    }

    const updated = await remindersService.respond(occurrenceId, response);
    if (!updated) {
      return { ok: false, error: "This medication reminder has already been answered or has not yet fired." };
    }

    await this.audit({
      tool: "confirm_medication",
      userId,
      argsRedacted: { occurrenceId, response },
      outcome: "success",
      entityType: "reminder_occurrence",
      entityId: occurrenceId,
    }, conversationId);

    const messages: Record<string, string> = {
      YES: `Got it — I've noted that you took ${row.reminder.medicationName ?? "your medication"}.`,
      NO: `Understood. I've recorded that you haven't taken ${row.reminder.medicationName ?? "your medication"} yet. Don't forget when you can.`,
      UNKNOWN: `No problem — I've noted you're unsure. You can let me know later.`,
    };

    return {
      ok: true,
      data: { occurrenceId, response },
      confirmationHint: messages[response] ?? "Response recorded.",
    };
  }

  // ── correct_memory ─────────────────────────────────────────────────────────

  private async correctMemory(
    rawArgs: Record<string, unknown>,
    userId: string,
    conversationId: string,
  ): Promise<ToolCallResult> {
    const parsed = CorrectMemoryArgs.safeParse(rawArgs);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join("; ");
      await this.audit({ tool: "correct_memory", userId, argsRedacted: rawArgs, outcome: "validation_error", error: msg }, conversationId);
      return { ok: false, error: msg };
    }
    const { subject, correctedFact, supersedesFactLike } = parsed.data;

    // Find the memory being superseded
    const conditions = [
      eq(memories.userId, userId),
      eq(memories.isActive, true),
      ilike(memories.subject, `%${subject}%`),
    ];
    if (supersedesFactLike) {
      conditions.push(ilike(memories.fact, `%${supersedesFactLike}%`));
    }

    const candidates = await db.select().from(memories).where(and(...conditions)).limit(3);

    const embedding = await embeddingProvider.embed(correctedFact);

    let supersedesId: string | undefined;

    if (candidates.length > 0) {
      // Deactivate the old memory(ies)
      for (const old of candidates) {
        await db.update(memories).set({ isActive: false, updatedAt: new Date() }).where(eq(memories.id, old.id));
        supersedesId = old.id; // Use the first one as the superseded link
      }
    }

    const [newMem] = await db.insert(memories).values({
      userId,
      type: "BIOGRAPHICAL" as const,
      subject,
      fact: correctedFact,
      confidence: 0.95,
      sourceType: "voice_correction",
      sourceConversationId: conversationId,
      supersedesMemoryId: supersedesId ?? null,
      embedding: embedding ?? undefined,
      isActive: true,
    }).returning({ id: memories.id });

    await this.audit({
      tool: "correct_memory",
      userId,
      argsRedacted: { subject, correctedFact: "[redacted]", supersedesFactLike },
      outcome: "success",
      entityType: "memory",
      entityId: newMem?.id,
    }, conversationId);

    logger.info({ userId, subject, supersedesId, newMemoryId: newMem?.id }, "Memory corrected via tool");

    const oldCount = candidates.length;
    return {
      ok: true,
      data: { newMemoryId: newMem?.id, supersedesCount: oldCount },
      confirmationHint: oldCount > 0
        ? `I've updated my memory about ${subject} and noted the correction.`
        : `I've saved the corrected information about ${subject}.`,
    };
  }

  // ── Audit logging ──────────────────────────────────────────────────────────

  private async audit(entry: ToolAuditEntry, conversationId: string): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        actorType: "companion",
        actorId: null,
        action: `tool:${entry.tool}`,
        entityType: entry.entityType ?? null,
        entityId: (entry.entityId ?? null) as string | null,
        metadata: {
          userId: entry.userId,
          outcome: entry.outcome,
          conversationId,
          args: entry.argsRedacted,
          ...(entry.error ? { error: entry.error } : {}),
        },
      });
    } catch (auditErr) {
      // Never crash the tool loop due to audit failure
      logger.error({ auditErr, tool: entry.tool }, "Audit log write failed");
    }
  }

  /** Strip any field that might contain sensitive content before logging */
  private redact(args: Record<string, unknown>): Record<string, unknown> {
    const SENSITIVE = new Set(["correctedFact", "fact", "details", "reason"]);
    return Object.fromEntries(
      Object.entries(args).map(([k, v]) => [k, SENSITIVE.has(k) ? "[redacted]" : v])
    );
  }
}

export const toolExecutor = new ToolExecutor();

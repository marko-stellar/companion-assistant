import { db } from "@workspace/db";
import {
  safetyEvents,
  emergencyContacts,
  type SafetyEvent,
} from "@workspace/db/schema";
import { eq, and, desc, lt, ne, sql } from "drizzle-orm";
import type { LLMProvider, SafetyCategory } from "../../providers/llm.provider";
import type { NotificationProvider } from "../../providers/notification.provider";
import { logger } from "../../lib/logger";

/**
 * Safety domain — independent safety classification and family SMS escalation.
 *
 * This is a lightweight assistive feature, NOT an emergency-service guarantee.
 *
 * RULES (non-negotiable for the MVP):
 * 1. Safety classification MUST run as a separate LLM call from response generation.
 * 2. SMS is only sent when severity = 'high' AND requiresImmediateAttention = true
 *    AND confidence >= MIN_SMS_CONFIDENCE.
 * 3. Routine deviation alone NEVER authorises SMS. Only conversation content can —
 *    the single escalation entry point is evaluateConversationTurn(), and every
 *    event it creates carries source = 'CONVERSATION'.
 * 4. No medical diagnosis — the system flags concern; it does not diagnose.
 * 5. Delivery failures stay visible (alertStatus = FAILED + providerError);
 *    an event is never marked sent unless the provider reported success.
 * 6. Sensitive utterance text is stored bounded on the event, never written
 *    to ordinary server logs.
 */

const MIN_SMS_CONFIDENCE = 0.6;
/** Total provider attempts per event (1 initial + bounded retries). */
const MAX_SMS_ATTEMPTS = 2;
/**
 * Lease on the SENDING state. A crash or hung provider call leaves the event
 * in SENDING; once the lease expires the event becomes claimable again
 * (by the retry loop or the scheduler recovery pass).
 */
const SENDING_LEASE_MS = 60_000;
/** Max stored evidence length (chars). */
const EVIDENCE_MAX_CHARS = 280;
/** Max evidence quoted inside the SMS body (chars). */
const SMS_EVIDENCE_MAX_CHARS = 120;

export interface ConversationTurnInput {
  userId: string;
  conversationId: string;
  /** Finalized meaningful user utterance (transcript) */
  userText: string;
  recentContext?: string;
  /** For the SMS text + spoken guidance */
  userName: string;
  timezone: string;
  /** 'hr' | 'en' */
  language: string;
}

export interface SafetyTurnOutcome {
  /** true when an urgent concern was detected this turn */
  urgent: boolean;
  event?: SafetyEvent;
  /** Calm, non-diagnostic spoken guidance to use as the companion reply */
  guidance?: string;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function localTimeString(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(11, 16);
  }
}

/**
 * Contextual family SMS. Honest about scope: family was asked to check in;
 * emergency services were NOT contacted.
 */
export function buildAlertSMS(params: {
  userName: string;
  evidence: string;
  timezone: string;
  language: string;
}): string {
  const time = localTimeString(params.timezone);
  const quote = truncate(params.evidence, SMS_EVIDENCE_MAX_CHARS);
  if (params.language === "hr") {
    return (
      `COMPANION sigurnosno upozorenje za ${params.userName} u ${time}. ` +
      `Izjava: "${quote}". Sustav je ovo procijenio kao moguće hitno. ` +
      `Molimo odmah provjerite kako je. ` +
      `Napomena: obaviještena je samo obitelj — hitne službe NISU kontaktirane.`
    );
  }
  return (
    `COMPANION safety alert for ${params.userName} at ${time}. ` +
    `${params.userName} stated: "${quote}". The system classified this as potentially urgent. ` +
    `Please check on them immediately. ` +
    `Note: only family has been notified — emergency services have NOT been contacted.`
  );
}

/** Honest description of what happened with the family message. */
export type SmsState = "SENT" | "SIMULATED" | "FAILED" | "NONE";

/**
 * Calm, non-diagnostic spoken guidance. Never claims emergency services
 * were contacted; states honestly whether the family message was sent —
 * including when delivery was only simulated (development test mode).
 */
export function buildGuidance(params: {
  category: SafetyCategory;
  language: string;
  smsState: SmsState;
  contactName?: string;
}): string {
  const hr = params.language === "hr";

  const opening: Record<Exclude<SafetyCategory, "NONE">, { hr: string; en: string }> = {
    FALL: {
      hr: "Čujem vas. Ostanite mirni i ne pokušavajte naglo ustati.",
      en: "I hear you. Stay calm and don't try to get up suddenly.",
    },
    CHEST_PAIN: {
      hr: "Čujem vas. Sjednite ili se naslonite i pokušajte mirno disati.",
      en: "I hear you. Sit down or lean back and try to breathe calmly.",
    },
    BREATHING: {
      hr: "Tu sam s vama. Pokušajte se uspraviti i disati polako.",
      en: "I'm here with you. Try to sit upright and breathe slowly.",
    },
    SELF_HARM: {
      hr: "Hvala vam što ste mi to rekli. Niste sami i važni ste.",
      en: "Thank you for telling me. You are not alone, and you matter.",
    },
    OTHER_URGENT: {
      hr: "Čujem vas. Ostanite mirni, tu sam s vama.",
      en: "I hear you. Stay calm, I'm right here with you.",
    },
  };

  const key = params.category === "NONE" ? "OTHER_URGENT" : params.category;
  const first = hr ? opening[key].hr : opening[key].en;

  let smsPart: string;
  switch (params.smsState) {
    case "SENT":
      smsPart = hr
        ? `Poslala sam poruku ${params.contactName ?? "vašoj obitelji"} da odmah provjeri kako ste.`
        : `I've sent a message to ${params.contactName ?? "your family"} asking them to check on you right away.`;
      break;
    case "SIMULATED":
      // Development test mode — no real message went out; say so honestly.
      smsPart = hr
        ? "Sustav je u probnom načinu rada, pa prava poruka vašoj obitelji NIJE poslana."
        : "The system is in test mode, so a real message to your family was NOT sent.";
      break;
    case "FAILED":
      smsPart = hr
        ? "Nažalost, trenutno nisam uspjela poslati poruku vašoj obitelji."
        : "I wasn't able to send a message to your family just now.";
      break;
    case "NONE":
      smsPart = "";
      break;
  }

  const help = hr
    ? "Ako možete, pozovite nekoga u blizini ili nazovite 112 za hitnu pomoć."
    : "If you can, call someone nearby, or dial your local emergency number for immediate help.";

  return smsPart ? `${first} ${smsPart} ${help}` : `${first} ${help}`;
}

/** Map a persisted alert status to the honest spoken/user-facing state. */
function smsStateFromEvent(event: SafetyEvent): SmsState {
  switch (event.alertStatus) {
    case "SENT":
      return "SENT";
    case "SIMULATED":
      return "SIMULATED";
    case "NONE":
      return "NONE";
    default:
      return "FAILED";
  }
}

export class SafetyService {
  constructor(
    private readonly llm: LLMProvider,
    private readonly notifications: NotificationProvider,
  ) {}

  /**
   * Evaluate one finalized conversation utterance.
   * Runs the independent classifier; when an urgent concern is detected,
   * persists a SafetyEvent and (when thresholds are met) escalates via SMS.
   *
   * This is the ONLY entry point that can create safety events. It handles
   * conversation content exclusively — routine deviations have no path here.
   */
  async evaluateConversationTurn(input: ConversationTurnInput): Promise<SafetyTurnOutcome> {
    // 1. Independent classification call — never combined with respond()
    const { safety } = await this.llm.classifySafety({
      userText: input.userText,
      recentContext: input.recentContext,
    });

    if (safety.category === "NONE") {
      return { urgent: false };
    }

    // 2. Persist the event (bounded evidence; alert not yet attempted)
    const shouldSend =
      safety.requiresImmediateAttention &&
      safety.severity === "high" &&
      safety.confidence >= MIN_SMS_CONFIDENCE;

    const [event] = await db
      .insert(safetyEvents)
      .values({
        userId: input.userId,
        conversationId: input.conversationId,
        classification: safety.classification,
        category: safety.category,
        severity: safety.severity,
        confidence: safety.confidence,
        reasoning: safety.reasoning ?? null,
        source: "CONVERSATION",
        triggerText: truncate(input.userText, EVIDENCE_MAX_CHARS),
        alertStatus: shouldSend ? "PENDING" : "NONE",
      })
      .returning();

    // Privacy-safe log: ids and status only, never utterance content
    logger.info(
      {
        safetyEventId: event.id,
        userId: input.userId,
        category: safety.category,
        severity: safety.severity,
        willAlert: shouldSend,
      },
      "Safety event recorded",
    );

    let finalEvent = event;
    if (shouldSend) {
      finalEvent = await this.sendAlert(event, input);
    }

    return {
      urgent: true,
      event: finalEvent,
      guidance: buildGuidance({
        category: safety.category,
        language: input.language,
        smsState: smsStateFromEvent(finalEvent),
        contactName: finalEvent.recipientName ?? undefined,
      }),
    };
  }

  /**
   * Send the family SMS for a PENDING event.
   *
   * Idempotency is enforced in the database, not in memory: each provider
   * call is preceded by an atomic conditional UPDATE that claims an attempt
   * (PENDING → SENDING, attempts += 1) and only succeeds while the event is
   * still PENDING, unsent, and under the attempt budget. Concurrent callers
   * therefore cannot double-send or exceed MAX_SMS_ATTEMPTS.
   */
  async sendAlert(event: SafetyEvent, input: ConversationTurnInput): Promise<SafetyEvent> {
    // Cheap pre-check (the DB claim below is the real guard)
    if (event.alertStatus === "SENT" || event.smsSent) return event;
    if (event.smsAttempts >= MAX_SMS_ATTEMPTS) return event;

    const [contact] = await db
      .select()
      .from(emergencyContacts)
      .where(
        and(
          eq(emergencyContacts.userId, input.userId),
          eq(emergencyContacts.isPrimary, true),
          eq(emergencyContacts.isActive, true),
        ),
      );

    if (!contact) {
      const [updated] = await db
        .update(safetyEvents)
        .set({
          alertStatus: "FAILED",
          providerError: "No active emergency contact configured",
          updatedAt: new Date(),
        })
        .where(eq(safetyEvents.id, event.id))
        .returning();
      logger.warn({ safetyEventId: event.id }, "Safety alert failed — no active emergency contact");
      return updated ?? event;
    }

    const message = buildAlertSMS({
      userName: input.userName,
      evidence: event.triggerText ?? "",
      timezone: input.timezone,
      language: input.language,
    });

    let current = event;

    // Bounded retry loop. Each iteration atomically claims one attempt in
    // the DB; a failed claim means another caller holds/finished the event.
    for (;;) {
      const [claimed] = await db
        .update(safetyEvents)
        .set({
          alertStatus: "SENDING",
          smsAttempts: sql`${safetyEvents.smsAttempts} + 1`,
          lastAttemptAt: new Date(),
          recipientName: contact.name,
          recipientPhone: contact.phone,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(safetyEvents.id, event.id),
            eq(safetyEvents.smsSent, false),
            lt(safetyEvents.smsAttempts, MAX_SMS_ATTEMPTS),
            // Only PENDING is claimable. A SENDING event may still complete
            // at the provider — re-claiming it could duplicate a real SMS,
            // so stale SENDING is surfaced for manual recovery instead.
            eq(safetyEvents.alertStatus, "PENDING"),
          ),
        )
        .returning();

      if (!claimed) {
        // Already SENT, being sent by a concurrent caller, or budget exhausted
        return current;
      }
      current = claimed;

      const result = await this.notifications.sendSMS({
        to: contact.phone,
        message,
        safetyEventId: event.id,
      });

      if (result.success) {
        // Honesty rule: a simulated (development mock) delivery is never
        // presented as a real family notification.
        const simulated = result.simulated === true;
        const [updated] = await db
          .update(safetyEvents)
          .set({
            alertStatus: simulated ? "SIMULATED" : "SENT",
            smsSent: !simulated,
            smsSentAt: simulated ? null : new Date(),
            providerMessageId: result.providerMessageId ?? null,
            providerError: null,
            updatedAt: new Date(),
          })
          .where(
            and(eq(safetyEvents.id, event.id), ne(safetyEvents.alertStatus, "SENT")),
          )
          .returning();
        logger.info(
          { safetyEventId: event.id, attempts: claimed.smsAttempts, simulated },
          simulated
            ? "Safety alert SMS simulated (development mock — no real delivery)"
            : "Safety alert SMS delivered",
        );
        return updated ?? current;
      }

      const lastError = result.error ?? "Unknown delivery error";
      // Ambiguous outcome (e.g. timeout after the provider may have accepted
      // the message): never auto-retry — a duplicate alert to family is worse
      // than a visible failure. Exhaust the budget and surface it.
      const exhausted =
        result.ambiguous === true || claimed.smsAttempts >= MAX_SMS_ATTEMPTS;

      // Failure stays visible — never marked sent. Below budget the event
      // returns to PENDING so the loop (or a later caller) may retry.
      const [updated] = await db
        .update(safetyEvents)
        .set({
          alertStatus: exhausted ? "FAILED" : "PENDING",
          smsSent: false,
          providerError: result.ambiguous
            ? `${lastError} — not retried automatically to avoid a possible duplicate message; please verify with the contact`
            : lastError,
          // Ambiguity permanently closes the auto-retry budget for this event
          ...(result.ambiguous ? { smsAttempts: MAX_SMS_ATTEMPTS } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(eq(safetyEvents.id, event.id), eq(safetyEvents.alertStatus, "SENDING")),
        )
        .returning();
      current = updated ?? current;

      if (exhausted) {
        logger.warn(
          { safetyEventId: event.id, attempts: claimed.smsAttempts },
          "Safety alert SMS delivery failed",
        );
        return current;
      }
    }
  }

  /**
   * Recovery pass for events stuck in SENDING past their lease (process
   * crash or hung provider call mid-send). Called periodically by the
   * scheduler.
   *
   * A stale SENDING event is NEVER re-sent: the original provider request
   * may still have been accepted, and a duplicate real alert to family is
   * worse than a visible failure. Instead the event is marked FAILED with
   * an explicit "verify manually" error so an admin can follow up. It also
   * never classifies anything or creates new events, so the "routine
   * deviation never triggers SMS" rule is preserved.
   */
  async recoverStaleAlerts(now: Date = new Date()): Promise<void> {
    const staleBefore = new Date(now.getTime() - SENDING_LEASE_MS);
    const stale = await db
      .select()
      .from(safetyEvents)
      .where(
        and(
          eq(safetyEvents.alertStatus, "SENDING"),
          eq(safetyEvents.smsSent, false),
          lt(safetyEvents.lastAttemptAt, staleBefore),
        ),
      );

    for (const event of stale) {
      await db
        .update(safetyEvents)
        .set({
          alertStatus: "FAILED",
          // Close the auto-retry budget: outcome of the in-flight send is unknown
          smsAttempts: MAX_SMS_ATTEMPTS,
          providerError:
            "Delivery attempt was interrupted — the message may or may not have reached the contact. Not retried automatically to avoid a possible duplicate; please verify with the contact.",
          updatedAt: new Date(),
        })
        .where(and(eq(safetyEvents.id, event.id), eq(safetyEvents.alertStatus, "SENDING")))
        .returning();
      logger.warn(
        { safetyEventId: event.id },
        "Stale safety alert marked FAILED for manual verification",
      );
    }
  }

  /**
   * Admin/developer test mechanism: sends a clearly labelled test SMS to a
   * designated test number. Creates NO safety event and never triggers a
   * real emergency workflow.
   */
  async sendTestSMS(params: { phone: string; language?: string }): Promise<{
    success: boolean;
    simulated?: boolean;
    providerMessageId?: string;
    error?: string;
  }> {
    const hr = params.language === "hr";
    const message = hr
      ? "COMPANION TEST — ovo je probna poruka sigurnosnog sustava. Nije potrebna nikakva radnja."
      : "COMPANION TEST — this is a test message from the safety alert system. No action is needed.";

    const result = await this.notifications.sendSMS({
      to: params.phone,
      message,
      safetyEventId: "test",
    });
    logger.info(
      { success: result.success, simulated: result.simulated === true },
      "Safety test SMS attempted",
    );
    return {
      success: result.success,
      ...(result.simulated ? { simulated: true } : {}),
      ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
      ...(result.error ? { error: result.error } : {}),
    };
  }

  async resolve(id: string): Promise<SafetyEvent | undefined> {
    const [updated] = await db
      .update(safetyEvents)
      .set({ resolved: true, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(safetyEvents.id, id))
      .returning();
    return updated;
  }

  async listForUser(userId: string, limit = 200): Promise<SafetyEvent[]> {
    return db
      .select()
      .from(safetyEvents)
      .where(eq(safetyEvents.userId, userId))
      .orderBy(desc(safetyEvents.createdAt))
      .limit(limit);
  }

  async getUnresolved(userId: string): Promise<SafetyEvent[]> {
    return db
      .select()
      .from(safetyEvents)
      .where(
        and(eq(safetyEvents.userId, userId), eq(safetyEvents.resolved, false)),
      );
  }
}

// Instantiated at startup with concrete providers
export function createSafetyService(
  llm: LLMProvider,
  notifications: NotificationProvider,
): SafetyService {
  return new SafetyService(llm, notifications);
}

// Singleton wired to the provider registry (lazy to keep tests light)
import { llmProvider, notificationProvider } from "../../providers/registry";
export const safetyService: SafetyService = new SafetyService(
  llmProvider,
  notificationProvider,
);

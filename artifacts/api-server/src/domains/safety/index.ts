import { db } from "@workspace/db";
import {
  safetyEvents,
  emergencyContacts,
  type SafetyEvent,
  type InsertSafetyEvent,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import type { LLMProvider } from "../../providers/llm.provider";
import type { NotificationProvider } from "../../providers/notification.provider";

/**
 * Safety domain — independent safety classification and emergency notification.
 *
 * RULES (non-negotiable for the MVP):
 * 1. Safety classification MUST run as a separate LLM call from response generation.
 * 2. SMS is only sent when classification severity = 'high' AND requiresImmediateAttention = true.
 * 3. Routine deviation alone NEVER authorises SMS. Only conversation content can.
 * 4. No medical diagnosis — the system flags concern; it does not diagnose.
 * 5. No camera monitoring in the MVP.
 */
export class SafetyService {
  constructor(
    private readonly llm: LLMProvider,
    private readonly notifications: NotificationProvider,
  ) {}

  /**
   * Classify user text for safety concerns.
   * Called separately from the main conversational LLM request.
   */
  async classify(
    userId: string,
    conversationId: string,
    userText: string,
    recentContext?: string,
  ): Promise<SafetyEvent> {
    // Independent classification call — not combined with respond()
    const { safety } = await this.llm.classifySafety({ userText, recentContext });

    const [event] = await db
      .insert(safetyEvents)
      .values({
        userId,
        conversationId,
        classification: safety.classification,
        severity: safety.severity,
        triggerText: userText,
      })
      .returning();

    if (safety.requiresImmediateAttention && safety.severity === "high") {
      await this.notifyEmergencyContact(userId, event.id, userText);
    }

    return event;
  }

  private async notifyEmergencyContact(
    userId: string,
    safetyEventId: string,
    _triggerText: string,
  ): Promise<void> {
    const [primaryContact] = await db
      .select()
      .from(emergencyContacts)
      .where(
        and(
          eq(emergencyContacts.userId, userId),
          eq(emergencyContacts.isPrimary, true),
        ),
      );

    if (!primaryContact) return;

    const result = await this.notifications.sendSMS({
      to: primaryContact.phone,
      message: `COMPANION: Your contact may need assistance. Please check in on them.`,
      safetyEventId,
    });

    await db
      .update(safetyEvents)
      .set({
        smsSent: result.success,
        smsSentAt: result.success ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(safetyEvents.id, safetyEventId));
  }

  async resolve(id: string): Promise<void> {
    await db
      .update(safetyEvents)
      .set({ resolved: true, resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(safetyEvents.id, id));
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

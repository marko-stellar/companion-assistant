/**
 * Proactivity domain — logic for the companion initiating conversations.
 *
 * The scheduler calls checkProactivityTriggers() each minute.
 * Triggers include: routine deviation (see constraint below),
 * time-based prompts (morning greeting, evening check-in), and
 * context-based prompts derived from upcoming appointments.
 *
 * CONSTRAINT: Routine deviation alone must NEVER trigger an emergency SMS.
 * Proactivity may initiate a check-in conversation, but safety classification
 * of actual conversation content is the only path to SMS.
 */

export interface ProactivityTrigger {
  type: "morning_greeting" | "evening_checkin" | "appointment_reminder" | "routine_checkin" | "custom";
  userId: string;
  message: string;
  priority: "low" | "normal" | "high";
  scheduledForUtc: Date;
}

export class ProactivityService {
  /**
   * Evaluate whether any proactive triggers are due for any active users.
   * Called by the scheduler every minute.
   * TODO: Implement when LLMProvider and user model are complete.
   */
  async checkTriggers(_nowUtc: Date): Promise<ProactivityTrigger[]> {
    // Stub: return no triggers until implemented
    return [];
  }

  /**
   * Dispatch a proactive message to the user's tablet session.
   * TODO: Implement via WebSocket push when real-time layer is added.
   */
  async dispatch(_trigger: ProactivityTrigger): Promise<void> {
    throw new Error("Proactivity dispatch not yet implemented");
  }
}

export const proactivityService = new ProactivityService();

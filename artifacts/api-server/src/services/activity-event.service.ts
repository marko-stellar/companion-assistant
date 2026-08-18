/**
 * ActivityEventService — fire-and-forget event emission for interaction tracking.
 *
 * Events are used by the routine inference engine to detect behavioural patterns.
 * They are NOT used for real-time decisions; failures here never affect the
 * voice loop or any user-facing path.
 *
 * Event types correspond exactly to the spec:
 *   USER_STARTED_CONVERSATION, USER_ENDED_CONVERSATION,
 *   COMPANION_PROACTIVE_CHECKIN, REMINDER_TRIGGERED,
 *   REMINDER_CONFIRMED, MEDICATION_CONFIRMED_TAKEN, MEDICATION_CONFIRMED_NOT_TAKEN,
 *   APPOINTMENT_CREATED, APPOINTMENT_ACKNOWLEDGED,
 *   USER_REPORTED_ACTIVITY, PHOTO_CONVERSATION, TEMPORARY_DND_SET
 */

import { db, activityEvents } from "@workspace/db";
import { logger } from "../lib/logger";

export const ACTIVITY_EVENT_TYPES = [
  "USER_STARTED_CONVERSATION",
  "USER_ENDED_CONVERSATION",
  "COMPANION_PROACTIVE_CHECKIN",
  "REMINDER_TRIGGERED",
  "REMINDER_CONFIRMED",
  "MEDICATION_CONFIRMED_TAKEN",
  "MEDICATION_CONFIRMED_NOT_TAKEN",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_ACKNOWLEDGED",
  "USER_REPORTED_ACTIVITY",
  "PHOTO_CONVERSATION",
  "TEMPORARY_DND_SET",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export class ActivityEventService {
  /**
   * Emit an activity event. Fire-and-forget — errors are logged but never thrown.
   * Pass only non-sensitive metadata (IDs, types, counts — never transcript content).
   */
  emit(
    userId: string,
    eventType: ActivityEventType,
    metadata?: Record<string, unknown>,
  ): void {
    // Deliberately synchronous kick-off — the promise is not awaited
    this.writeEvent(userId, eventType, metadata).catch(err => {
      logger.error({ err, userId, eventType }, "Activity event write failed");
    });
  }

  /** Awaitable version for callers that need backpressure (e.g., inference engine). */
  async emitAsync(
    userId: string,
    eventType: ActivityEventType,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.writeEvent(userId, eventType, metadata);
    } catch (err) {
      logger.error({ err, userId, eventType }, "Activity event write failed");
    }
  }

  private async writeEvent(
    userId: string,
    eventType: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(activityEvents).values({
      userId,
      eventType,
      metadata: metadata ?? null,
      occurredAtUtc: new Date(),
    });
  }
}

export const activityEventService = new ActivityEventService();

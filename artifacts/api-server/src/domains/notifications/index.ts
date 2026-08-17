/**
 * Notifications domain — thin orchestration layer above NotificationProvider.
 * Direct SMS calls must always go through safety.service, which enforces
 * the constraint that routine deviation alone never triggers SMS.
 */

import type { NotificationProvider } from "../../providers/notification.provider";

export class NotificationsService {
  constructor(private readonly provider: NotificationProvider) {}

  /**
   * Low-level send. Should only be called from SafetyService.
   * All other code should use SafetyService.classify() instead.
   */
  async sendSMS(to: string, message: string, safetyEventId: string) {
    return this.provider.sendSMS({ to, message, safetyEventId });
  }
}

export function createNotificationsService(
  provider: NotificationProvider,
): NotificationsService {
  return new NotificationsService(provider);
}

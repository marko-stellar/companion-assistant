/**
 * ProactivityService — detects routine deviations each scheduler tick.
 *
 * Detected deviations are stored with their check-in text so the tablet
 * can poll and deliver them. This service never pushes directly — delivery
 * is poll-based via GET /api/tablet/pending-checkin.
 *
 * CONSTRAINT: check-ins are the MAXIMUM action. SMS must never be sent
 * here — only SafetyService may do that.
 */

import { routineService } from "../routine";
import { logger } from "../../lib/logger";

export type ProactivityTrigger = {
  userId: string;
  reason: string;
  spokenText: string;
  deviationId?: string;
};

export class ProactivityService {
  /**
   * Called by the scheduler every minute.
   * Runs deviation detection; any new deviations are stored and returned
   * so the scheduler can log them. The tablet polls independently.
   */
  async checkTriggers(nowUtc: Date): Promise<ProactivityTrigger[]> {
    try {
      const checkIns = await routineService.detectDeviations(nowUtc);
      return checkIns.map(ci => ({
        userId: ci.userId,
        reason: `Routine deviation — pending check-in stored (deviationId: ${ci.deviationId})`,
        spokenText: ci.checkInText,
        deviationId: ci.deviationId,
      }));
    } catch (err) {
      logger.error({ err }, "Proactivity: deviation detection failed");
      return [];
    }
  }
}

export const proactivityService = new ProactivityService();

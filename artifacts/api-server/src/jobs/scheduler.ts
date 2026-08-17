import { logger } from "../lib/logger";
import { remindersService } from "../domains/reminders";
import { routineService } from "../domains/routine";
import { proactivityService } from "../domains/proactivity";

/**
 * AppScheduler — in-process minute-tick scheduler.
 *
 * Runs inside the always-on Reserved VM backend. Do NOT use Replit
 * Scheduled Deployments for minute-level reminder checks — those are
 * separate deployments better suited for periodic cleanup jobs.
 *
 * CONSTRAINT: Routine deviation detection (tick) must NEVER directly
 * trigger an emergency SMS. Only SafetyService may authorise SMS.
 */
export class AppScheduler {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private readonly TICK_INTERVAL_MS = 60_000; // one minute
  private isRunning = false;

  start(): void {
    if (this.intervalHandle) {
      logger.warn("AppScheduler already running — ignoring duplicate start");
      return;
    }
    this.intervalHandle = setInterval(
      () => void this.tick(),
      this.TICK_INTERVAL_MS,
    );
    logger.info({ tickIntervalMs: this.TICK_INTERVAL_MS }, "AppScheduler started");
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info("AppScheduler stopped");
    }
  }

  private async tick(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Scheduler tick skipped — previous tick still running");
      return;
    }
    this.isRunning = true;
    const nowUtc = new Date();

    try {
      await Promise.allSettled([
        this.checkReminders(nowUtc),
        this.checkRoutines(nowUtc),
        this.checkProactivity(nowUtc),
      ]);
    } finally {
      this.isRunning = false;
    }
  }

  private async checkReminders(nowUtc: Date): Promise<void> {
    try {
      const due = await remindersService.getDueOccurrences(nowUtc);
      if (due.length > 0) {
        logger.info({ count: due.length }, "Due reminder occurrences found");
        // TODO: push reminder to active tablet sessions via WebSocket
      }
    } catch (err) {
      logger.error({ err }, "Error checking reminders");
    }
  }

  private async checkRoutines(nowUtc: Date): Promise<void> {
    try {
      // IMPORTANT: detectDeviations records deviations only.
      // It does NOT trigger SMS — that is the safety domain's responsibility.
      await routineService.detectDeviations(nowUtc);
    } catch (err) {
      logger.error({ err }, "Error checking routines");
    }
  }

  private async checkProactivity(nowUtc: Date): Promise<void> {
    try {
      const triggers = await proactivityService.checkTriggers(nowUtc);
      if (triggers.length > 0) {
        logger.info({ count: triggers.length }, "Proactivity triggers pending");
        // TODO: dispatch to active sessions
      }
    } catch (err) {
      logger.error({ err }, "Error checking proactivity");
    }
  }
}

export const scheduler = new AppScheduler();

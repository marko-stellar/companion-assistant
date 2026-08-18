import type { AppointmentAlert } from "@workspace/api-client-react";
import { getActiveAlerts, type AppointmentAlertItem } from "./alerts";

/** Dependencies injected by the device context (kept pure for testing). */
export interface SpokenAlertDeps {
  /** True when it's currently OK to speak an alert out loud. */
  canSpeakNow(): boolean;
  /** Build the sentence to speak for an in-window alert. */
  buildText(alert: AppointmentAlertItem): string;
  /** TTS round-trip. May throw (network / server failure). */
  synthesize(text: string): Promise<{ audio: string; mimeType: string }>;
  /**
   * Play synthesized audio. Must call `onStarted` once playback has actually
   * begun, and resolve when playback ends, errors, is paused/stopped, or
   * never starts (e.g. autoplay blocked).
   */
  play(audio: string, mimeType: string, onStarted: () => void): Promise<void>;
}

/**
 * Drives proactive spoken appointment reminders.
 *
 * Guarantees:
 * - An alert is marked spoken ONLY once playback has actually begun, so a
 *   cancelled/failed synthesis or blocked playback is retried on later ticks
 *   while the appointment is still in its reminder window.
 * - `cancel()` (barge-in, DND start, offline, effect cleanup) invalidates any
 *   in-flight synthesis so it can never start playback afterwards.
 * - At most one alert operation runs at a time.
 */
export class SpokenAlertController {
  private spokenIds = new Set<string>();
  private generation = 0;
  private inFlight = false;

  constructor(private deps: SpokenAlertDeps) {}

  /** Invalidate any in-flight synthesis (does not stop active audio itself). */
  cancel(): void {
    this.generation += 1;
  }

  hasSpoken(id: string): boolean {
    return this.spokenIds.has(id);
  }

  /** Evaluate alerts and speak the first unspoken in-window one, if allowed. */
  async tick(alerts: AppointmentAlert[], now: Date): Promise<void> {
    if (this.inFlight || !this.deps.canSpeakNow()) return;

    const candidate = getActiveAlerts(alerts, now).find(
      (a) => !this.spokenIds.has(a.id),
    );
    if (!candidate) return;

    this.inFlight = true;
    const generation = this.generation;
    try {
      let synthesized: { audio: string; mimeType: string };
      try {
        synthesized = await this.deps.synthesize(
          this.deps.buildText(candidate),
        );
      } catch {
        return; // transient TTS/network failure — retry on a later tick
      }
      if (!synthesized.audio) return;

      // Re-check ALL live conditions after the network round-trip — a
      // conversation may have started, DND may have begun, the tablet may
      // have gone offline, or cancel() may have invalidated this operation.
      // Not marked spoken → retried while the window is still open.
      if (generation !== this.generation || !this.deps.canSpeakNow()) return;

      await this.deps.play(synthesized.audio, synthesized.mimeType, () => {
        // Mark only once playback actually began — never repeats this session.
        this.spokenIds.add(candidate.id);
      });
    } finally {
      this.inFlight = false;
    }
  }
}

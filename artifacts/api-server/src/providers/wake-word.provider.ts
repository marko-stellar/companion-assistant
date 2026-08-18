/**
 * WakeWordProvider — interface for wake-word detection.
 *
 * Full low-latency wake-word activation is DEFERRED from this milestone.
 * Rationale: no stable, browser-compatible, offline-capable library was found
 * that does not add significant bundle weight or require native binaries.
 * The Talk button remains the primary and fully-functional activation path.
 *
 * A fixed wake word (e.g. "Companion" / "Pratitelj") can be added in a future
 * milestone once picovoice Porcupine WASM or a comparable library is evaluated.
 * No arbitrary customizable wake words will be built.
 */

export interface WakeWordEvent {
  /** The detected keyword (e.g. "companion") */
  keyword: string;
  confidence: number;
}

export interface WakeWordProvider {
  /** Start listening. Returns a cleanup/stop function. */
  start(onWakeWord: (event: WakeWordEvent) => void): () => void;
  stop(): void;
  /** Whether this provider can function in the current runtime environment. */
  isSupported(): boolean;
}

/**
 * NoOpWakeWordProvider — placeholder that never fires.
 * Replace with a concrete implementation in a future milestone.
 */
export class NoOpWakeWordProvider implements WakeWordProvider {
  start(_onWakeWord: (event: WakeWordEvent) => void): () => void {
    return () => {};
  }
  stop(): void {}
  isSupported(): boolean {
    return false;
  }
}

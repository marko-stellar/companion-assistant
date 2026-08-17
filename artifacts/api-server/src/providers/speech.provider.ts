/**
 * SpeechProvider — interface for speech-to-text and text-to-speech.
 * Concrete implementations (e.g. OpenAI Whisper + TTS) live in
 * src/providers/impl/. Never call speech APIs from React components.
 */

export interface TranscribeParams {
  /** Raw audio buffer (WAV, WebM, etc.) */
  audioBuffer: Buffer;
  mimeType: string;
  /** IANA language hint: "hr" | "en" */
  language?: string;
}

export interface TranscribeResult {
  transcript: string;
  confidence?: number;
  detectedLanguage?: string;
}

export interface SynthesizeParams {
  text: string;
  /** Provider-specific voice identifier (stored in companion.personalityConfig.voiceId) */
  voiceId: string;
  /** IANA language code */
  language?: string;
  /** Speech rate 0.5–2.0; default 1.0 — senior-friendly: use 0.85–0.95 */
  speed?: number;
}

export interface SynthesizeResult {
  /** Raw audio buffer (MP3 or WAV) */
  audioBuffer: Buffer;
  mimeType: string;
  durationMs?: number;
}

export interface SpeechProvider {
  transcribe(params: TranscribeParams): Promise<TranscribeResult>;
  synthesize(params: SynthesizeParams): Promise<SynthesizeResult>;
}

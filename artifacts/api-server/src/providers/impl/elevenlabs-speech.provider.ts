/**
 * ElevenLabs SpeechProvider adapter.
 *
 * STT: ElevenLabs Scribe (scribe_v1) — multilingual, supports Croatian.
 * TTS: ElevenLabs eleven_multilingual_v2 — natural-sounding, Croatian-capable.
 *
 * Model IDs are configurable via environment variables so they can be updated
 * without code changes:
 *   ELEVENLABS_STT_MODEL  (default: "scribe_v1")
 *   ELEVENLABS_TTS_MODEL  (default: "eleven_multilingual_v2")
 */

import type {
  SpeechProvider,
  TranscribeParams,
  TranscribeResult,
  SynthesizeParams,
  SynthesizeResult,
} from "../speech.provider";
import { normalizeCompanionLanguage } from "../../lib/language";
import { readConfig } from "../provider-config";

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

interface ScribeResponse {
  text: string;
  language_code?: string;
  language_probability?: number;
}

export class ElevenLabsSpeechProvider implements SpeechProvider {
  private readonly apiKey: string;
  private readonly sttModel: string;
  private readonly ttsModel: string;

  constructor() {
    const key = readConfig("ELEVENLABS_API_KEY");
    if (!key) throw new Error("ELEVENLABS_API_KEY is required for ElevenLabsSpeechProvider");
    this.apiKey = key;
    this.sttModel = readConfig("ELEVENLABS_STT_MODEL") ?? "scribe_v1";
    this.ttsModel = readConfig("ELEVENLABS_TTS_MODEL") ?? "eleven_multilingual_v2";
  }

  async transcribe({
    audioBuffer,
    mimeType,
    language,
  }: TranscribeParams): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("model_id", this.sttModel);
    form.append(
      "file",
      // Wrap in Uint8Array to satisfy BlobPart type constraint on Buffer<ArrayBufferLike>
      new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
      "audio",
    );
    // Croatian IANA code understood by Scribe
    if (language) {
      form.append("language_code", normalizeCompanionLanguage(language));
    }

    const res = await fetch(`${ELEVENLABS_BASE}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": this.apiKey },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`ElevenLabs STT error ${res.status}: ${detail}`);
    }

    const json = (await res.json()) as ScribeResponse;
    return {
      transcript: json.text?.trim() ?? "",
      confidence: json.language_probability,
      detectedLanguage: json.language_code,
    };
  }

  async synthesize({
    text,
    voiceId,
    speed = 1.0,
  }: SynthesizeParams): Promise<SynthesizeResult> {
    const res = await fetch(
      `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: this.ttsModel,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            // Senior-friendly: slightly slower than default
            speed: Math.max(0.7, Math.min(1.2, speed)),
          },
        }),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`ElevenLabs TTS error ${res.status}: ${detail}`);
    }

    const buf = await res.arrayBuffer();
    return {
      audioBuffer: Buffer.from(buf),
      mimeType: "audio/mpeg",
    };
  }
}

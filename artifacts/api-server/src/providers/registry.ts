/**
 * Provider registry — creates and exports singleton provider instances.
 *
 * Configuration is read from environment variables at startup.
 * No provider key ever reaches the browser.
 *
 * Speech provider selection:
 *   ELEVENLABS_API_KEY set  →  ElevenLabsSpeechProvider
 *   otherwise               →  MockSpeechProvider
 *
 * LLM provider selection:
 *   (future: OPENAI_API_KEY / ANTHROPIC_API_KEY)
 *   currently always         →  MockLLMProvider
 *
 * Companion voice IDs (override defaults via env vars):
 *   ELEVENLABS_VOICE_ANA   ELEVENLABS_VOICE_MIA
 *   ELEVENLABS_VOICE_LUKA  ELEVENLABS_VOICE_IVAN
 */

import type { SpeechProvider } from "./speech.provider";
import type { LLMProvider } from "./llm.provider";
import { ElevenLabsSpeechProvider } from "./impl/elevenlabs-speech.provider";
import { MockSpeechProvider } from "./impl/mock-speech.provider";
import { MockLLMProvider } from "./impl/mock-llm.provider";

// ── Voice ID table ──────────────────────────────────────────────────────────
// Default IDs are ElevenLabs pre-made voices (multilingual-capable).
// Values are public voice IDs visible to anyone with the ElevenLabs API.
export const COMPANION_VOICE_IDS: Record<string, string> = {
  Ana:  process.env.ELEVENLABS_VOICE_ANA  ?? "21m00Tcm4TlvDq8ikWAM", // Rachel  — warm female
  Mia:  process.env.ELEVENLABS_VOICE_MIA  ?? "AZnzlk1XvdvUeBnXmlld", // Domi    — energetic female
  Luka: process.env.ELEVENLABS_VOICE_LUKA ?? "ErXwobaYiN019PkySvjV", // Antoni  — calm male
  Ivan: process.env.ELEVENLABS_VOICE_IVAN ?? "TxGEqnHWrfWFTfGW9XjX", // Josh    — friendly male
};

// ── Speech provider ─────────────────────────────────────────────────────────
function buildSpeechProvider(): SpeechProvider {
  if (process.env.ELEVENLABS_API_KEY) {
    console.info("[registry] Using ElevenLabsSpeechProvider");
    return new ElevenLabsSpeechProvider();
  }
  console.warn("[registry] ELEVENLABS_API_KEY not set — using MockSpeechProvider");
  return new MockSpeechProvider();
}

// ── LLM provider ────────────────────────────────────────────────────────────
function buildLLMProvider(): LLMProvider {
  // TODO: check OPENAI_API_KEY / ANTHROPIC_API_KEY when implemented
  console.warn("[registry] No LLM API key configured — using MockLLMProvider");
  return new MockLLMProvider();
}

export const speechProvider: SpeechProvider = buildSpeechProvider();
export const llmProvider: LLMProvider = buildLLMProvider();

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
import type { SearchProvider } from "./search.provider";
import type { NotificationProvider } from "./notification.provider";
import { ElevenLabsSpeechProvider } from "./impl/elevenlabs-speech.provider";
import { MockSpeechProvider } from "./impl/mock-speech.provider";
import { MockLLMProvider } from "./impl/mock-llm.provider";
import { MockSearchProvider } from "./impl/mock-search.provider";
import { UnavailableSearchProvider } from "./impl/unavailable-search.provider";
import { TwilioSMSProvider } from "./impl/twilio-sms.provider";
import { MockSMSProvider } from "./impl/mock-sms.provider";
import { UnavailableSMSProvider } from "./impl/unavailable-sms.provider";

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

// ── Search provider ─────────────────────────────────────────────────────────
// Selection:
//   SEARCH_PROVIDER=mock (or development env) → MockSearchProvider
//   otherwise → UnavailableSearchProvider (fails explicitly; the companion
//   tells the user honestly that it cannot look things up right now).
function buildSearchProvider(): SearchProvider {
  // Mock search is DEVELOPMENT-ONLY: its results are clearly labelled
  // placeholders. In production (or any non-development env) search fails
  // explicitly so the companion answers honestly instead of fabricating news.
  if (process.env.NODE_ENV === "development") {
    console.warn("[registry] Using MockSearchProvider (development only — placeholder results)");
    return new MockSearchProvider();
  }
  console.warn("[registry] No search provider configured — search will fail explicitly");
  return new UnavailableSearchProvider();
}

// ── Notification (SMS) provider ─────────────────────────────────────────────
// Selection:
//   SMS_MODE=mock (default)  → MockSMSProvider (simulated success)
//   SMS_MODE=real + secrets  → TwilioSMSProvider (real delivery)
//   SMS_MODE=real, missing   → UnavailableSMSProvider (fails explicitly)
//
// Real delivery is opt-in even when Twilio credentials are present. This
// prevents a deployment or credential change from unexpectedly sending live
// safety messages.
function buildNotificationProvider(): NotificationProvider {
  const smsMode = resolveSmsMode();

  if (smsMode === "mock") {
    console.warn("[registry] Using MockSMSProvider (SMS_MODE=mock — simulated delivery)");
    return new MockSMSProvider();
  }

  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  ) {
    console.info("[registry] Using TwilioSMSProvider");
    return new TwilioSMSProvider();
  }

  console.error(
    "[registry] SMS_MODE=real but Twilio credentials are incomplete — " +
      "safety alerts will fail explicitly",
  );
  return new UnavailableSMSProvider();
}

export type SmsMode = "real" | "mock";

/**
 * Resolve SMS delivery mode with a safe default.
 *
 * "simulated" is accepted as a friendly alias for "mock", but "mock" is the
 * canonical configuration value documented for the project.
 */
export function resolveSmsMode(rawMode = process.env.SMS_MODE): SmsMode {
  const mode = rawMode?.trim().toLowerCase();
  if (mode === "real") return "real";
  if (mode === "mock" || mode === "simulated") return "mock";
  if (mode) {
    console.warn(`[registry] Unknown SMS_MODE="${mode}" — defaulting to mock`);
  }
  return "mock";
}

export const speechProvider: SpeechProvider = buildSpeechProvider();
export const llmProvider: LLMProvider = buildLLMProvider();
export const searchProvider: SearchProvider = buildSearchProvider();
export const notificationProvider: NotificationProvider = buildNotificationProvider();

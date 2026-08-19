/**
 * Provider registry — creates and exports singleton provider instances.
 *
 * Configuration is read from environment variables at startup.
 * No provider key ever reaches the browser.
 *
 * Every provider uses an explicit MODE=real|mock setting. Missing or invalid
 * mode values safely resolve to mock. Real mode never falls back to mock.
 *
 * Companion voice IDs (override defaults via env vars):
 *   ELEVENLABS_VOICE_ANA   ELEVENLABS_VOICE_MIA
 *   ELEVENLABS_VOICE_LUKA  ELEVENLABS_VOICE_IVAN
 */

import type { SpeechProvider } from "./speech.provider";
import type { LLMProvider } from "./llm.provider";
import type { SearchProvider } from "./search.provider";
import type { NotificationProvider } from "./notification.provider";
import type { VisionProvider } from "./vision.provider";
import type { WakeWordProvider } from "./wake-word.provider";
import {
  missingConfig,
  readConfig,
  resolveProviderMode,
  type ProviderMode,
} from "./provider-config";
import { ElevenLabsSpeechProvider } from "./impl/elevenlabs-speech.provider";
import { MockSpeechProvider } from "./impl/mock-speech.provider";
import { UnavailableSpeechProvider } from "./impl/unavailable-speech.provider";
import { MockLLMProvider } from "./impl/mock-llm.provider";
import { UnavailableLLMProvider } from "./impl/unavailable-llm.provider";
import { MockSearchProvider } from "./impl/mock-search.provider";
import { UnavailableSearchProvider } from "./impl/unavailable-search.provider";
import { TwilioSMSProvider } from "./impl/twilio-sms.provider";
import { MockSMSProvider } from "./impl/mock-sms.provider";
import { UnavailableSMSProvider } from "./impl/unavailable-sms.provider";
import { MockVisionProvider } from "./impl/mock-vision.provider";
import { UnavailableVisionProvider } from "./impl/unavailable-vision.provider";
import {
  NoOpWakeWordProvider,
  UnavailableWakeWordProvider,
} from "./wake-word.provider";

// ── Voice ID table ──────────────────────────────────────────────────────────
// Default IDs are ElevenLabs pre-made voices (multilingual-capable).
// Values are public voice IDs visible to anyone with the ElevenLabs API.
export const COMPANION_VOICE_IDS: Record<string, string> = {
  Ana:  readConfig("ELEVENLABS_VOICE_ANA")  ?? "21m00Tcm4TlvDq8ikWAM", // Rachel  — warm female
  Mia:  readConfig("ELEVENLABS_VOICE_MIA")  ?? "AZnzlk1XvdvUeBnXmlld", // Domi    — energetic female
  Luka: readConfig("ELEVENLABS_VOICE_LUKA") ?? "ErXwobaYiN019PkySvjV", // Antoni  — calm male
  Ivan: readConfig("ELEVENLABS_VOICE_IVAN") ?? "TxGEqnHWrfWFTfGW9XjX", // Josh    — friendly male
};

// ── Speech provider ─────────────────────────────────────────────────────────
function buildSpeechProvider(): SpeechProvider {
  if (resolveProviderMode("SPEECH_MODE") === "mock") {
    console.warn("[registry] Using MockSpeechProvider (SPEECH_MODE=mock — canned audio)");
    return new MockSpeechProvider();
  }

  const missing = missingConfig(["ELEVENLABS_API_KEY"]);
  if (missing.length === 0) {
    console.info("[registry] Using ElevenLabsSpeechProvider (SPEECH_MODE=real)");
    return new ElevenLabsSpeechProvider();
  }

  console.error(
    `[registry] SPEECH_MODE=real but required configuration is missing: ${missing.join(", ")}`,
  );
  return new UnavailableSpeechProvider(
    `SPEECH_MODE=real requires ${missing.join(", ")}`,
  );
}

// ── LLM provider ────────────────────────────────────────────────────────────
function buildLLMProvider(): LLMProvider {
  if (resolveProviderMode("LLM_MODE") === "mock") {
    console.warn("[registry] Using MockLLMProvider (LLM_MODE=mock — canned responses)");
    return new MockLLMProvider();
  }

  console.error(
    "[registry] LLM_MODE=real but no supported real LLM adapter is implemented",
  );
  return new UnavailableLLMProvider();
}

// ── Search provider ─────────────────────────────────────────────────────────
function buildSearchProvider(): SearchProvider {
  if (resolveProviderMode("SEARCH_MODE") === "mock") {
    console.warn("[registry] Using MockSearchProvider (SEARCH_MODE=mock — placeholder results)");
    return new MockSearchProvider();
  }

  console.error(
    "[registry] SEARCH_MODE=real but no supported real search adapter is implemented",
  );
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

  const missing = missingConfig([
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_PHONE_NUMBER",
  ]);
  if (missing.length === 0) {
    console.info("[registry] Using TwilioSMSProvider (SMS_MODE=real)");
    return new TwilioSMSProvider();
  }

  console.error(
    `[registry] SMS_MODE=real but required configuration is missing: ${missing.join(", ")}`,
  );
  return new UnavailableSMSProvider();
}

// ── Vision provider ─────────────────────────────────────────────────────────
function buildVisionProvider(): VisionProvider {
  if (resolveProviderMode("VISION_MODE") === "mock") {
    console.warn("[registry] Using MockVisionProvider (VISION_MODE=mock — canned description)");
    return new MockVisionProvider();
  }

  console.error(
    "[registry] VISION_MODE=real but no supported real vision adapter is implemented",
  );
  return new UnavailableVisionProvider();
}

// ── Wake-word provider ──────────────────────────────────────────────────────
function buildWakeWordProvider(): WakeWordProvider {
  if (resolveProviderMode("WAKE_WORD_MODE") === "mock") {
    console.warn("[registry] Using NoOpWakeWordProvider (WAKE_WORD_MODE=mock)");
    return new NoOpWakeWordProvider();
  }

  console.error(
    "[registry] WAKE_WORD_MODE=real but no supported wake-word adapter is implemented",
  );
  return new UnavailableWakeWordProvider();
}

export type SmsMode = ProviderMode;

/**
 * Resolve SMS delivery mode with a safe default.
 *
 * "simulated" is accepted as a friendly alias for "mock", but "mock" is the
 * canonical configuration value documented for the project.
 */
export function resolveSmsMode(rawMode = process.env.SMS_MODE): SmsMode {
  return resolveProviderMode("SMS_MODE", rawMode);
}

export const speechProvider: SpeechProvider = buildSpeechProvider();
export const llmProvider: LLMProvider = buildLLMProvider();
export const searchProvider: SearchProvider = buildSearchProvider();
export const notificationProvider: NotificationProvider = buildNotificationProvider();
export const visionProvider: VisionProvider = buildVisionProvider();
export const wakeWordProvider: WakeWordProvider = buildWakeWordProvider();

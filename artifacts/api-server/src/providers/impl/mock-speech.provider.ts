/**
 * MockSpeechProvider — used when ELEVENLABS_API_KEY is not configured.
 *
 * Transcription: returns a canned greeting in the user's language so the
 * full voice flow (recording → uploading → playing) can be exercised locally.
 *
 * Synthesis: returns a valid 0.5-second silent WAV so the Audio element plays
 * correctly and the UI transitions through the "speaking" state.
 */

import type {
  SpeechProvider,
  TranscribeParams,
  TranscribeResult,
  SynthesizeParams,
  SynthesizeResult,
} from "../speech.provider";

/** Generate a minimal valid PCM WAV with silence. */
function silentWav(durationMs = 500): Buffer {
  const sampleRate = 16_000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);

  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);                                     // chunk size
  buf.writeUInt16LE(1, 20);                                       // PCM
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28); // byte rate
  buf.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);      // block align
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  // Data section is already zero-filled (silence)
  return buf;
}

const CANNED_GREETINGS: Record<string, string[]> = {
  hr: [
    "Kako si danas?",
    "Dobro jutro! Kako se osjećaš?",
    "Pričaj mi nešto lijepo.",
  ],
  en: [
    "How are you today?",
    "Good morning! How are you feeling?",
    "Tell me something nice.",
  ],
};

export class MockSpeechProvider implements SpeechProvider {
  async transcribe({ language }: TranscribeParams): Promise<TranscribeResult> {
    const lang = language === "hr" ? "hr" : "en";
    const options = CANNED_GREETINGS[lang];
    const transcript = options[Math.floor(Math.random() * options.length)];
    return {
      transcript,
      confidence: 1.0,
      detectedLanguage: lang,
    };
  }

  async synthesize(_params: SynthesizeParams): Promise<SynthesizeResult> {
    // Small artificial delay to simulate TTS latency in demo mode
    await new Promise(r => setTimeout(r, 400));
    return {
      audioBuffer: silentWav(800),
      mimeType: "audio/wav",
      durationMs: 800,
    };
  }
}

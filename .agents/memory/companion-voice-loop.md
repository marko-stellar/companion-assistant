---
name: COMPANION voice conversation loop
description: Architecture and decisions for the real voice flow (STT → LLM → TTS) implemented in the tablet and API server.
---

# COMPANION voice conversation loop

## Architecture

```
Tablet (browser)
  → press Talk button
  → MediaRecorder captures audio (audio/webm;codecs=opus preferred)
  → FileReader converts blob to base64
  → POST /api/tablet/converse { audio, mimeType, conversationId }
  ← { transcript, reply, audio (base64), mimeType, conversationId }
  → new Audio(`data:${mimeType};base64,${audio}`).play()
```

## Provider pattern

All provider keys stay server-side. Registry (`src/providers/registry.ts`) selects adapters at startup based on env vars — never exposes keys to the browser.

- `ELEVENLABS_API_KEY` set → `ElevenLabsSpeechProvider` (STT: scribe_v1, TTS: eleven_multilingual_v2)
- No key → `MockSpeechProvider` (canned greeting + silent WAV)
- No LLM key → `MockLLMProvider` (personality-aware, round-robin responses, Croatian/English)

**Why:** Keeps all AI credentials off the client, makes offline demo viable.

## Companion voice IDs

Default ElevenLabs pre-made voice IDs (all work with eleven_multilingual_v2 for Croatian):
- Ana → `21m00Tcm4TlvDq8ikWAM` (Rachel)
- Mia → `AZnzlk1XvdvUeBnXmlld` (Domi)
- Luka → `ErXwobaYiN019PkySvjV` (Antoni)
- Ivan → `TxGEqnHWrfWFTfGW9XjX` (Josh)

Override via env: `ELEVENLABS_VOICE_ANA`, `ELEVENLABS_VOICE_MIA`, `ELEVENLABS_VOICE_LUKA`, `ELEVENLABS_VOICE_IVAN`.

## Voice phase state machine (device-context.tsx)

`VoicePhase`: idle → recording → uploading → playing → idle

Maps to `CompanionState` for the Orb:
- recording → listening
- uploading → thinking
- playing → speaking
- idle / dnd / offline → respective states

Button behavior per phase:
- idle: "Razgovaraj" → start recording
- recording: "Zaustavi" (red indicator) → stop + send
- uploading: "…" disabled → in-flight, ignore taps
- playing: "Razgovaraj" → barge-in (stops audio, starts new recording)

## Key technical decisions

- **JSON body for audio upload** (not multipart) — base64 in JSON avoids multer dependency. Express JSON limit raised to 10 MB in app.ts.
- **Buffer → Uint8Array for ElevenLabs Blob** — `new Blob([new Uint8Array(buffer)])` required because `Buffer<ArrayBufferLike>` fails TypeScript's `BlobPart` check.
- **WakeWordProvider** — interface defined as `NoOpWakeWordProvider` stub; deferred because no stable browser-compatible offline library found.
- **Auto-stop at 30 s** — seniors press the button twice (start/stop); 30 s failsafe prevents infinite recording.
- **TTS failure non-fatal** — conversation is saved to DB but empty audio returned; UI falls back to idle without crashing.

## Error handling (VoiceError type)

`mic_denied | mic_unavailable | transcription_empty | llm_error | network_error`

Each maps to a senior-friendly localized string. Banner shown below Talk button, auto-dismisses after 5 s.

## What's still mock

- LLM: `MockLLMProvider` with hardcoded round-robin responses. Replace when OPENAI_API_KEY or ANTHROPIC_API_KEY is available — the `LLMProvider` interface is already wired.
- ConversationService conversation context: history loaded from DB for real LLM, but mock ignores it.

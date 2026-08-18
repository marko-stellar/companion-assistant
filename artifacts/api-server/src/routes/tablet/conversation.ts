/**
 * POST /api/tablet/converse
 *
 * Full voice conversation loop:
 *   1. Receive base64-encoded audio from the tablet
 *   2. Transcribe with the configured SpeechProvider
 *   3. Build message history and call LLMProvider
 *   4. Synthesize reply with the configured SpeechProvider
 *   5. Return transcript + reply text + base64 audio
 *
 * All provider keys stay server-side. No credentials reach the browser.
 */

import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  users,
  companions,
  conversations,
  conversationMessages,
} from "@workspace/db";
import { requireDevice } from "../../middlewares/requireDevice";
import { speechProvider, llmProvider, COMPANION_VOICE_IDS } from "../../providers/registry";
import type { Message } from "../../providers/llm.provider";

const router = Router();

// ── System prompt builder ───────────────────────────────────────────────────

function buildSystemPrompt(
  companion: {
    name: string;
    personalityConfig: { systemPromptText: string; languageStyle: string };
  },
  language: string,
): string {
  const langInstruction =
    language === "hr"
      ? "Govori isključivo na standardnom hrvatskom jeziku. Koristi latinično pismo. Izbjegavaj srbizme i bosanske varijante gdje je moguće. Ne prevodi vlastita imena."
      : "Speak in English.";

  return [
    companion.personalityConfig.systemPromptText,
    "",
    langInstruction,
    "",
    "IMPORTANT RULES:",
    "- You are talking to an older person (65–75 years old). Be warm, patient and clear.",
    "- Keep replies to 1–3 sentences. Never ramble.",
    "- Never claim to be human. You may describe yourself as their companion or digital friend.",
    "- Never give medical advice or diagnoses. If the user raises a health concern, gently suggest speaking with a doctor.",
  ].join("\n");
}

// ── Route ───────────────────────────────────────────────────────────────────

router.post("/converse", requireDevice, async (req, res): Promise<void> => {
  const userId = req.deviceUserId!;

  const {
    audio,
    mimeType: reqMimeType,
    conversationId: existingConvId,
  } = req.body as {
    audio?: string;
    mimeType?: string;
    conversationId?: string;
  };

  if (!audio || typeof audio !== "string") {
    res.status(400).json({ error: "audio (base64 string) is required" });
    return;
  }

  const mimeType = reqMimeType ?? "audio/webm";

  // ── 1. Load user + companion ──────────────────────────────────────────────
  const [row] = await db
    .select({ user: users, companion: companions })
    .from(users)
    .leftJoin(companions, eq(users.companionId, companions.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { user, companion } = row;
  const language = user.language ?? "en";

  // ── 2. Decode audio buffer ────────────────────────────────────────────────
  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audio, "base64");
  } catch {
    res.status(400).json({ error: "Invalid base64 audio data" });
    return;
  }

  // ── 3. Transcribe ─────────────────────────────────────────────────────────
  let transcript: string;
  let detectedLanguage: string | undefined;

  try {
    const result = await speechProvider.transcribe({
      audioBuffer,
      mimeType,
      language,
    });
    transcript = result.transcript.trim();
    detectedLanguage = result.detectedLanguage;
  } catch (err) {
    req.log.error({ err }, "STT failed");
    res.status(500).json({ error: "Transcription failed. Please try again." });
    return;
  }

  if (!transcript) {
    res.status(422).json({ error: "transcription_empty" });
    return;
  }

  // ── 4. Get or create conversation session ─────────────────────────────────
  let convId = existingConvId;
  if (!convId) {
    const [conv] = await db
      .insert(conversations)
      .values({ userId })
      .returning({ id: conversations.id });
    convId = conv.id;
  }

  // ── 5. Load recent history for context (last 6 messages = 3 turns) ────────
  const recentRows = await db
    .select({
      role: conversationMessages.role,
      content: conversationMessages.content,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, convId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(6);

  const historyMessages: Message[] = recentRows
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // ── 6. Build LLM message list ─────────────────────────────────────────────
  const fallbackCompanion = {
    name: "Companion",
    personalityConfig: {
      systemPromptText:
        "You are a caring and friendly companion to an elderly person.",
      languageStyle: "warm and gentle",
    },
  };

  const llmMessages: Message[] = [
    {
      role: "system",
      content: buildSystemPrompt(companion ?? fallbackCompanion, language),
    },
    ...historyMessages,
    { role: "user", content: transcript },
  ];

  // ── 7. Generate reply ─────────────────────────────────────────────────────
  let reply: string;
  try {
    const result = await llmProvider.respond({
      messages: llmMessages,
      language,
      maxTokens: 150,
    });
    reply = result.content.trim();
  } catch (err) {
    req.log.error({ err }, "LLM failed");
    res.status(500).json({ error: "Response generation failed. Please try again." });
    return;
  }

  // ── 8. Persist conversation messages ─────────────────────────────────────
  await db.insert(conversationMessages).values([
    { conversationId: convId, role: "user" as const, content: transcript },
    { conversationId: convId, role: "assistant" as const, content: reply },
  ]);

  // ── 9. Synthesize speech ──────────────────────────────────────────────────
  const voiceId = companion
    ? (COMPANION_VOICE_IDS[companion.name] ?? companion.personalityConfig.voiceId)
    : "21m00Tcm4TlvDq8ikWAM";

  const effectiveLang = detectedLanguage ?? language;

  let replyAudioBuffer: Buffer = Buffer.alloc(0);
  let replyMimeType = "audio/mpeg";

  try {
    const synthesized = await speechProvider.synthesize({
      text: reply,
      voiceId,
      language: effectiveLang,
      speed: 0.9, // Slightly slower for senior-friendly delivery
    });
    replyAudioBuffer = synthesized.audioBuffer;
    replyMimeType = synthesized.mimeType;
  } catch (err) {
    // TTS failure is non-fatal — return text reply without audio
    req.log.error({ err }, "TTS failed; returning text-only response");
  }

  req.log.info(
    { userId, convId, lang: effectiveLang, transcriptLen: transcript.length },
    "Conversation turn complete",
  );

  res.json({
    transcript,
    reply,
    audio: replyAudioBuffer.toString("base64"),
    mimeType: replyMimeType,
    conversationId: convId,
  });
});

export default router;

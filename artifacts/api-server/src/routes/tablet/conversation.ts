/**
 * POST /api/tablet/converse
 *
 * Full voice conversation loop with persistent context assembly:
 *   1. Decode and transcribe audio (STT)
 *   2. Get or create a conversation session
 *   3. Build a bounded context window via ConversationContextService
 *   4. Generate a reply via LLMProvider
 *   5. Synthesize audio via SpeechProvider (TTS)
 *   6. Persist both messages with metadata (latency, language, model)
 *   7. Increment conversation message_count; fire-and-forget summary check
 *
 * Privacy: transcript content is NEVER written to server logs.
 * Only metadata (lengths, latencies, language) is logged.
 */

import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  users,
  companions,
  conversations,
  conversationMessages,
} from "@workspace/db";
import { requireDevice } from "../../middlewares/requireDevice";
import {
  speechProvider,
  llmProvider,
  COMPANION_VOICE_IDS,
} from "../../providers/registry";
import { conversationContextService } from "../../services/conversation-context.service";
import { conversationSummaryService } from "../../services/conversation-summary.service";

const router = Router();

router.post("/converse", requireDevice, async (req, res): Promise<void> => {
  const routeStart = Date.now();
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

  // ── 2. Decode audio ───────────────────────────────────────────────────────
  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audio, "base64");
  } catch {
    res.status(400).json({ error: "Invalid base64 audio data" });
    return;
  }

  // ── 3. Transcribe (STT) ───────────────────────────────────────────────────
  const sttStart = Date.now();
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

  const sttLatencyMs = Date.now() - sttStart;

  if (!transcript) {
    res.status(422).json({ error: "transcription_empty" });
    return;
  }

  const effectiveLang = detectedLanguage ?? language;

  // ── 4. Get or create conversation session ─────────────────────────────────
  let convId = existingConvId;
  if (!convId) {
    const [conv] = await db
      .insert(conversations)
      .values({ userId, language: effectiveLang })
      .returning({ id: conversations.id });
    convId = conv.id;
  }

  // ── 5. Build bounded context window ──────────────────────────────────────
  const { systemPrompt, recentMessages } =
    await conversationContextService.buildContext({
      userId,
      companion,
      conversationId: convId,
      language: effectiveLang,
    });

  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...recentMessages,
    { role: "user" as const, content: transcript },
  ];

  // ── 6. Generate LLM reply ─────────────────────────────────────────────────
  const llmStart = Date.now();
  let reply: string;
  let tokenUsage: { promptTokens: number; completionTokens: number } | undefined;

  try {
    const result = await llmProvider.respond({
      messages: llmMessages,
      language: effectiveLang,
      maxTokens: 150,
    });
    reply = result.content.trim();
    tokenUsage = result.usage;
  } catch (err) {
    req.log.error({ err }, "LLM failed");
    res.status(500).json({
      error: "Response generation failed. Please try again.",
    });
    return;
  }

  const llmLatencyMs = Date.now() - llmStart;

  // ── 7. Synthesize speech (TTS) ────────────────────────────────────────────
  const voiceId = companion
    ? (COMPANION_VOICE_IDS[companion.name] ??
       companion.personalityConfig.voiceId)
    : "21m00Tcm4TlvDq8ikWAM";

  const ttsStart = Date.now();
  let replyAudioBuffer: Buffer = Buffer.alloc(0);
  let replyMimeType = "audio/mpeg";

  try {
    const synthesized = await speechProvider.synthesize({
      text: reply,
      voiceId,
      language: effectiveLang,
      speed: 0.9,
    });
    replyAudioBuffer = synthesized.audioBuffer;
    replyMimeType = synthesized.mimeType;
  } catch (err) {
    // TTS failure is non-fatal — conversation is saved, audio is empty
    req.log.error({ err }, "TTS failed — returning text-only response");
  }

  const ttsLatencyMs = Date.now() - ttsStart;
  const totalLatencyMs = Date.now() - routeStart;

  // ── 8. Persist messages with metadata ─────────────────────────────────────
  // Privacy: content is stored in the DB but NEVER written to log output.
  const sttModel = process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1";
  const ttsModel = process.env.ELEVENLABS_TTS_MODEL ?? "eleven_multilingual_v2";

  await db.insert(conversationMessages).values([
    {
      conversationId: convId,
      role: "user" as const,
      content: transcript,
      language: effectiveLang,
      latencyMs: sttLatencyMs,
      providerMeta: { sttModel, sttLatencyMs },
    },
    {
      conversationId: convId,
      role: "assistant" as const,
      content: reply,
      language: effectiveLang,
      latencyMs: totalLatencyMs,
      providerMeta: {
        sttModel,
        ttsModel,
        voiceId,
        sttLatencyMs,
        llmLatencyMs,
        ttsLatencyMs,
        ...(tokenUsage ? { tokens: tokenUsage } : {}),
      },
    },
  ]);

  // ── 9. Increment message count; fire-and-forget summary ───────────────────
  const [updated] = await db
    .update(conversations)
    .set({
      messageCount: sql`${conversations.messageCount} + 2`,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, convId))
    .returning({ messageCount: conversations.messageCount });

  // Fire-and-forget: errors are logged inside the service, never propagated
  void conversationSummaryService.maybeSummarize(
    convId,
    updated?.messageCount ?? 0,
  );

  // ── 10. Privacy-safe log ──────────────────────────────────────────────────
  req.log.info(
    {
      userId,
      convId,
      lang: effectiveLang,
      sttLatencyMs,
      llmLatencyMs,
      ttsLatencyMs,
      totalLatencyMs,
      // Lengths only — never log transcript content
      transcriptLen: transcript.length,
      replyLen: reply.length,
    },
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

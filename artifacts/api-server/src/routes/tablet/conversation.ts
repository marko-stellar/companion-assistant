/**
 * POST /api/tablet/converse
 *
 * Full voice conversation loop with persistent context assembly and
 * structured tool calling:
 *   1. Decode and transcribe audio (STT)
 *   2. Get or create a conversation session
 *   3. Build a bounded context window (companion identity, user profile,
 *      schedule, DND, retrieved memories, tool descriptions)
 *   4. Call respondWithTools — LLM returns either text or a tool call
 *   5a. Tool call → validate + execute → call respond() for confirmation
 *   5b. Text → use directly
 *   6. Synthesize audio via SpeechProvider (TTS)
 *   7. Persist both messages with metadata
 *   8. Increment message_count; fire-and-forget summary + memory extraction
 *
 * Privacy: transcript content is NEVER written to server logs.
 * Security: userId is always from req.deviceUserId — never from LLM args.
 */

import { Router } from "express";
import { eq, sql, and, desc } from "drizzle-orm";
import {
  db,
  users,
  companions,
  conversations,
  conversationMessages,
  photos,
  memories,
} from "@workspace/db";
import { requireDevice } from "../../middlewares/requireDevice";
import {
  speechProvider,
  llmProvider,
  COMPANION_VOICE_IDS,
} from "../../providers/registry";
import { conversationContextService } from "../../services/conversation-context.service";
import { conversationSummaryService } from "../../services/conversation-summary.service";
import { memoryExtractionService } from "../../services/memory-extraction.service";
import { parseToolCall, toolExecutor } from "../../tools";
import { buildToolsPromptSection } from "../../tools/definitions";
import { activityEventService } from "../../services/activity-event.service";
import { routineService } from "../../domains/routine";
import { safetyService, type SafetyTurnOutcome } from "../../domains/safety";
import { normalizeCompanionLanguage } from "../../lib/language";

const router = Router();

router.post("/converse", requireDevice, async (req, res): Promise<void> => {
  const routeStart = Date.now();
  const userId = req.deviceUserId!;

  const {
    audio,
    mimeType: reqMimeType,
    conversationId: existingConvId,
    activePhotoId,
  } = req.body as {
    audio?: string;
    mimeType?: string;
    conversationId?: string;
    /** UUID of the photo currently visible on the tablet screen (if any). */
    activePhotoId?: string;
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
  // The user’s saved language setting is authoritative for the companion’s
  // reply. Speech-to-text detection can return variants such as "hrv", but it
  // must not unexpectedly change the language the user chose in Admin.
  const language = normalizeCompanionLanguage(user.language);
  const timezone = user.timezone ?? "UTC";

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

  try {
    const result = await speechProvider.transcribe({
      audioBuffer,
      mimeType,
      language,
    });
    transcript = result.transcript.trim();
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

  const effectiveLang = language;

  // ── 4. Get or create conversation session ─────────────────────────────────
  let convId = existingConvId;
  const isNewConversation = !convId;
  if (!convId) {
    const [conv] = await db
      .insert(conversations)
      .values({ userId, language: effectiveLang })
      .returning({ id: conversations.id });
    convId = conv.id;
  }

  // Emit activity event — fire-and-forget, never blocks the voice loop.
  // Only emit on the first turn of each conversation to count distinct sessions.
  if (isNewConversation) {
    activityEventService.emit(userId, "USER_STARTED_CONVERSATION", {
      conversationId: convId,
      language: effectiveLang,
    });
    // Resolve any open routine-deviation check-ins — user has now been heard from
    void routineService.resolveOpenDeviations(userId, new Date()).catch(() => {});
  }

  // ── 4b. Independent safety classification (separate LLM call) ────────────
  // Runs in parallel with the normal response turn for EVERY finalized
  // utterance. A classifier failure must never break the conversation —
  // it is caught and logged content-free (no utterance text, no provider
  // error message which could echo request content).
  const safetyPromise: Promise<SafetyTurnOutcome | null> = safetyService
    .evaluateConversationTurn({
      userId,
      conversationId: convId,
      userText: transcript,
      userName:
        user.preferredFormOfAddress ?? user.firstName ?? user.displayName,
      timezone,
      language: effectiveLang,
    })
    .catch((err) => {
      req.log.error(
        { userId, convId, errName: err instanceof Error ? err.name : "UnknownError" },
        "Safety classification failed",
      );
      return null;
    });

  // ── 5. Load photo context + available photos ──────────────────────────────
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const safeActivePhotoId = activePhotoId && UUID_RE.test(activePhotoId) ? activePhotoId : undefined;

  const [availablePhotos, activePhotoCtx] = await Promise.all([
    db.select().from(photos).where(eq(photos.userId, userId)).orderBy(desc(photos.createdAt)).limit(30),
    safeActivePhotoId
      ? (async () => {
          const [photo] = await db
            .select()
            .from(photos)
            .where(and(eq(photos.id, safeActivePhotoId), eq(photos.userId, userId)))
            .limit(1);
          if (!photo) return undefined;
          const photoMems = await db
            .select()
            .from(memories)
            .where(
              and(
                eq(memories.userId, userId),
                eq(memories.photoId, safeActivePhotoId),
                eq(memories.isActive, true),
              ),
            )
            .limit(20);
          return { photo, photoMemories: photoMems };
        })()
      : Promise.resolve(undefined),
  ]);

  // ── 6. Build bounded context window (with retrieved memories + photo) ─────
  const { systemPrompt, recentMessages } =
    await conversationContextService.buildContext({
      userId,
      companion,
      conversationId: convId,
      language: effectiveLang,
      userTranscript: transcript,
      activePhotoContext: activePhotoCtx,
      availablePhotos,
    });

  const toolsSection = buildToolsPromptSection(effectiveLang);
  const fullSystemPrompt = systemPrompt + toolsSection;

  const llmMessages = [
    { role: "system" as const, content: fullSystemPrompt },
    ...recentMessages,
    { role: "user" as const, content: transcript },
  ];

  // ── 7. LLM turn with tool support ─────────────────────────────────────────
  const llmStart = Date.now();
  let reply: string;
  let tokenUsage: { promptTokens: number; completionTokens: number } | undefined;
  let responsePhotoUrl: string | undefined;
  let responsePhotoId: string | undefined;

  try {
    const firstResult = await llmProvider.respondWithTools({
      messages: llmMessages,
      language: effectiveLang,
      maxTokens: 200,
      toolsSection,
    });

    if (firstResult.type === "tool_call") {
      // ── 7a. Execute the tool ─────────────────────────────────────────────
      req.log.info({ tool: firstResult.toolName, userId }, "Tool call detected");

      const toolResult = await toolExecutor.execute(
        { tool: firstResult.toolName, args: firstResult.args },
        { userId, timezone, conversationId: convId },
      );

      // Capture photo URL when show_photo succeeds
      if (toolResult.ok && toolResult.data?.photoUrl) {
        responsePhotoUrl = toolResult.data.photoUrl as string;
        responsePhotoId = toolResult.data.photoId as string | undefined;
      }

      tokenUsage = firstResult.usage;

      // ── 7b. Ask LLM to produce a natural-language confirmation ───────────
      const resultMessage = toolResult.ok
        ? `[Tool ${firstResult.toolName} succeeded. Confirm naturally: "${toolResult.confirmationHint}"]`
        : `[Tool ${firstResult.toolName} failed: "${toolResult.error}". Apologise briefly and explain.]`;

      const confirmResult = await llmProvider.respond({
        messages: [
          { role: "system" as const, content: systemPrompt },
          ...recentMessages,
          { role: "user" as const, content: transcript },
          { role: "assistant" as const, content: resultMessage },
        ],
        language: effectiveLang,
        maxTokens: 120,
      });

      reply = confirmResult.content.trim();
      if (confirmResult.usage && tokenUsage) {
        tokenUsage = {
          promptTokens: tokenUsage.promptTokens + confirmResult.usage.promptTokens,
          completionTokens: tokenUsage.completionTokens + confirmResult.usage.completionTokens,
        };
      } else if (confirmResult.usage) {
        tokenUsage = confirmResult.usage;
      }

    } else {
      // ── 7c. Plain text response — check for inline <tool_call> block ─────
      const inlineToolCall = parseToolCall(firstResult.content);
      if (inlineToolCall) {
        req.log.info({ tool: inlineToolCall.tool, userId }, "Inline tool call parsed");
        const toolResult = await toolExecutor.execute(inlineToolCall, { userId, timezone, conversationId: convId });

        // Capture photo URL when show_photo succeeds
        if (toolResult.ok && toolResult.data?.photoUrl) {
          responsePhotoUrl = toolResult.data.photoUrl as string;
          responsePhotoId = toolResult.data.photoId as string | undefined;
        }

        const resultMessage = toolResult.ok
          ? `[Tool ${inlineToolCall.tool} succeeded. Confirm naturally: "${toolResult.confirmationHint}"]`
          : `[Tool ${inlineToolCall.tool} failed: "${toolResult.error}". Apologise briefly and explain.]`;

        const confirmResult = await llmProvider.respond({
          messages: [
            { role: "system" as const, content: systemPrompt },
            ...recentMessages,
            { role: "user" as const, content: transcript },
            { role: "assistant" as const, content: resultMessage },
          ],
          language: effectiveLang,
          maxTokens: 120,
        });
        reply = confirmResult.content.trim();
        tokenUsage = confirmResult.usage;
      } else {
        reply = firstResult.content.trim();
        tokenUsage = firstResult.usage;
      }
    }
  } catch (err) {
    req.log.error({ err }, "LLM failed");
    res.status(500).json({
      error: "Response generation failed. Please try again.",
    });
    return;
  }

  const llmLatencyMs = Date.now() - llmStart;

  // ── 7c. Apply safety outcome ──────────────────────────────────────────────
  // When this turn was classified urgent, the calm safety guidance replaces
  // the normal reply. The conversation keeps running either way.
  const safetyOutcome = await safetyPromise;
  if (safetyOutcome?.urgent && safetyOutcome.guidance) {
    reply = safetyOutcome.guidance;
  }

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
    req.log.error({ err }, "TTS failed — returning text-only response");
  }

  const ttsLatencyMs = Date.now() - ttsStart;
  const totalLatencyMs = Date.now() - routeStart;

  // ── 8. Persist messages with metadata ─────────────────────────────────────
  const sttModel = process.env.ELEVENLABS_STT_MODEL ?? "scribe_v1";
  const ttsModel = process.env.ELEVENLABS_TTS_MODEL ?? "eleven_multilingual_v2";

  const [userMsg] = await db
    .insert(conversationMessages)
    .values([
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
    ])
    .returning({ id: conversationMessages.id });

  // ── 9. Update message_count; fire-and-forget summary ─────────────────────
  const [updated] = await db
    .update(conversations)
    .set({
      messageCount: sql`${conversations.messageCount} + 2`,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, convId))
    .returning({ messageCount: conversations.messageCount });

  void conversationSummaryService.maybeSummarize(
    convId,
    updated?.messageCount ?? 0,
  );

  // ── 10. Fire-and-forget memory extraction ────────────────────────────────
  void memoryExtractionService.extractFromTurn({
    userId,
    transcript,
    conversationId: convId,
    messageId: userMsg?.id,
    language: effectiveLang,
    // Link memories to the active photo (pre-existing or just shown via tool)
    photoId: activePhotoCtx?.photo.id ?? responsePhotoId,
  });

  // ── 11. Privacy-safe log ──────────────────────────────────────────────────
  req.log.info(
    {
      userId,
      convId,
      lang: effectiveLang,
      sttLatencyMs,
      llmLatencyMs,
      ttsLatencyMs,
      totalLatencyMs,
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
    // Present when show_photo was called successfully this turn
    ...(responsePhotoUrl ? { photoUrl: responsePhotoUrl, photoId: responsePhotoId } : {}),
    // Present when this turn triggered a safety concern
    ...(safetyOutcome?.urgent ? { safetyAlert: true } : {}),
  });
});

/**
 * POST /api/tablet/speak
 *
 * Synthesize arbitrary short text with the user's companion voice.
 * No STT / LLM / persistence — pure TTS passthrough for proactive alerts.
 */
router.post("/speak", requireDevice, async (req, res): Promise<void> => {
  const userId = req.deviceUserId!;
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text (string) is required" });
    return;
  }
  if (text.length > 300) {
    res.status(400).json({ error: "text must be 300 characters or fewer" });
    return;
  }

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

  const voiceId = companion
    ? (COMPANION_VOICE_IDS[companion.name] ??
       companion.personalityConfig.voiceId)
    : "21m00Tcm4TlvDq8ikWAM";

  const ttsStart = Date.now();
  try {
    const synthesized = await speechProvider.synthesize({
      text: text.trim(),
      voiceId,
      language,
      speed: 0.9,
    });
    req.log.info(
      { userId, textLen: text.length, ttsLatencyMs: Date.now() - ttsStart },
      "Proactive speech synthesized",
    );
    res.json({
      audio: synthesized.audioBuffer.toString("base64"),
      mimeType: synthesized.mimeType,
    });
  } catch (err) {
    req.log.error({ err }, "Proactive TTS failed");
    res.status(500).json({ error: "Speech synthesis failed" });
  }
});

export default router;

/**
 * MemoryExtractionService — extracts structured long-term memories from conversation turns.
 *
 * Called fire-and-forget after each assistant reply is sent. Errors never surface to
 * the voice loop. Extraction only works with a real LLM (a mock returns canned text
 * that fails JSON parsing — the service catches this and skips gracefully).
 *
 * EXTRACTION RULES (embedded in the system prompt):
 *   - Conservative: only explicit statements, not speculation
 *   - No medical diagnoses
 *   - Ambiguous statements get confidence ≤ 0.5
 *   - Corrections (Ne, nije …) supersede the old memory and retain audit trail
 *   - Duplicate detection: don't re-create a fact that already exists as active
 */

import { eq, and, ilike, sql } from "drizzle-orm";
import { db, memories, conversationMessages } from "@workspace/db";
import type { MemoryType } from "@workspace/db";
import { llmProvider } from "../providers/registry";
import { embeddingProvider } from "../providers/embedding.provider";
import { logger } from "../lib/logger";

const CONFIDENCE_THRESHOLD_STORE = 0.4; // Below this we skip storing

interface ExtractedMemory {
  type: MemoryType;
  subject: string | null;
  fact: string;
  confidence: number;
  emotional_context: string | null;
}

interface Correction {
  /** Subject of the memory being corrected */
  supersedes_subject: string;
  /** Approximate fragment of the wrong fact to match against */
  supersedes_fact_like: string;
  /** New correct fact */
  new_fact: string;
  new_type: MemoryType;
  confidence: number;
  emotional_context: string | null;
}

interface ExtractionResult {
  memories: ExtractedMemory[];
  corrections: Correction[];
}

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant for a senior care companion app.
Your job is to extract explicit factual statements from a message spoken by a senior user.

MEMORY TYPES: PROFILE | RELATIONSHIP | PREFERENCE | BIOGRAPHICAL | EPISODIC | ROUTINE | HEALTH_CONTEXT | CONVERSATION_SUMMARY

RULES:
- Extract ONLY what is explicitly and clearly stated. Never speculate.
- Do NOT infer medical diagnoses or health conditions.
- For clear, unambiguous statements: confidence 0.8–1.0.
- For clear implications: confidence 0.5–0.8.
- For ambiguous or indirect: confidence 0.3–0.5.
- Detect voice corrections: phrases like "ne, ...", "nije ...", "zapravo ...", "actually ...", "no, ..." indicate the user is correcting a prior belief.
- Write facts as short, neutral third-person statements in the same language as the user's message.
- Subject should be a noun ("Petra", "kava", "posao") or null if the fact is about the user themselves.

Respond ONLY with valid JSON in this exact format:
{
  "memories": [
    { "type": "RELATIONSHIP", "subject": "Petra", "fact": "Petra je korisnikova kći.", "confidence": 0.9, "emotional_context": null }
  ],
  "corrections": [
    { "supersedes_subject": "Petra", "supersedes_fact_like": "sestra", "new_fact": "Petra je kći, ne sestra.", "new_type": "RELATIONSHIP", "confidence": 0.95, "emotional_context": null }
  ]
}

If nothing is extractable, respond with exactly: {"memories":[],"corrections":[]}`;

export class MemoryExtractionService {
  /**
   * Fire-and-forget: extract memories from a single user transcript turn.
   * Errors are logged but never propagated.
   */
  async extractFromTurn(params: {
    userId: string;
    transcript: string;
    conversationId: string;
    messageId?: string;
    language: string;
    /** When set, extracted memories are linked to this photo. */
    photoId?: string;
  }): Promise<void> {
    const { userId, transcript, conversationId, messageId, language, photoId } = params;

    // Skip very short utterances (greetings, acknowledgements)
    if (transcript.trim().length < 15) return;

    try {
      await this.doExtract({ userId, transcript, conversationId, messageId, language, photoId });
    } catch (err) {
      // Never crash the voice loop
      logger.error({ err, userId, conversationId }, "Memory extraction failed");
    }
  }

  private async doExtract(params: {
    userId: string;
    transcript: string;
    conversationId: string;
    messageId?: string;
    language: string;
    photoId?: string;
  }): Promise<void> {
    const { userId, transcript, conversationId, messageId, photoId } = params;

    // Ask LLM to extract memories
    const { content: raw } = await llmProvider.respond({
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: `USER MESSAGE: "${transcript}"` },
      ],
      maxTokens: 400,
    });

    // Parse JSON — MockLLM returns prose which will fail here (expected)
    let result: ExtractionResult;
    try {
      const jsonStr = raw.trim();
      // Find JSON object in response (LLM may add preamble)
      const jsonStart = jsonStr.indexOf("{");
      const jsonEnd = jsonStr.lastIndexOf("}");
      if (jsonStart === -1 || jsonEnd === -1) return;
      result = JSON.parse(jsonStr.slice(jsonStart, jsonEnd + 1)) as ExtractionResult;
    } catch {
      // Not valid JSON — MockLLM or malformed response, skip silently
      return;
    }

    if (!result.memories?.length && !result.corrections?.length) return;

    // Process corrections first (they may create new memories we dedup against)
    for (const correction of result.corrections ?? []) {
      await this.applyCorrection({ userId, correction, conversationId, messageId });
    }

    // Process new memories
    for (const mem of result.memories ?? []) {
      if (mem.confidence < CONFIDENCE_THRESHOLD_STORE) continue;
      await this.storeMemory({ userId, mem, conversationId, messageId, photoId });
    }
  }

  private async applyCorrection(params: {
    userId: string;
    correction: Correction;
    conversationId: string;
    messageId?: string;
  }): Promise<void> {
    const { userId, correction, conversationId, messageId } = params;

    // Find the memory being corrected
    const candidates = await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.isActive, true),
          correction.supersedes_subject
            ? ilike(memories.subject, `%${correction.supersedes_subject}%`)
            : sql`true`,
          ilike(memories.fact, `%${correction.supersedes_fact_like}%`),
        ),
      )
      .limit(3);

    if (candidates.length === 0) {
      // No matching memory to supersede — just store the corrected fact
      await this.storeMemory({
        userId,
        mem: {
          type: correction.new_type,
          subject: correction.supersedes_subject || null,
          fact: correction.new_fact,
          confidence: correction.confidence,
          emotional_context: correction.emotional_context,
        },
        conversationId,
        messageId,
        sourceType: "voice_correction",
      });
      return;
    }

    // Deactivate each old memory and create a superseding record
    for (const old of candidates) {
      // Create the corrected memory first to get its ID
      const embedding = await embeddingProvider.embed(correction.new_fact);
      const [newMem] = await db
        .insert(memories)
        .values({
          userId,
          type: correction.new_type,
          subject: correction.supersedes_subject || null,
          fact: correction.new_fact,
          confidence: correction.confidence,
          emotionalContext: correction.emotional_context ?? null,
          sourceType: "voice_correction",
          sourceConversationId: conversationId,
          sourceMessageId: messageId ?? null,
          supersedesMemoryId: old.id,
          embedding: embedding ?? undefined,
          isActive: true,
        })
        .returning({ id: memories.id });

      // Deactivate the superseded memory
      await db
        .update(memories)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(memories.id, old.id));

      logger.info(
        { userId, oldMemoryId: old.id, newMemoryId: newMem.id },
        "Memory superseded by voice correction",
      );
    }
  }

  private async storeMemory(params: {
    userId: string;
    mem: ExtractedMemory;
    conversationId: string;
    messageId?: string;
    sourceType?: string;
    photoId?: string;
  }): Promise<void> {
    const { userId, mem, conversationId, messageId, photoId, sourceType = photoId ? "photo" : "conversation" } = params;

    // Duplicate check: is there already an active memory with this subject + very similar fact?
    if (mem.subject) {
      const existing = await db
        .select({ id: memories.id })
        .from(memories)
        .where(
          and(
            eq(memories.userId, userId),
            eq(memories.isActive, true),
            ilike(memories.subject, mem.subject),
            ilike(memories.fact, `%${mem.fact.slice(0, 30)}%`),
          ),
        )
        .limit(1);

      if (existing.length > 0) return; // Already have this fact
    }

    const embedding = await embeddingProvider.embed(mem.fact);

    await db.insert(memories).values({
      userId,
      type: photoId ? "PHOTO_MEMORY" : mem.type,
      subject: mem.subject ?? null,
      fact: mem.fact,
      confidence: Math.max(0, Math.min(1, mem.confidence)),
      emotionalContext: mem.emotional_context ?? null,
      sourceType,
      sourceConversationId: conversationId,
      sourceMessageId: messageId ?? null,
      photoId: photoId ?? null,
      embedding: embedding ?? undefined,
      isActive: true,
    });

    // Log only non-sensitive metadata (type, subject) — not the fact content
    logger.info(
      { userId, type: mem.type, subject: mem.subject, confidence: mem.confidence },
      "Memory stored",
    );
  }
}

export const memoryExtractionService = new MemoryExtractionService();

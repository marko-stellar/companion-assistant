---
name: COMPANION long-term memory system
description: Architecture, schema design, and provider decisions for the memory extraction, retrieval, and admin management system.
---

# COMPANION long-term memory system

## Schema — memories table

Key columns (after migration from stub):
- `type` text — one of 9 MEMORY_TYPES (PROFILE, RELATIONSHIP, PREFERENCE, BIOGRAPHICAL, EPISODIC, ROUTINE, HEALTH_CONTEXT, PHOTO_MEMORY, CONVERSATION_SUMMARY)
- `subject` text — who/what the memory is about ("Petra", "kava")
- `fact` text — neutral third-person statement (renamed from `content`)
- `confidence` real 0.0–1.0 — ≥0.8 explicit, 0.5–0.8 implied, <0.5 ambiguous
- `source_type` text — "conversation" | "admin" | "voice_correction" | "photo"
- `source_conversation_id` / `source_message_id` — provenance FKs
- `emotional_context` text — optional emotional tone annotation
- `supersedes_memory_id` uuid → self-ref — correction audit trail
- `embedding` vector(1536) — OpenAI text-embedding-3-small (NULL when no key)
- `is_active` boolean — soft-delete; deactivated memories kept for audit
- `last_referenced_at` timestamp — updated each retrieval; drives fallback ranking

Migration was applied via a manual tsx script (drizzle-kit generate fails non-interactively when it detects rename ambiguity). See `lib/db/scripts/migrate-memories.ts`.

**Why:** drizzle-kit `generate` requires TTY when it can't determine whether a column rename or drop+add happened. For future similar migrations, use the manual script pattern.

## Provider chain

1. **EmbeddingProvider** (`artifacts/api-server/src/providers/embedding.provider.ts`)
   - `OpenAIEmbeddingProvider` — when `OPENAI_API_KEY` set; uses text-embedding-3-small
   - `NoOpEmbeddingProvider` — returns null; triggers keyword fallback in retrieval

2. **MemoryExtractionService** (`artifacts/api-server/src/services/memory-extraction.service.ts`)
   - Called fire-and-forget after each user transcript turn
   - Sends transcript to LLM with JSON extraction prompt
   - MockLLM returns canned prose (not JSON) — try/catch JSON.parse silently skips
   - Real extraction only works with a proper LLM
   - Deduplication: ILIKE check on subject + first 30 chars of fact
   - Corrections: `supersedes_fact_like` matched via ILIKE; old memory deactivated

3. **MemoryRetrievalService** (`artifacts/api-server/src/services/memory-retrieval.service.ts`)
   - Primary: pgvector cosine search via raw SQL (`embedding <=> $1::vector`)
   - Fallback: recency + confidence ORDER BY when embedding is NULL
   - Min confidence filter: `MEMORY_MIN_CONFIDENCE` env var (default 0.5)
   - Top-k: `MEMORY_RETRIEVAL_TOP_K` env var (default 5)
   - Updates `last_referenced_at` fire-and-forget after retrieval

## Integration with conversation route

ConversationContextService now receives `userTranscript` and calls `memoryRetrievalService.retrieveForTurn()` in the parallel Promise.all block. Retrieved memories are formatted as bullet points in the RELEVANT MEMORIES section of the system prompt (min confidence 0.5 enforced).

After sending the response, the conversation route calls `memoryExtractionService.extractFromTurn()` fire-and-forget with the user's transcript and message ID.

## Admin API routes (all behind requireAdmin)

```
GET  /api/admin/users/:id/memories        ?type= ?active=true|false|all
GET  /api/admin/memories/:id              with supersedesChain array
PATCH /api/admin/memories/:id             edit type/subject/fact/confidence/emotionalContext
POST  /api/admin/memories/:id/deactivate
POST  /api/admin/memories/:id/reactivate
```

## Admin UI

MemoriesTab in `artifacts/admin/src/pages/users/detail.tsx`:
- Left: list with type dropdown filter, active/inactive filter, confidence bar
- Right: detail panel with edit form, deactivate/reactivate, correction history chain
- No generated hooks — direct fetch with `credentials: "include"` (cookie auth)

## Voice correction flow

1. User says "Ne, Petra mi je kći, nije sestra"
2. Extraction LLM detects correction: `corrections[0].supersedes_fact_like = "sestra"`
3. ILIKE search finds active memory with subject "Petra" and fact containing "sestra"
4. New memory created with `supersedesMemoryId = old.id` and `sourceType = "voice_correction"`
5. Old memory deactivated (`isActive = false`)
6. Audit chain visible in admin panel

## Env vars

| Var | Default | Purpose |
|-----|---------|---------|
| OPENAI_API_KEY | (none) | Enables real embedding + extraction |
| MEMORY_RETRIEVAL_TOP_K | 5 | Max memories per LLM turn |
| MEMORY_MIN_CONFIDENCE | 0.5 | Min confidence to inject into prompt |
| CONVERSATION_CONTEXT_WINDOW | 10 | Recent message window |

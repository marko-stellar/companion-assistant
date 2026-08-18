---
name: COMPANION structured tool system
description: Architecture, security model, and implementation details for the LLM conversation tool-calling pipeline.
---

# COMPANION structured tool system

## Architecture

The tool system gives the LLM safe, typed access to backend services during voice conversations. The LLM proposes structured arguments; the server validates and executes; a confirmation prompt generates the spoken reply.

### Flow

```
STT transcript
  → buildContext() (system prompt includes TOOLS section)
  → llmProvider.respondWithTools()
      → type: "tool_call"  → ToolExecutor.execute() → llmProvider.respond() for confirmation
      → type: "text"       → check for inline <tool_call> block → (same path if found)
  → TTS → persist messages
```

### Tool call format (text-based)

LLMs that don't support native function calling emit:
```
<tool_call>
{"tool": "<name>", "args": {...}}
</tool_call>
```
Parsed by `parseToolCall()` in `artifacts/api-server/src/tools/index.ts`.

## Tools (6)

| Tool | Purpose |
|------|---------|
| `create_reminder` | GENERAL or MEDICATION reminder with local time + recurrence |
| `create_appointment` | Calendar appointment with local date/time → converted to UTC |
| `set_temporary_dnd` | Temporary DND until HH:MM; stored in `temporary_dnd` table |
| `get_today_schedule` | Returns formatted today schedule string |
| `confirm_medication` | Records YES/NO/UNKNOWN on a reminder_occurrence |
| `correct_memory` | Supersedes wrong memory, creates corrected one with audit trail |

## Security invariant

**userId is ALWAYS from `req.deviceUserId` (session) — never from tool arguments.**
Tools that need userId receive it from the server context, not from LLM args.
Ownership is verified before any mutation (e.g. `getOccurrenceWithReminder` checks `reminder.userId === userId`).

## Schema additions

- `temporary_dnd` table: `id, user_id, starts_at, ends_at, reason, created_at`
  - Applied via direct `CREATE TABLE` script (no drizzle-kit migration needed for this table)
  - Scheduler cleans expired rows each tick via `cleanExpiredTemporaryDnd()`
  - Context service reads active temporary DND (`ends_at > now`) and injects into system prompt

## LLMProvider interface

Added `respondWithTools(params: LLMRespondWithToolsParams): Promise<LLMRespondWithToolsResult>`.
Result type is either `{ type: "text", content }` or `{ type: "tool_call", toolName, args, callId }`.
MockLLMProvider implements via keyword detection (trigger patterns for reminder/appointment/DND/schedule/medication/memory keywords).

## MockLLM tool detection

The mock does keyword matching so the pipeline is testable without a real LLM:
- "podsjeti"/"remind me" → `create_reminder` (extracts time and date patterns)
- "zubar"/"doctor"/"termin" + date/time → `create_appointment`
- "ne smetaj"/"don't disturb" → `set_temporary_dnd`
- "što imam"/"my schedule" → `get_today_schedule`
- "uzeo"/"took"/"nisam" + occurrenceId in system prompt → `confirm_medication`
- "ispravi"/"correct memory" → `correct_memory`

## Validation

All tool args validated with Zod schemas in `executor.ts`. Validation errors surface as
`{ ok: false, error: string }` which the LLM converts to a natural spoken explanation.

## Audit logging

Every tool call → `audit_logs` row: `actorType: "companion"`, `action: "tool:<name>"`,
`entityType`, `entityId`, `metadata: { userId, outcome, conversationId, args: [redacted] }`.
Sensitive fields (correctedFact, fact, details, reason) are redacted to `"[redacted]"`.
Audit never crashes the tool loop (try/catch with logger.error).

## occurrenceId in system prompt

Medication items in the TODAY'S SCHEDULE system prompt section now include:
`occurrenceId: <uuid>`
This is how the LLM knows which occurrence to reference in `confirm_medication`.

## Temporary DND in context service

Context service queries `temporary_dnd` (ends_at > now) alongside regular DND periods.
Temporary DND takes precedence in the system prompt: shows end local time.
Regular DND shown only when no temporary DND is active.

## Key files

- `artifacts/api-server/src/tools/types.ts` — ToolDefinition, ToolCallRequest, ToolCallResult, ToolAuditEntry
- `artifacts/api-server/src/tools/definitions.ts` — 6 JSON Schema tool definitions + buildToolsPromptSection()
- `artifacts/api-server/src/tools/executor.ts` — ToolExecutor class with per-tool handlers + audit
- `artifacts/api-server/src/tools/index.ts` — re-exports + parseToolCall()
- `artifacts/api-server/src/providers/llm.provider.ts` — added respondWithTools() to LLMProvider interface
- `artifacts/api-server/src/providers/impl/mock-llm.provider.ts` — MockLLMProvider.respondWithTools() keyword detection
- `artifacts/api-server/src/routes/tablet/conversation.ts` — two-pass tool loop wired in
- `lib/db/src/schema/temporary_dnd.ts` — TemporaryDnd schema

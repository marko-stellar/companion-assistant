# COMPANION

> AI-powered digital companion for independent seniors.
> Tablet-first, voice-first. Remembers. Proactively connects. Never a dashboard.

---

## Quick Start (Local)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment variables and fill in values
cp .env.example .env

# 3. Ensure PostgreSQL 15+ is running with pgvector extension
# (Replit provides this automatically)

# 4. Run database migrations
pnpm --filter @workspace/db run migrate

# 5. Seed companion personas
pnpm --filter @workspace/db run seed

# 6. Start the API server
pnpm --filter @workspace/api-server run dev
```

The API server starts on `PORT` (default 8080).

---

## Migration Commands

All schema changes use migrations. Never run destructive resets after the first migration without explicit approval.

```bash
# Generate a new migration after changing lib/db/src/schema/
pnpm --filter @workspace/db run generate

# Apply pending migrations to the database
pnpm --filter @workspace/db run migrate

# (Dev only) Push schema directly without a migration file
pnpm --filter @workspace/db run push
```

Migration files live in `lib/db/migrations/`. Commit them to version control.

---

## Running Tests

```bash
# Run unit tests (api-server)
pnpm --filter @workspace/api-server run test

# Run tests with coverage
pnpm --filter @workspace/api-server run test:coverage

# Full typecheck
pnpm run typecheck
```

---

## Environment Variables

See `.env.example` for the full annotated list. Required at startup:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto-injected on Replit) |
| `PORT` | API server port (auto-injected on Replit) |
| `SESSION_SECRET` | Min 32-char secret for session signing |
| `OPENAI_API_KEY` | LLM + STT + TTS (server-side only, never browser) |
| `SEARCH_API_KEY` | Brave Search or equivalent |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Emergency SMS only |

---

## Architecture

COMPANION is a **modular monolith**. One backend, two frontend route groups.

```
artifacts/
  api-server/           Express 5 + TypeScript backend
    src/
      domains/          Business logic (12 domain services)
      providers/        External service interfaces (LLM, Speech, Search, SMS, Storage)
      routes/
        tablet/         /api/tablet/* — tablet API
        admin/          /api/admin/*  — admin API
      jobs/             In-process scheduler (minute-tick reminders + proactivity)
      middlewares/      Error handler, request validation
  tablet/               Vite + React tablet UI  →  /tablet
  admin/                Vite + React admin UI   →  /admin

lib/
  db/                   Drizzle schema + migrations (PostgreSQL + pgvector)
  api-spec/             OpenAPI contract (source of truth for API)
  api-zod/              Generated Zod schemas
  api-client-react/     Generated React Query hooks
```

### Key Architecture Rules

- **Modular monolith** — no microservices.
- **Provider interfaces** — LLM, Speech, Search, Notification, Storage. No direct API calls from React.
- **Domain services** own business rules. Not system prompts.
- **UTC storage** — all timestamps in UTC. `user.timezone` used for display and scheduling.
- **Separate transcript vs. memory** — `conversation_messages` (raw) ≠ `memories` (structured).
- **Independent safety classification** — never combined with `respond()` in one LLM call.
- **Routine deviation ≠ SMS** — deviations alone never trigger emergency contact notification.
- **Migrations only** — `lib/db/migrations/`, no destructive resets after dev begins.
- **Reserved VM deployment** — always-on API for persistent connections and background scheduling.

### Health & Readiness

```
GET /api/healthz  →  { "status": "ok" }                       (liveness)
GET /api/readyz   →  { "status": "ready", "checks": { ... } } (readiness: DB + object storage; 503 when not ready)
```

### Evaluator / Operations Docs

- `docs/demo-script.md` — step-by-step evaluator demo (9 flows, fictional seeded data)
- `docs/croatian-voice-benchmark.md` — 30-utterance Croatian speech benchmark
- `docs/evaluator-acceptance.md` — pass/fail acceptance checklist
- `docs/operations.md` — Reserved VM deployment, secrets, persistence, rollback

---

## Database Schema (19 tables)

| Table | Purpose |
|---|---|
| `admins` | Admin user accounts (email/password) |
| `users` | Senior user profiles (one per tablet) |
| `companions` | AI companion personas (Ana, Mia, Luka, Ivan) |
| `emergency_contacts` | Contacts for safety SMS |
| `conversations` | Conversation sessions |
| `conversation_messages` | Raw transcript turns |
| `memories` | Structured long-term memories + vector embeddings |
| `reminders` | Recurring/one-off reminders |
| `reminder_occurrences` | Each scheduled firing |
| `appointments` | User calendar events |
| `dnd_periods` | Do-Not-Disturb windows |
| `activity_events` | Interaction events for routine detection |
| `routines` | Expected interaction patterns |
| `routine_deviations` | Recorded deviations (never trigger SMS alone) |
| `photos` | Photo metadata (bytes in object storage) |
| `photo_memories` | Memories extracted from photo conversations |
| `safety_events` | Safety classifications + SMS audit trail |
| `news_sources` | Curated trusted news outlets |
| `audit_logs` | Immutable admin/system action log |

---

## MVP Boundaries

- ✅ Croatian + English
- ✅ One senior per tablet, one admin role
- ❌ No medical diagnosis or clinical guidance
- ❌ No family/caregiver portal
- ❌ No external calendar integration
- ❌ No continuous camera monitoring
- ❌ No wearable integration
- ❌ No phone/video calling

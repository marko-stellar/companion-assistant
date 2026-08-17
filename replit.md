# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

### COMPANION design philosophy (final instruction, binding for all COMPANION work)
- COMPANION is NOT ChatGPT, Siri, Alexa, or a dashboard. It is a beautiful object in the user's home.
- If adding a UI element makes the interface busier, remove it. Simplicity over features, always.
- Every screen must create emotional comfort and companionship.
- Established language: Ambient Light (layered blur blobs, sine-based breathing), Cormorant Garamond italic serif + Inter, dark `#0e0b08` / light `#f5f0e8`, no chat bubbles, no timestamps, no red/urgency cues, no bouncing motion.
- All screens delivered as matched dark + light pairs, side by side on the canvas (see `.agents/memory/companion-motion-language.md` for layout and motion details).
- Logo/wordmark: the app name is just "companion" (lowercase, Cormorant Garamond) — no "AI" in the wordmark.

### COMPANION implementation guardrails (binding whenever anything is implemented)
1. TypeScript end-to-end where practical.
2. PostgreSQL for structured data; pgvector (or equivalent supported vector mechanism) for semantic memory search.
3. Replit Object Storage (or equivalent persistent object store) for uploaded photos — never the published app filesystem.
4. API keys/credentials live in Replit Secrets; never expose provider keys to browser JavaScript.
5. Deployed MVP runs on an always-on Reserved VM deployment (continuously available API, persistent connections, background scheduling).
6. Minute-level reminder/proactivity checks via an application-level scheduler inside the always-on backend. Scheduled Deployments reserved for later independent jobs (cleanup, reports).
7. A single health endpoint and basic structured logs from the beginning.

### COMPANION architecture constraints (binding)
- **Modular monolith.** No microservices.
- **One backend, two route groups.** Tablet and admin experiences are separate route groups/components sharing a single backend.
- **No provider calls from React.** All AI, speech, search, and SMS calls go through server-side provider interfaces — never from browser components.
- **Provider interfaces.** Every external integration (AI, TTS, SMS, search) is wrapped behind a provider interface so implementations are swappable.
- **Domain services own business logic.** Business logic belongs in domain services, not in system prompts.
- **UTC storage + user timezone.** All timestamps stored in UTC; a user timezone field drives display and scheduling.
- **Migrations only.** All database changes use migrations. No destructive schema reset after the first migration unless explicitly approved.
- **Separate storage for transcripts vs. structured memory.** Conversation transcript storage and structured memory storage are distinct.
- **Safety classification is independent.** Safety classification runs separately from normal conversational response generation.
- **No emergency SMS on routine deviation alone.** Routine deviation alone never triggers an emergency SMS in the MVP.
- **No medical diagnosis.** The product does not diagnose, prescribe, or interpret medical results.
- **No camera monitoring in the MVP.**

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

# COMPANION

An AI digital companion for independent seniors (65–75). Voice-first, tablet-native. The senior speaks naturally with a named AI companion (Ana, Mia, Luka, Ivan); a caregiver or family member configures everything through the admin panel.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run generate` — generate a new migration after schema changes
- `pnpm --filter @workspace/db run migrate` — apply pending migrations to the DB
- `pnpm --filter @workspace/db run seed` — seed the 4 companion personas (idempotent)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — secret for admin session cookies (any long random string)

### Creating the first admin user

```
pnpm --filter @workspace/api-server run create-admin admin@example.com YourSecurePassword123
```

Safe to run repeatedly — skips if the email already exists. Requires `DATABASE_URL` in the environment.

**Dev default:** `admin@companion.local` / `DevAdmin123!` (change before production)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + express-session (cookie-based admin auth)
- DB: PostgreSQL + Drizzle ORM + pgvector
- Validation: Zod, drizzle-zod
- API codegen: Orval (from OpenAPI spec → `lib/api-spec/openapi.yaml`)
- Build: esbuild (ESM bundle)
- Admin auth: bcryptjs (pure JS, no native modules)

## Where things live

- `lib/db/src/schema/` — 19 table definitions (source of truth for DB shape)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/api-client-react/` — generated TanStack Query hooks (do not edit by hand)
- `lib/api-zod/` — generated Zod validation schemas (do not edit by hand)
- `artifacts/api-server/src/routes/admin/` — admin API route handlers
- `artifacts/api-server/src/routes/tablet/` — tablet API route handlers
- `artifacts/api-server/src/domains/` — domain service stubs
- `artifacts/api-server/src/providers/` — provider interface stubs (LLM, TTS, SMS, etc.)
- `artifacts/admin/src/` — admin React app (Vite + wouter)
- `artifacts/tablet/src/` — tablet React app (Vite)

## Architecture decisions

- **Modular monolith.** One Express server, two route groups (`/api/admin`, `/api/tablet`).
- **Session-based admin auth.** Server-side sessions stored in `admin_sessions` postgres table via `connect-pg-simple`. Cookie is httpOnly, sameSite=lax.
- **UTC everywhere.** All timestamps stored in UTC; `user.timezone` (IANA string) used for display and scheduling.
- **Migrations only.** Schema changes go through `drizzle-kit generate` + `migrate`. Never `push` in production.
- **Provider interfaces.** All AI, TTS, SMS, and search calls go through server-side interfaces in `src/providers/`. Never from the browser.
- **bcryptjs over bcrypt.** The native `bcrypt` module requires a binary download blocked by the Replit package firewall. bcryptjs is pure JS and has the same API.

## Product

**Senior experience (tablet):** The senior wakes to a warm home screen. They speak. COMPANION listens, responds with voice and gentle text. Proactive reminders surface as gentle nudges. No typing, no menus.

**Caregiver experience (admin):** Caregiver sets up the senior's profile, chooses a companion persona, sets emergency contacts and DND hours, and reviews conversation history and safety alerts.

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

- **bcryptjs, not bcrypt.** `bcrypt` requires native binary download which is blocked by the Replit package firewall. Use `bcryptjs` (identical API).
- **`connect-pg-simple` `createTableIfMissing` breaks in esbuild bundles.** The option reads `table.sql` from the package directory via `__dirname`, but esbuild replaces `__dirname` with the output dir at runtime. Pre-create `admin_sessions` via psql instead and omit the `createTableIfMissing` option. Schema: `CREATE TABLE IF NOT EXISTS admin_sessions (sid varchar NOT NULL COLLATE "default", sess json NOT NULL, expire timestamp(6) NOT NULL, CONSTRAINT admin_sessions_pkey PRIMARY KEY (sid)); CREATE INDEX IF NOT EXISTS IDX_admin_sessions_expire ON admin_sessions (expire);`
- **drizzle-kit paths must be relative.** Using `path.join(__dirname, ...)` in `drizzle.config.ts` produces a double-slash path that drizzle-kit can't read. Use `"./migrations"` and `"./src/schema/index.ts"` as string literals.
- **pnpm install --no-frozen-lockfile** when adding new packages that aren't yet in the lockfile.
- **Always run `generate` then `migrate`**, not `push`, after schema changes.
- **Orval naming for query params:** `{OperationId}QueryParams` (not `{OperationId}Params`) for query string schemas; path params keep `{OperationId}Params`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

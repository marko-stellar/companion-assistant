---
name: COMPANION foundation
description: Database, migrations, seed, providers, domains, tests, and artifact setup for the COMPANION project foundation build.
---

## What was built

**Database (lib/db)**
- drizzle.config.ts uses `out: "./migrations"` with timestamp prefix — run `pnpm --filter @workspace/db run generate` then `migrate`
- 19 tables migrated; pgvector extension must be enabled first (`CREATE EXTENSION IF NOT EXISTS vector`)
- 4 seed companions (Ana, Mia, Luka, Ivan) via `pnpm --filter @workspace/db run seed` — idempotent

**API server (artifacts/api-server)**
- Routes mounted: `/api/healthz`, `/api/tablet/*`, `/api/admin/*`
- `errorHandler` middleware registered after all routes in `app.ts`
- Tests: `vitest` + `supertest` — run `pnpm --filter @workspace/api-server run test`
- vitest.config.ts uses Node environment

**Artifacts**
- `artifacts/tablet` (preview: `/tablet/`) — always-dark COMPANION UI, Cormorant Garamond + Inter
- `artifacts/admin` (preview: `/admin/`) — warm linen light-mode admin panel
- Both have CSS tokens patched to COMPANION palette (dark and light variants)
- Both index.html have Cormorant Garamond loaded from Google Fonts

## Color palette tokens (HSL)

Dark: bg=`30 15% 5%`, fg=`38 35% 73%`, border=`30 18% 14%`, primary=`30 47% 55%`, muted-fg=`30 23% 49%`
Light: bg=`38 38% 93%`, fg=`30 23% 13%`, primary=`27 52% 40%`, muted-fg=`30 23% 49%`

## Provider interfaces (artifacts/api-server/src/providers/)
Five interfaces: LLMProvider, SpeechProvider, SearchProvider, NotificationProvider, StorageProvider
No concrete implementations yet — all return `throw new Error("Not implemented")`.

## Domain skeletons (artifacts/api-server/src/domains/)
12 domains: users, companions, conversation, memory, reminders, appointments, proactivity, routine, photos, search, safety, notifications.
`safety/index.ts` is the most complete — has full classify → SMS flow with constraint enforcement.

## Scheduler (artifacts/api-server/src/jobs/scheduler.ts)
`AppScheduler` — minute-tick setInterval, skips if previous tick still running. Not yet wired into index.ts startup.

## What is NOT done yet
- Scheduler not started on server boot (needs `new AppScheduler().start()` in index.ts)
- Provider concrete implementations (OpenAI, ElevenLabs/Deepgram, Bing/Perplexity, Twilio, Replit Object Storage)
- Real tablet UI (Home screen, voice interaction, reminders, photos, news)
- Real admin UI (senior profiles, conversation summary, safety events, settings)
- OpenAPI spec only has /healthz — tablet and admin endpoints not yet defined
- WebSocket route for real-time voice streaming not set up

**Why:** Foundation was built first per architecture spec; real features require provider keys and are next phase.

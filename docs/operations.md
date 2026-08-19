# Operations Runbook (MVP)

Deployment, persistence, rollback, and secrets for the COMPANION MVP on a
Replit **Reserved VM** (always-on) deployment.

## Architecture

- `artifacts/api-server` — Express API (binds `PORT`), background scheduler.
- `artifacts/admin` — admin web app (Vite).
- `artifacts/tablet` — senior tablet web app (Vite).
- PostgreSQL (Replit-managed) — all persistent app data.
- Replit Object Storage — photos and audio objects.

The scheduler runs inside the API process; an always-on Reserved VM is required
so reminders, safety recovery, and routine inference keep running.

## Required secrets / environment

| Variable | Purpose | Required in prod |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | yes (set by Replit DB) |
| `SESSION_SECRET` | admin session signing | yes |
| `ELEVENLABS_API_KEY` | STT + TTS | yes |
| `PRIVATE_OBJECT_DIR` | object storage private dir | yes |
| `PUBLIC_OBJECT_SEARCH_PATHS` | object storage public paths | yes |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | object storage bucket | yes |
| `OPENAI_API_KEY` | embeddings for memory retrieval | recommended (keyword fallback otherwise) |
| `SMS_MODE` | `mock` (default) or explicit `real` delivery | yes — use `real` only intentionally |
| SMS provider keys (Twilio) | real safety SMS | yes for real escalation — see mock note below |
| Search provider key | current-info retrieval | optional — see mock note below |

**Provider status (MVP):** conversations currently always use `MockLLMProvider`
(a real LLM provider is not yet wired into the registry). Mock search and mock
SMS activate when `SMS_MODE` is `mock` (the safe default). Real SMS activates
only when `SMS_MODE=real` and all Twilio secrets are configured. If
`SMS_MODE=real` is selected with incomplete credentials, SMS fails explicitly
instead of silently switching to simulation.

The API logs at startup which providers are real vs. mock — check those lines
after every deploy. Do not demo with mock providers while claiming real
delivery; the UI labels mock SMS as SIMULATED by design.

## Health and readiness

- `GET /api/healthz` — liveness (process up). 200 `{ "status": "ok" }`.
- `GET /api/readyz` — readiness. 200 `{"status":"ready"}` only when the
  database answers and object storage is configured; 503 otherwise, with a
  per-dependency `checks` map (no connection details are exposed).

## Persistence

- Database schema is managed by checked-in Drizzle migrations in
  `lib/db/migrations/`; migrations run against the production DB before/at
  deploy. Never edit applied migrations.
- Object storage contents and the database survive deploys and restarts;
  nothing durable is stored on the VM filesystem.
- Development and production have separate databases — seed production
  explicitly if demo data is needed there.

## Deploy procedure

1. Verify locally: typechecks, API + tablet test suites pass.
2. Confirm `/api/readyz` is 200 in development.
3. Publish via Replit deploy (Reserved VM). The build runs each artifact's
   build; the VM serves the API and static apps.
4. Post-deploy checks: `/api/healthz`, `/api/readyz`, admin sign-in, one
   tablet voice turn.

## Rollback

- Replit deployments keep previous versions: re-deploy the last known-good
  checkpoint/version from the Deployments pane.
- Database: migrations are additive for the MVP; rolling back the app version
  does not require reversing migrations. If a migration must be undone, write
  a new forward migration — never drop the database.
- Record the known-good version (deploy timestamp + git checkpoint) in the
  acceptance report after each successful evaluator run.

## Known development-mode behaviours

- `MockLLMProvider` is currently always used (see provider status above).
- `MockSearchProvider` activates only when `NODE_ENV=development`.
- `MockSMSProvider` activates when `SMS_MODE=mock` (including production);
  simulated delivery is surfaced as SIMULATED in the admin UI. `SMS_MODE=real`
  requires all Twilio secrets and never falls back to mock delivery.
- `NoOpEmbeddingProvider` (keyword-fallback memory retrieval) activates when
  `OPENAI_API_KEY` is absent. Each selection is logged at startup.

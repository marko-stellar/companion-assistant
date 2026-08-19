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

Always required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection (set by Replit DB) |
| `SESSION_SECRET` | Admin session signing |
| `PRIVATE_OBJECT_DIR` | Object Storage private directory |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Object Storage public paths |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Object Storage bucket |

Provider mode matrix:

| Mode variable | `mock` behavior | `real` requirements and behavior |
|---|---|---|
| `SPEECH_MODE` | Canned transcript + silent WAV; no ElevenLabs call | `ELEVENLABS_API_KEY`; optional STT/TTS model and voice IDs |
| `SMS_MODE` | Persists `SIMULATED`; sends no message | All three Twilio settings; incomplete config is explicitly unavailable |
| `EMBEDDING_MODE` | No embedding call; memory retrieval uses keywords | `OPENAI_API_KEY`; API errors are surfaced, not converted to mock success |
| `LLM_MODE` | Deterministic conversation, tools, extraction, and safety | Unsupported in the current MVP; explicitly unavailable |
| `SEARCH_MODE` | Clearly labelled placeholder results | Unsupported in the current MVP; explicitly unavailable |
| `VISION_MODE` | Canned safe description; photo bytes are not downloaded | Unsupported in the current MVP; explicitly unavailable |
| `WAKE_WORD_MODE` | No-op detector | Unsupported in the current MVP; explicitly unavailable |

Optional provider-name values (`LLM_PROVIDER`, `SEARCH_PROVIDER`,
`VISION_PROVIDER`, `WAKE_WORD_PROVIDER`) are reserved for future real adapters.
Blank optional values are treated as unset. Replit Object Storage and
PostgreSQL remain real-only persistence dependencies and do not have mock modes.

Mode parsing is fail-safe: only the literal value `real` enables a real
integration. Empty or invalid modes select mock. Once real is selected, missing
configuration or runtime API errors never silently switch back to mock.

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

## Known provider-mode behaviours

- Modes are independent: for example, speech can be real while SMS remains
  simulated and search remains placeholder-only.
- Mock selection is identical in development and production; it is controlled
  by the mode variables, not `NODE_ENV`.
- `SIMULATED` SMS and `[Mock result ...]` search labels are intentional honesty
  signals and must not be hidden for demonstrations.
- Each selected mode is logged at startup. No credential value is logged.

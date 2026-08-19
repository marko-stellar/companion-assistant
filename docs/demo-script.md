# Evaluator Demo Script

Step-by-step script for demonstrating the COMPANION MVP. Uses only fictional
seeded data. Total time ~15 minutes.

## Preparation (before the evaluator arrives)

1. Seed data: `pnpm --filter @workspace/db run seed`
   (creates the four companions and the fictional senior **Marija Horvat (Demo)**
   with an emergency contact, a daily 08:30 medication reminder, an appointment
   TODAY at 17:30 Zagreb time — or the next half hour ≥90 min ahead if seeded
   late in the day — and relationship/preference memories). Re-running the
   seed is safe and automatically moves the demo appointment to today, so
   **run the seed on the demo day**.
2. Verify the API is ready: `curl <api-base>/api/readyz` → `{"status":"ready", ...}`.
3. Upload 1–2 legally safe placeholder photos (your own photos or licensed
   stock) via Admin → user → Photos, so the photo flow can be shown.
4. Open the Admin app in one browser tab, the Tablet app on the demo tablet.
5. Confirm the tablet is paired (Flow 2) or have a pairing code ready.

## Flow 1 — Admin sign-in and user overview
1. Sign in to the admin app.
2. Open **Marija Horvat (Demo)** → show profile, reminders, appointments,
   memories, photos, safety tabs.

## Flow 2 — Tablet pairing
1. Admin: generate a device pairing code for Marija.
2. Tablet: enter the 6-character code on the setup screen → home screen appears
   with greeting and Today schedule.

## Flow 3 — Voice conversation (Croatian)
1. Tap the microphone; say: „Dobro jutro, kako si danas?"
2. Show listening → thinking → speaking states and the spoken reply.
3. Ask: „Što imam danas u rasporedu?" → companion reads the seeded schedule.

## Flow 4 — Memory recall
1. Ask: „Kako se zove moja kći?" → companion answers Ivana (seeded memory).
2. Admin: show the Memories tab entry backing the answer.

## Flow 5 — Reminder / schedule
1. Show the Today list on the tablet (medication at 08:30 and the 17:30
   appointment, provided the seed ran today — see Preparation step 1).
2. Admin: edit the reminder time; tablet refreshes to the new time.

## Flow 6 — Photo memory
1. Say: „Pokaži mi sliku" (or reference the uploaded photo's subject).
2. Photo appears in the tablet overlay; conversation continues over it.

## Flow 7 — Current information (trusted sources)
1. Admin: show Settings → News sources (allowlist).
2. Ask a current-events question; with `SEARCH_MODE=mock`, the provider returns
   clearly labelled placeholder results — explain that real mode is currently
   unavailable rather than fabricating live information.

## Flow 8 — Safety escalation (controlled)
1. Say a scripted concerning phrase (e.g. „Pala sam i ne mogu ustati" — state
   clearly to the evaluator this is a scripted test).
2. Tablet: companion responds with calm guidance.
3. Admin → Safety tab: event appears; with `SMS_MODE=mock`, delivery shows
   **SIMULATED** (no real message sent; honest labelling is by design). Resolve
   the event.

## Flow 9 — Failure and recovery
1. Turn off tablet Wi-Fi → offline overlay with recovery guidance appears.
2. Restore Wi-Fi → app recovers without restart.
3. Optionally deny microphone permission → clear guidance, no crash.

## Wrap-up
- Show `/api/healthz` and `/api/readyz`.
- Point to `docs/evaluator-acceptance.md` for pass/fail evidence and
  `docs/operations.md` for deployment/rollback.

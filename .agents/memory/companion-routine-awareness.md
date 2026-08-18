---
name: COMPANION routine awareness
description: Architecture and constraints for the rule-based routine inference + deviation detection system
---

## Rule-based inference (no ML)

Three routine types inferred by `RoutineInferenceService`:
- `MORNING_CONVERSATION` — USER_STARTED_CONVERSATION before `ROUTINE_MORNING_CUTOFF_HOUR` (default 12), one obs per calendar day
- `MEDICATION_CONFIRMATION` — MEDICATION_CONFIRMED_TAKEN, grouped by reminderId
- `REPORTED_ACTIVITY` — USER_REPORTED_ACTIVITY, grouped by `metadata.activityName`

Established when evidence ≥ `ROUTINE_MIN_EVIDENCE_COUNT` (default 5). Confidence = `min(1.0, sqrt(evidenceCount / (MIN_EVIDENCE × 3)))`.
Scattered evidence (stdDev > `ROUTINE_MAX_SPREAD_MINUTES`, default 120) is discarded for MORNING_CONVERSATION.

**Why:** Simple rule-based approach keeps the system auditable. Seniors have very consistent patterns so heuristics are sufficient.

## Activity events emitted from

- `conversation.ts` — USER_STARTED_CONVERSATION on new conversation session
- `executor.ts` — APPOINTMENT_CREATED, TEMPORARY_DND_SET, MEDICATION_CONFIRMED_TAKEN/NOT_TAKEN/REMINDER_CONFIRMED
- `scheduler.ts` — REMINDER_TRIGGERED (after markTriggered)

All emissions are fire-and-forget via `activityEventService.emit()`.

## Scheduler integration

`AppScheduler.maybeRunInference()` calls `routineInferenceService.inferForAllUsers()` rate-limited to `INFERENCE_INTERVAL_MS` = 6 h (tracked via `lastInferenceAt` class property). Proactivity check calls `routineService.detectDeviations()` which checks all active routines and inserts deviations.

## Deviation & check-in flow

1. Scheduler calls `routineService.detectDeviations(nowUtc)` on every tick
2. Deviation inserted when: source event NOT found today AND deadline passed (expectedMins + halfWindow + gracePeriod)
3. Idempotency: one deviation per routine per local calendar day
4. `checkInText` generated immediately (Croatian or English based on `user.language`) and stored in the deviation row
5. Tablet polls `GET /api/tablet/pending-checkin` every 60 s
6. When pending=true: tablet speaks via `/api/tablet/speak`, shows CheckInBanner with OK button
7. OK dismisses banner and calls `POST /api/tablet/pending-checkin/:id/acknowledge`
8. When user starts any conversation: `routineService.resolveOpenDeviations(userId, now)` marks all as resolved

## Admin routines tab

`artifacts/admin/src/pages/users/tabs/routines-tab.tsx` — fetches from:
- `GET /api/admin/users/:id/routines` — routines + last 30 days deviations joined
- `GET /api/admin/users/:id/activity-events?limit=100&eventType=X` — debug panel

## Config env vars (all have defaults)

- `ROUTINE_MIN_EVIDENCE_COUNT` = 5
- `ROUTINE_LOOKBACK_DAYS` = 30
- `ROUTINE_MORNING_CUTOFF_HOUR` = 12
- `ROUTINE_MAX_SPREAD_MINUTES` = 120
- `ROUTINE_GRACE_PERIOD_MINUTES` = 90

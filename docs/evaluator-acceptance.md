# Evaluator Acceptance Checklist

Record one row per core flow before every evaluator demonstration. A flow
passes only when it completes end to end with no crash and no developer-facing
text. Do not claim completion while any core flow is failing.

Severity: **S1** blocks the demo · **S2** visible defect, flow completes ·
**S3** cosmetic.

## Core flows

| # | Flow | Pass/Fail | Defects (severity) | Notes |
|---|---|---|---|---|
| 1 | Admin sign-in and user overview | | | |
| 2 | Tablet pairing with 6-char code | | | |
| 3 | Croatian voice conversation (states + reply) | | | |
| 4 | Memory recall with admin evidence | | | |
| 5 | Reminder/schedule display and edit propagation | | | |
| 6 | Photo memory display during conversation | | | |
| 7 | Trusted-source current information | | | |
| 8 | Controlled safety escalation + admin record | | | |
| 9 | Failure recovery (offline, mic denied, session expiry) | | | |

## Supporting evidence

| Item | Status | Reference |
|---|---|---|
| Croatian 30-utterance benchmark ≥ 26/30 | | docs/croatian-voice-benchmark.md results log |
| `/api/healthz` + `/api/readyz` green in target environment | | |
| Demo seed idempotent (re-run produces no duplicates) | | |
| Latency fields recorded per voice turn (STT/LLM/TTS/total) | | admin transcript metadata |
| Deployment + rollback steps verified | | docs/operations.md |

## Sign-off

| Date | Environment | Version (checkpoint) | Result | Remaining defects |
|---|---|---|---|---|
| | | | | |

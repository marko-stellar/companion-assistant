---
name: COMPANION device assignment
description: How the tablet device assignment system works — setup codes, sessions, Bearer tokens, and the tablet frontend auth pattern.
---

## Architecture
- Admin generates a 6-char alphanumeric code (chars: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 — no 0/O or 1/I ambiguity), stored in `device_setup_codes` with 24h TTL.
- Tablet POSTs the code to `/api/tablet/setup` → server validates, marks code used, revokes any prior session, creates `device_sessions` record with a 64-char hex Bearer token.
- Token is stored in browser local storage and never sent again by the server.
- All subsequent tablet API calls send `Authorization: Bearer <token>`.
- `requireDevice` middleware validates token against `device_sessions` (checks `revokedAt IS NULL`), attaches `req.deviceUserId` and `req.deviceSessionId`, fire-and-forget updates `lastSeenAt`.

## Tablet auth setup pattern
Initialize the tablet request helper with a getter for the persisted device
token before making any protected request. The helper should also fall back to
reading local storage directly so a newly completed setup can immediately load
the device context without a missing-Bearer-token race.

## Device context lifecycle
- `DeviceProvider` calls `initDeviceAuth()` on mount, checks localStorage for token.
- No token → appState = "setup" → shows SetupPage.
- Token found → calls `fetchDeviceContext()` (GET /tablet/me) → success: appState = "home"; a failed post-setup context load clears the token and returns to setup.
- Conversation state cycle: idle → listening (3s) → thinking (2.5s) → speaking (3.5s) → idle.
- DND: computed client-side from `ctx.dnd` (handles overnight spans).

## Admin device management (detail.tsx DeviceTab)
- `useGetDeviceStatus(userId)` — shows if tablet is assigned and last-seen time.
- `useGenerateDeviceCode` mutation → displays the code prominently with expiry countdown.
- `useRevokeDeviceSession` mutation → soft-revokes the active session.

## Routes
- `POST /api/tablet/setup` — no auth required
- `GET /api/tablet/me` — requireDevice
- `GET /api/tablet/today` — requireDevice (placeholder items until reminders/appointments built)
- `GET /api/admin/users/:id/device-status` — requireAdmin
- `POST /api/admin/users/:id/device-code` — requireAdmin
- `DELETE /api/admin/users/:id/device-session` — requireAdmin

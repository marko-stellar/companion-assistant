---
name: COMPANION foundation
description: DB schema, seeded data, working artifacts, and key backend decisions for the COMPANION project
---

## Database (lib/db)
- 19 table schema files in `lib/db/src/schema/`
- pgvector extension enabled, custom `vector` column type in `lib/db/src/types/vector.ts`
- drizzle.config.ts uses **relative paths** (`"./migrations"`, `"./src/schema/index.ts"`) — not `path.join(__dirname, ...)` which causes a double-slash bug in drizzle-kit
- 4 companions seeded: Ana (warm/supportive), Mia (energetic/curious), Luka (calm/thoughtful), Ivan (friendly/humorous)

## Session table
The `admin_sessions` table must be pre-created manually (or via migration) before starting the server. `connect-pg-simple@10` with `createTableIfMissing: true` reads a `table.sql` from its own package directory using `__dirname`, but esbuild replaces `__dirname` with the dist output dir — so the file is never found. Fix: create table via `psql $DATABASE_URL` (or Drizzle migration), set `createTableIfMissing: false` (or omit the option).

Schema:
```sql
CREATE TABLE IF NOT EXISTS admin_sessions (
  sid varchar NOT NULL COLLATE "default",
  sess json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT admin_sessions_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS IDX_admin_sessions_expire ON admin_sessions (expire);
```

## API server (artifacts/api-server)
- Express 5, esbuild ESM bundle
- Session auth: express-session + connect-pg-simple, table `admin_sessions`, httpOnly cookie
- **bcryptjs** (not bcrypt) — native bcrypt binary download blocked by Replit package firewall
- Session type augmented in `src/types/express-session.d.ts` (`adminId: string`)
- Admin routes: `/api/admin/auth/login|logout|me`, `/api/admin/dashboard`, `/api/admin/companions`, `/api/admin/users` (CRUD), `/api/admin/users/:id/emergency-contact` (PUT), `/api/admin/users/:id/dnd` (PUT)
- `requireAdmin` middleware in `src/middlewares/requireAdmin.ts`
- Create first admin: `pnpm --filter @workspace/api-server run create-admin <email> <password>`
- Dev admin: `admin@companion.local` / `DevAdmin123!`

## Admin frontend (artifacts/admin)
- wouter routing, AuthContext, AppLayout with sidebar
- Pages: login, dashboard, /users list, /users/new, /users/:id (11 tabs)
- Auth redirect uses `useEffect` in AppLayout — not during render (fixed anti-pattern)
- Orval hook naming: `{OperationId}QueryParams` for query params (not `{OperationId}Params`)

## Codegen (lib/api-spec)
- `pnpm --filter @workspace/api-spec run codegen` — regenerates hooks + Zod schemas
- Orval naming for query params: `ListAdminUsersQueryParams` (not `ListAdminUsersParams`)
- `format: email` in spec causes Orval to emit `z.email()` which doesn't exist in Zod v3 — use plain `type: string`

## Key constraints
- UTC storage everywhere; user.timezone used for display
- Migrations only — no schema reset
- Secrets server-side only
- No medical diagnosis; safety classification independent from response generation
- No emergency SMS on routine deviation alone (MVP)
- Overnight DND (e.g. 22:00–07:00): endTime < startTime means next-day crossing — scheduler must handle

## Object storage readiness probe
Replit sidecar GCS credentials grant only object-level permissions: `bucket.exists()` fails with `storage.buckets.get` denied. Probe availability with `bucket.getFiles({ prefix, maxResults: 1, autoPaginate: false })` instead, bounded by a timeout, returning boolean (never throwing) for /api/readyz.

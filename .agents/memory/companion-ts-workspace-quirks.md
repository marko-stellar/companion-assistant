---
name: COMPANION TypeScript workspace quirks
description: Build-order and type-resolution gotchas in the pnpm + project-references setup.
---

# TypeScript project references — always rebuild lib/db after schema changes

## Rule
After editing any file under `lib/db/src/`, run:
```
pnpm --filter @workspace/db exec tsc --build
```
**before** running `pnpm --filter @workspace/api-server run typecheck`.

## Why
`artifacts/api-server/tsconfig.json` uses TypeScript project references (`"references": [{ "path": "../../lib/db" }]` with `"incremental": true`). TypeScript reads the **compiled declaration output** in `lib/db/dist/` — not the source. If the dist is stale, new schema columns appear as "does not exist" type errors even though the source file is correct.

## How to apply
Any time you add, rename, or remove a column from a Drizzle schema file, rebuild lib/db first. The dist files are: `lib/db/dist/schema/*.d.ts`.

---

# Express 5 route params are `string | string[]`

## Rule
Always cast `req.params.id` (and similar) to `string` when passing to `eq()`:
```typescript
const userId = req.params.id as string;
eq(table.id, userId)
```

## Why
Express 5 types `req.params` values as `string | string[]`. Drizzle's `eq()` overload 1 accepts only `string | SQLWrapper`. Without the cast, TypeScript picks overload 3 (`never`) and raises TS2769. This affects every admin route — it is a known pre-existing pattern.

## How to apply
All new routes should cast params at the top of the handler. The pre-existing errors in `admin/device.ts` are the same issue; fix them together when touching that file.

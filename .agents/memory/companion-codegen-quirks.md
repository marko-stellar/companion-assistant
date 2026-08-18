---
name: COMPANION codegen quirks
description: Orval index.ts generation bugs and the codegen script fixes required for api-spec, api-zod, and api-client-react.
---

## The issue
Orval's `mode: "split"` with `clean: true` cleans only the `target/` subfolder, NOT the workspace root `index.ts`. On every codegen run, Orval appends new `export *` lines to the existing `index.ts` files, creating duplicate exports that cause TypeScript TS2308 errors.

## The fix (in lib/api-spec/package.json codegen script)
```
rm -f ../../lib/api-zod/src/index.ts ../../lib/api-client-react/src/index.ts
&& orval --config ./orval.config.ts
&& echo "export * from './custom-fetch';" >> ../../lib/api-client-react/src/index.ts
&& echo "export * from './generated/api';" > ../../lib/api-zod/src/index.ts
&& pnpm -w run typecheck:libs
```

**Why:**
- Deleting both index files before codegen ensures Orval writes fresh, not appends.
- `api-client-react` must also export `custom-fetch.ts` (setAuthTokenGetter, ApiError, customFetch) — Orval doesn't do this automatically.
- `api-zod` only needs the Zod schemas (generated/api.ts), NOT the TypeScript interface types (generated/types/) which have identical names and would conflict.

**How to apply:** Any time you run or modify the codegen pipeline, preserve this exact script structure.

## Pre-existing admin typecheck errors
These 4 TypeScript errors exist in the admin app and predate device work — they're in Orval-generated hook call sites where `queryKey` is required by TanStack Query types but the hooks pass only `{ retry: false }` or `{ enabled: bool }`. Do not treat these as regressions.

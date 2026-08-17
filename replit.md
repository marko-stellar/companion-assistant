# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

### COMPANION design philosophy (final instruction, binding for all COMPANION work)
- COMPANION is NOT ChatGPT, Siri, Alexa, or a dashboard. It is a beautiful object in the user's home.
- If adding a UI element makes the interface busier, remove it. Simplicity over features, always.
- Every screen must create emotional comfort and companionship.
- Established language: Ambient Light (layered blur blobs, sine-based breathing), Cormorant Garamond italic serif + Inter, dark `#0e0b08` / light `#f5f0e8`, no chat bubbles, no timestamps, no red/urgency cues, no bouncing motion.
- All screens delivered as matched dark + light pairs, side by side on the canvas (see `.agents/memory/companion-motion-language.md` for layout and motion details).

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

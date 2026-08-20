---
name: COMPANION API artifact routing
description: Routing rule for browser clients calling the shared API from path-based artifacts.
---

## Rule

The shared COMPANION API is served at the global `/api` path. Browser clients in
the `/admin/` and `/tablet/` artifacts must call it root-relatively, without
prepending their own artifact path.

**Why:** The web artifacts and API are separate proxy services. Prefixing a
request with `/tablet` sends it to the tablet static/Vite service instead of the
API and produces a 404 even when the backend route exists.

**How to apply:** Check the API artifact's declared paths before adding client
helpers. For tablet device setup, align both the requested URL and JSON field
names with the server route; verify with a deliberately invalid request so
one-time setup codes are not consumed during debugging.
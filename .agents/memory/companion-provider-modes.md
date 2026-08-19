---
name: COMPANION provider modes
description: Safety contract for selecting mock and real external integration adapters.
---

All optional external integrations must use an explicit `real` or `mock` mode.
Missing, blank, and invalid values resolve to mock; mock mode must not invoke
the provider's external API even when credentials are present or invalid. Once
real mode is selected, missing configuration, unsupported adapters, and runtime
provider failures must be visible rather than substituted with simulated
success. Startup output may name modes and configuration keys, but never
configuration values.

**Why:** Evaluator and first-user environments need predictable offline-safe
behavior, while a mistaken or partial production configuration must not either
send real communications unexpectedly or hide a lost real capability behind
convincing mock output.

**How to apply:** When adding or replacing a provider, add its mode to the
shared resolver, register a safe mock and explicit unavailable path, document
the required real-mode configuration, and test both no-network mock behavior
and no-fallback real failure behavior. Keep real-only persistence dependencies
separate unless a genuine storage mock is intentionally designed.
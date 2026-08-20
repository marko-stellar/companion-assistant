---
name: COMPANION language authority
description: How conversation language is selected when a saved user preference and speech recognition metadata differ.
---

The saved user language preference is authoritative for every conversational reply, including simulated LLM and speech-provider behavior. Normalize language variants such as `hrv` and `hr-HR` to Croatian before selecting response content.

**Why:** Speech-to-text may report a three-letter or regional language variant. Treating that detection as the conversation language can override the user’s explicit setting and send an English simulated response to a Croatian-speaking user.

**How to apply:** Use a shared normalizer at provider boundaries and preserve the normalized user setting throughout the conversation turn. Detection metadata can be retained for diagnostics, but must not change the reply language without an explicit product decision.
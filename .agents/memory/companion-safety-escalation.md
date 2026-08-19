---
name: COMPANION safety escalation
description: Durable policy rules for the conversational safety alert system.
---

# Safety escalation policy

**Rules (non-negotiable):**
- Safety classification is a SEPARATE LLM call from response generation, run for EVERY finalized utterance (no length-based bypass).
- Family SMS only for high-severity, immediate-attention, high-confidence classifications. Routine deviations NEVER trigger safety SMS — only conversation content.
- Never claim emergency services were contacted; spoken guidance and SMS both say so explicitly.
- Delivery status must be honest end-to-end: failures stay visible with the provider error, and simulated (dev mock) delivery is surfaced as SIMULATED — never presented to the senior or admin as a real notification.

**Why:** vulnerable-user trust; a false "your family has been told" is a concrete safety failure.

**How to apply:**
- Any at-most-once side effect here must be enforced in the database (atomic conditional claim), not with in-memory guards.
- Ambiguous provider outcomes (timeout/network loss after the request may have been accepted) and stale in-flight sends must NEVER be auto-retried — a duplicate real alert is worse than a visible failure. Mark them failed with a "verify manually" message instead.
- On code paths that carried user speech, never log provider/classifier error messages (they can echo the utterance) — log error names/ids only.

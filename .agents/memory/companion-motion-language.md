---
name: COMPANION motion & screenshot lessons
description: Motion conventions for the COMPANION tablet design system and a screenshot-visibility pitfall with staggered entrance animations.
---

## Staggered entrance animations vs screenshots
Keyframing `opacity` from 0 with `animation-fill-mode: both` leaves elements invisible during their animation-delay — screenshots and canvas captures miss them.
**Why:** Bit twice (schedule + news screens): headlines appeared "missing" in captures though fine live.
**How to apply:** For staggered lists, use transform-only keyframes; let opacity come from the static class.

## COMPANION motion language (user-approved)
- All ambient-light motion is sine-based via requestAnimationFrame (breath ~8–16s, warmth drift ~18–28s, optional attention flicker ~6s).
- Fades: 1.0–1.6s, easing `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out, no overshoot). Never bounce/spring curves.
- Tap feedback: scale ~0.98, transition ≥0.35s with the same bezier.
- TranslateY distances small (6–10px).

## Canvas layout convention
Dark frame at x:363, light at x:1617, 1194×834 each, rows stacked with 80px gap (row N y = 123 + (N-1)*914).

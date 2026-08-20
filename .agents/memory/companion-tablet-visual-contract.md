---
name: COMPANION tablet visual contract
description: The approved visual source of truth and constraints for the production tablet UI.
---

## Rule

The approved dark COMPANION canvas screens are the visual source of truth for
the tablet: warm ambient-light presence, quiet dark material layers, serif
conversation copy, thin amber hairlines, and a timeline-style daily schedule.
The tablet remains dark by default; do not introduce a theme switch unless the
product explicitly adds one.

**Why:** The implemented tablet is intended to faithfully realize the
previously approved design screens, rather than reinterpret their aesthetic or
add new interactions.

**How to apply:** Map existing functional states onto their corresponding
visual states (idle, listening, speaking, reminder, schedule, photo, and
conversation), but never use visual time status to hide existing actions.
Presentation may de-emphasize overdue items; unanswered medication
confirmations must remain available in every responsive layout.

## Confirmed ambient motion states

The approved Home Screen treatment is the normal idle state: its warm
five-layer bloom uses three non-harmonic breathing cycles and a slow 28°–44°
golden hue drift. The approved listening treatment is the brighter five-layer
bloom with three staggered, outward-expanding amber rings. The approved
Speaking treatment is the response state: its glow uses a slow deep breath,
an 18-second warmth drift, and a subtle shimmer rather than audio waves.

**Why:** The creator explicitly selected the canvas animations as the exact
production treatments for normal, listening, and responding states.

**How to apply:** Map the animations directly to the existing state machine:
idle → Home Screen bloom, recording → Listening bloom and rings, playback →
Speaking bloom. Preserve their cadence, colors, layer sizes, and status-text
entrances; do not substitute the legacy orb or audio-waveform treatment for
these three states. Upload/thinking, DND, and offline remain separate states.
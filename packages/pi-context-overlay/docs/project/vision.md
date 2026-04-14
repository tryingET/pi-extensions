---
summary: "Product and technical vision for pi-context-overlay."
read_when:
  - "Defining or revisiting project direction."
system4d:
  container: "Project north-star statement for the context inspector package."
  compass: "Help Pi operators understand live session context quickly enough to act before stale state or overflow causes mistakes."
  engine: "Truthful live snapshot -> lightweight overlay UX -> bounded package validation and release flow."
  fog: "Host lifecycle drift and over-scoping into replay/history are the main ways this package can lose clarity and trust."
---

# Vision

Deliver a dependable context inspector for Pi sessions that makes the current live context window legible at command time.

The package should help an operator:

- open `/c` and quickly understand what is currently in the active session context
- judge context pressure before continuing or compacting
- inspect grouped context items without digging through raw logs
- open file-backed context items directly when the host/runtime allows it
- use `/context-report` when a textual snapshot is more useful than the overlay

This package stays intentionally bounded:

- it mirrors Pi's current live session authority rather than owning durable replay/history
- it remains an operator UX package, not a shared interaction-runtime primitive
- it should stay easy to install locally, validate in-package, and evolve without dragging unrelated runtime concerns into the seam

For scope and boundary details, see [Project foundation model](foundation.md) and the compatibility note [2026-04-01-session-start-surface-compatibility](2026-04-01-session-start-surface-compatibility.md).

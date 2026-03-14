---
summary: "Plan for hardening PTX context inference so live/trigger-style contexts without sessionManager do not crash template suggestion building."
read_when:
  - "Implementing the PTX live-picker getBranch crash fix."
system4d:
  container: "Focused hardening slice for prompt-template context inference."
  compass: "Treat session history as optional enrichment, not a required dependency."
  engine: "Reproduce -> guard inference -> verify deterministic behavior -> update handoff/docs."
  fog: "The main risk is fixing only the symptom instead of the shared inference assumption."
---

# Plan 002: trigger-context hardening

## Objective

Stop PTX from crashing when live-picker or trigger-style contexts do not provide `sessionManager`.

## Steps

1. Reproduce the missing-`sessionManager` failure through the deterministic PTX transform path.
2. Guard context inference so `sessionManager` / `getBranch()` are optional.
3. Add a regression test using a trigger-like context with no `sessionManager`.
4. Run `npm run check` and relevant smoke tests.
5. Update `README.md`, `CHANGELOG.md`, and `NEXT_SESSION_PROMPT.md` to reflect the fix and next truthful priority.

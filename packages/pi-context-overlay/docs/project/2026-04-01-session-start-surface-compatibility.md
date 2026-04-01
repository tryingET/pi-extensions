---
summary: "Compatibility note for keeping pi-context-overlay aligned with Pi host lifecycle changes that converge on enriched session_start metadata."
read_when:
  - "You are updating pi-context-overlay for host lifecycle drift."
  - "You need to know why the package stopped depending on session_switch hooks."
system4d:
  container: "Package-local compatibility note for the context overlay live surface."
  compass: "Keep the overlay truthful to Pi's live session authority without inventing a second history substrate."
  engine: "State the lifecycle drift -> capture the compatibility move -> name the resulting live-surface boundary."
  fog: "The main risk is preserving stale overlay state by depending on removed hooks or compensating with an unnecessary shadow graph."
---

# 2026-04-01 — session_start live-surface compatibility

## Problem

The bounded FCOS-M40 V6-lite wave moves Pi extension lifecycle handling toward enriched `session_start` metadata and away from legacy `session_switch` / `session_fork` assumptions.
`pi-context-overlay` was still using `session_switch` to blank its in-memory snapshot.
That created two risks:

- future host compatibility would drift as the old hook disappeared
- the overlay could become stale or unnecessarily empty instead of reflecting the current live session truth

## Decision

Keep the package simple and live-authority-bound:

- stop depending on `session_switch`
- rebuild the overlay snapshot from `ctx.sessionManager` on `session_start`
- keep `session_tree` and `session_compact` aligned to the same snapshot rebuild path
- keep `/c` using that same live-session reconstruction path when the overlay opens

## Boundary preserved

This package still does **not** own history or replay.
It only mirrors Pi's current live session context.
Durable replay/history work belongs to the separate bounded V6-lite follow-up, not to `pi-context-overlay`.

## Result

- the overlay stays current-session-aware from Pi's live session manager state
- the package no longer depends on a removed lifecycle hook to stay coherent
- no extra local graph, replay cache, or shadow session model was introduced

## Validation

Run from `packages/pi-context-overlay`:

```bash
npm run docs:list
npm run check
npm run release:check:quick
```

---
summary: "Completed AK task #662 by converging pi-context-overlay onto session_start-driven live snapshot sync and documenting the bounded V6-lite compatibility move."
read_when:
  - "You are resuming after FCOS-M40 task #662 in pi-extensions."
  - "You need the exact package-local changes made for session_start surface convergence."
---

# 2026-04-01 — FCOS-M40 session_start surface convergence

## What I did
- Claimed AK task `#662`.
- Identified the only repo code path still depending on legacy `session_switch`: `packages/pi-context-overlay/extensions/context-overlay.ts`.
- Replaced that assumption with one live-session sync path that rebuilds the overlay snapshot from `ctx.sessionManager` on:
  - `session_start`
  - `session_tree`
  - `session_compact`
- Added a small snapshot-store helper so the live session/system-prompt/usage state updates coherently in one write.
- Updated package docs/handoff surfaces:
  - `packages/pi-context-overlay/README.md`
  - `packages/pi-context-overlay/next_session_prompt.md`
  - `packages/pi-context-overlay/docs/project/2026-04-01-session-start-surface-compatibility.md`
- Added a focused test assertion that the package now registers `session_start` / `session_tree` / `session_compact` handlers and no longer registers `session_switch`.

## Why this was the right bounded move
- Task `#662` was specifically about replacing assumptions tied to removed `session_switch` / `session_fork` hooks.
- `pi-context-overlay` was the only remaining code path in this repo that still depended on `session_switch`.
- Rebuilding from `ctx.sessionManager` keeps the overlay truthful to Pi's live authority without inventing a second history/replay substrate inside the package.

## Validation
- `cd packages/pi-context-overlay && npm run docs:list`
- `cd packages/pi-context-overlay && npm run check`
- `cd packages/pi-context-overlay && npm run release:check:quick`

## Result
- Task `#662` now has a concrete repo-local implementation and package-local docs/test coverage.
- The next separate FCOS-M40 repo task remains `#663` (bounded replay/history affordances), not a continuation of this compatibility slice.

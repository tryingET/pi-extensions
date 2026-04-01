---
summary: "Completed AK task #663 by adding bounded execution-history fixtures, session-aware subagent history surfaces, and repo-local AK/evidence hardening for the V6-lite ops-plane wave."
read_when:
  - "You are resuming after FCOS-M40 task #663 in pi-extensions."
  - "You need the exact repo-local changes made for bounded replay/history affordances."
---

# 2026-04-01 — FCOS-M40 bounded history affordances

## What I did
- Claimed AK task `#663`.
- Added a root V6-lite cross-repo note at `docs/project/2026-04-01-v6-lite-pi-operations-plane-cross-repo-note.md` so the live-vs-durable split stays explicit.
- Added a shared execution seam casebook under `governance/execution-seam-cases/` and wired ASC/orchestrator tests + installed release smoke to reuse those canonical scenarios.
- Extended ASC execution shaping so consumers can use normalized `displayOutput` via `getDispatchSubagentDisplayOutput(...)` instead of re-deriving fallback bodies from raw transport output.
- Made subagent history surfaces more operator-friendly and session-aware:
  - new `parentSessionKey` capture from live Pi session context
  - bounded `resultPreview` persisted in status sidecars
  - `/subagent-dashboard` and `/subagent-inspect` now show session-scope/boundary guidance instead of treating local artifacts like live session authority
  - root `.gitignore` now ignores repo-root `.pi-subagent-sessions/` artifacts
- Hardened orchestrator runtime integration around the same wave:
  - repo-local `scripts/ak.sh` discovery for runtime AK calls
  - direct SQL evidence writes when the current repo is unregistered, instead of noisy known-failing AK evidence writes
  - consumer-side execution shaping now prefers ASC display output consistently

## Why this was the right bounded move
- Task `#663` asked for bounded replay/history affordances without collapsing durable history into live Pi session authority.
- The live operator-facing answer stays small and truthful:
  - Pi native session/tree remains the live authority
  - local subagent artifacts remain bounded replay aids
  - long-horizon durable milestone history is still a separate concern, not a shadow graph inside this repo
- The shared casebook plus display-output helper gives contract tests, consumer tests, installed smoke, and local session inspection one reusable compatibility memory instead of divergent one-off fixture stories.

## Validation
- `cd packages/pi-autonomous-session-control && node --test tests/dispatch-subagent.test.mjs tests/dispatch-subagent-diagnostics.test.mjs tests/subagent-dashboard-data.test.mjs tests/public-execution-contract.test.mjs tests/execution-seam-casebook.test.mjs`
- `cd packages/pi-society-orchestrator && node --test tests/runtime-shared-paths.test.mjs tests/execution-seam-casebook.test.mjs`
- `cd packages/pi-autonomous-session-control && npm run docs:list && npm run check`
- `cd packages/pi-society-orchestrator && npm run docs:list && npm run check && npm run release:check`
- `npm run quality:pre-commit`
- `npm run quality:pre-push`
- `npm run check`

## Result
- Task `#663` now has concrete repo-local implementation, docs, and validation coverage.
- Bounded replay/history affordances are clearer for operators, but still explicitly separated from live Pi session authority.

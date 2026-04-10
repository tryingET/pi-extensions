---
summary: "Closed the first TG3 hardening slice by making invalid package-owned KES roots fail closed and by strengthening installed-package KES proof under the true installed package root."
read_when:
  - "You need the durable execution note for tasks 1107 and 1108."
  - "You are checking how pi-society-orchestrator hardened non-happy-path KES behavior after the first proof packet."
system4d:
  container: "Root diary capture for the first TG3 KES hardening slice."
  compass: "Make exceptional-state truth explicit instead of leaving it in prose or raw filesystem errors."
  engine: "Add fail-closed invalid-root contract -> extend tests -> strengthen installed-package proof -> refresh docs/handoff."
  fog: "The main risks were leaving KES root failures as raw leaked exceptions, overstating installed-package proof semantics, or letting package/root docs drift again after the hardening landed."
---

# Diary — 2026-04-10 — TG3 KES root fail-closed and installed-root proof

## Scope

Close the first bounded TG3 hardening slice in `pi-society-orchestrator`:
- `task:1107` — fail closed on invalid package-owned KES roots
- `task:1108` — strengthen installed-package KES proof to execute from the true installed package root

The task scope allowed edits in:
- `packages/pi-society-orchestrator/**`
- `docs/project/**`
- `next_session_prompt.md`
- `diary/**`

## What changed

### 1. Invalid package-owned KES roots now fail closed with a typed contract

Added a typed KES materialization failure in:
- `packages/pi-society-orchestrator/src/kes/scaffold.ts`
- `packages/pi-society-orchestrator/src/kes/index.ts`

Then wired `loop_execute` to surface that failure as a structured operator-visible error in:
- `packages/pi-society-orchestrator/src/loops/engine.ts`

Outcome:
- invalid or unwritable `PI_ORCH_KES_ROOT` no longer leaks raw filesystem exceptions directly through the loop tool surface
- the tool now fails closed with an explicit `loop-kes-root-invalid` error and `kes_root_invalid` failure kind

Focused coverage landed in:
- `packages/pi-society-orchestrator/tests/loop-kes.test.mjs`
- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`

### 2. Installed-package KES smoke is now more honest and stronger

Hardened:
- `packages/pi-society-orchestrator/scripts/release-smoke.mjs`

Key changes:
- kept the import harness copy-isolated so TypeScript loading remains deterministic outside `node_modules`
- made the host-peer fallback more robust by allowing package-local peer locations as a fallback when the expected global host package path is absent
- kept the successful kaizen-loop smoke, but now explicitly points the KES write path at the **true installed package root**
- asserts the installed-root `diary/` + `docs/learnings/` outputs there instead of only under the import copy or operator cwd
- stabilized the abort smoke timing after the stronger installed KES proof widened the overall harness work slightly

This keeps the package/runtime claim honest:
- import is still copy-isolated
- KES write proof now targets the true installed package root

### 3. Root/package docs and handoffs were refreshed together

Updated:
- root direction/handoff docs:
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
  - `next_session_prompt.md`
- package-local truth surfaces:
  - `packages/pi-society-orchestrator/README.md`
  - `packages/pi-society-orchestrator/docs/project/strategic_goals.md`
  - `packages/pi-society-orchestrator/docs/project/tactical_goals.md`
  - `packages/pi-society-orchestrator/docs/project/operating_plan.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-11-hermetic-installed-release-smoke.md`
  - `packages/pi-society-orchestrator/docs/project/2026-04-10-kes-crystallization-contract.md`
  - `packages/pi-society-orchestrator/next_session_prompt.md`

Key doc shifts:
- the first TG3 hardening slice is now landed history through `tasks:1107-1108`
- invalid-root behavior is now explicit and fail-closed
- installed-package KES proof is stronger but described honestly: copy-isolated import harness, true installed package root for KES writes
- the next truthful move is to reassess AK rather than synthesize another TG3 slice from stale prose

## Validation run

### Package-local

From `packages/pi-society-orchestrator`:
- `node --test tests/loop-kes.test.mjs tests/runtime-shared-paths.test.mjs`
- `npm run release:check`
- `npm run docs:list`
- `npm run check`

### Root

From repo root:
- `npm run quality:pre-push`

### Direction substrate note

- `./scripts/ak.sh direction import/check --repo . -F json` was re-run after the docs refresh.
- I then bound the truthful post-hardening empty-ready state into repo-local AK task `task:1110` and refreshed the root/package direction docs to use that reassessment slice as the active `SG -> TG -> OP -> task` path.
- After that authority binding, `./scripts/ak.sh direction import --repo . -F json` and `./scripts/ak.sh direction check --repo . -F json` both passed again.

## Result

The first bounded TG3 hardening slice is now closed:
- `task:1107` — invalid package-owned KES roots fail closed with a typed contract and structured tool output
- `task:1108` — installed-package KES proof now asserts writes under the true installed package root while keeping the import harness honest about its copy-isolated boundary

Repo-local AK now includes `task:1110` as the explicit reassessment slice after those tasks, so the next session should continue that authority-bound state rather than inventing follow-through from this diary entry alone.

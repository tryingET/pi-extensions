---
summary: "Closed task 1091 by proving package-owned KES outputs through package checks, installed-package release smoke, and root validation."
read_when:
  - "You need the durable execution note for task 1091."
  - "You are checking how pi-society-orchestrator's first KES packet gained installed-package and root-level proof."
system4d:
  container: "Root diary capture for the TG2 KES proof slice."
  compass: "Keep package-owned KES outputs bounded and prove them through the same validation layers that later loop work will rely on."
  engine: "Harden installed-package release smoke -> rerun package checks -> rerun root validation -> refresh docs/handoff."
  fog: "The main risks were proving only workspace-local tests, letting installed-package smoke miss KES output materialization, or leaving docs stuck in the pre-proof state."
---

# Diary — 2026-04-10 — KES proof surfaces

## Scope

Close root task `#1091` — `[WAVE-TG2] Prove KES outputs with package checks, release smoke, and root validation`.

The task scope allowed edits in:
- `packages/pi-society-orchestrator/**`
- `docs/project/**`
- `diary/**`
- `next_session_prompt.md`

So the durable landing here is package-local proof hardening plus the root/package direction and handoff refresh.

## What changed

### 1. Installed-package release smoke now proves package-owned KES output materialization

Hardened `packages/pi-society-orchestrator/scripts/release-smoke.mjs` so the headless installed-package harness now:
- seeds the cognitive tools needed for a successful kaizen loop in the temporary Prompt Vault fixture
- drives one successful `loop_execute({ loop: "kaizen", ... })` run against the installed extension instance
- asserts the run emits six package-owned KES diary artifacts plus one candidate-only learning artifact
- proves those artifacts land under the installed package root (`diary/` + `docs/learnings/`) rather than the operator cwd
- asserts the loop phase evidence writes recorded by the fake `ak` path for the installed run

This closes the remaining proof gap after `task:1090`: package tests already proved the workspace-local behavior, but the packaged/imported release lane had not yet proved that the installed extension still materialized the bounded KES outputs truthfully.

### 2. Package docs/handoff truth was refreshed

Updated package-local truth surfaces so they no longer describe the KES packet as active/pending:
- `packages/pi-society-orchestrator/README.md`
- `packages/pi-society-orchestrator/next_session_prompt.md`
- `packages/pi-society-orchestrator/docs/project/strategic_goals.md`
- `packages/pi-society-orchestrator/docs/project/tactical_goals.md`
- `packages/pi-society-orchestrator/docs/project/operating_plan.md`
- `packages/pi-society-orchestrator/docs/project/2026-03-11-hermetic-installed-release-smoke.md`
- `packages/pi-society-orchestrator/docs/project/2026-04-10-kes-crystallization-contract.md`

Key doc shifts:
- the first bounded KES packet is landed history through `tasks:1089-1091`
- installed-package smoke explicitly includes successful KES output proof
- the next package/root move is to reassess AK before inventing loop-hardening work

### 3. Root direction + handoff truth was refreshed

Updated root truth surfaces so the monorepo no longer treats the first KES packet as still active:
- `docs/project/strategic_goals.md`
- `docs/project/tactical_goals.md`
- `docs/project/operating_plan.md`
- `next_session_prompt.md`

Key root shifts:
- seam-first prompt-plane work remains completed history
- the first KES packet is also completed history
- repo-local AK readiness is currently empty, so the next session must reassess rather than synthesize a new slice from stale prose

## Validation run

### Package-local

From `packages/pi-society-orchestrator`:
- `npm run check`
- `npm run release:check`

### Root

From repo root:
- `npm run quality:pre-push`

### Direction substrate note

- `./scripts/ak.sh direction import/check/export` was attempted after the doc refresh.
- The current direction substrate rejects a truthful "no ready TG3 task yet" state because it requires an active `SG -> TG -> OP -> task` path.
- I kept the docs aligned to the actual empty ready queue instead of inventing synthetic follow-on tasks just to satisfy the importer.

## Result

Task `#1091` is now supported by:
- package-local regression coverage for the KES contract and loop emission
- installed-package release smoke that proves successful KES materialization under the package-owned roots
- root validation after the proof lane and docs/handoff refresh landed

The first bounded KES packet is now fully closed: contract (`#1089`), runtime emission (`#1090`), and proof (`#1091`).

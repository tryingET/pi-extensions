---
summary: "Package-local handoff for pi-society-orchestrator after the first KES packet and first TG3 hardening slice closed; the next session should reassess AK before opening any further loop-hardening follow-through."
read_when:
  - "Starting the next focused package-development session."
  - "You need the current package truth after tasks 1089-1108 completed."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep package runtime behavior truthful, bounded, and release-safe while avoiding any replay of the already-complete KES/TG3 packet."
  engine: "Re-establish current package truth -> check AK readiness -> proceed only if a bounded package-local slice is actually ready -> validate -> update docs/handoff."
  fog: "Biggest risk is resuming from stale pre-hardening assumptions or inventing a new package task when AK currently shows none."
---

# Next session prompt for pi-society-orchestrator

## Session objective

Start from the current package truth after the first bounded KES packet and first TG3 hardening slice completed:
- `task:1089` — bounded KES contract/scaffolding
- `task:1090` — loop execution emits package-owned KES artifacts
- `task:1091` — package checks + installed-package release smoke + root validation prove that path
- `task:1107` — invalid package-owned KES roots fail closed with a typed materialization error and structured `loop_execute` failure
- `task:1108` — installed-package KES proof asserts successful writes under the true installed package root while the import harness stays copy-isolated and explicit about that boundary

The next package-local move is **not** to replay those slices.
The next move is to continue the AK-bound reassessment slice `task:1110` and determine whether another bounded TG3 loop-hardening slice is actually ready.

If AK still shows only the reassessment slice and no new implementation task, stop rather than synthesizing work from this handoff alone.

## What is now true

### Lower-plane packet is landed history
- the runtime-truth wave and prompt-plane cutover are already landed history in this package
- raw prompt-body reads are no longer the active blocker
- `src/kes/` owns a bounded artifact contract for package-local diary and candidate-only learning outputs
- loop execution emits package-owned KES artifacts through that seam
- invalid or unwritable package-owned KES roots now fail closed with a typed materialization error and a structured `loop_execute` failure surface
- installed-package release smoke now proves successful KES writes under the true installed package root while keeping the import harness copy-isolated and explicit about that boundary
- package-local AK task `task:1110` now binds the truthful post-hardening state into an explicit reassessment slice while no further implementation task is ready yet

### KES + TG3 proof surfaces are explicit
Package-local proof now spans:
- `tests/kes-contract.test.mjs`
- `tests/loop-kes.test.mjs`
- `tests/runtime-shared-paths.test.mjs`
- `scripts/release-smoke.mjs`
- repo-root validation rerun after the package hardening landed

### Carry-forward package guardrails
- keep KES outputs package-owned and bounded to `diary/` + candidate-only `docs/learnings/`
- do **not** treat learning candidates as auto-promoted canonical knowledge
- do **not** reopen the prompt-plane seam, the first KES packet, or the first TG3 hardening slice as if contract, emission, proof, or fail-closed behavior were still missing
- do **not** pull higher-order ASC self work forward before a bounded loop-hardening slice exists

## What should not be redone
- do **not** replay `task:1089`, `task:1090`, `task:1091`, `task:1107`, or `task:1108`
- do **not** move KES output ownership out of `pi-society-orchestrator`
- do **not** replace the bounded KES seam with ad-hoc loop-local diary writes
- do **not** treat installed-package release smoke as the primary owner of semantics; it is proof, not architecture authority
- do **not** infer a new package-local implementation task from this file if AK only shows the reassessment slice `task:1110`

## Read first
1. `AGENTS.md`
2. `README.md`
3. `docs/project/strategic_goals.md`
4. `docs/project/tactical_goals.md`
5. `docs/project/operating_plan.md`
6. `docs/project/2026-04-10-kes-crystallization-contract.md`
7. `docs/project/2026-03-11-hermetic-installed-release-smoke.md`
8. `tests/kes-contract.test.mjs`
9. `tests/loop-kes.test.mjs`
10. `tests/runtime-shared-paths.test.mjs`
11. `scripts/release-smoke.mjs`
12. `../../next_session_prompt.md`
13. `../../diary/2026-04-10--tg3-kes-root-fail-closed-and-installed-root-proof.md`

## First concrete next action
From `packages/pi-society-orchestrator`:
1. inspect repo-local AK state through the monorepo-root wrapper
   ```bash
   ../.ak task ready -F json | jq '.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")'
   ../.ak task list -F json | jq '[.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")] | sort_by(.id) | reverse | .[:6]'
   ```
2. if AK shows only `task:1110` and no new implementation task, stop
3. only then choose the next bounded package-local slice

## Validation
From `packages/pi-society-orchestrator`:
```bash
npm run docs:list
npm run check
npm run release:check
```

From repo root when root docs or release surfaces change:
```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-push
./scripts/ci/full.sh
```

## Explicit deferrals currently in force
- no reopening of the first KES packet unless real validation drift appears
- no reopening of the first TG3 hardening slice unless real validation drift appears
- no live-host `/reload` parity expansion in this pass; keep the current split between deterministic installed-package smoke and separate live-host evidence
- no bundled-ASC lifecycle changes in this pass

## Session checklist
1. Read `AGENTS.md`, `README.md`, the package direction docs, and this handoff.
2. Check AK before choosing work.
3. Pick one bounded pack only.
4. If you surface a new finding, either resolve it in the same pass or add a full deferral contract.
5. Run `npm run docs:list` if docs changed.
6. Run `npm run check`.
7. If release/runtime surface changed, run `npm run release:check`.
8. Update `README.md` and this handoff prompt before stopping.

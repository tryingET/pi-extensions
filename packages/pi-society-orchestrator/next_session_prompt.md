---
summary: "Package-local handoff for pi-society-orchestrator after the first bounded KES packet closed; the next session should reassess AK before opening any loop-hardening follow-through."
read_when:
  - "Starting the next focused package-development session."
  - "You need the current package truth after tasks 1089-1091 completed."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep package runtime behavior truthful, bounded, and release-safe while avoiding any replay of the already-complete KES packet."
  engine: "Re-establish current package truth -> check AK readiness -> proceed only if a bounded package-local slice is actually ready -> validate -> update docs/handoff."
  fog: "Biggest risk is resuming from stale pre-KES-proof assumptions or inventing a new package task when AK currently shows none."
---

# Next session prompt for pi-society-orchestrator

## Session objective

Start from the current package truth after the bounded KES packet completed:
- `task:1089` — bounded KES contract/scaffolding
- `task:1090` — loop execution emits package-owned KES artifacts
- `task:1091` — package checks + installed-package release smoke + root validation prove that path

The next package-local move is **not** to replay that packet.
The next move is to reassess AK and current docs to determine whether a bounded TG3 loop-hardening slice is actually ready.

If AK still shows no package-local ready task, stop rather than synthesizing work from this handoff alone.

## What is now true

### Lower-plane packet is landed history
- the runtime-truth wave and prompt-plane cutover are already landed history in this package
- raw prompt-body reads are no longer the active blocker
- `src/kes/` owns a bounded artifact contract for package-local diary and candidate-only learning outputs
- loop execution now emits package-owned KES artifacts through that seam
- installed-package release smoke now proves a successful kaizen loop writes package-owned `diary/` plus candidate-only `docs/learnings/` output under the installed package root rather than the operator cwd
- package-local AK readiness is currently empty

### KES proof surfaces are explicit
Package-local proof now spans:
- `tests/kes-contract.test.mjs`
- `tests/loop-kes.test.mjs`
- `scripts/release-smoke.mjs`
- repo-root validation rerun after the package proof landed

### Carry-forward package guardrails
- keep KES outputs package-owned and bounded to `diary/` + candidate-only `docs/learnings/`
- do **not** treat learning candidates as auto-promoted canonical knowledge
- do **not** reopen the prompt-plane seam or KES packet as if contract, emission, or proof were still missing
- do **not** pull higher-order ASC self work forward before a bounded loop-hardening slice exists

## What should not be redone
- do **not** replay `task:1089`, `task:1090`, or `task:1091`
- do **not** move KES output ownership out of `pi-society-orchestrator`
- do **not** replace the bounded KES seam with ad-hoc loop-local diary writes
- do **not** treat installed-package release smoke as the primary owner of semantics; it is proof, not architecture authority
- do **not** infer a new package-local task from this file if AK readiness remains empty

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
10. `scripts/release-smoke.mjs`
11. `../../next_session_prompt.md`
12. `../../diary/2026-04-10--kes-proof-surfaces.md`

## First concrete next action
From `packages/pi-society-orchestrator`:
1. inspect repo-local AK readiness through the monorepo-root wrapper
   ```bash
   ../../scripts/ak.sh task ready -F json | jq '.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")'
   ../../scripts/ak.sh task list -F json | jq '[.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")] | sort_by(.id) | reverse | .[:5]'
   ```
2. if no repo-local ready task exists, stop
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
- no higher-order ASC self follow-on before a bounded loop-hardening slice exists
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

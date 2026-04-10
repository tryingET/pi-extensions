---
summary: "Operating plan for the bounded KES activation slices in pi-society-orchestrator."
read_when:
  - "You need the current package-local operating slices and exact AK task bindings for KES work."
  - "You are about to claim or close the next KES slice in this package."
system4d:
  container: "Operating layer for the active package-owned KES tactical goal."
  compass: "Keep one active slice, bind exact AK tasks, and make the next KES move obvious."
  engine: "Choose active tactical goal -> list exact tasks -> state dependencies and validation surfaces."
  fog: "The main risk is leaving the contract, loop wiring, and validation proof as one blurred queue instead of one truthful sequence."
---

# Operating plan — package-owned KES slices

Active strategic goal: **SG1 — Make package-owned KES outputs truthful, bounded, and reusable before widening loop behavior**

Active tactical goal: **TG2 — Wire loop execution to emit package-owned KES outputs through the new seam**

## Current baseline after `task:1089`

- `src/kes/` now owns the bounded KES contract for path resolution, diary/learning-candidate scaffolding, and lazy materialization
- [2026-04-10 KES crystallization contract](2026-04-10-kes-crystallization-contract.md) is the package-local boundary note for that seam
- `tests/kes-contract.test.mjs` now guards the contract, bounded roots, markdown scaffolding, and duplicate-name allocation behavior
- loop execution still has to adopt that seam; the ad-hoc local diary behavior is no longer the desired steady state

## Current bounded KES slices

### OP1 — Define bounded KES crystallization contract and scaffolding in `pi-society-orchestrator`
- **AK task:** `task:1089`
- **State:** done
- **Deliverable:** package-owned KES artifact planning/materialization now exists in `src/kes/` with focused docs and tests.

### OP2 — Wire loop execution to emit package-owned KES outputs in `pi-society-orchestrator`
- **AK task:** `task:1090`
- **State:** active
- **Dependency:** `task:1089`
- **Deliverable:** loop/runtime paths emit bounded diary and candidate-only learning artifacts through `src/kes/` instead of ad-hoc diary writes.

### OP3 — Prove KES outputs with package checks, release smoke, and root validation
- **AK task:** `task:1091`
- **State:** staged behind OP2
- **Dependency:** `task:1090`
- **Deliverable:** emitted KES outputs are covered strongly enough to support later loop-family hardening without reopening the contract.

## Validation surfaces

- package KES contract coverage: `../../tests/kes-contract.test.mjs`
- package boundary note: [2026-04-10 KES crystallization contract](2026-04-10-kes-crystallization-contract.md)
- package truth/charter docs: `../../README.md`
- current loop consumer surface to rewire in OP2: `../../src/loops/engine.ts`

## Future trigger

- Reopen this operating area for broader loop-family hardening only after OP2 and OP3 are both done and KES output truth no longer depends on ad-hoc loop-local diary behavior.

---
summary: "Strategic goals for pi-society-orchestrator after the bounded KES contract, loop emission, proof packet, and first TG3 hardening slice all landed."
read_when:
  - "You need the current package-level strategic direction after the first KES packet and first TG3 hardening slice completed."
  - "You are deciding whether loop hardening, KES maintenance, or no package-local work is the truthful next bet."
system4d:
  container: "Strategic layer for pi-society-orchestrator after the first TG3 hardening slice."
  compass: "Keep package-owned KES outputs truthful and only widen loop behavior when AK says the next slice is actually ready."
  engine: "Read current package truth -> score the next two bets -> keep one active and one next."
  fog: "The main risk is reopening completed seam/KES/TG3 proof or widening loop behavior from stale assumptions when AK has no ready package-local task."
---

# Strategic goals — package-owned KES follow-through

## Selection basis

Evidence used:
- [README.md](../../README.md)
- [2026-04-10 KES crystallization contract](2026-04-10-kes-crystallization-contract.md)
- [2026-03-11 hermetic installed release smoke](2026-03-11-hermetic-installed-release-smoke.md)
- [root wave packet](../../../../docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md)
- `../../src/loops/engine.ts`
- `../../src/kes/index.ts`
- `../../tests/kes-contract.test.mjs`
- `../../tests/loop-kes.test.mjs`
- `../../tests/runtime-shared-paths.test.mjs`
- `../../scripts/release-smoke.mjs`

Current package-local truth:
- the runtime-truth wave and prompt-plane cutover are landed history in this package
- the first bounded KES packet is complete through `task:1089`, `task:1090`, and `task:1091`
- the first bounded TG3 hardening slice is complete through `task:1107` and `task:1108`
- `src/kes/` owns the bounded artifact contract for package-local diary and learning-candidate outputs
- loop execution emits package-owned KES artifacts through that seam
- invalid or unwritable package-owned KES roots now fail closed with a typed materialization error and a structured `loop_execute` failure surface
- installed-package release smoke now proves successful KES writes under the true installed package root while keeping the import harness copy-isolated and explicit about that boundary
- package-local AK task `task:1110` now binds the truthful post-hardening state into an explicit reassessment slice while no further TG3 implementation task is ready yet

## Eisenhower-3D ranking

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Harden loop-family and evidence semantics on top of the bounded KES base | 5 | 4 | 4 | **active** | The KES packet and first TG3 hardening slice are now complete, and `task:1110` keeps the post-hardening reassessment state bound to authority while AK waits for another bounded implementation slice. |
| 2 | Keep package-owned KES outputs truthful, bounded, and reusable as later work evolves | 4 | 3 | 2 | next | The just-landed hardening slice becomes part of the baseline that later loop work must preserve instead of silently eroding. |

## Active strategic goal

### SG2 — Harden loop-family and evidence semantics on top of the bounded KES base

Intent:
- start any later loop-family or evidence semantic tightening from the now-proved KES base
- keep higher-order execution-plane follow-on explicitly downstream of the lower prompt/KES/loop packet
- require AK-backed bounded scope before implementation begins again

Success signal:
- any new package-local follow-through is first materialized as a bounded AK task
- later work tightens loop-family/evidence semantics without reopening the KES contract, loop emission, installed-package proof packet, or the new fail-closed invalid-root contract
- if AK remains empty, package docs and handoff say stop instead of inventing work from stale memory

## Next strategic goal

### SG1 — Make package-owned KES outputs truthful, bounded, and reusable before widening loop behavior

Why this is now completed history:
- `task:1089` landed the bounded KES contract and scaffolding
- `task:1090` wired loop execution through that seam
- `task:1091` proved the package checks, installed-package release smoke, and root validation surfaces
- `task:1107` hardened the invalid-root failure path
- `task:1108` strengthened installed-package proof under the true installed package root while keeping the import harness honest about its copy-isolated boundary
- the package no longer needs to rediscover whether KES outputs can be bounded and package-owned; that fact is landed truth

## Not the current strategic path

These matter, but they are not the active package-level bet now:
- reopening the already-complete runtime-truth footer/status wave as if it were still active
- reopening the prompt-plane seam as if raw prompt-body access were still the active blocker
- replaying the first KES packet (`tasks:1089`, `1090`, `1091`) or the first TG3 hardening slice (`tasks:1107`, `1108`) as if contract, emission, proof, or fail-closed behavior were still missing
- pulling higher-order ASC self work forward before a new bounded loop-hardening slice exists

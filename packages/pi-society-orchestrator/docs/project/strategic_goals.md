---
summary: "Strategic goals for package-owned KES activation in pi-society-orchestrator after runtime-truth and prompt-plane cutover."
read_when:
  - "You need the current package-local strategic direction after the prompt-plane seam landed."
  - "You are deciding whether KES, loops, or broader execution-plane work is the next truthful package bet."
system4d:
  container: "Strategic layer for package-owned KES activation in pi-society-orchestrator."
  compass: "Keep KES outputs package-owned, bounded, and attributable before widening loop behavior."
  engine: "Read current package truth -> score the next two bets -> keep one active and one next."
  fog: "The main risk is reopening completed seam/runtime waves or jumping to loop hardening before package-owned KES outputs exist."
---

# Strategic goals — package-owned KES activation

## Selection basis

Evidence used:
- [README.md](../../README.md)
- [2026-04-10 KES crystallization contract](2026-04-10-kes-crystallization-contract.md)
- [root wave packet](../../../../docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md)
- `../../src/loops/engine.ts`
- `../../src/kes/index.ts`
- `../../tests/kes-contract.test.mjs`

Current package-local truth:
- the runtime-truth wave and prompt-plane cutover are landed history in this package
- raw prompt-body reads are no longer the next missing boundary fact
- `src/kes/` now owns a bounded artifact contract for package-local diary and learning-candidate outputs
- loop execution still has to consume that new seam before KES becomes runtime truth

## Eisenhower-3D ranking

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Make package-owned KES outputs truthful, bounded, and reusable before widening loop behavior | 5 | 5 | 3 | **active** | The prompt-plane seam is no longer the missing fact; the package now needs a truthful KES base before loop hardening or higher-order follow-on work can be justified. |
| 2 | Harden loop-family and evidence semantics on top of the bounded KES base | 4 | 4 | 4 | next | Loop execution already exists, but its next truthful improvement is to consume the new KES seam and then prove that behavior, not to widen semantics without a bounded output contract. |

## Active strategic goal

### SG1 — Make package-owned KES outputs truthful, bounded, and reusable before widening loop behavior

Intent:
- keep KES outputs owned by `pi-society-orchestrator` rather than leaking into ad-hoc package-local writes
- establish one bounded seam for raw diary capture plus candidate-only learning promotion
- sequence later work clearly: KES contract first, loop emission second, validation proof third

Success signal:
- `src/kes/` remains the package-owned contract for KES artifact planning/materialization
- package docs describe `diary/` and `docs/learnings/` as the only allowed artifact roots for this seam
- `task:1090` becomes the active follow-through because the contract no longer has to be rediscovered
- loop hardening work can build on emitted KES outputs instead of on ad-hoc diary behavior

## Next strategic goal

### SG2 — Harden loop-family and evidence semantics on top of the bounded KES base

Intent:
- consume the KES seam from loop execution without inventing a second output authority
- expand deterministic proof only after emitted outputs are real
- keep higher-order execution-plane follow-on explicitly downstream of the lower prompt/KES/loop packet

Why it is not active yet:
- the immediate package-local missing fact was the KES contract itself, which `task:1089` now supplies
- loop/evidence hardening is real, but it should start from that contract rather than proceed in parallel with it

## Not the current strategic path

These matter, but they are not the active package-level bet now:
- reopening the already-complete runtime-truth footer/status wave as if it were still active
- treating residual society-read boundary cleanup as the primary package execution anchor
- widening loop semantics before package-owned KES outputs exist
- pulling higher-order ASC self work forward before the lower prompt/KES/loop packet is truthful

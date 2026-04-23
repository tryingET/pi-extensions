---
summary: "Problem brief for the narrow pi-society-orchestrator follow-on that must decide whether chain/parallel/optional-worktree workflow composition UX belongs above ASC without reopening the broad orchestrator/ASC owner split."
read_when:
  - "Before advancing the AK decision for chain/parallel/worktree workflow composition UX over ASC."
  - "When deciding why this is a narrow Tier 1 packet instead of ordinary package implementation work."
type: "reference"
system4d:
  container: "Package-local problem brief for the workflow-composition packet in pi-society-orchestrator."
  compass: "Name the smallest architecture-significant gap above ASC without reviving a second runtime or reopening the broad owner split."
  engine: "State the landed boundary -> isolate the exact workflow-composition gap -> explain why this belongs in AK decision workflow -> name the exact decision needed next."
  fog: "The main risks are reviving an orchestrator-local execution runtime, letting convenience persistence become authority, or collapsing this packet back into peer-session messaging."
---

# Problem brief — chain / parallel / worktree UX over ASC for `pi-society-orchestrator`

## Why this artifact exists

The broad orchestrator/ASC boundary is already decided.
The missing fact is narrower.

`pi-society-orchestrator` already has:

- accepted package-boundary direction in [2026-03-11-control-plane-boundaries.md](../adr/2026-03-11-control-plane-boundaries.md)
- an orchestrator-side adapter over ASC's public execution seam
- loop/routing control-plane behavior that sits above execution

What it still lacks is a truthful owned workflow-composition surface for:

- chain execution
- parallel fan-out/fan-in
- optional worktree-assisted parallel isolation

This artifact freezes that narrower problem statement so the AK decision does not drift back into the already-settled owner split.

## Current landed baseline

The current accepted baseline is:

- ASC owns subagent execution/runtime behavior
- `pi-society-orchestrator` owns coordination/control-plane behavior
- duplicate orchestrator-local execution paths are prohibited
- AK remains canonical authority outside the local workflow runtime

That means the missing concern is **not** where execution belongs.
It already belongs in ASC.

The missing concern is:

> whether `pi-society-orchestrator` should own a thin workflow-composition layer for chain / parallel / optional worktree UX above ASC, and if so what the stable authority-bearing surface should be.

## Exact problem statement

Contrib `pi-subagents` proved that operator-facing workflow composition can be useful, but the owned stack should not recover it by porting a monolith or by reopening runtime ownership.

The real gap is the missing contract for:

- a small package-local workflow request/result core
- routing/team validation before execution starts
- delegation through ASC's public execution seam only
- orchestrator-owned fan-out/fan-in aggregation and optional worktree coordination
- adapter-only treatment of commands, builders, and saved workflows

Without that contract, the package risks two equally bad outcomes:

1. no truthful orchestrator-native workflow UX exists above ASC
2. convenience layers quietly become a second runtime or a second authority model

## Why this is architecture-significant

This concern belongs in the AK decision workflow because it changes exactly the facts reserved there:

- default workflow behavior
- architecture-significant packet/contract shape
- authority boundary at the workflow-core versus adapter layer
- lifecycle legality for how this narrower packet closes after the broad boundary ADR

This is not just a local command addition.
It decides what kind of workflow surface the package is allowed to own above ASC.

## Decision that must be made next

The decision must answer all of the following concretely:

1. may orchestrator own chain / parallel / optional worktree workflow composition above ASC?
2. is the stable core a package-local workflow contract rather than commands or persistence?
3. what exactly remains ASC truth versus orchestrator aggregation?
4. how narrow must the first worktree boundary stay?
5. what convenience surfaces are explicitly non-authoritative in the first slice?
6. what artifact chain is required before the concern is legal for ADR closure in AK?

## Out of scope

This problem brief does **not** argue for:

- reopening the broad orchestrator/ASC owner split
- reviving an orchestrator-local execution runtime
- treating `src/chains.yaml` as first-slice authority
- folding peer-session messaging into this packet
- changing prompt-plane ownership
- replacing AK as canonical authority

## Bottom line

The missing fact is no longer whether orchestrator should execute subagents.
It should not.

The missing fact is:

- **what exact thin workflow-composition contract `pi-society-orchestrator` may own above ASC without letting commands, builders, saved workflows, or worktree helpers become authority by convenience.**

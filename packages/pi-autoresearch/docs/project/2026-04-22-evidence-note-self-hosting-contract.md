---
summary: "Evidence note for the pi-autoresearch self-hosting contract follow-on: current package/runtime docs already make self-hosting plausible, while the surrounding boundary docs show why evaluator freeze, promotion authority, and lifecycle legality cannot be improvised."
read_when:
  - "Before deciding whether the pi-autoresearch self-hosting concern belongs in AK decision workflow."
  - "When you need concrete repo evidence that self-hosting is now plausible but still boundary-dangerous."
type: "reference"
system4d:
  container: "Package-local evidence note for the self-hosting contract follow-on in pi-autoresearch."
  compass: "Ground the self-hosting decision in current repo truth rather than intuition about what the package could probably do."
  engine: "Point at landed runtime/finalization/supervision truth -> point at architecture-boundary docs -> show why self-hosting needs a stricter contract -> bound what kind of decision is actually needed."
  fog: "The main risks are over-claiming that self-hosting is already safe, or under-claiming that it is architecture-significant enough to require AK decision workflow."
---

# Evidence note — supervised self-hosting contract for `pi-autoresearch`

## Why this artifact exists

This note records the concrete repo evidence behind the self-hosting concern.
It answers one narrow question:

> what, exactly, is already true in the repo that makes self-hosting both plausible and architecture-significant?

## Evidence 1 — the package already has the bounded loop mechanics that make self-hosting thinkable

`packages/pi-autoresearch/docs/project/current-vs-target.md` now records all of the following as landed:

- package-local runtime machine + ledger
- Prompt Vault decision integration
- resumable control surface
- safer finalization orchestration
- orchestrator-side live supervision
- bounded AK lifecycle automation above ordinary package completion

This proves the repo no longer lacks basic loop execution capability.
So self-hosting is not a fantasy question anymore.

## Evidence 2 — the architecture correction already forbids the naive answer

`docs/project/pi-autoresearch-architecture-correction.md` fixes the core owner split:

- package-local XState runtime owns executable domain state
- AK owns durable campaign/task truth
- Prompt Vault owns durable decision procedures

That correction is exactly why naive self-hosting is no longer acceptable.
If the active runtime now becomes its own mutable judge/promoter, the package would regress toward the monolithic self-owning shape that the correction explicitly rejected.

## Evidence 3 — bounded finalization and supervision already exist, so self-hosting can no longer hide behind missing mechanics

The package and orchestrator already have:

- bounded review-branch materialization
- bounded live supervision above exact package runtime truth
- complete-only AK lifecycle automation for ordinary campaigns

That means the next question is no longer "could the stack ever support this?"
It is "what must remain immutable if it does?"

## Evidence 4 — current package docs already frame the main risk as authority collapse, not raw implementation difficulty

The self-hosting problem-intent and RFC now both record the central risks as:

- evaluator drift
- controller/candidate bleed-through
- narrow benchmark overfitting
- promotion without external authority

So the repo is already naming the concern correctly.
The missing work is not discovering the risk class.
It is closing it with a contract strong enough for review and ADR progression.

## Evidence 5 — AK decision workflow is already the truthful runtime for this class of concern

The canonical AK decision runtime docs say `ak decision` is the correct front door when the concern changes any of these:

- authority boundary
- canonical source of truth
- lifecycle legality
- default workflow behavior
- architecture-significant packet/contract shape

Self-hosting changes all five.
So this concern is not merely RFC-worthy.
It is decision-workflow-worthy.

## Evidence 6 — the remaining danger is transitive evaluator drift, not just direct config drift

The latest reviewer feedback identified a sharper form of the evaluator problem:

- even if the controller and candidate are separate worktrees,
- and even if the evaluator has a lock file,
- the judge is still not frozen if suite execution can resolve through candidate-owned scripts, package-manager commands, or wrapper dispatch.

That means evaluator freeze must be stronger than:

- "the candidate does not edit the lock file directly"

It must also mean:

- the candidate cannot redefine the effective evaluator entrypoint through dispatch indirection.

This is strong evidence that the concern is truly architectural rather than just procedural.

## What this evidence proves

Together, the current docs and landed boundaries prove all of the following:

1. self-hosting is now plausible because the runtime, control, finalization, and supervision mechanics exist
2. self-hosting is still dangerous because the package was explicitly designed to avoid collapsing runtime truth, durable truth, and governance truth
3. the missing move is a stronger contract for controller/candidate/evaluator/promotion separation
4. that contract belongs in AK decision workflow, not only in package-local implementation notes

## What this evidence does **not** prove

This evidence does **not** prove that:

- self-hosting is automatically the highest-priority next slice
- a full external evaluation platform is required before any bounded first slice is possible
- the package should self-promote or self-rotate controllers
- a single fast self-target benchmark is a good proxy for broad package quality

Those remain decision questions.

## Bottom line

The repo evidence is already strong enough to justify a Tier 1 self-hosting contract concern.

The gap is real, bounded, and specific:

- **the package now has enough loop machinery to attempt self-hosting, but it still lacks a contract strong enough to prevent transitive evaluator drift, authority collapse, and promotion without explicit external truth.**

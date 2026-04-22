---
summary: "Problem brief for the pi-autoresearch self-hosting follow-on that must decide whether and how a stable controller may evaluate a candidate version of packages/pi-autoresearch without collapsing evaluator, runtime, and promotion authority into one loop."
read_when:
  - "Before advancing a Tier 1 decision for pi-autoresearch self-hosting."
  - "When deciding why self-hosting is architecture-significant rather than an ordinary package experiment feature."
type: "reference"
system4d:
  container: "Package-local problem brief for the self-hosting contract follow-on in pi-autoresearch."
  compass: "Name the smallest architecture-significant gap in self-hosting without widening immediately into self-sovereign autonomy or a full external platform rewrite."
  engine: "State the landed baseline -> isolate the exact authority/evaluator gap -> explain why this belongs in AK decision workflow -> name the exact decision needed next."
  fog: "The main risks are letting the active runtime become its own mutable judge, letting candidate-owned dispatch redefine the evaluator, or treating local success as implicit promotion authority."
---

# Problem brief — supervised self-hosting contract for `pi-autoresearch`

## Why this artifact exists

`pi-autoresearch` already has enough bounded runtime capability that self-hosting is now a real design question rather than a hypothetical one.

The package already has:

- bounded runtime execution
- resumable operator control
- bounded finalization orchestration
- orchestrator-side live supervision

That makes it plausible to target `packages/pi-autoresearch` itself.
But it does **not** yet make that lawful.

This artifact freezes the exact problem statement for the self-hosting concern.

## Current landed baseline

Today the package truth is:

- executable loop state remains package-local
- AK owns durable campaign/task truth
- Prompt Vault owns durable prompt procedures
- bounded finalization and supervision already exist above ordinary campaigns

So the missing fact is not "can the package run experiments?"
It can.

The missing fact is:

> under what exact contract can a stable controller evaluate a candidate version of `packages/pi-autoresearch` without turning controller, candidate, judge, and promoter into the same mutable loop?

## Exact problem statement

A naive self-hosting extension would let the package do all of the following at once:

- edit itself in place
- evaluate itself through candidate-owned scripts/config
- classify its own success using a mutable benchmark harness
- treat local success as sufficient evidence for promotion

That would recreate the self-owning architecture the package was explicitly designed to avoid.

So the real gap is not raw runtime power.
The real gap is the missing contract for:

- controller-versus-candidate separation
- evaluator immutability, including transitive command-dispatch immutability
- explicit applicability classification for specialized vs general wins
- external promotion/rollback authority

## Why this is architecture-significant

This concern belongs in the AK decision workflow because it changes exactly the kinds of facts the decision runtime reserves for Tier 1 handling:

- authority boundary
- canonical source of truth
- lifecycle legality
- default workflow behavior
- architecture-significant packet/contract shape

This is not merely a package implementation detail.
It decides what must remain immutable when the optimizer is pointed at the package itself.

## Decision that must be made next

The next decision must answer all of the following concretely:

1. what runtime model keeps the stable controller from becoming the candidate mid-campaign?
2. how is evaluator freeze enforced when controller and candidate still live in the same repo/package family?
3. what counts as a specialized win versus a default-promotion candidate?
4. who performs controller rotation, and what artifact records that decision?
5. what rollback contract restores the prior controller if the promoted candidate regresses later?
6. what exact lifecycle artifacts must exist before ADR is legal for this concern?

## Out of scope

This problem brief does **not** argue for:

- automatic merge/promotion
- in-place self-sovereign recursion
- whole-monorepo self-improvement
- a full external evaluation platform as a first prerequisite
- direct AK mutation from the package runtime

The bounded concern is only the first lawful self-hosting contract.

## Bottom line

The missing fact is no longer whether self-hosting is imaginable.
It is.

The missing fact is:

- **what exact controller/candidate/evaluator/promotion split makes self-hosting lawful enough to review as a Tier 1 architecture concern rather than a dangerous extension of ordinary package-local campaigns.**

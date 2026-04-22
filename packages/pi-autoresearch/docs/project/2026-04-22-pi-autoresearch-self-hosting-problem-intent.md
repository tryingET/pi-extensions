---
summary: "Problem-intent for letting pi-autoresearch improve packages/pi-autoresearch itself through supervised self-hosting without collapsing controller/evaluator/promotion roles, weakening evaluator truth, or overfitting to one local benchmark."
read_when:
  - "Before widening pi-autoresearch into self-hosting or self-improvement work against packages/pi-autoresearch itself."
  - "When deciding how to prevent recursive scope narrowing, evaluator drift, and loss of general applicability in self-targeted campaigns."
system4d:
  container: "Package-local problem-intent note for a possible post-target widening into supervised self-hosting."
  compass: "Let pi-autoresearch optimize a candidate version of itself while preserving external truth owners, frozen evaluation, and explicit generalization guardrails."
  engine: "State the missing capability -> separate controller/candidate/judge/promotion -> answer the reviewer-grade boundary questions -> define the smallest safe self-hosting move -> keep non-goals explicit."
  fog: "The main risks are recursive self-authorization, evaluator drift, runtime/controller bleed-through, narrow benchmark overfitting, and promoting specialized local wins as general package truth."
---

# Problem-intent — supervised self-hosting for `pi-autoresearch`

## Problem in one sentence

`pi-autoresearch` now has enough bounded runtime, control, finalization, and supervision machinery to target `packages/pi-autoresearch` itself, but it still has **no lawful self-hosting contract** that keeps controller, candidate, evaluator, and promotion authority separate enough to avoid recursive overfitting, evaluator drift, and accidental self-authorization.

## Why this problem exists now

The package has already reached its bounded target control-plane state and several post-target widening slices:

- package-local runtime machine + ledger
- governed Prompt Vault decision use
- explicit control/finalization orchestration
- orchestrator-side live supervision
- bounded manifest-campaign planning/control follow-ons

That means a natural next question appears:

> can the same bounded experiment-loop capability now improve `pi-autoresearch` itself?

The answer is still **not yet**, unless self-hosting is made explicit as a different contract from ordinary repo-local optimization.

Without that contract, an agent will tend to improvise a dangerous shape:

- the active runtime edits itself in place
- the same loop chooses scope, runs experiments, judges success, and decides promotion
- the fast local benchmark/check surface becomes the whole truth
- narrow wins are mistaken for general package improvement
- evaluator and promotion rules become vulnerable to same-campaign drift

So the missing problem is not merely "run the benchmark against this package." The missing problem is:

> how to let `pi-autoresearch` optimize a candidate version of itself without quietly recreating the monolithic self-owning architecture that the package was explicitly designed to avoid.

## What the current evidence does and does not prove

### Evidence that is already strong

The current package state proves that self-hosting is no longer a fantasy question:

- the runtime can execute bounded experiments and record receipts/events
- the control surface can persist operator decisions across fresh sessions
- finalization can create bounded review branches
- live supervision can observe exact anchored campaigns from above the package

So the package no longer lacks execution mechanics.
It has enough bounded machinery that self-hosting must now be addressed deliberately rather than accidentally.

### Evidence that is still intentionally limited

This note does **not** claim that self-hosting is automatically the next highest-value slice.
It only claims that if self-hosting is attempted, it needs a stricter architecture than ordinary package-local campaigns.

What is still not proven by current docs/artifacts alone:

- that self-hosting is higher-value than other post-target widenings
- that a single fast self-target benchmark is a good proxy for broad package quality
- that the current single-runtime surfaces can be reused unchanged without a controller/candidate split

That is why this note is a boundary artifact, not a landing claim.

## What capability is actually missing

The missing capability is **supervised self-hosting as a bounded campaign model**.

That model must make all of the following explicit:

- which version of `pi-autoresearch` is the **controller**
- which branch/worktree is the **candidate** being improved
- which frozen scripts/suites act as the **judge**
- which external actor or gate decides **promotion**
- which results count as:
  - reject
  - specialized/variant-only improvement
  - general/default-promotion candidate
- how controller rotation and rollback are recorded explicitly instead of inferred from local success

Today the package has runtime surfaces for executing bounded loops, but it still does not have a checked way to represent that six-way split.

## Why the existing runtime surfaces are not enough

The existing surfaces are valuable, but they answer different questions:

- `autoresearch_runtime_run`
  - can execute bounded runs and record receipts/events
- `autoresearch_runtime_control`
  - can persist operator intent such as continue / rebaseline / finalize / stop
- `autoresearch_runtime_finalize`
  - can plan/approve/materialize bounded review branches
- `autoresearch_live_supervision`
  - can supervise exact anchored campaigns live from above the package

Those surfaces are sufficient for ordinary bounded campaigns.
They are **not** yet sufficient for self-hosting because they do not define:

- controller-versus-candidate separation
- frozen evaluator semantics outside the mutable candidate
- code-loading/runtime-isolation rules that keep the controller from becoming the candidate mid-campaign
- holdout/transfer/generalization suites as first-class campaign requirements
- regression-budget policy across multiple suites
- applicability classification for "general" versus "specialized" wins
- promotion and rollback records that keep runtime success separate from controller rotation

So the package can already run local experiment loops.
It still cannot yet run **self-hosted** experiment loops truthfully.

## Reviewer-grade boundary questions this note must answer next

A self-hosting RFC is not yet serious until it answers all of the following concretely:

1. how is evaluator freeze enforced if controller and candidate both live in the same repo/package family, including transitive command-dispatch drift through candidate-owned scripts/config?
2. what runtime/code-loading model keeps the stable controller from accidentally becoming the mutable candidate?
3. what minimum evidence turns a result into `default_promotion_candidate` instead of only `variant_candidate`?
4. who performs controller rotation, and what exact artifact records that decision?
5. what is the rollback path if a promoted controller later degrades under real operator use?
6. which existing bounded surfaces remain reusable unchanged, and which require self-hosting-specific adaptation?
7. does this concern need to open as an `ak decision`, and if so what exact lifecycle artifact chain must exist before ADR is legal?

Any next RFC must answer those questions directly rather than treating them as implementation details.

## Self-hosting constraints that must be respected

Any solution has to preserve the current architecture correction and package boundary truth.

### 1. Controller, candidate, judge, and promotion must not collapse into one loop

A self-hosting campaign is only truthful if these roles stay distinct:

- **controller** — the stable currently trusted runtime that runs the campaign
- **candidate** — the branch/worktree/version under improvement
- **judge** — the frozen evaluation harness and suite portfolio
- **promotion** — the external approval/promotion step

If one loop owns all four, self-hosting becomes self-authorization.

### 2. The candidate must not rewrite its own judge in the same campaign

The same bounded self-hosting campaign must not let the candidate edit:

- the evaluation harness
- holdout/transfer suite membership
- regression budgets
- promotion policy
- controller-side evaluator snapshots/locks

If those change, that is a different governed change.
Otherwise the loop can win by moving the goalposts.

### 3. General applicability must be evaluated explicitly, not assumed

A self-targeted fast local benchmark is not enough.
The campaign needs at minimum:

- a **dev suite** for fast iteration
- a **holdout suite** the campaign does not tune against directly
- a **transfer/generalization suite** that reaches beyond the single self-target workflow

Otherwise the loop will optimize for one narrow internal path and call that progress.

### 4. Promotion must remain outside the candidate loop

The package may eventually propose or materialize candidate review branches.
It must not silently:

- make the candidate the new controller automatically
- auto-merge itself as the new package truth
- treat local completion as promoted default behavior
- rewrite the current stable install/runtime without an external gate

Promotion belongs to an external gate above the candidate loop.

### 5. The active controller must not mutate itself in place

A truthful first self-hosting model is:

- stable controller version `N`
- candidate version `N+1`
- frozen evaluator bundle `E`
- explicit promotion from `N+1` only after evaluation succeeds

It is **not**:

- active runtime mutates itself, reloads itself, and calls the new state trustworthy by default

### 6. Exact scope must still come from AK and bounded package truth

Self-hosting does not remove normal scope discipline.
The campaign still needs:

- exact task identity
- exact allowed paths
- exact required artifacts
- explicit off-limits files

This is especially important because self-hosting tempts the loop to widen from package-local work into monorepo- or control-plane-level mutation.

## Current baseline that self-hosting must build on

The current package baseline is already strong enough to make self-hosting tempting:

- the runtime can execute experiments and record machine/ledger truth
- the control surface can persist operator decisions across fresh sessions
- finalization can create bounded review branches
- live supervision can observe exact anchored campaigns from above the package

That means the package no longer lacks execution mechanics.
What it still lacks is the **self-hosting governance/evaluation split** that makes those mechanics safe to use against the package itself.

## Smallest truthful success state for the next slice

The first self-hosting slice is solved truthfully when all of the following are true:

1. one exact self-hosting campaign can target `packages/pi-autoresearch` as a **candidate** rather than the active controller itself
2. one checked self-hosting contract makes explicit:
   - controller ref/runtime
   - candidate branch/worktree
   - allowed/off-limits paths
   - evaluator snapshot location and hash
   - frozen dev / holdout / transfer suites
   - promotion policy
   - rollback target
3. the candidate cannot modify evaluator or promotion artifacts within the same campaign
4. the controller can run bounded experiments against the candidate **without importing candidate runtime code into the controller process**
5. the campaign can classify outcomes explicitly as:
   - reject
   - specialized/variant candidate
   - default-promotion candidate
6. controller rotation remains an external approval action with an explicit record
7. existing bounded finalization/supervision surfaces are reused where possible instead of inventing a second self-improvement control plane
8. remaining non-goals stay explicit

## What this problem-intent does **not** ask for yet

This note does **not** ask for:

- daemonized always-on self-improvement
- in-place self-reloading of the active controller as soon as the candidate looks better
- automatic merge/promotion of a candidate into package truth
- broad monorepo self-improvement outside bounded package scope
- a candidate loop that can rewrite its own evaluator or promotion rules
- direct AK mutation or implicit controller rotation from the package
- ontology or Prompt Vault widening beyond what the first bounded self-hosting contract actually needs

Those may become later decisions, but they are not the first truthful move.

## Why this is the next bounded move

Self-hosting is attractive precisely because the package already has real loop mechanics.
That also makes it risky.

It is also architecture-significant in the exact way AK's decision runtime reserves for `ak decision` concerns:

- authority boundary
- canonical source of truth
- lifecycle legality
- default workflow behavior
- architecture-significant packet/contract shape

So the next truthful move is not only a stronger RFC.
It is a stronger RFC plus the correct decision-lifecycle posture for this concern.

If the next step is taken without a boundary note like this one, the package will likely regress toward the same anti-patterns earlier architecture work rejected:

- local self-owned authority
- hidden runtime lifecycle widening
- evaluator drift
- benchmark overfitting
- broad self-mutation without external truth owners

So the next bounded move is not "turn self-hosting on."
It is:

> define supervised self-hosting as a distinct controller/candidate campaign model with frozen evaluator truth, external promotion/rollback records, and explicit generalization guardrails.

That is the smallest truthful step from:

- "the package can optimize ordinary repo-local campaigns"

to:

- "the package can one day improve a candidate version of itself without collapsing into a self-regressing local-optimum machine that mistakes mutable self-consistency for general usefulness."

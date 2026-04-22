---
summary: "Accepted package-level decision for bounded supervised self-hosting in pi-autoresearch: a stable controller may evaluate a candidate version of packages/pi-autoresearch only under snapshot-owned evaluator entrypoints, explicit applicability gates, and external promotion/rollback authority."
status: accepted
read_when:
  - "Before implementing or reviewing any self-hosting or self-improvement follow-on for packages/pi-autoresearch itself."
  - "When deciding whether candidate evaluation may resolve through candidate-owned scripts, package-manager commands, or other mutable dispatch layers."
  - "When you need the durable accepted contract after decision 18 reached ADR recording."
system4d:
  container: "Package-local ADR for bounded supervised self-hosting in pi-autoresearch."
  compass: "Allow a stable controller to evaluate a candidate successor without collapsing controller, candidate, judge, and promoter into one mutable loop."
  engine: "stage the strongest schools of thought -> force confrontation -> choose the smallest durable synthesis -> bind scope, seams, legality, and rollout invariants."
  fog: "The main risks are candidate-owned evaluator drift, controller/candidate runtime bleed-through, or treating local candidate success as implicit promotion authority."
---

# ADR — supervised self-hosting contract for `pi-autoresearch`

## Status

Accepted as the package-level architectural contract for `decision:18`.

- date: 2026-04-22
- owner: `packages/pi-autoresearch`
- reviewers:
  - `decision:18` current-track review memo
- related_docs:
  - `../project/2026-04-22-pi-autoresearch-self-hosting-problem-intent.md`
  - `../project/2026-04-22-problem-brief-self-hosting-contract.md`
  - `../project/2026-04-22-evidence-note-self-hosting-contract.md`
  - `../project/2026-04-22-pi-autoresearch-self-hosting-rfc.md`
  - `../project/2026-04-22-review-self-hosting-rfc.md`
  - `../project/current-vs-target.md`
  - `../../../../docs/project/pi-autoresearch-architecture-correction.md`
  - `../../../../docs/project/decision-runtime-and-roadmap.md`

## Executive summary

`pi-autoresearch` may adopt self-hosting only as a **supervised controller-versus-candidate campaign model**. A stable controller may evaluate a candidate version of `packages/pi-autoresearch` only under exact AK scope, snapshot-owned evaluator entrypoints, explicit applicability gates, and external promotion/rollback authority. Candidate-owned scripts, package-manager commands, wrapper dispatch, or other mutable indirection must never redefine the evaluator in the same campaign. Promotion and controller rotation remain explicit reversible acts above the package, not package-local side effects.

## Context

`pi-autoresearch` now already has real bounded loop mechanics:

- package-local runtime execution
- resumable operator control
- bounded finalization orchestration
- orchestrator-side live supervision

That makes self-hosting a real design question.
But the architecture correction for `pi-autoresearch` already established that:

- executable runtime state stays package-local
- AK owns durable campaign/task truth
- Prompt Vault owns durable decision procedures

So the missing question was never merely "can the package run on itself?"
It was:

> under what exact contract may a stable controller evaluate a candidate successor without turning controller, candidate, judge, and promoter into the same mutable loop?

The review chain for `decision:18` showed that the decisive risk is **transitive evaluator drift**. Even with separate controller and candidate worktrees, the judge is still not frozen if evaluation can resolve through candidate-owned `package.json` scripts, wrapper shells, or mutable repo-local dispatch.

## Problem statement

A naive self-hosting extension would allow the package to:

- edit itself in place
- evaluate itself through candidate-owned scripts/config
- classify its own success using a mutable benchmark harness
- treat local success as sufficient evidence for promotion

That would recreate the monolithic self-owning architecture the package was explicitly designed to avoid.

The accepted contract therefore needed durable answers to:

- how controller and candidate stay separate
- how evaluator entrypoints stay frozen outside the candidate
- how specialized wins differ from default-promotion candidates
- who owns promotion and rollback legality

## Decision drivers

- preserve the package-local runtime / AK / Prompt Vault owner split
- prevent direct and transitive evaluator drift
- keep the controller from becoming the candidate mid-campaign
- distinguish specialized wins from general/default improvements explicitly
- keep promotion and rollback above the package and explicitly recorded
- keep the first slice brownfield-compatible without waiting for a wholly separate evaluation platform
- route the concern through AK decision legality rather than implied document chronology

## Decision

Adopt bounded self-hosting only as a **supervised controller/candidate/judge/promotion split**.

This decision was reached after a many-of-the-greats confrontation among three first-rate schools:

1. **Hermetic evaluation maximalism**
   - if the candidate can redefine evaluator entrypoints through any mutable path, the judge is not frozen
2. **Brownfield controller pragmatism**
   - the first slice should reuse the already-landed package/orchestrator surfaces through controller-subprocess-against-candidate execution rather than waiting for a whole new platform
3. **Governance legality discipline**
   - self-hosting changes authority boundary, lifecycle legality, default workflow behavior, and packet shape, so it must move through AK decision workflow and explicit promotion/rollback records

The accepted decision is a true synthesis:

- from hermetic evaluation maximalism:
  - evaluator entrypoints are snapshot-owned and hash-checked
  - candidate-owned package-manager scripts and wrapper commands may never define the judge
- from brownfield controller pragmatism:
  - the first slice uses a stable controller and separate candidate worktree
  - evaluation is by subprocess against the candidate rather than in-process mutation
- from governance legality discipline:
  - this concern moves through `ak decision`
  - ADR legality comes from the AK review closure path
  - promotion and rollback are explicit reversible acts above the package

### Scope
- in scope:
  - controller/candidate split for self-hosting campaigns
  - snapshot-owned evaluator lock and entrypoint semantics
  - applicability outcomes: `reject`, `variant_candidate`, `default_promotion_candidate`
  - external promotion / rollback record contract
  - AK decision legality path for this concern
  - first-slice transition and rollout invariants
- out of scope:
  - in-place self-sovereign recursion
  - automatic merge/promotion
  - whole-monorepo self-improvement
  - direct AK mutation from the package runtime
  - a new self-hosting-specific Prompt Vault procedure set in the first slice

### Ownership / seam / policy notes
- owner:
  - `packages/pi-autoresearch` owns controller-side self-hosting orchestration and applicability classification
- allowed seams:
  - `controller_subprocess_against_candidate`
  - snapshot-owned evaluator entrypoints
  - exact AK scope for the candidate campaign
  - external operator/orchestrator promotion and rollback recording
- prohibited patterns:
  - candidate-owned evaluator entrypoints
  - candidate-owned package-manager or wrapper-script indirection redefining the judge
  - in-process loading of candidate runtime code into the active controller during Stages 0-2
  - implicit promotion from local success
  - treating ordinary single-runtime campaign semantics as automatically sufficient for self-hosting

## Alternatives considered

### Option A — in-place self-sovereign loop
- description:
  - active runtime edits, evaluates, and promotes itself in place
- pros:
  - maximal automation
  - minimal administrative separation
- cons:
  - collapses controller, candidate, judge, and promoter into one loop
  - recreates the architecture the package explicitly rejected
  - makes evaluator drift and authority drift almost impossible to bound
- why not chosen:
  - it is architecturally false to the current package boundary model

### Option B — fully external hermetic evaluation platform first
- description:
  - forbid self-hosting until a separate external runner/evaluator platform exists
- pros:
  - cleanest evaluator-isolation answer
  - lowest risk of candidate-owned dispatch drift
- cons:
  - too heavy for the first bounded slice
  - delays a truthful brownfield experiment even though the package already has reusable bounded surfaces
- why not chosen:
  - correct long-run instinct, but too much prerequisite machinery for the first bounded slice

### Option C — no self-hosting at all
- description:
  - permanently exclude `pi-autoresearch` from its own optimization loop
- pros:
  - simplest safety posture
- cons:
  - ignores a legitimate future use case now made plausible by the landed package/runtime state
- why not chosen:
  - too conservative relative to the package's current maturity

### Option D — supervised controller/candidate split with snapshot-owned evaluator entrypoints and external promotion/rollback
- description:
  - stable controller evaluates a candidate worktree under hash-checked snapshot-owned evaluator entrypoints; promotion and rollback remain external and explicit
- pros:
  - closes the evaluator-entrypoint loophole
  - preserves brownfield reuse without in-process mutation
  - keeps legality and promotion authority outside the package runtime
- cons:
  - richer contract and more artifacts than ordinary campaigns
  - requires careful implementation to keep entrypoint ownership and subject-under-test cwd distinct
- why chosen or not chosen:
  - chosen because it is the smallest durable synthesis that preserves truth at all the relevant boundaries

## Consequences

### Positive
- self-hosting becomes discussable and implementable without becoming self-sovereign
- evaluator truth is stronger than a mere lock-file convention; entrypoints are frozen outside candidate control
- specialization vs general package improvement becomes explicit rather than rhetorical
- controller rotation and rollback become explicit governance acts instead of implied runtime behavior
- the AK decision path for this concern is now clear and durable

### Costs
- self-hosting introduces additional controller-owned artifacts
- evaluation commands can no longer rely on candidate-owned package-manager scripts or wrapper commands as the judge
- implementation must maintain a precise distinction between subject-under-test cwd and evaluator entrypoint ownership

### Risks
- later convenience layers may try to reintroduce candidate-owned command dispatch
- transfer-suite scope for `default_promotion_candidate` may prove too weak or too strong and require later tuning
- operator ergonomics for controller rotation may remain manual-heavy until a later bounded follow-on justifies assistive tooling

### Mitigations
- fail closed on evaluator hash drift or entrypoint mismatch
- require minimum transfer coverage for default promotion
- require explicit `variantTargetProfile` for `variant_candidate`
- keep promotion/rollback records explicit and reversible
- validate all first-slice invariants with executable checks rather than document confidence

## Migration / rollout

- phase 1:
  - add `autoresearch.self-hosting.json`
  - add `autoresearch.self-hosting.evaluator.lock.json`
  - validate snapshot-owned evaluator entrypoints and exact candidate scope
- phase 2:
  - implement controller-subprocess-against-candidate execution discipline
  - classify outcomes as reject / variant / default-promotion candidate
- phase 3:
  - add `autoresearch.self-hosting.promotion.json`
  - keep promotion and rollback external and explicit
- rollback / escape hatch:
  - if promotion later proves wrong, restore `rollbackControllerRef`, record rollback explicitly, and rerun post-promotion verification against the restored controller

## Architecture fitness functions / validation

- invariant 1:
  - the candidate is the subject under test, never the source of evaluator entrypoint truth
- invariant 2:
  - candidate-owned package-manager scripts or wrapper commands cannot redefine snapshot-owned evaluator entrypoints
- invariant 3:
  - `variant_candidate` requires a declared target profile fixed before the campaign begins
- invariant 4:
  - `default_promotion_candidate` requires minimum transfer coverage across both `package_non_self_hosting` and `operator_consumer`
- invariant 5:
  - promotion and rollback remain explicit acts above the package runtime
- command checks:
  - `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/pi-autoresearch/docs --strict`
  - `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs --strict`
- test / review gates:
  - focused proof that candidate runtime code is not imported into the controller process during early stages
  - proof that evaluator hash drift fails closed
  - proof that candidate-owned dispatch cannot redefine the judge
  - proof that applicability classification obeys the typed thresholds and coverage requirements
  - proof that promotion/rollback records cannot imply self-promotion

## Follow-up decisions / open questions
- where should the evaluator snapshot live by default: repo-local controller path, exported AK snapshot path, or another controller-owned storage root?
- should the minimum `operator_consumer` transfer coverage expand beyond the first bounded adjacent flow over time?
- should later controller rotation remain fully manual, or is there a truthful orchestrator-assisted but still explicit handoff path worth standardizing?
- if later evidence justifies new Prompt Vault procedures, which self-hosting decisions are durable enough to belong there rather than in typed code contracts?

## Supersession
- supersedes:
- superseded_by:

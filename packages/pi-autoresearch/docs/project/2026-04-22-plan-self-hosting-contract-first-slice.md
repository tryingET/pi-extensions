---
summary: "Post-ADR implementation plan for the first bounded self-hosting slice in pi-autoresearch: add controller-owned self-hosting artifacts, snapshot-owned evaluator entrypoints, candidate worktree execution discipline, and explicit applicability/promotion records without landing self-sovereign automation."
read_when:
  - "After ADR acceptance for decision 18 and before implementing the first self-hosting slice."
  - "When turning the self-hosting ADR into bounded execution work without reopening the accepted architecture."
type: "reference"
---

# Plan — first bounded self-hosting slice for `pi-autoresearch`

## Scope of this plan

This plan covers only the first bounded post-ADR slice under `decision:18`.
It does **not** authorize broader self-sovereign autonomy, automatic promotion, or whole-monorepo self-improvement.

## Goal

Land the minimum package/orchestrator surfaces required to make supervised self-hosting real under the accepted ADR:

- controller-owned self-hosting contract
- controller-owned evaluator lock with snapshot-owned entrypoints
- controller-subprocess-against-candidate execution discipline
- typed applicability classification
- explicit promotion/rollback record

Interpretation rule:
- the accepted architecture is a bounded synthesis, not a loose blend
- brownfield controller reuse is allowed only while evaluator truth stays snapshot-owned outside the candidate and promotion authority stays external above the package

## Execution graph

The first slice has one dominant dependency shape:

1. schema + lock artifacts become valid first
2. controller/candidate execution isolation depends on those artifacts
3. snapshot-owned evaluator entrypoints depend on the isolation model being explicit
4. applicability classification depends on the evaluator producing bounded trustworthy results
5. promotion/rollback records depend on the earlier four units, because promotion legality is downstream of truthful evaluation rather than parallel to it

Interpretation rule:

- do not start with promotion mechanics
- do not let applicability logic appear before evaluator-entrypoint ownership is truthful
- do not let convenience command dispatch reopen the accepted architecture

## Units

### SH-1 — self-hosting contract + evaluator lock schema

- objective:
  - make the self-hosting campaign and evaluator lock first-class validated artifacts rather than ambient conventions
- outcome:
  - validate `autoresearch.self-hosting.json`
  - validate `autoresearch.self-hosting.evaluator.lock.json`
  - reject invalid scope, evaluator, applicability, and promotion shapes
- dependencies / legal preconditions:
  - ADR `packages/pi-autoresearch/docs/adr/2026-04-22-supervised-self-hosting-contract.md`
- authority owner / target substrate:
  - `packages/pi-autoresearch` docs/code/test surface
  - repo-tracked implementation under the package runtime owner
- boundaries / touched surfaces:
  - `packages/pi-autoresearch/src/**`
  - `packages/pi-autoresearch/tests/**`
  - `packages/pi-autoresearch/docs/project/**`
- failure modes:
  - artifact shape accepts evaluator definitions too weak to preserve snapshot-owned entrypoints
  - variant/default applicability fields stay too loose to drive later gating
- validation / evidence required:
  - focused schema tests
  - negative-path tests for missing/invalid fields
- current execution status:
  - landed locally via `packages/pi-autoresearch/src/core/selfHosting.ts`
  - focused proof now lives in `packages/pi-autoresearch/tests/self-hosting.test.ts`
  - follow-on tasks should reuse these checked loaders/validators instead of re-parsing self-hosting artifacts ad hoc

### SH-2 — controller/candidate execution isolation

- objective:
  - ensure a stable controller can evaluate a candidate worktree without becoming that candidate
- outcome:
  - create bounded candidate worktree preparation
  - preserve exact path fences for `packages/pi-autoresearch`
  - enforce `controller_subprocess_against_candidate`
  - forbid in-process candidate runtime loading during Stages 0-2
- dependencies / legal preconditions:
  - SH-1
- authority owner / target substrate:
  - `packages/pi-autoresearch` runtime/test surface
- boundaries / touched surfaces:
  - package runtime helpers
  - candidate worktree preparation logic
  - package tests proving no in-process bleed-through
- failure modes:
  - controller imports candidate code directly
  - candidate worktree touches off-limits paths without rejection
- validation / evidence required:
  - proof that candidate runtime code is not imported into the controller process
  - proof that off-limits path mutation fails closed
- current execution status:
  - landed locally via controller/candidate isolation helpers in `packages/pi-autoresearch/src/core/selfHosting.ts`
  - focused proof now lives in `packages/pi-autoresearch/tests/self-hosting.test.ts`
  - follow-on tasks should reuse the landed worktree-preparation, scope-check, and candidate-subprocess helpers rather than widening back into in-process candidate loading

### SH-3 — snapshot-owned evaluator entrypoints

- objective:
  - make evaluator entrypoint ownership truthful at the command-resolution level, not only at the lock-file level
- outcome:
  - implement evaluator lock resolution from controller-owned snapshot roots
  - allow candidate as subject under test without allowing candidate-owned evaluator entrypoint selection
  - reject candidate-owned package-manager / wrapper dispatch as evaluator truth
- dependencies / legal preconditions:
  - SH-1
  - SH-2
- authority owner / target substrate:
  - `packages/pi-autoresearch` runtime/test surface
- boundaries / touched surfaces:
  - evaluator command resolution
  - snapshot lock parsing
  - candidate subject-cwd handling
- failure modes:
  - same-named evaluator files inside the candidate worktree redefine the judge
  - candidate-owned `package.json` scripts or wrappers become transitive evaluator entrypoints
  - subject-under-test cwd is confused with evaluator-entrypoint ownership
- validation / evidence required:
  - proof that hash drift fails closed
  - proof that same-named evaluator files inside the candidate worktree do not redefine the judge
  - proof that candidate-owned `package.json` scripts cannot redefine evaluator entrypoints
- current execution status:
  - landed locally via snapshot-owned evaluator suite resolution/execution helpers in `packages/pi-autoresearch/src/core/selfHosting.ts`
  - focused proof now lives in `packages/pi-autoresearch/tests/self-hosting.test.ts`
  - follow-on tasks should reuse the landed locked-suite resolution/execution path rather than widening back into candidate-owned package-manager or wrapper dispatch

### SH-4 — applicability classification

- objective:
  - classify outcomes as `reject`, `variant_candidate`, or `default_promotion_candidate` using the accepted thresholds and coverage rules rather than operator feel
- outcome:
  - classify outcomes using typed result envelopes
  - require declared `variantTargetProfile` for variant outcomes
  - require minimum transfer coverage for default-promotion outcomes
- dependencies / legal preconditions:
  - SH-3
- authority owner / target substrate:
  - `packages/pi-autoresearch` runtime/test surface
- boundaries / touched surfaces:
  - result classification logic
  - transfer-suite coverage handling
  - operator-facing status/output wording
- failure modes:
  - default-promotion classification is emitted with insufficient transfer coverage
  - variant classification is used as an after-the-fact excuse instead of a declared target profile
- validation / evidence required:
  - tests for all three outcome classes
  - tests for blocked default promotion when transfer coverage is insufficient
  - tests for variant classification requiring declared target profile
- current execution status:
  - landed locally via typed applicability-classification helpers in `packages/pi-autoresearch/src/core/selfHosting.ts`
  - focused proof now lives in `packages/pi-autoresearch/tests/self-hosting.test.ts`
  - follow-on tasks should reuse the landed applicability classifier and typed blocker reporting rather than reclassifying self-hosting results ad hoc or treating specialized wins as default-promotion evidence

### SH-5 — promotion/rollback record

- objective:
  - make promotion readiness and rollback target explicit without granting package-local self-promotion
- outcome:
  - add `autoresearch.self-hosting.promotion.json`
  - record approvals, previous controller, promoted candidate, and rollback controller
  - keep promotion external to the package runtime
- dependencies / legal preconditions:
  - SH-4
- authority owner / target substrate:
  - package artifact projection owned by `packages/pi-autoresearch`, while promotion authority remains external
- boundaries / touched surfaces:
  - promotion-record helpers
  - status/help surfaces that report readiness without implying self-promotion
- failure modes:
  - controller rotation appears to happen automatically from package-local success
  - rollback target is missing or not durable enough for later restoration
- validation / evidence required:
  - proof that controller rotation cannot be reported without approvals and rollback target
  - proof that rollback updates the record truthfully
- current execution status:
  - landed locally via promotion-record validation/load helpers plus plan/apply promotion-readiness and rollback-record helpers in `packages/pi-autoresearch/src/core/selfHosting.ts`
  - focused proof now lives in `packages/pi-autoresearch/tests/self-hosting.test.ts`
  - follow-on tasks should reuse the landed promotion-record helpers rather than implying package-local self-promotion or ad hoc rollback bookkeeping

## Structural rules for implementation

- preserve one dominant synthesis doc for this slice rather than scattering new execution truth across many weak notes
- keep the accepted ADR as the durable architecture commitment; do not reopen the architecture in implementation tasks
- keep execution leaves in AK task truth once tasks are materialized; do not let this plan become a shadow task system
- do not route reusable learning into KES or `ak knowledge` until the slice actually lands and produces real evidence
- do not invoke Oracle / DSPx as current authority; that remains downstream empirical follow-through only

## AK task materialization status

The bounded AK task family for this first slice is now materialized and linked to `decision:18`.

Current task family:

- `#1806` — `[UMBRELLA] Implement first bounded self-hosting slice for pi-autoresearch`
- `#1807` — `SH-1 — validate self-hosting contract and evaluator lock artifacts`
- `#1808` — `SH-2 — implement controller/candidate execution isolation for self-hosting`
- `#1809` — `SH-3 — implement snapshot-owned evaluator entrypoints for self-hosting`
- `#1810` — `SH-4 — implement self-hosting applicability classification gates`
- `#1811` — `SH-5 — implement self-hosting promotion and rollback record`

Dependency shape now encoded in AK:

- umbrella `#1806` depends on `#1807-#1811`
- `#1808` depends on `#1807`
- `#1809` depends on `#1807` and `#1808`
- `#1810` depends on `#1809`
- `#1811` depends on `#1810`

Decision/runtime posture now encoded in AK:

- all six tasks are linked to `decision:18` as `post_adr_execution`
- decision `18` has been reevaluated for those tasks and is now `unblocked`

Interpretation rule:

- this plan is now both execution memory and the narrative companion to a live AK task family
- future executors should use the AK task family as the executable leaf queue rather than re-deriving work from this document alone

## Expected follow-on after this plan lands

After this first slice lands, the next truthful move is not broader autonomy.
It is validating whether the bounded self-hosting contract is actually useful in practice before widening further.

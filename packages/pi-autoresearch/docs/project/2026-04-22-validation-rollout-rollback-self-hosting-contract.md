---
summary: "Validation, rollout, and rollback note for the first bounded self-hosting slice in pi-autoresearch: keep evaluator entrypoints snapshot-owned, promotion external, and rollback explicit while staging the new campaign type conservatively."
read_when:
  - "After ADR acceptance for decision 18 and before claiming the first self-hosting slice is safe to roll out."
  - "When you need the minimum truthful rollout and rollback posture for bounded self-hosting."
type: "reference"
---

# Validation / rollout / rollback — first bounded self-hosting slice for `pi-autoresearch`

## Validation posture

The first self-hosting slice is only truthful if all of the following are proven:

1. candidate runtime code is not imported into the active controller process during Stages 0-2
2. evaluator lock/hash drift fails closed
3. candidate-owned package-manager scripts and wrapper commands cannot redefine snapshot-owned evaluator entrypoints
4. off-limits path mutation is rejected
5. applicability outcomes obey the accepted thresholds and coverage rules
6. promotion/rollback records cannot imply package-local self-promotion

## Unit-to-proof mapping

### SH-1 — schema and lock artifact truth

Required proof:
- invalid `autoresearch.self-hosting.json` shapes fail closed
- invalid evaluator lock shapes fail closed

Evidence shape:
- focused schema tests
- negative-path fixtures

Current proof status:
- landed locally via `packages/pi-autoresearch/tests/self-hosting.test.ts`
- current coverage proves valid contract/lock loading plus invalid scope, evaluator, applicability, promotion, and snapshot-entrypoint shapes fail closed

### SH-2 — controller/candidate isolation

Required proof:
- candidate runtime modules are not imported into the controller process during Stages 0-2
- candidate worktree preparation respects exact path fences and rejects off-limits mutation

Evidence shape:
- focused isolation tests
- failure-path tests for scope violations

### SH-3 — snapshot-owned evaluator entrypoints

Required proof:
- evaluator entrypoints always resolve from the controller-owned snapshot
- same-named evaluator files inside the candidate worktree do not redefine the judge
- candidate-owned package-manager commands and wrappers are rejected as evaluator truth

Evidence shape:
- focused evaluator-resolution tests
- hash-drift negative paths
- candidate-dispatch negative paths

### SH-4 — applicability classification

Required proof:
- `reject`, `variant_candidate`, and `default_promotion_candidate` are emitted only under the accepted thresholds
- `variant_candidate` requires declared `variantTargetProfile`
- `default_promotion_candidate` is blocked when minimum transfer coverage is missing

Evidence shape:
- focused classification tests
- coverage-rule fixtures

### SH-5 — promotion/rollback record

Required proof:
- promotion readiness cannot be reported without approvals and rollback target
- rollback updates the record truthfully and preserves the controller-restoration path

Evidence shape:
- promotion-record tests
- rollback-record tests

## Rollout posture

Use a conservative staged rollout:

### Stage 0 — controller-only artifact landing
- land schemas and contract parsing
- no candidate mutation yet
- no evaluator execution yet

### Stage 1 — isolated candidate execution
- allow bounded controller-subprocess-against-candidate evaluation
- keep promotion disabled
- fail closed on any command path that resolves through candidate-owned evaluator dispatch

### Stage 2 — applicability classification
- allow reject / variant / default-promotion-candidate classification
- still keep controller rotation external and manual

### Stage 3 — explicit promotion/rollback record
- allow external operator/orchestrator gate to record promotion readiness and rollback target
- still no automatic self-promotion

Interpretation rule:

- passing Stage 2 does not authorize controller rotation by itself
- Stage 3 still records readiness, not self-sovereign package authority

## Rollback posture

Rollback is required when any of the following becomes true after promotion:

- post-promotion verification suites fail
- real operator use reveals a regression that violates the promotion contract
- evaluator or promotion evidence is later shown to be incomplete or misleading

Rollback means:

1. restore `rollbackControllerRef` as active controller
2. update `autoresearch.self-hosting.promotion.json`
3. update the corresponding AK decision/task evidence
4. rerun post-promotion verification against the restored controller

## Failure-handling posture before promotion

When a bounded self-hosting campaign fails before promotion:

- keep the controller unchanged
- preserve or clean up the candidate worktree according to `candidate.onFailureDisposition`
- preserve receipts/evidence even if the worktree is cleaned up
- do not reinterpret failure as proof that the package should widen into stronger automation

## Knowledge and compression posture

- explicit knowledge exit classification: `none` for now
- do **not** create KES or `ak knowledge` packets until real implementation/use evidence exists
- compression targets for the first slice remain:
  - this validation note
  - `packages/pi-autoresearch/docs/project/2026-04-22-plan-self-hosting-contract-first-slice.md`
  - `packages/pi-autoresearch/docs/project/current-vs-target.md`
  - `ak decision passport 18`
- Oracle / DSPx remain later empirical follow-through only

## Minimal verification commands

At minimum, keep docs validation green and pair it with focused implementation tests once code lands:

```bash
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/pi-autoresearch/docs --strict
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs --strict
```

Implementation-phase tests should then prove the architecture invariants named above.

## AK execution alignment

The live AK task family for scaled execution is now materialized and aligned to SH-1 through SH-5:

- `#1806` umbrella
- `#1807` SH-1
- `#1808` SH-2
- `#1809` SH-3
- `#1810` SH-4
- `#1811` SH-5

Those tasks are linked to `decision:18`, reevaluated as `still_valid`, and the decision is now `unblocked`.

Interpretation rule:

- this validation note is no longer waiting for task materialization
- the next truthful move after this note is implementing the bounded task family while preserving the proof obligations recorded here

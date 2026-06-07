---
summary: "Appendix for the pi-autoresearch supervised self-hosting RFC: worked examples, first implementation slices, and open questions."
read_when:
  - "You are changing the pi-autoresearch supervised self-hosting RFC examples, implementation slices, or open questions."
  - "You need worked examples for self-hosting applicability classification before changing self-hosting behavior."
type: "reference"
---

# Appendix — supervised self-hosting RFC

Canonical RFC: [2026-04-22-pi-autoresearch-self-hosting-rfc.md](2026-04-22-pi-autoresearch-self-hosting-rfc.md)

## Q) Worked examples

### Example 1 — `reject`

Scenario:

- candidate improves one local benchmark for manifest-campaign planning
- but a critical holdout suite covering finalization freshness fails

Outcome:

- `reject`

Why:

- a critical holdout failure means the candidate is not even safe as a specialized win under this contract

### Example 2 — `variant_candidate`

Scenario:

- campaign declares `variantTargetProfile = fast_local_self_hosting_analysis`
- candidate improves that declared profile
- all critical suites pass
- transfer suites for ordinary repo-local campaigns are slightly worse but still within the declared non-critical budget
- the gain is real but not broad enough to justify replacing the default package behavior

Outcome:

- `variant_candidate`

Why:

- the change is useful, but only truthfully as an opt-in mode/profile

### Example 3 — `default_promotion_candidate`

Scenario:

- candidate improves the declared primary metric beyond the default-promotion threshold
- all critical dev/holdout/transfer suites pass
- transfer coverage includes both `package_non_self_hosting` and `operator_consumer`
- non-critical transfer regression stays within budget
- evaluator lock is unchanged
- promotion record and rollback target are complete

Outcome:

- `default_promotion_candidate`

Why:

- this is the minimum evidence that the candidate improved the package broadly enough to justify external promotion review

## U) Suggested first implementation slices

If this RFC is accepted, the next bounded slices should be:

### Slice 1 — self-hosting contract + evaluator lock schema

Implement:

- `autoresearch.self-hosting.json` validator
- `autoresearch.self-hosting.evaluator.lock.json` validator
- negative-path tests for invalid scope/evaluator/promotion shapes

### Slice 2 — controller/candidate execution isolation

Implement:

- bounded candidate worktree/branch preparation
- exact allowed-path fences for `packages/pi-autoresearch`
- controller-subprocess-against-candidate execution discipline
- negative-path tests for candidate runtime bleed-through

### Slice 3 — snapshot-owned evaluator entrypoints + applicability gates

Implement:

- explicit dev / holdout / transfer suite profiles
- critical/non-critical suite classification
- snapshot-owned evaluator entrypoints
- typed applicability thresholds and outcome classification
- fail-closed behavior when evaluator lock drifts or when candidate-owned dispatch tries to redefine the judge

### Slice 4 — promotion/rollback record + supervised handoff

Implement:

- `autoresearch.self-hosting.promotion.json`
- explicit external approval recording
- rollback target capture and rollback record updates
- no direct package self-promotion

### Slice 5 — adapted finalization/supervision surfaces

Implement:

- bounded reuse of finalization/materialization for successful candidates
- orchestrator/operator-facing supervision above self-hosting campaigns
- clear runtime/help/status wording for reject / variant / default-promotion outcomes

## V) Open questions that remain real after this RFC

These are real later decision questions, not unresolved core contradictions:

1. should the evaluator snapshot live in a repo-local controller path, an exported AK snapshot path, or another controller-owned storage root by default?
2. should transfer suites in the first slice stay package-adjacent only, or should the `operator_consumer` coverage requirement expand beyond one minimal adjacent flow over time?
3. should later controller rotation remain fully manual, or is there a truthful future orchestrator-assisted but still explicit handoff path worth standardizing?
4. if later evidence justifies new Prompt Vault procedures, which decisions are durable enough to belong there instead of in typed code contracts?

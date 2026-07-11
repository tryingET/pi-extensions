---
summary: "Pi-owned pre-activation contract for deterministic SF14 Layer-12 readback presentation and later comprehension evidence."
read_when:
  - "Changing the Layer-12 generated-program readback presentation boundary."
  - "Preparing IW14-A presentation-policy evidence without selecting a policy."
system4d:
  container: "Pi presentation adapter and evidence-shape boundary."
  compass: "Render AK truth without laundering display into authority."
  engine: "Validate closed readback -> derive fail-closed display -> preserve explicit non-authorizations."
  fog: "A polished display can falsely imply readiness, selection, or lifecycle permission."
---

# SF14 Layer-12 readback presentation contract

## Owner boundary

Pi owns presentation policy and rendering. AK remains the sole owner of canonical transition tokens, legality, replay/currentness, evaluation receipts, checker results, deterministic next action, and lifecycle authority. DSPx owns candidate publication, metrics/comparison, and empirical policy evidence.

The pure adapter in [`layer12-readback-presentation.ts`](../../src/runtime/layer12-readback-presentation.ts) performs no reads, writes, dispatch, activation, apply, policy selection, publication, or owner mutation. It validates the closed Task-C readback shape and renders it. It does not recompute or certify AK content identities; receipt authenticity remains an AK checker/import concern.

## Fail-closed rendering

The adapter requires:

- the exact V1 readback fields;
- all nine canonical checker kinds exactly once;
- content-reference-shaped identities and non-empty checker subjects;
- closed pass/fail/unavailable remediation posture;
- exact agreement between failed checker reasons and declared failure reasons;
- the complete six-item non-authorization inventory;
- a `null` recommendation.

Unknown fields, unknown enums, duplicate or missing gates, malformed identities, recommendation-bearing input, any aggregate action other than the closed non-authorizing `await_verified_selected_policy_owner_evidence`, or incomplete non-authorizations render `unavailable`. Failing checks render `blocked`; unavailable checks render `unavailable`. A fully passing, accepted/legal shape renders only `structurally_valid_non_authorizing`. Pi labels the aggregate action as an unauthenticated declared canonical field—not as an AK instruction—because Pi does not recompute AK receipt identities. None of these states grants readiness or authorization.

## Presentation evidence, not policy selection

[`layer12-presentation-evidence.v1.schema.json`](../../policy/layer12-presentation-evidence.v1.schema.json) closes the Pi-owned shape for later comprehension observations. The corresponding validator returns only:

- `structurally_valid_not_authorized`, or
- `invalid`.

The schema fixes `selection_status` to `not_selected` and requires explicit `no_activation`, `no_apply`, `no_policy_selection`, and `no_publication` declarations. Schema/validator conformance therefore establishes only that the inert Pi-owned contract exists for a later gate. It is not readiness, empirical evidence, a selected presentation policy, or permission to begin the during-wave shadow gate.

## Gate posture

This slice may satisfy the Pi-owned Task-E **pre-activation contract/checker conformance** obligation. It does not satisfy the during-wave comprehension evidence gate. That later gate requires active IW14-A, separately authorized shadow execution, owner-native receipts, and a separate policy-selection authorization.

## Rollback

Revert the scoped implementation commit. No extension is wired or installed by this slice, so rollback changes no live Pi runtime or external owner state.

---
summary: "IW14-A G3 Pi-owned deterministic presentation shadow evidence, explicitly without policy selection."
read_when:
  - "Reviewing SF14 presentation evidence or the IW14-A G3 shadow gate."
system4d:
  container: "Pi-owned presentation evidence inside an active but separately gated IW14-A."
  compass: "Measure deterministic presentation comprehension without laundering it into authority or policy."
  engine: "Freeze cases and evaluator -> execute pure adapter -> content-address receipts -> verify every identity."
  fog: "Synthetic exact-match evidence can be overread as human comprehension or policy-selection authority."
---

# SF14 Layer-12 presentation shadow evidence

## Gate and boundary

IW14-A was active before this separately scoped G3 run. This run exercises the pure Pi presentation adapter from Task E commit `a008c134`; it does not install, reload, or wire a live extension.

Pi owns the rendered presentation and this comprehension-shadow receipt. AK remains authority for canonical readback, legality, currentness, next action, and lifecycle permission. DSPx remains authority for empirical policy comparison and selection evidence. The run does not mutate either owner.

## Preregistered slice

The checked-in case corpus contains three **Pi-synthetic** closed shapes derived from the canonical Task-C `layer12-replay-readback.v1` schema at commit `581276c`. They are adapter stimuli only: their content-shaped IDs, `authority: pass`, and `verifier_status: legal` fields are not AK-issued receipts or claims of actual legality. The corpus records `fixture_authority=pi_synthetic_shape_only` and `source_legality_claimed=false`:

1. all canonical checks pass, producing `structurally_valid_non_authorizing`;
2. currentness fails with `stale_observation`, producing `blocked`;
3. selected-policy evidence is unavailable, producing `unavailable`.

Before result capture, the preregistration fixes the three case identities, exact-match scoring, evaluator identity, timestamp, and non-authorizations. The evaluator is deliberately a **synthetic deterministic machine evaluator**. Its score answers only whether the adapter's display status and `authorizationGranted=false` match each preregistered answer. It is not human-comprehension evidence and not global empirical policy evidence.

## Result

The executable checker recomputes the corpus, preregistration, rendered variant, evaluator receipt, presentation-evidence, and aggregate result identities. The policy-candidate identity also binds the actual bytes of the imported/executed adapter, so changed adapter code invalidates the checked-in result. All three cases matched, for a mean synthetic comprehension score of 100.

Canonical checked-in result references:

- shadow result: `sha256:e8645e59c78245b027c1cef5bccfa4e96443accaa8d9616d094f007e617c8509`
- presentation evidence: `sha256:8573425ab9bbae86e32aa0f89ff5db374908e23932a9e0abd420a406ebb47704`

Run the owner-native checker with:

```bash
node packages/pi-society-orchestrator/scripts/check-layer12-presentation-shadow.mjs
node --test packages/pi-society-orchestrator/tests/layer12-presentation-shadow.test.mjs
```

## Non-authorizations

Every preregistration, evidence, and result surface fixes:

- `no_activation`
- `no_apply`
- `no_policy_selection`
- `no_publication`

The result's selection status is `not_selected`; aggregate policy selection is `not_authorized`. It does not claim AK legality, DSPx recommendation, owner action, promotion, public publication, dogfood, rollout, or closeout.

## Rollback

Revert the six Task 3724 paths. No live Pi runtime or external owner state was changed.

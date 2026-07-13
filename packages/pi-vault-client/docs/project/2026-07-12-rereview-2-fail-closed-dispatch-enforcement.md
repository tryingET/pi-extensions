---
summary: "Formal adversarial rereview attempt 2; outcome revise_rfc for remaining composite, claim, identity, and rollout gaps."
read_when:
  - "Tracing the review lineage for fail-closed Vault dispatch."
type: "review-memo"
review_attempt: 2
review_outcome: "revise_rfc"
system4d:
  container: "Second independent review of revised dispatch-enforcement architecture."
  compass: "Require executable identity and rollout contracts, not only strong intent."
  engine: "Verify attempt-1 closure -> attack residual cardinality/race/identity/rollout gaps -> require revision."
  fog: "Aggregate identity can still hide multiple incompatible executor bindings."
---

# Review Attempt 2 — Fail-Closed Prompt Vault Dispatch Enforcement

## Outcome

**`revise_rfc`**

Revision 2 closed the legacy V1 bypass, projection ownership, and durable handoff at decision level. Four blockers remained.

## Remaining blockers

1. **Composite binding cardinality** — aggregate identity still carried one binding without defining multiple dispatch-required members. Required: identical composite-capable binding or `incompatible_bindings` block.
2. **Single-use claim race** — authorization was consumed after host invocation. Required: atomic `issued -> claimed` transition before every persistence/host side effect; every failure terminal.
3. **Incomplete identity/eligibility** — controlled vocabulary and exact export eligibility were not fully bound. Required: hash raw governed metadata without permissive defaults and require exact `export_to_pi === true` for executable surfaces.
4. **Non-mechanical rollout ordering** — routes/grounding were inaccurately described, ingress channels were not enumerated, divergence closure was subjective, and installed proof followed package enforcement. Required: exact channel matrix, objective closure evidence, disabled enforcement build, installed proof, then activation.

## Required ADR constraints if later review succeeds

- canonical-byte equality for composite bindings;
- private issuer-state validation and atomic claim;
- full raw metadata and eligibility identity;
- one named final guard per concrete ingress;
- durable pre-handoff failure blocks;
- executor outcome remains executor-owned;
- projection evidence and installed proof precede activation;
- rollback reaches only blocked/quarantined posture.

## Revision response

The next RFC revision added the required composite-binding rule, atomic claim state machine, controlled-vocabulary/export identity, exact ingress matrix, objective divergence closure, and reordered activation gates.

## Non-authorizations

This review did not authorize ADR recording or implementation.

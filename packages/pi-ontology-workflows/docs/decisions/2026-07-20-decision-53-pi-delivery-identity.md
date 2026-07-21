---
summary: "Pi-owner decision defining pi-ontology-workflows as the semantic-delivery attester component without creating a standalone pi-adapter repository."
read_when:
  - "Changing Decision 53 Pi delivery identity, host witnessing, or semantic-release delivery integration."
  - "Evaluating whether pi-ontology-workflows should become a separate adapter product."
system4d:
  container: "Pi-owner product and protocol-identity decision."
  compass: "Bind delivery claims to the real component while keeping host execution, semantics, adoption, and recovery authority separate."
  engine: "Owner decision -> successor protocol review -> default-off implementation -> isolated Pi-host dogfood."
  fog: "A fixture role label or host runtime can be mistaken for a repository product or complete delivery authority."
type: "decision"
status: "proposed"
---

# Decision — Pi semantic-delivery component identity

## Context

Decision 53 protocol v0 names an exact `local://softwareco/pi-adapter` repository. No such product, repository, package, capability-map entry, release surface, or independent owner lifecycle exists. The identity originated as a fixture issuer label and was later promoted into a repository tuple while exact-issuer security checks were being hardened.

The implemented Pi-side surface already lives in the `pi-extensions` repository as `packages/pi-ontology-workflows`. Its package manifest, product vision, stable-core/thin-adapter ADR, implementation plan, and delivery implementation all place ontology workflow and Pi delivery behavior in this component.

Creating a standalone repository merely to satisfy the accepted fixture would add an unsupported product and authority boundary. Silently treating the existing package as `local://softwareco/pi-adapter` would instead falsify the accepted identity. A reviewed successor protocol is required.

## Decision

`@tryinget/pi-ontology-workflows` is the Pi-side ontology workflow and semantic-delivery attester component. No standalone `pi-adapter` repository is created.

The owner-issued identity model is:

```json
{
  "repository": {
    "owner": "pi-owner",
    "repository_id": "pi-extensions",
    "canonical_locator": "local://softwareco/owned/pi-extensions",
    "identity_revision": 1
  },
  "component": {
    "component_id": "pi-ontology-workflows",
    "repository_path": "packages/pi-ontology-workflows",
    "identity_revision": 1
  },
  "package": {
    "package_id": "@tryinget/pi-ontology-workflows",
    "identity_revision": 1
  },
  "protocol_issuer": {
    "kind": "pi_extension_component",
    "id": "@tryinget/pi-ontology-workflows",
    "role": "semantic_pi_delivery_attestor"
  }
}
```

Repository, component, package, protocol role, runtime host, loaded component digest, and execution instance are separate identity axes. A successor protocol must bind them independently and reject coherent substitution of any axis.

## Product boundary

This component owns:

- the stable Pi-side ontology workflow core and explicit workflow contracts;
- thin Pi, ROCS, workspace, and formatting adapters;
- ontology inspection/change UX and development semantic-preflight integration;
- bounded `delivered`, `suppressed`, and `failed` semantic-delivery attestations;
- component-side validation of the generation, scope, freshness, and prompt-run bindings required by those attestations.

This component does not own:

- ontology meaning, release approval, trust, publication, or semantic authority;
- consumer intent, acceptance, activation, adoption, use, or influence;
- AK task, decision, evidence, or lineage authority;
- Pi host runtime identity or final provider transmission;
- recovery policy or the independent recovery controller.

## Runtime-host witness

Pi host identity is not the receipt issuer. For each delivery attempt, the component may include a host-owned witness obtained only from immutable host context. The witness binds:

- host package and version provenance;
- extension API version;
- the closed, canonically sorted capability tokens required for the operation;
- loaded component digest and extension generation when supplied by the host;
- witness scope `runtime_host_capability_only_no_receipt_issuance`.

The host witness proves only that the host exposed the required execution boundary. It does not establish semantic approval, consumer consent, adoption, influence, or production authorization.

## Delivery claim

A `delivered` attestation may be sealed only after the actual Pi prompt-chain adapter reports successful insertion for the bound prompt run. Preparing bytes or requesting insertion is insufficient. Failure, cancellation, stale generation, deadline equality, missing host witness, incompatible capabilities, or unsuccessful insertion cannot produce `delivered`.

The narrow claim is component delivery into the Pi prompt chain. It is not proof of final provider transmission or downstream model influence.

## Protocol and compatibility posture

- Introduce `semantic-pi-delivery-receipt.v1` and digest domain `semantic-release.pi-delivery.v1` through a reviewed successor to Decision 53.
- Preserve v0 artifacts as history; do not silently edit their accepted identity.
- Runtime validation rejects v0 delivery receipts after the successor implementation lands.
- No compatibility alias maps `pi-adapter` to this component.
- Generated machine artifacts change only through their owning generators and independent validators.
- Delivery remains default-off and `live_acquisition_implemented=false`.

## D2E posture

The first executable proof is an isolated, one-shot, explicit Pi-host dogfood. It must load this exact component, obtain the actual host witness, perform one prompt-chain insertion, seal one receipt afterward, prove a second attempt is suppressed, and emit explicit negative assertions for publication, activation, adoption, use, and production authority.

This proof is not a production canary. Live D2E remains blocked until an independently owned product consumer, owner consent, operator-named canary, and correctly scoped independent recovery controller exist.

## Extraction triggers

A standalone adapter repository may be proposed only when at least one independently reviewed boundary exists:

- independent deployment;
- independent secrets or privileges;
- independent owner;
- independent release cadence or consumers;
- separate compromise containment;
- separate rollback or availability obligations.

Absent such evidence, extraction is architecture without a product.

## Consequences

- Decision 53 v0 remains historical and blocked for live use.
- A new cross-repo architecture decision must review and accept the successor identity/protocol before default-off implementation replaces v0.
- The package public surface remains compact; dogfood authorization is explicit and one-shot rather than a normal always-on command or default.
- Pi host and component attestations remain separable and independently falsifiable.

## Non-authorizations

This decision does not authorize live owner acquisition, semantic publication, consumer adoption, activation, defaults, startup enforcement, fleet rollout, or recovery execution. It issues only the Pi-owner product/component identity and the boundary required for successor protocol review.

## Rollback

Before successor acceptance, rollback is deletion or rejection of this proposed decision with no runtime effect. After acceptance, replacement requires a later Pi-owner decision and a reviewed successor protocol; history is preserved.

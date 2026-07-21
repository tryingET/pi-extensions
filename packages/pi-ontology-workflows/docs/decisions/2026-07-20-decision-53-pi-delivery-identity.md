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
status: "accepted"
---

# Decision — Pi semantic-delivery component identity

## Context

Decision 53 protocol v0 names an exact `local://softwareco/pi-adapter` repository. No such product, repository, package, capability-map entry, release surface, or independent owner lifecycle exists. The identity originated as a fixture issuer label and was later promoted into a repository tuple while exact-issuer security checks were being hardened.

The implemented experiment already lives in the `pi-extensions` repository as `packages/pi-ontology-workflows`, and the manifest establishes that repository/package topology. The current vision, foundation, and stable-core/thin-adapter ADR authorize ontology inspection/change workflows but do not yet authorize semantic-delivery attestations. This decision therefore proposes an explicit product-boundary expansion consistent with the stable-core rule; those product documents must be reconciled after successor acceptance and before implementation.

Creating a standalone repository merely to satisfy the accepted fixture would add an unsupported product and authority boundary. Silently treating the existing package as `local://softwareco/pi-adapter` would instead falsify the accepted identity. A reviewed successor protocol is required.

## Decision

`@tryinget/pi-ontology-workflows` is the Pi-side ontology workflow and semantic-delivery attester component. No standalone `pi-adapter` repository is created.

The owner-issued identity model is:

```json
{
  "governance_owner_role": "pi-owner",
  "repository": {
    "repository_id": "pi-extensions",
    "canonical_source_locator": "git+https://github.com/tryingET/pi-extensions.git",
    "workspace_projection": "local://softwareco/owned/pi-extensions",
    "identity_revision": 1
  },
  "component": {
    "component_id": "pi-ontology-workflows",
    "repository_path": "packages/pi-ontology-workflows",
    "identity_revision": 1
  },
  "package_artifact": {
    "package_name": "@tryinget/pi-ontology-workflows",
    "version_and_digest_required_per_receipt": true
  },
  "protocol_issuer": {
    "kind": "pi_extension_component",
    "id": "pi-ontology-workflows",
    "role": "semantic_pi_delivery_attestor"
  }
}
```

The manifest repository URL is canonical source provenance. The workspace locator is an AI Society projection used for local routing; it is not substituted for source provenance. `pi-owner` is a governance role, not a Git hosting namespace or repository owner string.

Repository, component, package, protocol role, runtime host, loaded component digest, and execution instance are separate identity axes. A successor protocol must bind them independently and reject coherent substitution of any axis.

## Product-boundary expansion

Subject to successor acceptance and reconciliation of the package vision, foundation, and stable-core ADR, this component owns:

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

## Host context and future host witness

Pi host identity is not the receipt issuer. Current immutable `ctx.hostCapabilities` is component-observed host-context evidence, not an independently verifiable host-issued witness. Its closed v1 evidence is limited to:

- host package and version provenance;
- extension API version `1.0.0`;
- canonically sorted tokens `prompt.system.chain.v1`, `session.lifecycle.reason.v1`, `session.shutdown.v1`, `ui.confirm.timeout.v1`, and `ui.mode.v1`.

Current Pi does not supply a loaded-component digest, component generation provenance, or post-application insertion acknowledgement. The component must mark those facts unavailable and cannot manufacture them from its path, package manifest, callback return, prepared bytes, or immutable context.

A future host-issued delivery witness requires a separately reviewed immutable host contract that binds the loaded component digest, execution generation, prompt-run attempt, and successful prompt-chain application. That witness remains capability/execution evidence only; it does not establish semantic approval, consumer consent, adoption, influence, or production authorization.

## Delivery claim

A `delivered` attestation may be sealed only after a reviewed Pi host contract issues post-application acknowledgement for the bound prompt run. No such host observation exists today. Until it exists, the component may produce only proposal/preparation evidence or `suppressed`/`failed` outcomes; it cannot truthfully issue `delivered`. Preparing bytes, returning a modified prompt, or requesting insertion is insufficient. Failure, cancellation, stale generation, deadline equality, missing acknowledgement, incompatible capabilities, or unsuccessful insertion cannot produce `delivered`.

The narrow claim is component delivery into the Pi prompt chain. It is not proof of final provider transmission or downstream model influence.

## Protocol and compatibility posture

- Introduce `semantic-pi-delivery-receipt.v1` and digest domain `semantic-release.pi-delivery.v1` through a reviewed successor to Decision 53.
- Preserve v0 artifacts as history; do not silently edit their accepted identity.
- Runtime validation rejects v0 delivery receipts after the successor implementation lands.
- No compatibility alias maps `pi-adapter` to this component.
- Generated machine artifacts change only through their owning generators and independent validators.
- Delivery remains default-off and `live_acquisition_implemented=false`.

## D2E posture

This decision does not authorize dogfood. After successor-protocol acceptance, a separate one-shot Pi-owner test authorization may permit an isolated Pi-host proof. `isolatedDogfood: true`, fixtures, callback return values, and prepared bytes are never authorization or insertion evidence.

Executable delivery dogfood remains blocked until Pi provides the reviewed post-application witness contract. Once available, the proof must load the exact component artifact, bind its digest, receive one host acknowledgement, seal one receipt afterward, prove a second attempt is suppressed, and emit explicit negative assertions for publication, activation, adoption, use, and production authority.

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
- The package public surface remains compact; any future dogfood authorization is a separate owner artifact, explicit and one-shot rather than a constructor flag, normal command, or default.
- Pi host and component attestations remain separable and independently falsifiable.

## Non-authorizations

This decision does not authorize live owner acquisition, semantic publication, consumer adoption, activation, defaults, startup enforcement, fleet rollout, or recovery execution. It issues only the Pi-owner product/component identity and the boundary required for successor protocol review.

## Review evidence

- Independent Pi-owner review: `ACCEPT`, dispatch `dispatch-1784658092396`.
- Separate Pi-owner review: `ACCEPT`, dispatch `dispatch-1784658106914`.
- Both reviews bind corrected commit `83b9e1eefa7938a735665087cd7a061459100a8c` and explicitly grant no implementation, dogfood, or live authority.

## Rollback

Before successor acceptance, rollback is deletion or rejection of this proposed decision with no runtime effect. After acceptance, replacement requires a later Pi-owner decision and a reviewed successor protocol; history is preserved.

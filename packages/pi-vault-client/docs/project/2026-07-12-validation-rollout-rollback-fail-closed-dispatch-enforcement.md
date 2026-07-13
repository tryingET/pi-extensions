---
summary: "Validation, rollout, activation, and rollback gates for fail-closed Prompt Vault dispatch enforcement."
read_when:
  - "Validating or activating the implementation wave under decision 56."
type: "reference"
decision_id: 56
system4d:
  container: "Acceptance and operational safety contract for dispatch enforcement."
  compass: "No enforcement claim or activation before source, packed, projection, and installed behavior agree."
  engine: "Fixtures -> shadow -> remediation -> disabled build -> packed/installed proof -> activation -> canary."
  fog: "A passing unit suite can coexist with an installed or projected bypass."
---

# Validation / Rollout / Rollback — Fail-Closed Prompt Vault Dispatch Enforcement

## Validation layers

### Source/package

From `packages/pi-vault-client`:

```bash
npm run docs:list
npm run typecheck
npm run check
npm run release:check
```

The implementation wave must add targeted tests for:

- every ingress/channel named by the ADR;
- missing/partial/invisible/inactive/export-ineligible templates;
- unknown and future semantic values;
- complete controlled-vocabulary identity;
- aggregate grounding and route composition;
- incompatible and mutable bindings;
- forged, reused, concurrent, and reentrant authorization IDs;
- identity drift between prepare and handoff;
- durable receipt failure;
- executor rejection/failure/timeout/cancellation;
- V1 no-raw-text behavior;
- emergency disable-to-blocked behavior.

### Generated and packed artifact

- runtime generation leaves the package tree unchanged;
- packed JS/declarations expose the documented union and no stale V1 bypass;
- a clean external consumer imports only public entrypoints;
- package contents contain no test residue, backups, local file dependencies, or unpublished source-only assumptions.

### Projection-owner proof

Required before activation:

- Prompt Vault owner task/evidence reference;
- current export receipt;
- disposition inventory of export-eligible templates;
- proof that raw gated/unknown/unbound projections are absent;
- rollback-to-quarantine proof.

### Installed Pi proof

1. install the actual local package path;
2. reload Pi;
3. exercise `/vault`, live trigger, routes, grounding, both prompt-plane methods through a consumer harness, and public adapters;
4. attempt direct projected invocation;
5. prove gated-disabled behavior;
6. enable enforcement explicitly;
7. repeat bypass canary;
8. disable and prove rollback reaches blocked, never advisory execution.

## Rollout gates

### Gate 0 — inventory complete

Every active visible executable candidate has a deterministic disposition. Unknown semantics are zero.

### Gate 1 — shadow complete

Shadow lasts at most seven days. Every channel and active gated template is exercised. Every divergence has:

- stable ID;
- owner;
- reproduction;
- regression test;
- code/metadata remediation or accepted RFC revision.

Zero unsafe divergence remains.

### Gate 2 — owner remediation complete

Every gated template has one approved binding or is quarantined. Binding registry and export receipt are current.

### Gate 3 — enforcement build complete but disabled

V1/V2 and all package channels fail closed. Durable pre-handoff receipts are proven. Default gated behavior remains blocked until activation.

### Gate 4 — packed and installed proof complete

Packed consumer and installed/reloaded Pi canaries pass. Projection bypass is absent.

### Gate 5 — activation

Activation requires explicit operator action after Gates 0–4. Record:

- package/version/commit;
- binding registry ID;
- ontology/schema version;
- projection receipt ID;
- installed canary result;
- activation timestamp.

Post-activation canary must pass before any consumer rollout claim.

## Failure and rollback

Any unsafe divergence, stale projection, binding drift, receipt durability failure, installed mismatch, or post-activation canary failure triggers rollback.

Rollback means:

- enable `disable_gated_dispatch`;
- all `dispatch_required` candidates become blocked;
- validated `text_ready` remains available;
- projection quarantine remains in force;
- V1 remains fail-closed;
- record operator-visible diagnostics and governance receipt;
- require re-preparation after remediation.

Forbidden rollback:

- restoring raw gated prepared text;
- treating missing/unknown as text-safe;
- re-exporting raw gated prompts;
- suppressing failed receipt durability;
- claiming executor completion from legacy `success=true` prompt rows.

## AK closeout evidence

Each wave leaf records exact command/artifact/live-proof evidence in AK. The wave closes only when:

- all owner tasks are complete or explicitly deferred by the owning authority;
- decision `56` remains accepted/unblocked;
- direction and packet checks pass;
- package, packed, projection, and installed evidence are current;
- no activation or publication claim exceeds the proven surface.

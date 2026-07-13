---
summary: "Post-ADR implementation-wave plan for fail-closed Prompt Vault dispatch authorization."
read_when:
  - "Planning or executing the implementation wave under decision 56."
type: "plan"
decision_id: 56
system4d:
  container: "Bounded implementation decomposition for accepted dispatch enforcement."
  compass: "Land enforcement in independently falsifiable owner-bounded leaves and activate only after installed proof."
  engine: "Core authorization -> ingress adoption -> projection handoff -> installed proof -> activation."
  fog: "Combining all owners into one task would hide incomplete projection or executor evidence."
---

# Implementation Plan — Fail-Closed Prompt Vault Dispatch Enforcement

## Governing decision

- AK decision: `56` (`accepted`, `unblocked`)
- design packet: `pi-vault-fail-closed-dispatch-v1`
- implementation wave: `IW6` (`next`)
- ADR: [Fail-Closed Prompt Vault Dispatch Enforcement](../adr/2026-07-12-fail-closed-dispatch-enforcement.md)
- Leaf A task: `3847`
- Leaf B task: `3848` (depends on `3847`)
- Leaf C cross-owner task: `3850` in `core/prompt-vault`
- Leaf D task: `3849` (depends on `3848` and `3850`)

The decision and post-ADR pack are now unblocked. `IW6` remains `next`; activation of the wave or a task still requires an explicit execution choice rather than being implied by ADR recording.

## Wave objective

Make dispatch posture mandatory at every supported `pi-vault-client` execution channel without moving executor lifecycle, Prompt Vault projection, ROCS semantics, or AK authority into the package.

## Leaf A — Authorization core

**Owner:** `pi-vault-client`

Scope:

- replace mutable global bindings with a validated frozen policy instance;
- introduce aggregate `DispatchAuthorizationV1` and private issuer state;
- validate raw governed metadata without permissive defaults;
- require exact export eligibility;
- implement canonical identities and sealed prepared bytes;
- implement atomic single-use claim;
- correct missing/partial `ready` behavior;
- make V1 block non-text dispositions without `prepared_text`.

Primary seams:

- `src/dispatchPosture.ts`;
- `src/dispatchRuntime.ts`;
- `src/promptPlane.ts`;
- public declarations/exports;
- focused authorization tests.

Done when adversarial tests cover unknown values, partial batches, mutable bindings, forged IDs, concurrent claims, identity drift, mixed composites, incompatible bindings, and V1 behavior.

## Leaf B — Ingress enforcement and durable handoff

**Owner:** `pi-vault-client`

Scope:

- guard `/vault` editor/send paths;
- guard `/next-10-expert-suggestions` and fixed commands;
- guard direct input transforms and live picker submission;
- guard `/route` and grounding/framework composition;
- guard prompt-plane selection/continuation and public adapters;
- add durable pre-handoff authorization receipts;
- require executor citation of Vault handoff UUID;
- label legacy success as prompt-event truth only.

Primary seams:

- `src/vaultCommands.ts`;
- `src/vaultPicker.ts`;
- `src/vaultGrounding.ts`;
- `src/promptPlane.ts`;
- `src/vaultReceipts.ts` and minimal durability support;
- extension/public adapter entrypoints.

Done when no package-owned ingress can release raw executable text for a gated or invalid candidate and receipt failure blocks gated handoff.

## Leaf C — Prompt Vault projection-owner handoff

**Owner:** `core/prompt-vault`; tracked as an explicit cross-owner task/handoff.

Scope:

- inventory active export-eligible templates by disposition;
- quarantine gated/unknown/malformed/unbound templates from raw `.md` export, or separately decide a host-gated projection format;
- emit an export receipt proving projection contents;
- define rollback to quarantine;
- provide evidence consumable by `pi-vault-client` diagnostics.

`pi-vault-client` may add read-only verification but must not mutate owner-managed projection files as if it owned them.

Done when current owner evidence proves no raw gated projection is invokable.

## Leaf D — Packed/installed proof and release hardening

**Owner:** `pi-vault-client` plus Pi operator for reload/canary.

Scope:

- test packed JavaScript, declarations, and public exports from a clean consumer;
- install package into Pi and reload;
- attempt all direct bypasses, including projected prompt invocation;
- prove disabled-build posture before activation and rollback-to-blocked after activation;
- add generated-runtime clean-tree assertion;
- clean test receipt residue and assert cleanup;
- update operator/release documentation.

Done when package checks, packed consumer tests, installed/reloaded canaries, projection evidence, and rollback canary all pass.

## Sequencing

```text
A authorization core
-> B package ingress enforcement
-> C projection-owner evidence (may proceed in parallel after ADR, but blocks activation)
-> D packed/installed proof
-> explicit enforcement activation
-> downstream consumer adoption tasks
```

C can execute in parallel with A/B under its own owner, but no activation claim is legal until A–D all close.

## Stop conditions

Stop and reopen decision review if implementation requires:

- multiple incompatible bindings in one composite execution;
- a per-member execution graph;
- moving executor lifecycle/outcome ownership into Vault;
- treating company context as authentication;
- changing Prompt Vault ontology/schema semantics;
- allowing non-exported templates to execute;
- restoring gated V1 raw text;
- replacing projection quarantine with an unreviewed host mechanism.

## Deferred follow-ups

Unless required for durable pre-handoff correctness, keep these separate:

- general receipt filesystem-permission hardening;
- general mutation commit-result redesign;
- continuation graph lineage;
- full multi-tenant authentication/service boundary;
- broad module decomposition;
- `pi-agent-run-contracts` extraction.

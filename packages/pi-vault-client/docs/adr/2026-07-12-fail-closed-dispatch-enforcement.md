---
summary: "Accepted architecture for fail-closed, identity-bound Prompt Vault dispatch authorization across pi-vault-client execution channels."
status: "accepted"
read_when:
  - "Implementing or changing Vault dispatch posture, prompt-plane execution, bindings, or authorization receipts."
  - "Reviewing decision 56 or its implementation wave."
type: "adr"
decision_id: 56
system4d:
  container: "Accepted enforcement boundary for governed Prompt Vault execution."
  compass: "A template executes only through the exact control mode, binding, identity, and surface authorized at handoff."
  engine: "Aggregate preparation -> fail-closed semantics -> exact identity -> atomic claim -> durable handoff -> owner-separated outcome."
  fog: "Legacy prepared text, composites, projections, and receipt vocabulary can reintroduce advisory bypasses."
---

# ADR — Fail-Closed Prompt Vault Dispatch Enforcement

## Status

Accepted for AK decision `56` after three serial adversarial review attempts; the controlling outcome is `ready_for_adr`.

This ADR records architecture. Implementation and activation remain governed by the post-ADR plan, wave tasks, and rollout gates.

## Context

`pi-vault-client` already owns template visibility, preparation, dispatch classification, receipts, and replay, but dispatch classification is advisory at several execution paths. Missing templates can appear ready, unknown metadata can fall through, mutable bindings can change future decisions, and authorization is not bound to exact execution identity.

The accepted 2026-04-10 prompt-plane ADR remains valid except where its generic V1 `ready + prepared_text` shape would allow non-text templates to execute as ordinary prompt text. This ADR explicitly amends that behavior.

## Decision

### 1. One mandatory package authorization boundary

Every package-owned execution channel must consume `DispatchAuthorizationV1` immediately before releasing executable text or calling an executor.

The only dispositions are:

- `text_ready`;
- `dispatch_required`;
- `blocked`.

Missing, invisible, inactive, export-ineligible, semantically unknown, malformed, partially resolved, mixed, unsupported, unbound, or identity-drifted candidates block.

### 2. Aggregate identity is the only execution subject

Authorization binds the primary template, every embedded governed member exactly once, preparation/wrapper identity, and final prepared bytes.

For multiple gated members, a first-version composite is lawful only when every member resolves to the same binding by canonical RFC 8785/JCS byte equality and that binding explicitly declares `compositeCapable: true`. Otherwise authorization blocks as `incompatible_bindings`.

No per-member execution graph is implied.

### 3. Exact canonical identity and eligibility

Executable authorization requires:

- positive non-null template ID/version;
- exact UTF-8 content bytes;
- complete raw governed metadata, including controlled vocabulary and `output_commitment`;
- exact boolean `export_to_pi === true`;
- ontology/schema, renderer, wrapper, context, and argument identity;
- resolved company, execution surface, and frozen policy registry identity;
- final prepared UTF-8 byte digest.

SHA-256 lowercase hexadecimal and RFC 8785/JCS canonical structured bytes are normative. Permissive DB parser defaults are forbidden for authorization.

### 4. Immutable binding policy

The active binding registry is validated, deep-cloned, deep-frozen, and deterministically identified at runtime construction. Only JCS-compatible data is accepted. Runtime overwrite, collisions, functions/accessors, unsupported numbers, mutable containers, and forged snapshots deny.

Dynamic mutation of the active registry is not part of this contract.

### 5. Single-use atomic claim before side effects

Authorization identity is private issuer state. Forged, unknown, claimed, or terminal IDs deny.

Immediately before handoff, the runtime revalidates every identity in a consistent read snapshot and atomically transitions `issued -> claimed` before any durable write, transformed-input release, or executor call. Exactly the sealed bytes and frozen binding just validated are handed off. Every later result is terminal; failures require re-preparation.

For input hooks, resolving with executable transformed text is the handoff point. Extension-source shortcuts may not bypass governed package adapters.

### 6. V1 is fail-closed; V2 makes disposition explicit

V1 remains compatible only for lawful `text_ready` templates. Every other disposition returns blocked and no executable `prepared_text`. V2 exposes the authorization union. V1 is deprecated at V2 release and may be removed only in a semver-major release after known consumers migrate.

### 7. One final guard per concrete ingress

Implementation must independently guard:

- `/vault` slash-command/editor submission;
- `/next-10-expert-suggestions` and other fixed prompt commands;
- direct input transforms;
- live picker submission;
- `/route` paths;
- grounding/framework composition;
- prompt-plane selection;
- prompt-plane continuation;
- public orchestrator/package adapters;
- Prompt Vault projected prompts.

Retrieval-only tools label posture but do not claim execution readiness.

### 8. Durable owner-separated receipts

Vault allocates and durably persists an authorization/handoff UUID before gated execution. Durability failure blocks. Current post-send JSONL and warning-only commit behavior do not satisfy this gate.

The executor must cite the Vault UUID and owns actual start/completion/failure/timeout/cancellation truth. Vault replay may correlate that receipt but never synthesize executor success. Existing `prompt_executions.success=true` means historical prompt-event recording, not executor outcome.

### 9. Projection remains Prompt Vault-owned

`core/prompt-vault` owns local prompt export/projection mutation. Gated or invalid templates must be quarantined from raw projection, or a separately accepted host-gated projection must exist. Prompt Vault owner evidence and a direct installed-Pi bypass test are required before enforcement activation.

### 10. Activation and rollback are asymmetric

The ordered rollout is inventory, bounded shadow observation, owner remediation, disabled enforcement build, packed/installed proof, activation, then consumer adoption.

Rollback may only disable gated execution to `blocked` and preserve projection quarantine. No flag or code rollback may restore raw gated execution.

## Authority boundaries

- `pi-vault-client`: preparation, authorization, handoff identity, authorization receipts, replay correlation.
- executor/orchestrator: runtime lifecycle and outcome receipt.
- Prompt Vault owner: governed template data and local projection/export policy.
- ROCS: controlled-semantic contract.
- AK: decision, task, wave, evidence, and lineage—not runtime execution.
- company context: cooperative local governance, not authenticated tenant isolation.

## Consequences

### Positive

- control metadata becomes executable policy rather than a warning;
- missing/unknown/partial paths fail closed;
- composite prompts cannot smuggle gated children into plain text;
- check/execution identity and receipt ownership become explicit;
- installed and projected behavior become activation gates.

### Costs

- V1 becomes stricter for gated templates;
- binding registry and preparation identity require refactoring;
- durable pre-handoff storage is mandatory;
- activation requires a cross-owner Prompt Vault projection task and live Pi proof.

### Residual limits

This remains cooperative in-process enforcement. It does not prevent hostile local code from bypassing package APIs or reading the database, and it does not create an atomic transaction spanning Dolt and an external executor.

## Supersession and non-goals

This ADR amends only the unsafe execution interpretation of the 2026-04-10 prompt-plane ADR. It does not move prompt-plane ownership, create authentication, introduce a composite execution graph, move executor lifecycle into Vault, create `pi-agent-run-contracts`, or authorize service/storage redesign.

## Validation anchors

- [Problem brief](../project/2026-07-12-problem-brief-fail-closed-dispatch-enforcement.md)
- [Evidence note](../project/2026-07-12-evidence-note-fail-closed-dispatch-enforcement.md)
- [RFC](../project/2026-07-12-rfc-fail-closed-dispatch-enforcement.md)
- [Review attempt 1](../project/2026-07-12-review-fail-closed-dispatch-enforcement.md)
- [Review attempt 2](../project/2026-07-12-rereview-2-fail-closed-dispatch-enforcement.md)
- [Controlling review attempt 3](../project/2026-07-12-rereview-3-fail-closed-dispatch-enforcement.md)
- [Implementation plan](../project/2026-07-12-plan-fail-closed-dispatch-enforcement.md)
- [Validation / rollout / rollback](../project/2026-07-12-validation-rollout-rollback-fail-closed-dispatch-enforcement.md)

---
summary: "RFC for a single fail-closed dispatch-authorization boundary across pi-vault-client execution ingresses."
read_when:
  - "Changing Vault dispatch posture, prompt-plane execution, bindings, or receipts."
  - "Reviewing the implementation wave for governed template execution."
type: "rfc"
proposal_status: "revised_for_rereview"
system4d:
  container: "Architecture for converting Prompt Vault dispatch posture into package-owned execution authorization."
  compass: "No governed executable template proceeds through a weaker path than its declared control mode permits."
  engine: "Prepare -> classify -> identity-bind -> authorize -> revalidate -> dispatch or block -> correlate owner receipts."
  fog: "Compatibility text fields, mutable registries, projected prompts, and check/execute drift can preserve hidden bypasses."
---

# RFC — Fail-Closed Prompt Vault Dispatch Enforcement

## Status

Revised after formal adversarial review attempt 1 returned `revise_rfc`. Rereview is required. This RFC does not itself authorize ADR recording or implementation.

## Revision history

- **Revision 1:** established the single authorization boundary and owner-separated receipts.
- **Review attempt 1:** found six blocking gaps: legacy V1 bypass, composite grounding, incomplete identity/linearization, projection-owner ambiguity, incomplete durable handoff, and non-executable rollout gates.
- **Revision 2:** closes those gaps through fail-closed V1 behavior, aggregate authorization, exact canonical identity, an explicit Prompt Vault projection-owner handoff, durable pre-handoff receipts, and measurable rollout/rollback gates.

## Decision in one sentence

Adopt a single versioned, fail-closed `DispatchAuthorizationV1` contract owned by `pi-vault-client`, require every package-owned execution ingress to consume it immediately before execution, and preserve executor-owned lifecycle/outcome authority through correlated—not duplicated—receipts.

## Context

The existing package correctly separates many prompt-plane concerns but does not yet make dispatch posture mandatory. Classification can therefore be bypassed by package-owned raw-text paths, and a successful check is not tied strongly enough to the identity later executed.

The architecture must close those gaps without claiming that a local TypeScript client is an authentication boundary or absorbing orchestrator runtime authority.

## Architectural invariants

1. **No weaker execution path** — a template declared as loop/workflow never executes as ordinary text through a package-owned path.
2. **Ready is total** — every requested template is present, visible, active, semantically valid, identity-bound, and supported by the returned disposition.
3. **Unknown denies** — unknown, null, malformed, case-drifted, or future governed enum values block.
4. **Partial denies** — a batch with one missing or blocked item is blocked as a whole unless a separately versioned partial-execution contract is adopted later.
5. **Exact identity** — authorization binds template ID, version, content digest, governed metadata digest, resolved company, binding-registry identity, execution surface, and preparation identity.
6. **Immediate revalidation** — the package re-reads and compares exact identity immediately before dispatch or text submission.
7. **Immutable policy** — binding registries are validated and deeply immutable for the lifetime of a runtime instance.
8. **One truth per concern** — Vault owns authorization truth; the actual executor owns lifecycle/outcome truth. Receipts correlate through stable IDs but do not duplicate ownership claims.
9. **No authentication overclaim** — company context remains cooperative local governance unless a trusted service/storage boundary is introduced separately.
10. **Installed behavior is the product** — packed public JS/declarations and a real installed-Pi path must prove the contract.

## Proposed public contract

The authorization subject is always an aggregate, even for one template. This prevents single-subject APIs from silently bypassing embedded grounding/framework templates.

```ts
type DispatchAuthorizationV1 =
  | {
      schema: "pi.vault.dispatch-authorization.v1";
      disposition: "text_ready";
      authorizationId: string;
      aggregate: DispatchAggregateIdentity;
      surface: ExecutionSurface;
      revalidateImmediatelyBeforeSend: true;
    }
  | {
      schema: "pi.vault.dispatch-authorization.v1";
      disposition: "dispatch_required";
      authorizationId: string;
      aggregate: DispatchAggregateIdentity;
      surface: ExecutionSurface;
      binding: FrozenExecutionBinding;
      registryId: string;
      revalidateImmediatelyBeforeDispatch: true;
    }
  | {
      schema: "pi.vault.dispatch-authorization.v1";
      disposition: "blocked";
      reason:
        | "missing_template"
        | "invisible_template"
        | "inactive_template"
        | "schema_incompatible"
        | "unknown_governed_value"
        | "missing_binding"
        | "unsupported_surface"
        | "identity_drift"
        | "partial_batch"
        | "mixed_disposition"
        | "incompatible_bindings"
        | "export_ineligible"
        | "company_context_conflict"
        | "authorization_receipt_failed";
      safeMessage: string;
    };

interface DispatchAggregateIdentity {
  primary: DispatchSubjectIdentity;
  members: readonly DispatchSubjectIdentity[];
  compositionKind: "single" | "grounding" | "route" | "batch";
  finalPreparedBytesSha256: string;
  preparation: PreparedIdentity;
}

interface DispatchSubjectIdentity {
  templateId: number;
  templateName: string;
  templateVersion: number;
  contentSha256: string;
  governedMetadataSha256: string;
  resolvedCompany: string;
}
```

For grounding, routing, or any composed prompt, `members` includes the primary and every embedded governed template exactly once. The package classifies every member before composition. Any blocked/gated child blocks ordinary text composition; mixed `text_ready` and `dispatch_required` members return `mixed_disposition`.

The first contract does not define a multi-binding execution graph. Multiple `dispatch_required` members are lawful only when every member resolves to the same byte-identical binding and that binding declares `compositeCapable: true`; otherwise the aggregate blocks as `incompatible_bindings`. A later per-member execution plan requires a separately versioned composite-executor decision. The final composed byte digest covers wrappers, ordering, context, and arguments.

The authorization object is a single-use, process-local capability description and correlation token, not proof that execution completed.

## Core runtime boundary

Introduce one package-owned runtime method conceptually equivalent to:

```ts
authorizePreparedExecution(
  request: PreparedExecutionRequest,
  context: DispatchExecutionContext,
): Promise<DispatchAuthorizationV1>
```

All execution ingresses must call this method:

- `/vault`;
- live `/vault:`;
- fixed `/route`, grounding, and framework-composition command/input paths that already prepare or submit text;
- `prompt-plane` selection and continuation paths;
- orchestrator-facing dispatch adapters;
- package-owned projected-prompt generation/invocation seams.

Retrieval-only tools may continue returning governed content, but must label posture and must not describe gated content as directly executable.

## Preparation versus execution

Preparation remains useful before authorization. The public prompt-plane result becomes an explicit union:

```ts
type PreparedPromptPlaneCandidateV2 =
  | { status: "text_ready"; candidate: PreparedCandidate; authorization: TextAuthorization }
  | { status: "dispatch_required"; candidate: PreparedCandidate; authorization: DispatchAuthorization }
  | { status: "blocked"; reason: BlockReason };
```

For `dispatch_required`, prompt content may be carried inside the sealed package-owned candidate needed by the executor, but UI/consumer surfaces must not expose an ordinary `send as user text` action. Type shape alone is not a hostile-process sandbox; runtime ingress enforcement remains mandatory.

## Binding registry

Replace mutable global bindings with a constructed policy object:

```ts
createDispatchPolicy({
  ontologyContractVersion,
  bindings,
}): FrozenDispatchPolicy
```

Requirements:

- validate all names, control modes, target surfaces, argument schemas, composite capability, and collisions at construction;
- accept only RFC 8785/JCS-compatible data: no functions, accessors, symbols, `undefined`, non-finite numbers, sparse arrays, or mutable class/container instances;
- deep-clone and deep-freeze the accepted policy;
- compute a deterministic `registryId` digest;
- expose read-only snapshots only;
- reject runtime overwrite/collision;
- if dynamic registration is later required, introduce an authenticated owner-controlled reload protocol and new registry identity rather than mutating the active instance.

Existing `registerLoopBinding()` becomes deprecated and then removed from public execution paths.

## Semantic validation

The classifier consumes a versioned controlled-semantic contract. It must not infer permissive defaults for executable metadata.

Rules:

- `one_shot` + supported non-gated formalization may become `text_ready`;
- known loop modes require a concrete verified loop binding;
- workflow modes require a concrete verified workflow surface, otherwise block;
- unknown values block and include no invisible-template details;
- schema compatibility includes semantic-value validation, not column presence alone;
- executable package surfaces require `export_to_pi === true`, preserving current executable lookup eligibility; non-exported templates remain retrievable through governed retrieval surfaces but cannot receive execution authorization.

## Exact identity and check-to-execution linearization

### Required identity fields

Authorization requires non-null positive template ID and version. Missing identity blocks; permissive defaults are forbidden on executable reads.

The identity contract covers:

- raw UTF-8 template content bytes;
- canonical governed metadata: artifact kind, control mode, formalization level, owner, visibility, active state, complete controlled vocabulary (including output commitment), ontology/schema contract version, and exact `export_to_pi` eligibility;
- renderer engine and renderer contract version;
- exact ordered arguments and context bytes;
- route/grounding wrapper identity and every composite member;
- final prepared UTF-8 bytes;
- resolved company, execution surface, and frozen binding-registry ID.

Digests use SHA-256 lowercase hexadecimal. Metadata and structured preparation inputs use UTF-8 RFC 8785 JSON Canonicalization Scheme bytes; prompt/content digests use the exact UTF-8 bytes sent, without implicit newline normalization. Any renderer or wrapper change therefore changes preparation identity.

### Linearization rule

1. resolve every subject in one consistent database read snapshot;
2. validate semantics and prepare exact sealed bytes;
3. issue a single-use in-memory authorization bound to those bytes and the frozen policy;
4. immediately before the host send/dispatch call, open a new consistent read snapshot and re-read every subject plus policy identity;
5. compare every covered field and recompute the aggregate digest;
6. atomically transition the in-memory authorization from `issued` to `claimed`; only that transition winner may continue;
7. persist the required authorization/handoff receipt;
8. invoke the host/executor using only the sealed bytes and frozen binding just validated—never recompute or reread caller-provided text;
9. transition `claimed` to terminal `handed_off` or `failed`; receipt failure, host rejection, exception, timeout, or cancellation is terminal and the authorization is never reusable;
10. on any difference or failure, return `blocked` and require re-preparation.

The host call is the linearization point for package behavior. A database mutation after the final snapshot but before an external executor starts cannot be made atomic with that executor; the contract guarantees that the exact sealed bytes and binding validated at the package boundary are the bytes and binding handed off. It does not claim a cross-process database/executor transaction.

No authorization survives process restart, policy replacement, company-context change, template mutation, failed receipt persistence, first claim, or first use. Claiming precedes every persistence or host side effect so concurrent and reentrant callers cannot reuse the authorization.

## Receipts and provenance

Use linked owner receipts rather than one owner claiming another owner's result.

### Vault authorization and handoff receipt

Owned by `pi-vault-client` and durably persisted **before** a gated executor call:

- authorization/handoff UUID allocated by Vault;
- exact aggregate/preparation identity;
- disposition and binding/registry identity;
- resolved company and execution surface;
- final revalidation result;
- intended executor target.

A gated dispatch blocks with `authorization_receipt_failed` if this receipt cannot be durably persisted. Commit warnings are not durable success. The executor must accept and cite the Vault-allocated handoff UUID; an executor surface that cannot do so is unsupported and blocks.

After the call is accepted, Vault may append an acknowledgement containing the executor's run ID. Failure to append that acknowledgement is reported as unresolved correlation, never as successful completion.

### Executor outcome receipt

Owned by the actual orchestrator/launcher:

- executor run ID;
- cited Vault handoff UUID;
- actual runtime target/profile/workflow identity;
- start, completion, failure, timeout, and cancellation truth;
- executor-owned logs/artifacts.

Current `prompt_executions.success=true` rows mean only that the historical prompt-send receipt path recorded its event. They are not executor outcome evidence. Migration must label this legacy meaning explicitly; new replay joins authorization/handoff identity to executor outcome when available and otherwise reports `outcome_unavailable`.

Vault replay may resolve and display the linked outcome but must never synthesize executor success.

## Native/projected prompt boundary

A projected Prompt Vault file can bypass command wiring if Pi invokes it directly. Projection mutation is owned by the Prompt Vault CLI/export surface (`core/prompt-vault`), not by `pi-vault-client`. Package-native prompts published in this npm package are a separate class and are not Prompt Vault projections.

Before package enforcement activation:

1. `pi-vault-client` produces a read-only inventory of active export-eligible templates and their authorization dispositions;
2. a Prompt Vault owner task changes export policy so gated, unknown, malformed, or unbound templates are quarantined from raw `.md` projection, or emits a host-gated projection format accepted by a later decision;
3. the Prompt Vault export receipt proves the local projection contains no raw gated template;
4. `pi-vault-client` diagnostics verify that receipt and file inventory;
5. an installed/reloaded Pi test attempts direct projected invocation and proves the bypass is absent.

This package does not delete or rewrite owner-managed projections. Its implementation wave carries an explicit cross-owner handoff and remains blocked at enforcement activation until owner evidence exists. Rollback of projection changes is also Prompt Vault-owned and may only return to quarantine, not raw gated export.

## Company-context boundary

The package continues to enforce owner/visibility policy for cooperative local clients. Documentation and errors must not call this authentication or tenant isolation. A hostile local process with database access remains out of scope; service-side authorization is a separate architecture decision.

## Compatibility and migration

### Public API and accepted-V3 amendment

This decision explicitly amends the accepted non-UI prompt-plane V3 contract where that contract's generic `ready + prepared_text` result would permit gated raw-text execution.

- add V2 prompt-plane/authorization types;
- V1 remains source-compatible only for lawful `text_ready` templates;
- for gated, unknown, malformed, missing, invisible, inactive, or mixed/composite-blocked templates, V1 returns `blocked` and **no executable `prepared_text`**;
- correct missing/partial `ready` immediately;
- mark V1 deprecated when V2 ships and remove it only in a semver-major release after known consumers migrate;
- no package enforcement claim is legal while any supported V1 path can return raw executable text for a non-`text_ready` candidate;
- deprecate advisory-only helpers and mutable registration;
- preserve retrieval APIs while making execution disposition explicit.

### Template and binding inventory

Before enforcement:

- inventory all active loop/workflow templates visible to each company;
- validate each governed value;
- owner-approve a concrete binding or quarantine the template from executable surfaces;
- record unsupported workflow templates as blocked, not text-compatible.

### Exact ingress/channel inventory

| Channel | Current role | Mandatory final guard |
|---|---|---|
| `/vault` command/editor submission | prepares and sends selected prompt | authorization immediately before `sendUserMessage` |
| live `/vault:` input transform | prepares and replaces/submits input | authorization before transformed text becomes executable input |
| `/route` and fixed routes | prepare route template text | authorization before command/input submission |
| grounding/framework composition | combines primary and child templates | aggregate authorization over all members and final bytes |
| prompt-plane selection | returns public prepared candidate | V1/V2 disposition gate; no gated raw text |
| prompt-plane continuation | prepares next candidate | same V1/V2 disposition and aggregate gate |
| orchestrator/package adapters | hand off gated execution | claimed authorization + durable handoff receipt |
| Prompt Vault projections | native Pi can invoke raw file | owner quarantine/host gate plus installed bypass canary |
| retrieval-only tools | return governed content | posture label; no execution-ready claim or automatic send |

### Rollout phases and gates

| Phase | Owner | Exit gate |
|---|---|---|
| 0. Inventory/fixtures | `pi-vault-client` | Every active visible template is classified; no unknown semantic value; every channel above has an adversarial fixture. |
| 1. Shadow observation | `pi-vault-client` | Maximum seven calendar days; at least one exercised case per channel and every known active gated template; every divergence has an ID and is closed only by a passing regression test plus either code/metadata remediation or an RFC revision accepted in rereview. Zero unsafe divergence remains. Low traffic never waives deterministic fixture coverage. |
| 2. Owner remediation | Prompt Vault + binding owners | Every gated template has an owner-approved frozen binding or is quarantined; export receipt and binding inventory are current; all divergence records satisfy the closure rule. |
| 3. Enforcement build, disabled | `pi-vault-client` | V1 and V2 fail closed for non-text dispositions; all package ingress tests pass; durable pre-handoff receipts are proven; emergency posture defaults to gated-disabled/blocked. |
| 4. Packed and installed proof | `pi-vault-client` + Pi operator | Packed consumer test and installed/reloaded Pi canary pass while explicitly exercising the disabled build and controlled enablement, including direct projected invocation attempts. |
| 5. Enforcement activation | `pi-vault-client` + operator | Projection-owner evidence and phase-4 proofs are current; the operator enables gated dispatch; post-activation canary passes; rollback-to-blocked is tested. |
| 6. Consumer adoption | each consumer owner | Consumer cites V2 authorization and executor receipt contract without moving runtime authority. |

Shadow mode automatically expires after seven days and cannot be called enforcement. Failure to meet an exit gate blocks forward movement; it does not extend advisory execution indefinitely. Broad activation is illegal before packed and installed proof.

## Failure behavior

- no fallback from loop/workflow to plain text;
- no fallback from exact lookup to picker behavior unless the request explicitly authorized picker resolution before preparation;
- no partial batch execution;
- no automatic binding synthesis;
- no hidden retry after identity drift;
- safe errors must not reveal invisible template identity or metadata.

## Adversarial scenarios required in tests

1. missing and partially found batches;
2. invisible/inactive templates;
3. unknown/future/case-drifted metadata;
4. returned binding mutation, registry snapshot mutation, unsupported JCS values, and mutable-container rejection;
5. binding collision, runtime replacement, mixed disposition, and incompatible multi-binding composite attempts;
6. template/version/content/controlled-vocabulary/export-eligibility mutation between authorization and dispatch;
7. concurrent and reentrant claim attempts, with exactly one claim winner and no reuse after any failure;
8. company-context change after preparation;
9. raw `/vault`, live trigger, continuation, route, grounding, adapter, and projected-prompt bypass attempts;
10. workflow without concrete execution surface;
11. executor rejection, failure, timeout, cancellation, and unavailable outcome receipt;
12. packed public entrypoints/declarations;
13. real installed/reloaded Pi invocation.

## Rejected alternatives

### Keep classifier advisory and rely on tool instructions

Rejected because instructions do not enforce package execution paths and create false confidence.

### Put all dispatch execution inside `pi-vault-client`

Rejected because it absorbs orchestrator/launcher lifecycle authority.

### Treat company context as authentication

Rejected because environment/cwd/caller assertions do not authenticate an external principal.

### Add dispatch fields to `pi-agent-run-contracts` first

Rejected because Vault authorization and governed template identity are owner-specific and not yet stable enough for neutral extraction.

### Sign long-lived authorization tokens

Rejected for the first slice. Cryptographic signing does not eliminate same-process bypass or stale-policy risk; immediate identity revalidation is simpler and more truthful.

## Decision gates

The RFC is ready for ADR only when adversarial review confirms:

- every known package-owned ingress is inventoried;
- unknown semantics and partial batches fail closed;
- policy immutability and drift handling are explicit;
- authorization and executor outcome ownership remain separate;
- projected-prompt bypass has a bounded treatment;
- migration and rollback do not silently restore unsafe behavior.

## Proposed implementation-wave shape

After ADR acceptance, create one work wave with owner-bounded leaves:

- **A — authorization core (`pi-vault-client`):** immutable policy, semantic validation, canonical identity, aggregate/composite authorization, sealed-byte linearization, and V1 fail-closed correction. Done when unit/contract tests falsify all identity, mutation, missing, partial, mixed, and unknown cases.
- **B — ingress enforcement (`pi-vault-client`):** V2 prompt-plane plus `/vault`, live trigger, routes, grounding, package adapters, durable pre-handoff receipts, and executor correlation. Done when no supported package ingress can raw-submit a non-text disposition.
- **C — projection handoff (`core/prompt-vault` owner):** owner-approved export quarantine or host-gated projection, export receipt, and rollback-to-quarantine contract. This is a separate owner task and a hard dependency for activation, not an implicit mutation by this package.
- **D — installed proof and release hardening (`pi-vault-client` + Pi operator):** packed consumer tests, installed/reloaded Pi bypass canary, test-residue cleanup, generated-runtime clean-tree assertion, docs, and release proof.

Receipt filesystem permissions and mutation-commit truth receive separate tasks unless required to make the pre-handoff receipt durable. If required, only the minimal durability behavior enters leaf B.

## Rollback principle

Rollback is forward correction to a blocked/quarantined state. After enforcement activation, rollback must never silently restore gated-template raw-text execution.

The only emergency runtime switch is `disable_gated_dispatch`, whose semantics are:

- all `dispatch_required` candidates become `blocked`;
- ordinary validated `text_ready` behavior continues;
- projected gated prompts remain quarantined;
- no flag can restore advisory/raw execution;
- activation/deactivation emits operator-visible diagnostics and a local governance receipt.

Code rollback that removes the authorization runtime is permitted only together with disabling gated execution and retaining V1 fail-closed behavior.

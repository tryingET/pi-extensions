---
summary: "Repo-native boundary note for the bounded v4 runtime_receipts concern: pi-vault-client remains canonical for Pi-side execution receipts while AK bindings stay projection-only."
read_when:
  - "Reviewing the first-wave v4 boundary notes for concern `runtime_receipts`."
  - "Deciding what receipt/runtime facts AK may project from pi-vault-client without implying shared-runtime cutover."
  - "Checking whether pi-vault-client or AK is the current canonical owner for receipt and replay behavior."
system4d:
  container: "Repo-scoped v4 boundary note for runtime receipts."
  compass: "Keep current package authority explicit while making the bounded AK-visible bindings truthful and non-canonical."
  engine: "State current authority -> enumerate bounded consumable facts -> name projection-only bindings -> preserve warning posture -> name out-of-bounds."
  fog: "Main risk is collapsing projection visibility into fake runtime ownership and accidentally claiming AK-native receipt or replay authority."
initiative_id: "v4-source-artifact-graph-control-plane"
decision_id: 4
type: "reference"
concern_id: "runtime_receipts"
owner_repo: "/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client"
---

# V4 runtime-receipts runtime-target binding

## Purpose

This note is the repo-native boundary note for the first-wave v4 concern `runtime_receipts`.
It preserves the current truth for the bounded slice:

- `pi-vault-client` is still the canonical runtime-receipt surface
- Agent Kernel may project that authority into initiative/passport outputs
- those AK-visible bindings are **not** shared-runtime cutover

This note complements, rather than replaces:

- [Vault execution receipts](./vault-execution-receipts.md)
- [Plan: Vault Execution Receipt architecture](./plans/2026-03-11-vault-execution-receipts-architecture.md)

## Governing context

This repo-native note is the owner-repo follow-through named by the v4 fan-out material in Agent Kernel:

- `agent-kernel/docs/project/2026-03-21-cross-repo-fanout-v4-source-artifact-graph-control-plane-boundary-note-wave.md`
- `agent-kernel/docs/project/2026-03-21-conformance-suite-v4-source-artifact-graph-control-plane-first-slice.md`

Those initiative artifacts stay coordination-only.
They point back to this package for runtime-receipt authority rather than replacing it.

## Concern and authority snapshot

| Field | Current bounded truth |
|---|---|
| Concern | `runtime_receipts` |
| Current canonical authority | `pi-vault-client` |
| Current authority status | `canonical` |
| Emerging authority in v4 outputs | Agent Kernel passport/projection surfaces |
| Emerging authority status | `passport_projection` |
| Target authority read for the bounded slice | `pi-vault-client-plus-ak-bindings` |
| Target authority status | `bound_external_truth` |
| Blocking posture | `warn_only` |

The distinction above is mandatory.
This note does **not** collapse current, emerging, and target authority into one owner string.

## Why pi-vault-client remains canonical today

`pi-vault-client` is the package that currently owns the live Pi-side receipt and replay behavior described in [Vault execution receipts](./vault-execution-receipts.md):

- receipt creation is execution-bound and keyed by exact `execution_id`
- receipt persistence is local package-owned JSONL, not initiative-native AK storage
- replay logic is implemented against stored local receipts and current visible package/runtime state
- the operator surfaces for inspection and replay live here (`/vault-last-receipt`, `/vault-receipt <execution_id>`, `/vault-replay <execution_id>`, `vault_replay({ execution_id })`)
- privacy and visibility behavior are enforced here through explicit company-context and fail-closed receipt access

The supporting architecture freeze in [Plan: Vault Execution Receipt architecture](./plans/2026-03-11-vault-execution-receipts-architecture.md) is also package-native:

- it intentionally keeps receipt payloads local-first
- it explicitly avoids widening shared persistence before governance/privacy decisions are ready
- it treats replay as an additive package capability rather than an AK-native runtime contract

Because those runtime behaviors and persistence boundaries are still implemented here, AK is not the canonical owner for this concern today.

## Bounded facts the v4 initiative may consume now

The bounded v4 slice may rely on the following facts from `pi-vault-client` without pretending AK owns the runtime.

| Fact category | Safe bounded read for v4 | Canonical anchor |
|---|---|---|
| Concern owner | `runtime_receipts` is currently owned by `pi-vault-client` | this note + [Vault execution receipts](./vault-execution-receipts.md) |
| Receipt identity model | receipts are bound to exact Prompt Vault `execution_id` values | [Vault execution receipts](./vault-execution-receipts.md#current-operator-workflow) |
| Runtime surfaces | Pi-side receipt preparation, inspection, and replay surfaces live in this package | [Vault execution receipts](./vault-execution-receipts.md#ground-truth-from-the-current-runtime) |
| Replay status contract | replay outcomes remain `match`, `drift`, or `unavailable` | [Vault execution receipts](./vault-execution-receipts.md#replay-contract) |
| Persistence/privacy boundary | receipt payloads remain local-first and are not promoted into shared AK persistence in this slice | [Vault execution receipts](./vault-execution-receipts.md#storage-and-privacy-boundary) |
| Execution scope | current receipt coverage is bounded to `/vault`, live `/vault:`, `/route`, and grounding owned by this package | [Vault execution receipts](./vault-execution-receipts.md#ground-truth-from-the-current-runtime) |

These are the facts the initiative may surface and reason about.
They are not permission to reimplement the receipt runtime elsewhere.

## AK-visible bindings that remain projection-only

AK may expose `runtime_receipts` in initiative/passport materials only as a projection of package-native truth.
For the bounded first slice, the following surfaces remain non-canonical bindings:

- the authority snapshot seed and later decision-passport projections that name `pi-vault-client` as the current owner
- cross-repo fan-out and boundary-note artifacts that point operators to this package and these docs
- initiative-level warnings that explain why AK can show the concern without becoming its runtime authority
- future AK-visible references to receipt/runtime targets that still depend on repo-native docs and package behavior to be truthful

What AK may **not** claim from these bindings:

- that receipt payloads are stored or governed natively inside AK
- that AK can replay package receipts without `pi-vault-client`
- that the initiative has already unified execution, receipt, and replay runtime ownership
- that the presence of this note is equivalent to runtime-native cutover

## Required warning posture

The v4 slice stays valid only if these warnings remain visible for `runtime_receipts`:

| Warning code | Why it still applies |
|---|---|
| `projection_only_authority` | AK may render `runtime_receipts` in initiative outputs, but canonical ownership remains in `pi-vault-client` |
| `external_binding_not_runtime_native` | truthful runtime-receipt visibility still depends on package-native docs/runtime rather than an AK-native receipt runtime |

For this concern, these warnings are **truth surfaces**, not automatic blockers.
They should remain report-only until a later bounded decision proves that stronger runtime-native integration is actually justified.

`hybrid_governance_authority` does **not** apply to this concern directly; that warning belongs to the governance concern, not to the package receipt runtime itself.

## Out of bounds for this note

This note must not be read as approval for any of the following:

- moving receipt payloads or replay-safe inputs into AK persistence
- declaring a shared-runtime or AK-native receipt implementation
- replacing package operator surfaces with AK commands as the canonical runtime interface
- widening the concern from package-owned Pi execution receipts into general cross-system execution provenance
- implying that Prompt Vault schema changes or AK schema changes are part of this bounded note
- treating the initiative passport as the source of truth for replay semantics, visibility checks, or local receipt storage

If any later slice needs one of those moves, it must open a new bounded decision or implementation contract explicitly.

## Completion signal

This boundary note is good enough for the bounded first slice when a cold-start operator can answer all of the following without reopening the whole v4 ADR chain:

1. who currently owns `runtime_receipts`
2. which receipt/runtime facts AK may project safely
3. which AK-visible surfaces are still projection-only
4. which warnings must remain visible for this concern
5. why this note does **not** mean shared-runtime or AK-native cutover has happened

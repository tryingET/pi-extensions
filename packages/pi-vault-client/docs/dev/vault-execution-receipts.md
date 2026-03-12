---
summary: "V1 architecture for additive Vault Execution Receipts and receipt replay in pi-vault-client."
read_when:
  - "Implementing VRE-02 through VRE-10 in the receipts/replay backlog."
  - "Deciding what provenance must be captured for /vault, /vault:, /route, and grounding executions."
  - "Evaluating whether receipt storage belongs in local package state or Prompt Vault schema changes."
system4d:
  container: "Architecture note for local-first vault execution provenance and replay."
  compass: "Capture truthful replayable provenance without widening Prompt Vault persistence before policy and schema decisions are ready."
  engine: "Ground current execution surfaces -> define receipt schema -> define privacy/storage boundary -> define replay contract -> phase rollout."
  fog: "The main risks are storing too little to replay, storing too much in shared persistence, or conflating current execution logging with a future receipt system."
---

# Vault Execution Receipts

## Status
This note started as the **v1 architecture freeze** for execution receipts in `pi-vault-client`.

It remains the design anchor for receipt/replay implementation tasks `VRE-02` through `VRE-10`.
Canonical queue state and detailed task payloads now live in Agent Kernel task rows rather than a repo-local backlog mirror.

### Implementation status snapshot
As of the current package runtime:

- receipt types, builder helpers, and a local JSONL sink are implemented
- `logExecution()` returns concrete execution metadata including `execution_id`
- `/vault`, live `/vault:`, `/route`, and grounding emit local receipts after execution binding
- receipt inspection commands exist:
  - `/vault-last-receipt`
  - `/vault-receipt <execution_id>`
- receipt inspection is company-scoped
  - the current company context must be explicit
  - receipts outside the current company's visibility boundary are treated as unavailable
- replay core is implemented in package internals
  - replay loads local receipts by `execution_id`
  - replay regenerates prepared prompts for `vault-selection`, `route-request`, and `grounding-request`
  - replay classifies `match`, `drift`, and `unavailable` with explicit reasons including `template-missing`, `version-mismatch`, `render-mismatch`, `company-mismatch`, and `missing-input-contract`
  - the operator-facing replay surface is now exposed through `/vault-replay <execution_id>` and `vault_replay({ execution_id })`

Execution rows are now written only when the prepared prompt is actually sent as a real user message.
Editor population alone is no longer treated as a successful execution.

The current runtime correlates prepared prompts to sent prompts with an opaque hidden execution marker carried through the editor/transform path and stripped back out before the LLM sees user content.
That marker replaced the earlier raw-text matching heuristic.

## Problem statement
`pi-vault-client` already does three useful things:

1. resolves visible Prompt Vault templates under explicit company context
2. prepares prompts through the shared render boundary
3. logs template executions into Prompt Vault's existing `executions` table

What it does **not** do yet is preserve a local, replayable record of what was actually prepared on each execution surface.

Today that leaves several gaps:

- operators cannot inspect the exact provenance of a prepared `/vault` or live `/vault:` execution after the fact
- later replay would have to guess which template, company context, render contract, and input shape were used
- `/route` and grounding flows have no durable local provenance contract even though they already share the same preparation boundary
- widening Prompt Vault schema immediately would force privacy and governance decisions before the runtime contract is stable

The receipt system exists to close those gaps **additively**.

## Goals
- Capture enough provenance to explain and replay prepared vault executions truthfully.
- Bind each receipt to the real Prompt Vault execution row used for the run.
- Keep phase-1 persistence local to this package so replayable inputs do not spill into shared Prompt Vault storage prematurely.
- Cover all execution surfaces owned by this package:
  - `/vault`
  - live `/vault:`
  - `/route`
  - grounding via `next-10-expert-suggestions`
- Support later operator inspection and deterministic replay by `execution_id`.

## Non-goals for v1
- no Prompt Vault schema migration
- no historical backfill of old executions
- no model-output capture or transcript analytics system
- no cross-repo shared receipt service
- no batch replay or dashboard UI

## Ground truth from the current runtime
The architecture is anchored to the execution surfaces that already exist in this package.

| Surface | Current source of truth | What is already known at execution time | Current gap |
|---|---|---|---|
| `/vault` exact / picker path | `src/vaultCommands.ts` | template identity, company context, optional context string, prepared prompt, model id, execution logging | local receipts now capture selection metadata and prepared-prompt baseline after send-time execution binding |
| live `/vault:` | `src/vaultPicker.ts` | selected template id, selection mode (`fzf` vs fallback), optional context string, prepared prompt, live-trigger channel | local receipts now preserve live-trigger selection provenance and exact prepared text |
| `/route` | `src/vaultCommands.ts` | fixed template `meta-orchestration`, company context, route context, prepared prompt | local receipts now record fixed-template route provenance after send-time execution binding |
| grounding | `src/vaultGrounding.ts` | fixed template `next-10-expert-suggestions`, company context, args/context/data, discovered frameworks, prepared prompt | local receipts now capture framework-resolution provenance and prepared output |
| execution logging | `src/vaultDb.ts` | template id/version, model, input_context | returns concrete execution metadata including `execution_id` for receipt binding |

## Design principles

### 1. Local-first before shared persistence
Receipts may contain replay-critical freeform inputs such as route context, grounding extras, or appended `## CONTEXT` text.
Those inputs are useful for replay, but they are also the exact reason **not** to widen shared Prompt Vault persistence until privacy and governance decisions are explicit.

### 2. Execution-bound, not session-summary-bound
A receipt is attached to one concrete Prompt Vault execution row.
It is not a loose session note and not a per-command aggregate.
The canonical binding key is `execution_id`.

### 3. Prepared-prompt truth beats inferred truth
If a replay system can only infer what probably happened, it will drift.
The receipt must preserve enough information to explain both:
- the exact prepared prompt that was produced at execution time
- the normalized inputs required to regenerate and compare later

### 4. Additive rollout
The receipt system must layer onto the current package without destabilizing existing query, render, or mutation behavior.
That means:
- types and builders first
- local JSONL sink second
- execution binding next
- primary execution surfaces before secondary ones
- replay only after receipt emission is stable

## Terminology

### `invocation_surface`
The semantic product surface that produced the prepared prompt.
This answers **what feature path was used**.

V1 values:
- `/vault`
- `/vault:`
- `/route`
- `grounding`

`invocation_surface` is stable even when the lower-level delivery channel changes.

### `invocation_channel`
The runtime mechanism that delivered the invocation.
This answers **how the surface was triggered inside Pi**.

V1 values:
- `slash-command` — a registered command handler path such as `pi.registerCommand(...)`
- `input-transform` — a `pi.on("input")` transform path handling text like `/vault foo`
- `live-trigger` — the inline live-picker interaction for `/vault:`
- `helper-call` — an internal package helper path that constructs a prompt without direct user typing

A single surface may appear on more than one channel.
For example, `/vault` can arrive through either `slash-command` or `input-transform`.

### `selection_mode`
How the primary template for the execution was chosen.
This answers **why this template won**.

V1 values:
- `exact` — direct exact-name hit
- `picker-fzf` — fuzzy picker chose the template through `fzf`
- `picker-fallback` — fuzzy picker chose the template through non-`fzf` fallback UI/runtime
- `fixed-template` — the surface always uses a fixed template name (`meta-orchestration`, `next-10-expert-suggestions`)

Framework discovery used by grounding is related provenance, but it is recorded separately under `grounding.framework_resolution` rather than overloading `selection_mode`.

### `company_source`
The exact source used to resolve company context at execution time.
This answers **why the execution saw this company's visible templates**.

V1 stores the runtime's raw source string, for example:
- `explicit:currentCompany`
- `env:PI_COMPANY`
- `env:VAULT_CURRENT_COMPANY`
- `cwd:/home/tryinget/ai-society/softwareco/...`

The receipt must preserve the raw string rather than normalizing it away.
Replay needs to distinguish a company mismatch from a source mismatch.

### `llm_tool_call`
Structured provenance for an upstream LLM-issued tool call when that fact is actually known.
This answers **whether the execution was caused by an LLM tool boundary rather than direct operator input**.

V1 shape:
- `null` when the runtime has no trustworthy tool-call provenance or the action was direct operator input
- an object when a tool boundary is explicitly known:
  - `tool_name`
  - optional `tool_call_id`

Important: v1 must not invent tool provenance.
If the runtime cannot prove it, the field is `null`.

## Receipt schema v1

### Canonical shape

```json
{
  "schema_version": 1,
  "receipt_kind": "vault_execution",
  "execution_id": 123,
  "recorded_at": "2026-03-11T17:30:00.000Z",
  "invocation": {
    "surface": "/vault:",
    "channel": "live-trigger",
    "selection_mode": "picker-fzf",
    "llm_tool_call": null
  },
  "template": {
    "id": 44,
    "name": "meta-orchestration",
    "version": 9,
    "artifact_kind": "procedure",
    "control_mode": "one_shot",
    "formalization_level": "workflow"
  },
  "company": {
    "current_company": "software",
    "company_source": "cwd:/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client"
  },
  "model": {
    "id": "live-trigger"
  },
  "render": {
    "engine": "nunjucks",
    "explicit_engine": "nunjucks",
    "context_appended": false,
    "append_context_section": true,
    "used_render_keys": ["current_company", "context"]
  },
  "prepared": {
    "text": "...exact prepared prompt text...",
    "sha256": "..."
  },
  "replay_safe_inputs": {
    "kind": "vault-selection",
    "query": "meta-orchestration",
    "context": "phase-1-live"
  }
}
```

### Field contract

#### Top-level envelope
- `schema_version: 1`
- `receipt_kind: "vault_execution"`
- `execution_id: number`
- `recorded_at: string` (ISO-8601)

`execution_id` is the canonical lookup key for inspection and replay.
There is no separate public receipt id in v1.

#### `invocation`
```json
{
  "surface": "/vault" | "/vault:" | "/route" | "grounding",
  "channel": "slash-command" | "input-transform" | "live-trigger" | "helper-call",
  "selection_mode": "exact" | "picker-fzf" | "picker-fallback" | "fixed-template",
  "llm_tool_call": null | { "tool_name": "...", "tool_call_id": "..." }
}
```

#### `template`
```json
{
  "id": 44,
  "name": "meta-orchestration",
  "version": 9,
  "artifact_kind": "procedure",
  "control_mode": "one_shot",
  "formalization_level": "workflow"
}
```

The receipt must record the exact template version used at execution time.
That value is later compared against current runtime state during replay.

#### `company`
```json
{
  "current_company": "software",
  "company_source": "cwd:/..."
}
```

#### `model`
```json
{ "id": "unknown" }
```

This mirrors the model string already passed into execution logging.
For live-trigger flows the current runtime uses `"live-trigger"` as the model identifier; receipts should preserve that raw value rather than rewriting it.

#### `render`
```json
{
  "engine": "none" | "pi-vars" | "nunjucks",
  "explicit_engine": null | "none" | "pi-vars" | "nunjucks",
  "context_appended": true | false,
  "append_context_section": true | false,
  "used_render_keys": ["current_company", "context"]
}
```

`engine` is the effective engine used during preparation.
`explicit_engine` preserves whether the engine was declared explicitly in frontmatter or inferred by the renderer contract.

#### `prepared`
```json
{
  "text": "...exact prepared prompt text...",
  "sha256": "..."
}
```

Both fields are required in v1.

Reason:
- `prepared.text` gives inspection and replay a truthful baseline
- `prepared.sha256` gives cheap equality and integrity checks

#### `replay_safe_inputs`
`replay_safe_inputs` stores the normalized inputs needed to explain and reconstruct preparation.
In v1 these inputs remain **local-only** even when they contain freeform operator context.

Base shape:

```json
{
  "kind": "vault-selection" | "route-context" | "grounding",
  "context": "...optional freeform context..."
}
```

Surface-specific additions:

For `/vault` and live `/vault:`:

```json
{
  "kind": "vault-selection",
  "query": "the raw query string before selection",
  "context": "optional ::context suffix"
}
```

For `/route`:

```json
{
  "kind": "route-context",
  "context": "the route description passed by the operator"
}
```

For grounding:

```json
{
  "kind": "grounding",
  "objective": "...",
  "workflow": "...",
  "mode": "off" | "lite" | "full",
  "extras": "normalized extras string",
  "args": ["objective", "workflow", "mode", "extras"],
  "context": "framework context passed into template preparation"
}
```

### Optional extension blocks in v1
Some surfaces need extra provenance without polluting the common envelope.
These blocks are optional and surface-specific.

#### `grounding.framework_resolution`
For grounding flows, record the framework resolution result used to build the appendix:

```json
{
  "selected_names": ["nexus", "inversion"],
  "retrieval_method": "discovery",
  "discovery_used": 1,
  "invalid_overrides": [],
  "warnings": []
}
```

This is required for truthful replay of grounded prompts.

## Sink abstraction
Receipts are written through a sink interface so storage can evolve without changing receipt builders.

### Required v1 sink contract

```ts
interface VaultExecutionReceiptSink {
  append(receipt: VaultExecutionReceiptV1): Promise<void> | void;
}
```

### Required v1 read helpers
The first concrete sink must also support deterministic local reads for:
- latest receipt
- receipt by `execution_id`

These read helpers may live alongside the JSONL sink implementation rather than on the generic sink interface.
The write interface stays minimal so the builder logic is not coupled to one storage backend.

## Storage and privacy boundary

### Phase-1 storage boundary
Phase 1 stores receipts in **local package-owned JSONL**, not in Prompt Vault's shared schema.

Current default spool path:

```text
~/.pi/agent/state/pi-vault-client/vault-execution-receipts.jsonl
```

Override the parent directory with `PI_VAULT_RECEIPTS_DIR` when you need isolated test/runtime storage.

Why:
- receipts need replay-critical freeform inputs and exact prepared prompt text
- those fields can contain operator context that is useful locally but not ready for shared cross-company persistence
- the current backlog needs additive implementation speed more than a global persistence redesign

### What is allowed in local receipts
Allowed in v1 local JSONL:
- exact prepared prompt text
- freeform context passed into prompt preparation
- normalized grounding args/extras
- template, company, selection, and render metadata

### What is explicitly out of scope for shared persistence in phase 1
Do **not** add new Prompt Vault columns or tables yet for:
- receipt payloads
- replay-safe input blobs
- prepared prompt text snapshots
- grounding appendix provenance

### Why phase 1 avoids a Prompt Vault schema migration
A schema migration now would force answers to questions the runtime does not yet need to settle:
- which receipt fields are globally visible across companies
- whether prepared prompt text counts as durable shared content
- what retention and redaction policy should apply to replay inputs
- how execution-bound replay data should be queried, indexed, or governed centrally

The package already has a safe additive seam:
- Prompt Vault keeps the canonical execution row
- `pi-vault-client` writes a local execution receipt keyed by that execution row

That delivers operator value immediately while preserving the option to promote selected receipt fields into shared storage later, after real usage proves which fields deserve that cost.

## Replay contract
Replay is a local operator capability driven by `execution_id`.

### Inputs
- exact `execution_id`
- the stored receipt for that execution
- current visible template/runtime state at replay time

### Replay algorithm (v1)
1. Load the receipt by `execution_id`.
2. Resolve the current template by recorded template name under the recorded company context.
3. Compare current template/version/renderability against the stored receipt.
4. Re-run prompt preparation using the stored `replay_safe_inputs`.
5. Compare the regenerated prompt to `prepared.sha256` and, when needed, `prepared.text`.
6. Emit a replay report with status, reasons, and regenerated prompt text when available.

### Replay statuses
- `match` — current regeneration matches the stored prepared prompt
- `drift` — regeneration succeeds but differs materially from stored provenance
- `unavailable` — regeneration cannot be completed truthfully

### Minimum drift / unavailable reasons
V1 must distinguish at least:
- `template-missing`
- `version-mismatch`
- `render-mismatch`
- `company-mismatch`
- `missing-input-contract`

Suggested status mapping:
- `template-missing` -> `unavailable`
- `missing-input-contract` -> `unavailable`
- `version-mismatch` -> `drift`
- `company-mismatch` -> `drift`
- `render-mismatch` -> `drift`

### Important replay invariant
Replay compares against the **stored prepared prompt baseline**, not just against template metadata.
Without that baseline, replay would silently degrade into "best-effort regeneration" instead of a truthful comparison.

## Rollout phases
The implementation phases intentionally mirror the AK backlog.

### Phase 1 — architecture freeze (`VRE-01`)
- author this document
- freeze terminology and schema direction
- keep implementation at zero code change

### Phase 2 — types and builder contract (`VRE-02`)
- add public receipt interfaces to `src/vaultTypes.ts`
- add builder/sink helpers in `src/vaultReceipts.ts`
- define the replay-safe input summary types from this note

### Phase 3 — local JSONL sink (`VRE-03`)
- implement additive local JSONL append
- implement latest/by-execution read helpers
- freeze spool-path policy

### Phase 4 — execution binding (`VRE-04`)
- make `logExecution()` return execution metadata, especially `execution_id`
- keep existing logging behavior intact

### Phase 5 — primary surface emission (`VRE-05`)
- emit receipts for `/vault` and live `/vault:`
- capture selection metadata and prepared prompt baseline

### Phase 6 — secondary surface emission (`VRE-06`)
- emit receipts for `/route` and grounding
- capture fixed-template and framework-resolution provenance

### Phase 7 — inspection (`VRE-07`)
- add operator receipt inspection by latest and by `execution_id`

### Phase 8 — replay core (`VRE-08`)
- regenerate prepared prompts from stored provenance
- classify drift vs unavailable
- status: implemented in package internals

### Phase 9 — replay surface (`VRE-09`)
- expose replay as a deterministic command/tool
- status: implemented through `/vault-replay <execution_id>` and `vault_replay({ execution_id })`

### Phase 10 — docs and test hardening (`VRE-10`)
- strengthen coverage across all receipt/replay surfaces
- update README and operator docs once behavior exists

## Open decisions
These are intentionally left open after the architecture freeze because they do not block the v1 contract.

1. **Exact spool path + rotation policy**
   - v1 requires deterministic local JSONL storage
   - the exact path, naming, and retention/rotation policy can freeze in `VRE-03`

2. **Whether `/route` and grounding should also create dedicated execution rows before receipt emission**
   - the receipt contract assumes execution binding exists
   - the minimal implementation path may reuse current logging semantics or add explicit logging at those surfaces

3. **Inspection and replay surface shape**
   - slash-command only vs slash-command + tool
   - headless operator use matters, but that choice can wait until `VRE-07` and `VRE-09`

4. **Future shared-storage promotion**
   - after local usage proves value, selected metadata may deserve central storage
   - that is a separate policy/schema program, not part of v1 local rollout

## Decision summary
For v1, `pi-vault-client` will treat execution receipts as **local, execution-bound, replayable provenance records** keyed by Prompt Vault `execution_id`.

The system stores:
- exact prepared prompt baseline
- replay-safe normalized inputs
- template/company/render/selection metadata

The system does **not** require a Prompt Vault schema migration in phase 1.
That is deliberate, not temporary indecision.

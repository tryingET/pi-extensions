---
summary: "Proposal for a package-owned non-UI prompt-plane seam plus continuation contract that downstream consumers can use without copying vault-client internals or reducing exact-next-step outputs to copy/paste prose."
read_when:
  - "Before implementing the pi-vault-client non-UI seam for orchestrator cognitive-tool consumers."
  - "When deciding how assistant-produced exact-next-step outputs should re-enter vault-client truthfully."
system4d:
  container: "Focused RFC for the prompt-plane and continuation seam owned by pi-vault-client."
  compass: "Preserve pi-vault-client as prompt-plane owner while exposing the smallest headless contract downstream consumers actually need."
  engine: "state pain -> bind authority -> define V3 contract -> reserve V4 graph semantics without prematurely implementing them."
  fog: "The main risks are reducing exact-next-step outputs to copy/paste prose, bypassing package-owned visibility/preparation/receipt rules, or inflating AK into runtime owner for a package-local seam."
---

# RFC — non-UI prompt-plane and continuation contract

## Role in the packet

This RFC is the **package-local seam-shaping document** for the active root wave anchored by:
- root packet: [`../../../../docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`](../../../../docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md)
- root operating slice `OP1`: expose a supported non-UI `pi-vault-client` prompt-plane seam for orchestrator consumers
- repo task: `task:1050`
- downstream boundary context: [`../../../pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`](../../../pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md)

Interpretation rule:
- the root packet answers **why the seam-first wave is current and what order must be preserved**
- root direction + AK tasks answer **what wave is active now**
- this RFC answers **what the first supported package-owned prompt-plane seam should look like**
- later implementation and validation answer **how that seam is realized in code**

## A) Decision in one sentence

`pi-vault-client` should expose a **small headless prompt-plane runtime contract** for non-UI consumers and make `exact_next_prompt` operational through a **machine-readable continuation envelope**, while keeping package-owned visibility, preparation, receipt, and replay semantics canonical and reserving execution-graph lineage for a later V4 runtime.

## B) Current behavior and limitation

### Current behavior

`pi-vault-client` already owns the strongest prompt-plane implementation through package runtime and extension surfaces:
- `/vault`
- live `/vault:`
- `/route`
- grounding / preparation helpers
- company/visibility fail-closed behavior
- shared prompt preparation with governed render inputs
- prepared-prompt markers
- send-time execution binding
- local receipts and replay

Relevant current package truths:
- `src/vaultCommands.ts`
- `src/vaultPicker.ts`
- `src/vaultRoute.ts`
- `src/vaultReceipts.ts`
- `src/vaultDb.ts`
- `tests/vault-commands.test.mjs`
- `tests/vault-replay.test.mjs`

### Current limitation

There is still **no supported package-level non-UI seam** for downstream consumers that need prompt-plane behavior without UI command wiring.

That leaves three bad options:
1. copy or reimplement package-owned selection/preparation/continuation behavior in the consumer
2. import private or unstable `src/*` internals directly as if they were public API
3. reduce assistant-produced exact-next-step outputs to human copy/paste instead of a truthful continuation contract

There is also a specific continuation gap:
- `controlled_vocabulary.output_commitment = exact_next_prompt` exists as governed metadata
- but the runtime does **not** yet operationalize assistant output into a package-native continuation path
- so exact-next-step outputs remain descriptive text instead of executable package-owned continuation truth

## C) Authority split to preserve

Preserve this split unless a later explicit decision changes it:

- **package docs** own the local contract description and implementation guidance for this seam
- **repo-root Vision** stays docs-owned
- **root SG / TG / operating slices / task rollout truth** may live in root docs + `ak direction` + AK tasks as currently declared by the monorepo
- **AK tasks / decisions** own execution and governance workflow state
- **`pi-vault-client`** remains the canonical owner of prompt-plane runtime semantics:
  - template visibility
  - company-context resolution
  - shared preparation
  - continuation parsing/validation
  - prepared-prompt integrity
  - receipts and replay for package-owned execution surfaces
- **AK is not the runtime owner** of this seam just because the strategic/tactical rollout is tracked there

## D) Requested change

### Primary change

Add a supported **headless prompt-plane contract** for non-UI consumers, owned by `pi-vault-client`.

That contract should cover two things together:
1. **selection preparation** — prepare a visible template/query/context through the same package-owned rules used by `/vault` / live `/vault:`
2. **continuation preparation** — consume a machine-readable continuation envelope emitted by an assistant response and turn it into the next lawful prepared prompt candidate through the same package-owned rules

### Explicit V3 target

Build **V3**, not V0/V1/V2 stopgaps:
- supported non-UI runtime seam
- machine-readable continuation envelope
- package-owned preparation semantics
- no execution-graph runtime yet

### Explicit V4 horizon

Design now for a later **V4 continuation graph** where:
- one execution can emit a continuation candidate
- that candidate can be accepted / edited / rejected / replaced
- replay/drift can reason about parent -> child execution edges

But do **not** require V4 graph persistence or AK-native runtime ownership in the V3 build.

## E) Why this matters

- downstream consumers such as `pi-society-orchestrator` need deterministic prompt-plane access without raw prompt-plane bypass
- exact-next-step outputs should become **runtime-meaningful**, not only prose humans must retype
- package-owned visibility, render, receipt, and replay invariants should not be duplicated in multiple packages
- the seam should stay narrow enough that `pi-vault-client` remains clearly the prompt-plane owner and the consumer remains a consumer

## F) Proposed API shape

The contract should stay headless and minimal.

### Proposed package entrypoint

```ts
import { createVaultPromptPlaneRuntime } from "pi-vault-client/prompt-plane";
```

### Proposed runtime shape

```ts
export interface PromptPlaneExecutionContext {
  cwd?: string;
  currentCompany?: string;
}

export interface PromptSelectionRequest {
  query: string;
  context?: string;
}

export interface VaultContinuationEnvelopeV1 {
  contract_version: 1;
  status: "ready" | "ambiguous" | "blocked";
  resolution:
    | {
        kind: "exact_template";
        template_name: string;
        allow_picker_fallback?: boolean;
      }
    | {
        kind: "picker_query";
        query: string;
        allow_picker_fallback: true;
      };
  preparation?: {
    context?: string;
    args?: string[];
    inherit_current_company?: boolean;
  };
  provenance?: {
    source_template?: string;
    source_execution_id?: number;
    source_output_commitment?: string;
  };
}

export interface PreparedPromptPlaneCandidate {
  ok: boolean;
  status: "ready" | "ambiguous" | "blocked";
  selection_mode?: "exact" | "picker-fzf" | "picker-fallback";
  template?: {
    name: string;
    artifact_kind: string;
    control_mode: string;
    formalization_level: string;
    owner_company: string;
    visibility_companies: string[];
    version?: number;
    id?: number;
  };
  prepared_text?: string;
  blocking_reason?: string;
  render?: {
    engine?: string;
    explicit_engine?: string | null;
    context_appended?: boolean;
    used_render_keys?: string[];
  };
}

export interface VaultPromptPlaneRuntime {
  prepareSelection(
    request: PromptSelectionRequest,
    ctx: PromptPlaneExecutionContext,
  ): Promise<PreparedPromptPlaneCandidate>;

  prepareContinuation(
    envelope: VaultContinuationEnvelopeV1,
    ctx: PromptPlaneExecutionContext,
  ): Promise<PreparedPromptPlaneCandidate>;
}

export function createVaultPromptPlaneRuntime(): VaultPromptPlaneRuntime;
```

## G) Continuation envelope contract

A continuation is only executable when it is emitted as a **machine-readable envelope**, not prose alone.

### Required rule

Plain language like:
- `next_prompt: analysis-router`

is **not** enough to count as package-native continuation truth.

The assistant output must instead emit a structured continuation block that the runtime can validate.

### Minimal example

```yaml
vault_continuation:
  contract_version: 1
  status: ready
  resolution:
    kind: exact_template
    template_name: analysis-router
    allow_picker_fallback: false
  preparation:
    context: |
      Teacher-facing two-way local translation web app;
      Tailscale access;
      no data storage.
    args: []
    inherit_current_company: true
  provenance:
    source_template: execution-chain-overview
    source_output_commitment: exact_next_prompt
```

### Required semantics

- `ready` means the runtime should be able to prepare the next prompt now
- `ambiguous` means the runtime may need picker-style resolution through package-owned logic
- `blocked` means the assistant must name the prerequisite instead of pretending continuation is legal

## H) Invariants

Any implementation of this contract must preserve these invariants:

1. **Visibility invariant**
   - the seam must use the same company/visibility rules as `/vault`, live `/vault:`, and current tool surfaces
2. **Preparation invariant**
   - the seam must use package-owned preparation/render logic rather than consumer-side prompt assembly
3. **No prose-as-control-plane invariant**
   - exact-next-step outputs become operational only through the continuation envelope, not ad hoc parsing of arbitrary prose
4. **No raw-internal-import invariant**
   - downstream consumers should not treat `src/vaultCommands.ts`, `src/vaultPicker.ts`, or direct DB helpers as their supported seam
5. **No AK-runtime-inflation invariant**
   - AK may track rollout and decisions, but that does not make AK the canonical runtime owner of prompt-plane continuation semantics
6. **Prepared-integrity invariant**
   - when the package later binds prepared continuations to execution receipts, edited prepared text must not be attributed as if it were the original prepared candidate

## I) Compatibility and migration

### Backwards compatibility expectations

- existing `/vault`, live `/vault:`, `/route`, and tool surfaces remain package-owned and compatible
- the non-UI runtime seam is additive
- consumers stop relying on private/internal imports or duplicated prompt-plane logic

### V3 migration path

1. publish this contract
2. expose the package-level headless prompt-plane runtime
3. implement selection preparation through that runtime
4. implement continuation-envelope preparation through that runtime
5. cut the first downstream consumer to the supported seam
6. prove parity through focused package and consumer tests

### Explicit non-goals for V3

Do **not** require in V3:
- AK-native continuation storage
- graph persistence for continuation edges
- branch-level continuation analytics
- UI trigger registration as part of the public non-UI seam

## J) Alternatives considered

### Alternative 1 — keep current extension-only surfaces and let consumers improvise
Rejected because it encourages raw prompt-plane duplication or hidden imports.

### Alternative 2 — parse freeform assistant prose for `next_prompt`
Rejected because prose is too ambiguous to serve as a truthful control plane.

### Alternative 3 — move continuation runtime into AK now
Rejected because no exact missing canonical fact has yet been proven that forces AK-native runtime ownership for this seam.

### Alternative 4 — extract a shared prompt-runtime package immediately
Deferred because the owner package should first prove the seam shape cleanly before widening package boundaries.

## K) Acceptance criteria

- [ ] `pi-vault-client` exposes a documented package-level non-UI prompt-plane runtime for downstream consumers
- [ ] the runtime can prepare a visible template/query/context without UI command wiring
- [ ] the runtime can prepare a continuation from a `VaultContinuationEnvelopeV1`
- [ ] exact-next-step outputs stop depending on human copy/paste when the continuation envelope is present
- [ ] downstream consumers no longer need private/raw imports to access prompt-plane behavior
- [ ] package-owned visibility/preparation rules remain canonical
- [ ] V4 continuation-graph semantics remain explicitly reserved rather than half-implemented implicitly
- [ ] no AK-native runtime/schema cutover is implied by the V3 seam

## L) Implementation sketch

- expose one package entrypoint for the headless prompt-plane runtime
- keep command registration, live picker wiring, and UI-only helpers in the extension layer
- factor selection preparation into runtime-owned methods callable without slash-command/input wiring
- add continuation-envelope validation and preparation using the same company/preparation pipeline
- prove package-local behavior with focused tests
- prove downstream consumer adoption with a narrow consumer-side harness
- keep receipt/replay lineage extension-ready so V4 graph work can attach later without redefining the V3 seam

## M) Companion docs

- root packet: [`../../../../docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`](../../../../docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md)
- package vision: [`vision.md`](vision.md)
- package resources: [`resources.md`](resources.md)
- downstream boundary ADR: [`../../../pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`](../../../pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md)
- current receipt/replay runtime contract: [`../dev/vault-execution-receipts.md`](../dev/vault-execution-receipts.md)

## N) Copy-paste issue body

### What do you want to change?

Expose a supported package-owned non-UI prompt-plane runtime from `pi-vault-client` and operationalize exact-next-step outputs through a machine-readable continuation envelope.

### Why?

Downstream consumers need deterministic prompt-plane access without private imports or duplicated prompt logic, and exact-next-step outputs should re-enter package truthfully instead of depending on human copy/paste.

### How? (optional)

Add a headless prompt-plane runtime entrypoint, support both selection preparation and continuation-envelope preparation, keep visibility/preparation/receipt semantics package-owned, and reserve execution-graph lineage for a later V4 runtime.

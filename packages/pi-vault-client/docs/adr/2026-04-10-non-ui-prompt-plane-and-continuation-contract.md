---
summary: "Accepted package-level decision for a supported pi-vault-client non-UI prompt-plane seam and machine-readable continuation envelope, with V3 build scope now and V4 graph persistence explicitly deferred."
status: accepted
read_when:
  - "You need the adopted package-level contract for the non-UI prompt-plane seam."
  - "You are implementing or reviewing task #1050."
  - "You need the durable accepted decision after the RFC/review chain closed."
system4d:
  container: "Package-local ADR for pi-vault-client prompt-plane runtime ownership and continuation semantics."
  compass: "Keep prompt-plane ownership in pi-vault-client while exposing the smallest stable headless seam downstream consumers need."
  engine: "bind authority -> accept V3 seam -> defer V4 graph persistence -> preserve package-owned invariants."
  fog: "The main risks are bypassing package-owned visibility/preparation rules, treating prose as control-plane truth, or implying AK-native runtime ownership by accident."
---

# ADR — pi-vault-client non-UI prompt-plane and continuation contract

## Status

Accepted as the package-level architectural contract for `decision:14`.

This ADR records the accepted seam shape.
It does **not** claim that the runtime is already implemented.
Implementation remains the follow-on execution slice tracked by task `#1050`.

## Context

`pi-vault-client` already owns the strongest prompt-plane runtime in the monorepo through:
- visibility-aware template resolution
- company-context fail-closed behavior
- shared prompt preparation
- slash-command and live-trigger package surfaces
- package-owned receipt and replay semantics

What it still lacks is a **supported package-level non-UI seam** for downstream consumers that need prompt-plane behavior without UI wiring or private source imports.

That leaves three unacceptable fallback patterns:
1. consumer-side duplication of prompt-plane behavior
2. private/raw imports from `src/*`
3. prose-only "next prompt" outputs that are not machine-actionable under package-owned rules

The current root wave and orchestrator boundary documents already fix the ordering and owner split:
- prompt-plane seam first
- KES/loop activation later
- `pi-vault-client` remains the prompt-plane owner
- AK tracks decision/execution workflow but is not the runtime owner of this seam

## Decision

### 1. Expose a supported headless prompt-plane runtime from `pi-vault-client`

The first supported non-UI consumer seam is a package-owned headless runtime exposed from:

```ts
import { createVaultPromptPlaneRuntime } from "pi-vault-client/prompt-plane";
```

This runtime is additive.
Existing `/vault`, live `/vault:`, `/route`, grounding, and tool surfaces remain package-owned and continue to exist.

### 2. Build V3 now

The accepted **build target** is V3:
- supported non-UI prompt-plane runtime seam
- selection preparation through that seam
- continuation-envelope preparation through that seam
- package-owned visibility/preparation/receipt/replay invariants preserved

This ADR does **not** accept stopgaps that reduce the seam to private imports, UI glue reuse, or prose parsing.

### 3. Make `exact_next_prompt` operational only through a machine-readable continuation envelope

Exact-next-step outputs are operational only when emitted as a validated continuation envelope under the package-owned contract.

Plain prose such as:
- `next_prompt: analysis-router`

is not sufficient to count as package-native continuation truth.

The runtime must validate a structured continuation envelope and prepare the next prompt candidate through the same package-owned rules used for normal prompt preparation.

### 4. Preserve package-owned runtime invariants

The seam must preserve these invariants:
- **visibility invariant** — use the same company/visibility rules as the existing package runtime
- **preparation invariant** — use package-owned preparation/render logic rather than consumer-side prompt assembly
- **receipt/replay invariant** — keep provenance and later replay anchored to package-owned execution semantics
- **no prose-as-control-plane invariant** — freeform prose alone does not become executable continuation truth
- **no raw-internal-import invariant** — downstream consumers must not treat `src/*` files as the public API
- **no AK-runtime-inflation invariant** — AK rollout/governance truth does not imply AK runtime ownership

### 5. Reserve V4 graph persistence explicitly, but do not implement it now

The accepted **design horizon** is V4 continuation-graph lineage.
That later horizon may capture parent/child continuation relationships and richer replay/drift reasoning.

But V4 graph persistence is **not** part of this slice.
This ADR explicitly defers:
- continuation-edge persistence
- graph analytics
- AK-native continuation storage
- broader branch lineage behavior

## Consequences

### Positive
- downstream consumers get a stable supported seam
- package-owned invariants stay canonical in one place
- `exact_next_prompt` becomes operational without waiting for V4 graph persistence
- the seam stays narrow enough to keep ownership obvious

### Costs
- `pi-vault-client` must add a public entrypoint and package-facing types
- selection/preparation helpers need to be refactored into a headless-friendly runtime surface
- focused docs/tests/packaging proof are required before consumer cutover

### Risks
- consumers may still try to use private imports until the supported seam is shipped and documented
- continuation semantics could widen accidentally into graph persistence if scope is not held tightly
- packaging/export drift could make the seam appear public in repo source but not in installed artifacts

### Mitigations
- keep task `#1050` package-scoped and bounded
- require focused contract tests and package validation
- keep V4 explicitly named as deferred in docs and code
- do not attach downstream cutover work to this first package-local implementation slice

## Non-goals

This ADR does **not**:
- move runtime ownership into AK
- implement V4 continuation graph persistence
- cut over `pi-society-orchestrator` in the same slice
- introduce a shared prompt-runtime package immediately
- redefine receipt/replay storage or persistence policy beyond what the package already owns

## Implementation boundary

The first execution slice under this ADR should:
- expose the package entrypoint
- support selection preparation
- support continuation-envelope preparation
- keep continuation operational only through the machine-readable envelope
- add focused package-local tests and docs

The first execution slice should **not**:
- widen into orchestrator integration work
- add graph persistence
- move persistence/runtime authority outside `pi-vault-client`
- dilute company/visibility fail-closed behavior

## Validation anchors

Keep this ADR aligned with:
- [RFC — non-UI prompt-plane and continuation contract](../project/2026-04-09-rfc-non-ui-prompt-plane-and-continuation-contract.md)
- [Review memo — non-UI prompt-plane and continuation contract](../project/2026-04-10-review-non-ui-prompt-plane-and-continuation-contract.md)
- [Implementation plan — non-UI prompt-plane V3](../project/2026-04-10-plan-non-ui-prompt-plane-v3.md)
- [Validation / rollout / rollback — non-UI prompt-plane V3](../project/2026-04-10-validation-rollout-rollback-non-ui-prompt-plane-v3.md)
- [Root seam-first packet](../../../../docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md)
- [Orchestrator control-plane boundaries ADR](../../../pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md)
- [ASC public execution contract](../../../pi-autonomous-session-control/docs/project/public-execution-contract.md)

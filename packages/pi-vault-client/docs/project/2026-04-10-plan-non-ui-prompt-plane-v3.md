---
summary: "Post-ADR implementation plan for task 1050: expose the supported pi-vault-client prompt-plane headless seam, add continuation-envelope preparation, and keep the slice package-local, V3-only, and invariant-preserving."
read_when:
  - "You are executing task #1050 after decision #14 is accepted."
  - "You need the bounded post-ADR implementation plan for the pi-vault-client prompt-plane seam."
  - "You want the exact package-local execution scope before touching runtime exports, tests, or docs."
type: "plan"
system4d:
  container: "Bounded post-ADR execution plan for the pi-vault-client prompt-plane seam."
  compass: "Ship V3 seam truthfully without widening into downstream cutover or V4 persistence."
  engine: "publish seam -> reuse package-owned preparation -> add continuation envelope -> prove with tests/docs."
  fog: "The main risk is letting the first seam slice sprawl into consumer migration, AK ownership, or graph work."
---

# Implementation Plan — pi-vault-client Non-UI Prompt-Plane Seam (V3)

## Scope

This plan covers only the first bounded post-ADR slice under decision `#14`.

In scope:
- expose a supported package entrypoint for the non-UI prompt-plane runtime
- support selection preparation through that seam
- support continuation-envelope preparation through that seam
- make exact-next-step outputs operational only through the machine-readable continuation envelope
- preserve package-owned visibility / preparation / receipt / replay invariants
- add focused tests and docs for the new seam
- keep all code/doc changes scoped to `packages/pi-vault-client/**`

Out of scope:
- `pi-society-orchestrator` consumer cutover
- AK-native runtime ownership or storage for continuations
- V4 continuation-graph persistence or lineage analytics
- shared prompt-runtime package extraction
- Prompt Vault schema changes
- any cross-package code changes unless a later blocker proves them necessary

## Work packages

### 1) Publish the package-owned headless seam

Add the supported runtime entrypoint described by the RFC/ADR, with a public package path such as:

```ts
import { createVaultPromptPlaneRuntime } from "pi-vault-client/prompt-plane";
```

This package entrypoint should:
- compose the existing provider-owned runtime pieces rather than duplicating them
- be headless-importable outside slash-command/live-trigger registration
- expose only the seam that non-UI consumers actually need
- stay clearly narrower than the full extension surface

Expected package-side work:
- add package export map / entrypoint file(s)
- add public types for request/context/result contracts
- keep internal command registration and UI-only helpers out of the public seam

### 2) Support selection preparation through the seam

Selection preparation should reuse package-owned rules already present in runtime helpers.

Required behavior:
- resolve explicit company context through the same fail-closed logic as current vault reads
- support exact-name preparation first
- support query-based preparation through package-owned candidate selection rules
- return a structured prepared-candidate result rather than raw prompt assembly side effects
- preserve template metadata and render/provenance details needed by downstream consumers

Implementation direction:
- factor or wrap current helper behavior from `src/vaultDb.ts`, `src/vaultPicker.ts`, and related preparation helpers
- avoid making UI picker registration itself part of the public runtime contract
- keep consumer-side prompt assembly out of scope

### 3) Support continuation-envelope preparation through the seam

Add continuation-envelope parsing/validation/preparation for the accepted V1 contract.

Required behavior:
- validate the continuation envelope as machine-readable contract input
- support `ready`, `ambiguous`, and `blocked` continuation states truthfully
- support both exact-template and picker-query resolution forms
- run continuation preparation through the same visibility/company/preparation pipeline as selection preparation
- reject prose-only control-plane fallbacks

Implementation direction:
- define the continuation-envelope types in the public seam
- keep the first contract minimal and deterministic
- treat continuation preparation as the same prompt-plane owner logic, not as a downstream consumer concern

### 4) Preserve receipt/replay and prepared-integrity boundaries

The first seam slice must not erode package-owned provenance boundaries.

Required guardrails:
- no raw consumer-side bypass around package preparation
- no prose parsing as substitute continuation truth
- no claim that edited prepared text still represents the original prepared candidate
- no V4 graph persistence in this slice
- no implication that AK owns prompt-plane runtime semantics

Implementation note:
- if continuation preparation needs provenance fields, keep them envelope-local and package-owned
- do not widen storage/persistence beyond current package-local receipt/replay boundaries in this slice

### 5) Prove the seam with focused tests and docs

Add package-local proof that the new seam is both supported and bounded.

Expected coverage:
- public entrypoint is importable/headless-safe
- selection preparation respects explicit company context and fail-closed visibility
- continuation-envelope preparation works for exact and query-based resolution paths
- prose-only next-step text does not become operational continuation truth
- README / contract docs explain the public seam and its non-goals
- package validation still passes after the new public export lands

Likely validation lanes:
- targeted node tests for the prompt-plane seam
- `npm run docs:list`
- `npm run typecheck`
- `npm run check`
- `npm run release:check` if export / packaging behavior changes

## Expected outputs

- public prompt-plane entrypoint for `pi-vault-client`
- public request/context/result types for the seam
- selection preparation implemented through the headless runtime
- continuation-envelope preparation implemented through the headless runtime
- focused tests for the seam
- package docs updated so downstream consumers can use the supported surface without private imports

## Completion criteria

This post-ADR implementation slice is complete when:
- `pi-vault-client` exposes the documented non-UI prompt-plane runtime seam
- selection preparation works through the supported seam
- continuation-envelope preparation works through the supported seam
- `exact_next_prompt` becomes operational only through the machine-readable continuation envelope
- package-owned visibility / preparation / receipt / replay invariants remain intact
- V4 graph persistence remains explicitly deferred
- package-local validation passes

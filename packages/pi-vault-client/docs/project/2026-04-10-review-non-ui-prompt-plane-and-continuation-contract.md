---
summary: "Structured review memo for decision 14, concluding that the pi-vault-client non-UI prompt-plane RFC is bounded and implementation-ready enough for ADR: package-owned headless seam now, continuation envelope now, V4 graph lineage later."
read_when:
  - "You are deciding whether decision #14 is ready for ADR."
  - "You need the canonical current-track review memo for the pi-vault-client prompt-plane seam."
  - "You want the exact non-blocking concerns task #1050 should carry after ADR instead of treating them as pre-ADR blockers."
type: "proposal"
proposal_status: "reviewed"
decision_id: 14
system4d:
  container: "Current-track review closure for the pi-vault-client prompt-plane seam decision."
  compass: "Confirm the RFC is bounded and execution-ready without reopening owner split or widening scope."
  engine: "reconstruct truth -> test objections -> classify blockers vs post-ADR work -> issue review outcome."
  fog: "The main risk is mistaking missing decision-lifecycle artifacts for missing architecture truth."
---

# Structured Review Memo — pi-vault-client Non-UI Prompt-Plane and Continuation Contract

## Review attempt

This is **review attempt 1** for `decision:14`.

It evaluates:
- `docs/project/2026-04-09-rfc-non-ui-prompt-plane-and-continuation-contract.md`
- `diary/2026-04-09-vault-prompt-plane-contract-binding.md`
- `next_session_prompt.md`
- `README.md`
- `docs/dev/vault-execution-receipts.md`
- `../../../../docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`
- `../../../pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`
- `../../../pi-autonomous-session-control/docs/project/public-execution-contract.md`
- `src/vaultDb.ts`
- `src/vaultPicker.ts`
- `src/vaultRoute.ts`
- `src/vaultGrounding.ts`
- `src/vaultTypes.ts`

Observed runtime / workflow checks reviewed during this pass:
- `npm run docs:list`
- `npm run typecheck`
- `npm run check`
- `git status --short`
- `./scripts/ak.sh task ready -F json`
- `./scripts/ak.sh task show 1050 -F json`
- `./scripts/ak.sh decision get 14 -F json`
- `./scripts/ak.sh decision passport 14 -F json`
- `./scripts/ak.sh direction export --repo . -F json`

## Review scope

Primary question:
- Is the RFC sufficiently bounded, authority-safe, and execution-shaped to proceed to ADR for `decision:14` without reopening seam ownership or widening into V4 graph persistence?

Supporting questions:
- Does the RFC preserve `pi-vault-client` as the runtime owner of prompt-plane semantics instead of inflating AK into runtime owner by implication?
- Does it choose the correct first public seam shape: a package-owned headless runtime rather than UI glue or consumer-side reimplementation?
- Does it operationalize `exact_next_prompt` through a machine-readable continuation envelope instead of prose parsing?
- Does it keep the first build target at V3 while reserving V4 graph lineage explicitly rather than half-implementing it now?

## Lens 1 — Authority split and ownership

### Assessment
**Resolved enough for ADR**

The RFC preserves the correct owner split already established by the root packet and orchestrator boundary ADR:
- `pi-vault-client` remains the canonical owner of template visibility, company resolution, preparation, continuation validation, receipts, and replay
- `pi-society-orchestrator` remains a downstream control-plane consumer rather than a prompt-plane owner
- AK tracks the strategic/tactical rollout, but does not become the runtime owner of the seam

Fresh truth does not contradict that split.
The current package already owns the strongest runtime substrate through `createVaultRuntime()`, `createPickerRuntime()`, `createGroundingRuntime()`, command wiring, tool wiring, receipt management, and replay.
The missing fact is a supported non-UI seam over that substrate, not a different owner.

## Lens 2 — V3 target versus V4 horizon

### Assessment
**Resolved enough for ADR**

The RFC makes the correct build/design distinction:
- **build now:** V3 headless seam + continuation envelope
- **reserve for later:** V4 continuation graph persistence and lineage analytics

That split is necessary and credible.
Current package truth already shows strong local receipt/replay semantics, but nothing reviewed here proves that graph persistence must land now.
Treating V4 lineage as the design horizon without implementing it in this slice keeps the seam honest and bounded.

## Lens 3 — Runtime fit with current package reality

### Assessment
**Resolved enough for ADR**

The reviewed source confirms that the package already has the necessary runtime ingredients for a public seam:
- `src/vaultDb.ts` exposes the visibility-aware vault runtime substrate
- `src/vaultPicker.ts` already centralizes picker-side selection and preparation helpers
- `src/vaultRoute.ts` already centralizes fixed-template route preparation
- `src/vaultGrounding.ts` already centralizes package-owned grounding preparation
- `docs/dev/vault-execution-receipts.md` plus receipt/replay code prove that execution-bound provenance is already package-owned and local-first

So the architecture question is no longer whether `pi-vault-client` can own this seam.
It already does in practice.
The missing work is packaging that behavior into a supported headless contract and adding continuation-envelope preparation under the same invariants.

## Lens 4 — Downstream seam pressure and precedent

### Assessment
**Resolved enough for ADR**

The downstream orchestrator ADR explicitly expects an upstream non-UI seam from `pi-vault-client` rather than raw consumer imports.
The ASC public execution contract provides the relevant monorepo precedent for how to expose such a seam truthfully:
- keep runtime ownership in the provider package
- expose a small package entrypoint
- avoid turning private implementation files into the supported integration API

The RFC matches that precedent well.
It does not widen into a premature shared package extraction, and it does not require consumer-side duplication.

## Main objections considered

### Objection A
"Because decision #14 is still `review_pending` and task #1050 is not ready, the seam contract must still be under-specified."

Response:
- rejected as a contract objection
- the AK state shows governance gating, not missing architectural direction
- the passport's missing pieces are lifecycle artifacts (`review_memo`, ADR, post-ADR pack), not fresh contradictions to the RFC
- queue blockage here is decision-workflow incompleteness, not proof that the seam shape is wrong

### Objection B
"`exact_next_prompt` should remain prose-only until V4 graph persistence exists."

Response:
- rejected
- the RFC correctly draws the boundary: prose alone is too ambiguous to count as package-native continuation truth
- a machine-readable continuation envelope is both smaller and safer than jumping straight to graph persistence
- V4 lineage can attach later without redefining the V3 control surface

### Objection C
"The continuation/runtime seam should move into AK now because AK is tracking the rollout."

Response:
- rejected
- no reviewed evidence proves an exact missing canonical fact that forces AK-native runtime ownership
- the strongest existing runtime and invariants remain inside `pi-vault-client`
- moving ownership now would widen both implementation and governance risk without closing a proven gap

## Review outcome

**Outcome: `ready_for_adr`**

Why:
- the owner split is already explicit and still holds under fresh inspection
- the V3 build target is bounded and implementation-shaped
- the package already owns the necessary preparation and provenance substrate
- the missing work is a supported seam plus continuation contract, not pre-ADR architecture discovery
- no fresh evidence reviewed here contradicts the RFC or decision framing

## Non-blocking concerns for ADR

These remain real follow-through obligations, but they do **not** block ADR:

1. expose a publishable package entrypoint and export map for the headless seam
2. shape public types so downstream consumers do not need private `src/*` imports
3. add focused tests that prove selection preparation, continuation-envelope preparation, and no-prose-as-control-plane behavior
4. add package docs and packaging validation for the new public seam
5. keep V4 graph persistence explicitly out of this slice even if receipt lineage hooks are left extension-ready

## Legal next move

The next legal move is:
1. record an ADR for `decision:14`
2. attach the bounded implementation-plan and validation / rollout / rollback artifacts
3. re-evaluate linked task `#1050` as the first still-valid post-ADR execution slice
4. unblock the decision so task `#1050` can become the truthful execution anchor

## Follow-through obligations for ADR

The ADR should preserve these points explicitly:
1. `pi-vault-client` owns the non-UI prompt-plane seam at runtime
2. the first supported consumer seam is `pi-vault-client/prompt-plane`
3. exact-next-step outputs become operational only through a machine-readable continuation envelope
4. V3 is the build target
5. V4 graph persistence stays deferred
6. no AK-native runtime ownership is implied by the decision workflow
7. task `#1050` stays bounded to package-local seam implementation, tests, and docs

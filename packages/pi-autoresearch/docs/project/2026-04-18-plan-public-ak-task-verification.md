---
summary: "Post-ADR implementation plan for task 1709: add explicit public task-context verification state to autoresearch_llamacpp_campaign_control, keep local status/advance usable without AK, and preserve the lower-level technical build_ak_binding helper as a distinct contract."
read_when:
  - "You are executing task 1709 after decision 17 was accepted and ADR-recorded."
  - "You need the bounded post-ADR implementation plan for public AK task verification semantics in pi-autoresearch."
  - "You want the exact code/test/doc scope before touching the public campaign-control surface."
type: "plan"
system4d:
  container: "Bounded post-ADR execution plan for public AK task verification semantics in pi-autoresearch."
  compass: "Ship truthful public task-context semantics without turning the public seam into an AK-dependent controller or collapsing it into the technical helper contract."
  engine: "add bounded verifier seam -> expose task-context state -> tighten public AK-bound fields -> prove graceful degradation -> update bounded docs."
  fog: "The main risk is over-coupling the public helper to AK or silently changing the lower-level technical binding helper into the same stricter contract."
---

# Implementation Plan — public AK task verification semantics for `autoresearch_llamacpp_campaign_control`

## Scope

This plan covers only the first bounded post-ADR slice under `decision:17` and task `#1709`.

In scope:
- add explicit public task-context verification state to `packages/pi-autoresearch/src/core/llamacppCampaign.ts`
- attempt bounded read-only live AK verification when `taskId` is supplied to the public control seam
- expose surfaced task-context state such as `not_requested`, `verified_live`, `not_found`, and `verification_unavailable`
- make public `akBinding`, `taskBound`, and `completionCandidate` depend on verified live task context
- preserve package-local `status` / `advance` behavior when AK verification is unavailable or the task does not exist
- update public reason / next-action wording so it does not imply live AK truth unless verification succeeded
- add focused tests in `packages/pi-autoresearch/tests/llamacpp-campaign.test.ts`
- update bounded package docs in allowed repo paths if behavior wording changes materially

Out of scope:
- direct AK mutation
- fuzzy task lookup or task creation
- changes to the lower-level technical `autoresearch_llamacpp_campaign action=build_ak_binding` helper contract
- broader public controller widening
- whole-campaign execution behavior changes
- cross-package code changes outside the task scope

## Work packages

### 1) Add a bounded public verifier seam

Add one bounded exact-task read-only verification path inside the public control implementation.

Required behavior:
- when `taskId` is omitted, do not query AK
- when `taskId` is supplied, validate integer shape first
- then attempt a bounded read-only exact-task verification
- classify the result as one of:
  - `not_requested`
  - `verified_live`
  - `not_found`
  - `verification_unavailable`

Implementation direction:
- keep the verifier seam narrow and deterministic
- do not import broader orchestrator lifecycle behavior
- do not write AK evidence, complete tasks, or create tasks
- keep the failure model explicit rather than collapsing all non-success paths into one silent fallback

### 2) Extend the public control surface with explicit task-context state

Update the public control result shape so it no longer relies on a single implicit interpretation of `taskId`.

Required behavior:
- add `taskContext` to the public control surface
- carry:
  - supplied task id
  - verification state
  - verified task id when present
  - short reason
- ensure the formatter renders this state clearly enough for operators to notice the difference between supplied and verified context

Implementation direction:
- keep the result additive and machine-readable
- do not let the human formatter hide the new contract

### 3) Tighten public AK-bound fields

Update the public seam so the following are only true under verified live task context:
- `akBinding !== null`
- `taskBound = true`
- `completionCandidate = true`

Required behavior:
- `akBinding` remains null unless verification succeeds
- `taskBound` becomes true only for `verified_live`
- `completionCandidate` becomes true only when verification succeeds and the verified binding lifecycle says `complete_task_candidate`

Implementation direction:
- keep the lower-level technical binding helper unchanged
- only the public seam gets the stricter verified-context contract in this slice

### 4) Preserve graceful package-local degradation

The public seam must stay useful when AK is not available.

Required behavior:
- `status` continues to return local public control truth when verification is `not_found` or `verification_unavailable`
- `advance` continues to plan/apply one lawful local next step in the same cases
- blocked local states must still fail for local reasons, not merely because AK could not be queried

Implementation direction:
- treat missing or unavailable verification as a downgrade in public AK context, not as a loss of package-local control behavior

### 5) Update public wording and proofs

The current wording can imply live AK truth too easily.

Required behavior:
- update public reason text so it distinguishes:
  - no task requested
  - verified task context
  - task not found
  - verification unavailable
- update next-action text for terminal completion so it only references verified AK task completion evaluation when verification actually succeeded
- add focused tests that prove all verification states and the tightened field semantics

## Expected outputs

- bounded verifier seam for exact-task read-only AK verification inside the public control surface
- explicit `taskContext` state in the public control result
- stricter public `akBinding` / `taskBound` / `completionCandidate` semantics
- focused tests for all verification states plus graceful degradation
- bounded doc updates for the new accepted contract and implementation reality

## Completion criteria

This post-ADR implementation slice is complete when:
- public task-context verification state is explicit and surfaced
- the public seam only exposes AK-bound semantics when live verification succeeds
- `status` and `advance` still work package-locally when verification is unavailable or the task does not exist
- the lower-level technical `build_ak_binding` helper remains a distinct contract
- focused package tests pass
- bounded package validation passes

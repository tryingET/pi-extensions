---
summary: "Post-ADR implementation plan for the first bounded workflow-composition slice in pi-society-orchestrator: land a narrow workflow core and thin adapter over ASC before any persistence-first or builder-first follow-on."
read_when:
  - "After ADR acceptance for decision 20 and before implementing the first chain/parallel/worktree slice."
  - "When turning the accepted workflow-composition ADR into bounded execution work without reopening the architecture."
type: "reference"
system4d:
  container: "Package-local post-ADR implementation plan for the workflow-composition packet in pi-society-orchestrator."
  compass: "Sequence the smallest truthful implementation slices above ASC without letting convenience surfaces become authority."
  engine: "Define the workflow core first -> route execution only through ASC -> add truthful aggregation -> add optional worktree support -> defer convenience surfaces until justified."
  fog: "The main risks are starting with wrappers or persistence, reintroducing private ASC coupling, or letting worktree helpers silently widen the authority model."
---

# Plan — first bounded workflow-composition slice for `pi-society-orchestrator`

## Scope of this plan

This plan covers only the first bounded post-ADR slice under `decision:20`.
It does **not** authorize builder-first UX, saved-workflow authority, peer-session messaging, or a second execution runtime.

## Goal

Land the minimum package surface required to make workflow composition real above ASC while preserving the accepted owner boundaries:

- narrow `WorkflowRequest` / `WorkflowResult` core
- fail-closed routing/team validation
- thin package-facing adapter over the existing orchestrator -> ASC seam
- truthful chain / parallel aggregation
- optional worktree coordination only if the fail-closed boundary is preserved

Interpretation rule:
- the accepted architecture is workflow composition over ASC, not workflow execution beside ASC
- convenience surfaces remain downstream of the core rather than redefining it

## Execution graph

The first slice has one dominant dependency shape:

1. define and validate the workflow core first
2. execute that core only through the existing orchestrator -> ASC seam
3. add truthful chain/parallel aggregation over preserved ASC step truth
4. add optional worktree coordination only after the earlier surfaces are explicit and testable
5. reassess command wrappers or builder affordances only after the thin core proves useful

Interpretation rule:
- do not start with saved workflows
- do not start with worktrees
- do not let wrappers become the architecture

## Units

### WF-1 — workflow core contract

- objective:
  - make chain / parallel workflow composition a first-class package contract rather than an ambient command convention
- outcome:
  - define the narrow request/result types
  - constrain the first slice to current agent profiles and routing semantics
  - reject invalid parallel nesting and invalid worktree usage in Slice A
- dependencies / legal preconditions:
  - ADR `packages/pi-society-orchestrator/docs/adr/2026-04-22-chain-parallel-worktree-ux-over-asc.md`
- authority owner / target substrate:
  - `packages/pi-society-orchestrator` package code/test/docs surface
- failure modes:
  - contract becomes too broad too early
  - commands or persistence shape redefine the core implicitly
- validation / evidence required:
  - focused contract tests
  - negative-path tests for invalid request shapes

### WF-2 — thin workflow adapter over ASC

- objective:
  - execute workflow steps only through the existing orchestrator-side adapter over ASC's public seam
- outcome:
  - add one thin package-facing workflow execution surface
  - perform routing/team validation before execution starts
  - preserve ASC status and `failureKind` truth for each step
- dependencies / legal preconditions:
  - WF-1
- authority owner / target substrate:
  - `packages/pi-society-orchestrator/src/**`
  - `packages/pi-society-orchestrator/tests/**`
- failure modes:
  - private ASC imports leak back in
  - step execution semantics are reinterpreted locally
- validation / evidence required:
  - seam-level tests proving ASC remains the only execution owner
  - fail-closed routing/team validation tests

### WF-3 — orchestrator-owned aggregation

- objective:
  - make fan-out/fan-in summaries truthful without mutating step-level execution truth
- outcome:
  - chain summary and parallel aggregation remain clearly orchestrator-owned
  - workflow-level output stays separate from canonical task/evidence truth
- dependencies / legal preconditions:
  - WF-2
- authority owner / target substrate:
  - orchestrator runtime/docs/test surface
- failure modes:
  - workflow output is treated as canonical authority by convenience
  - aggregation obscures raw step failures
- validation / evidence required:
  - summary/aggregation tests
  - proof that step status and `failureKind` are preserved

### WF-4 — optional worktree coordination

- objective:
  - add bounded worktree support only for eligible parallel groups
- outcome:
  - worktree remains a parallel-group option
  - dirty repo and incompatible cwd cases fail closed
  - diff/patch capture stays orchestrator-owned aggregation
- dependencies / legal preconditions:
  - WF-3
- authority owner / target substrate:
  - orchestrator worktree helpers and tests
- failure modes:
  - worktree becomes workflow-global by accident
  - dirty repo or cwd conflicts are silently tolerated
- validation / evidence required:
  - negative-path tests for dirty repo and incompatible cwd
  - cleanup tests for success/failure cases

### WF-5 — optional convenience adapters later

- objective:
  - reassess thin command wrappers or builder affordances only after WF-1 through WF-4 are proven useful
- outcome:
  - any wrapper remains a thin adapter over the same workflow core
  - saved-workflow or builder work stays explicitly deferred until justified
- dependencies / legal preconditions:
  - WF-2 at minimum; WF-4 if worktree-aware UX is desired
- authority owner / target substrate:
  - package-local commands/UI/docs only if later justified
- failure modes:
  - adapter becomes the de facto authority model
  - `src/chains.yaml` is silently reactivated as runtime truth
- validation / evidence required:
  - wrapper-to-core parity tests
  - explicit justification before landing broader convenience surfaces

## Structural rules for implementation

- consume ASC only through the public seam already accepted in the boundary packet
- do not reintroduce private ASC imports
- do not treat `src/chains.yaml` as live runtime authority in the first slice
- do not hide peer-session messaging inside this packet
- keep execution leaves in AK task truth once implementation work is materialized

## AK task materialization status

No bounded AK task family is materialized yet for this packet.
That is intentional.

Interpretation rule:
- this plan is the post-ADR execution memory
- if implementation proceeds, materialize a bounded task family from this plan rather than using the plan itself as a shadow task queue

## Expected follow-on after this plan lands

After the first slice lands, the next truthful move is not automatic broadening.
It is checking whether the thin workflow surface is actually used enough to justify any saved-workflow or builder follow-on.

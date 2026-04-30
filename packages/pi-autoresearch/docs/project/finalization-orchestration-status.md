---
summary: "Status note for Workstream C of pi-autoresearch: the checked finalization plan artifact, explicit finalization surface, and safe local review-branch materialization workflow are now landed and proven with freshness/safety/materialization tests plus package validation."
read_when:
  - "You need the shortest truthful answer to what Workstream C of pi-autoresearch actually landed."
  - "Before claiming that pi-autoresearch can now plan, approve, and materialize safer local finalization branches."
  - "When starting Workstream D and needing to know which finalization behavior is already real."
type: "reference"
system4d:
  container: "Package-local closure note for the safer finalization orchestration workstream in pi-autoresearch."
  compass: "State exactly what bounded finalization behavior is now real without overstating this slice as AK automation, remote review choreography, or a broader control plane."
  engine: "Summarize the landed plan/approve/materialize layer -> record the bounded proof -> name what changed in operator/runtime behavior -> bound what remains outside the workstream."
  fog: "The main risk is over-claiming this landing as generic git automation, remote review orchestration, or durable campaign-truth ownership."
---

# Status — safer finalization orchestration for `pi-autoresearch`

## Why this note exists

Workstream C in [`product-posture`](./product-posture.md) is now landed across these tasks:

- `#1538` — write the finalization orchestration contract and safety fences
- `#1539` — implement the checked finalization planner and grouped artifact runtime
- `#1540` — implement safe local branch materialization and approval workflow
- `#1541` — prove safer finalization orchestration and update package status truth

This note closes umbrella `#1537` / Workstream C by answering four questions:

1. what is now real in the package runtime
2. what the bounded proof actually proved
3. how the operator/runtime surface changed
4. what still remains outside this workstream

## Umbrella closure snapshot

`#1537` is truthful to close because all four child tasks are now done and their outputs are visible in the package:

- `#1538` froze the contract in `finalization-orchestration-contract.md`
- `#1539` landed the checked `autoresearch.finalization.json` plan artifact plus grouped-plan normalization
- `#1540` landed explicit approval, narrow branch materialization, verification, and local runtime completion
- `#1541` added the remaining freshness/safety proof coverage and updated package status truth

So this note is both the Workstream C status artifact and the umbrella-closure artifact for `#1537`.

## What is now real

## 1. The package now writes one checked finalization-plan artifact with freshness rules

`packages/pi-autoresearch/src/core/finalize.ts` now owns one package-local orchestration artifact:

- `autoresearch.finalization.json`

That artifact stores:

- the current source branch, merge-base, and final-tree commit
- the normalized grouped plan with deterministic branch names
- the Prompt Vault-derived grouping rationale and preserved `groupsJsonDraft`
- explicit approval state
- explicit materialization status and any failure reason

The artifact is still a **projection**, not durable campaign truth.
It is reused only when the current runtime/git posture still matches; otherwise the package marks it stale and tells the operator to refresh it.

## 2. The package now exposes one explicit bounded finalization surface

`packages/pi-autoresearch/extensions/pi-autoresearch.ts` now registers:

- `autoresearch_runtime_finalize`

That surface owns four explicit actions inside the package seam:

- `status`
- `plan`
- `approve`
- `materialize`

This means the operator no longer has to stitch together raw finalize packets, ad hoc git commands, or hidden branch mutations.
The package now has one truthful surface above the bounded runtime/control layer for turning a finalize-worthy campaign into reviewable local branches.

## 3. Materialization now stays behind explicit approval and git-safety fences

The local materialization path is no longer “just trust the finalize packet.”
Before any branch mutation, the package now requires all of the following to be true:

- control state is explicitly set to `finalize`
- the current plan is fresh for the current branch/runtime posture
- approval state is explicitly `approved`
- the worktree is clean except for allowed session artifacts
- destination review branches do not already exist

When those checks pass, the package materializes each review branch narrowly from the merge-base, applies only the files assigned to that group, excludes session-artifact-only changes, and verifies that the union of created branches matches the source branch final tree.

Failure behavior is also fenced:

- branch-creation failures roll back created branches and record failure in the plan artifact
- verification failures keep already-created branches for inspection, record failure, and fail closed
- successful verification marks the plan materialized instead of pretending any remote review choreography happened

## 4. Successful local finalization now completes the bounded package runtime truthfully

A successful verified materialization now does more than create branches.
It also completes the bounded package-local finalization slice by:

- appending the local accept-finalize ledger event
- advancing the runtime projection to `completed`
- clearing the explicit `finalize` control selection
- preserving the created local review branches in the checked plan artifact

So Workstream C now has both the **operator-facing orchestration surface** and the **runtime-side completion path** for the local finalization slice.

## Bounded proof for `#1541`

## Durable proof added/confirmed in this task

`packages/pi-autoresearch/tests/finalize.test.ts` now proves the plan/freshness side of the contract:

- finalization context is derived from kept runs plus live git posture
- normalized plans preserve full hashes and deterministic branch names
- overlapping groups fail closed
- groups that only touch session artifacts fail closed
- HEAD drift makes an existing plan stale and surfaces refresh guidance through the finalization status path
- trunk planning is rejected

`packages/pi-autoresearch/tests/finalize-materialization.test.ts` now proves the git-safety and success-path side of the contract:

- successful materialization creates independent review branches and completes the local runtime
- dirty non-session files block mutation before any branch creation
- destination-branch collisions block mutation before any branch creation
- branch-creation failure rolls back created branches and records failure
- verification failure preserves created branches for inspection and records failure
- the extension surface can plan, approve, and materialize end to end through `autoresearch_runtime_finalize`

Together those tests close the proof obligations from the contract note:

1. fresh-plan / stale-plan behavior
2. git-safety fence behavior
3. successful local branch materialization + verification
4. truthful package-local completion after success

## Verification commands run for closure

From `packages/pi-autoresearch`:

```bash
node --import tsx --test tests/finalize.test.ts tests/finalize-materialization.test.ts
npm run check
npm run release:check:quick
```

From the repo root:

```bash
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/pi-autoresearch/docs --strict
```

These checks verified:

- finalization planning, freshness, and stale-plan guidance
- git-safety preflight and failure handling
- successful local branch materialization and verification
- package lint/typecheck/test surface
- package release metadata/packageability quick checks
- package-doc metadata/structure validity for the updated status notes

## What changed in operator/runtime behavior

Before Workstream C, the package had:

- a finalize-worthy runtime posture and explicit `finalize` control intent
- a governed Prompt Vault finalize proposal packet
- no checked current finalization-plan artifact
- no explicit package-owned plan / approve / materialize surface
- no bounded success path from approved local finalization to completed runtime state

After Workstream C, the package now has:

- one checked finalization-plan artifact with fresh/stale handling
- one explicit bounded orchestration surface for status / plan / approve / materialize
- approval, cleanliness, branch-collision, and verification fences before mutation
- narrow independent review-branch creation from merge-base
- truthful bounded runtime completion after successful verified local materialization

So the package runtime is now **finalization-orchestration aware** inside the bounded package seam, while still remaining below the broader target control plane.

## What this workstream does **not** mean

This workstream should **not** be read as having implemented:

- AK campaign binding or AK task lifecycle automation
- PR creation, pushes, remote branch publication, or review-request automation
- cross-repo finalization orchestration
- automatic branch cleanup/deletion after success
- Prompt Vault owning branch names or git mutation directly
- the local plan artifact becoming the durable system of record
- a generic git-orchestration framework for unrelated packages

Those remain outside Workstream C.

## Bottom line

Workstream C is complete when read as the bounded slice that gave `pi-autoresearch`:

- one checked local finalization-plan artifact
- one explicit finalization orchestration surface for status / plan / approve / materialize
- explicit approval plus clean-tree / branch-collision / verification safety fences
- independent local review-branch materialization from merge-base
- truthful bounded runtime completion after successful verified materialization

What still comes next is not “make safer finalization real.”
That is now landed for the package-local bounded runtime.
What still comes next is the broader control-plane work above this seam:

- live supervision / polling
- bounded AK lifecycle automation
- wider operator/supervisor surfaces where explicitly contracted

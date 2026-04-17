---
summary: "Contract for Workstream C of pi-autoresearch: package-owned finalization planning, grouped artifact projection, and safe branch materialization fences for turning a finalize-worthy campaign into independent review branches."
read_when:
  - "Before implementing or reviewing tasks 1539, 1540, or 1541 in the safer finalization workstream."
  - "When deciding how pi-autoresearch should turn a finalize-worthy runtime posture into grouped review branches without reviving upstream whole-tree git defaults."
  - "When you need the exact finalization artifact model, approval gate, and git-safety fences for Workstream C."
type: "reference"
system4d:
  container: "Package-local contract note for Workstream C of the pi-autoresearch target control-plane rollout."
  compass: "Make finalization planning and branch materialization real inside the package while preserving Prompt Vault as grouping-guidance owner, AK as durable campaign-truth owner, and the repo git graph as the mutation substrate."
  engine: "State current truth -> freeze owner split -> define the plan artifact and finalization surface -> fence git/materialization behavior -> bound verification and non-goals."
  fog: "The main risks are letting a draft finalize packet become executable truth without validation, reviving upstream broad git mutation defaults, or overstating package-local finalization as AK/PR automation."
---

# Contract — safer finalization orchestration for `pi-autoresearch`

## Why this note exists

`pi-autoresearch` already has the two lower layers Workstream C must build on:

1. live governed finalize proposal packets from Prompt Vault
2. an explicit package-local operator control choice for `finalize`

Those facts are already captured in:

- [current-vs-target](./current-vs-target.md)
- [Prompt Vault runtime-decision contract](./prompt-vault-runtime-decision-contract.md)
- [Prompt Vault runtime-decision status](./prompt-vault-runtime-decision-status.md)
- [resume/control-surface contract](./resume-control-surface-contract.md)
- [resume/control-surface status](./resume-control-surface-status.md)
- [pi-autoresearch RFC](../../../../docs/project/pi-autoresearch-rfc.md)
- [pi-autoresearch integration analysis](../../../../docs/project/pi-autoresearch-integration-analysis.md)

The upstream finalize skill and shell test are also useful evidence that the branch-splitting idea is valuable.
But they are **not** the package contract.
They prove the idea, not the monorepo-safe owner split or safety fence set we need here.

What is still missing is the exact contract for the next bounded slice:

> how the package should turn a finalize-worthy runtime posture plus a governed finalization proposal into one checked grouped plan artifact and one safe, explicitly approved branch-materialization workflow.

This note freezes that contract for Workstream C.

---

## Current truthful starting point

Today the package truth is:

- the package can already request a governed `pi-autoresearch-finalize` packet through the bounded runtime seam
- that packet already parses into typed grouping fields plus `GROUPS_JSON_DRAFT`
- the package can already persist `finalize` as explicit operator control intent
- ordinary bounded runs already stay blocked when `control.kind = "finalize"`
- the package does **not** yet write a checked finalization plan artifact
- the package does **not** yet expose one truthful finalization surface above the raw finalize packet
- the package does **not** yet create grouped review branches from merge-base
- the package does **not** yet have a package-level success path from approved finalization to local runtime completion

So Workstream C is **not** about inventing finalization from scratch and **not** about moving grouping logic into Prompt Vault or AK.
It is about adding the first package-owned **finalization orchestration layer** above the already-landed finalize proposal and control intent.

---

## Contract in one sentence

`pi-autoresearch` should add one checked package-local finalization plan artifact plus one explicit finalization orchestration surface that can plan, approve, and materialize review branches from a finalize-worthy campaign using validated Prompt Vault grouping guidance and strict git-safety fences, while AK remains durable campaign truth, Prompt Vault remains grouping-guidance owner, and the resulting branches remain ordinary repo/git output rather than a new hidden control plane.

---

## Governing owner split

| Concern | Owner in Workstream C | Why |
|---|---|---|
| Finalize proposal text/structure and grouping guidance | Prompt Vault template + package parser | Prompt Vault still owns the durable decision procedure; the package only consumes it |
| Finalization preflight, plan normalization, approval gating, branch creation, and verification | `packages/pi-autoresearch` | This is package-owned runtime/orchestration behavior |
| Durable campaign/task truth, scope truth, result/evidence ownership | AK | Workstream C still must not move campaign authority into local files |
| Current branch, merge-base, commit objects, and resulting review branches | the repo git graph | Git remains the actual mutation substrate |
| Local finalization plan/status artifact | `packages/pi-autoresearch` local artifact | Projection/orchestration aid only, not durable society truth |
| Generic long-lived session supervision or cross-session polling | ASC / orchestrator-adjacent layers | Still out of scope for this workstream |
| PR creation, remote branch publication, or cross-repo review choreography | out of scope | Workstream C stops at local safe materialization |

Interpretation rule:

> Prompt Vault owns **how to think about grouping**.
> `pi-autoresearch` owns **how to validate, approve, and materialize that grouping safely**.
> AK still owns **campaign truth above the local runtime**.

---

## Workstream C target done-state

Workstream C is done when the following are all true:

1. the package can derive and write one exact finalization plan artifact for the current finalize-worthy campaign posture
2. that plan is bound to the current runtime/git state through:
   - current source branch
   - merge-base / trunk target
   - current `HEAD` / final tree
   - current `segmentKey` / `runtimeKey` when available
3. the plan records the normalized grouping proposal, not only the raw Prompt Vault packet
4. the operator can inspect the plan and approve it explicitly before any branch mutation happens
5. the package exposes one explicit finalization orchestration surface above the existing status/control surfaces
6. branch materialization creates one independent branch per approved group from merge-base
7. no two groups may materialize overlapping files
8. `autoresearch.*` session artifacts are excluded from materialized branches regardless of directory depth
9. materialization fails closed on dirty trees, detached HEAD, trunk execution, stale plans, missing commits, branch collisions, overlap, or verification mismatch
10. creation failures roll back package-created branches and restore the original branch
11. verification failures return non-zero but leave created branches intact for inspection
12. a successful materialization can consume the `finalize` control intent and mark the **package-local** runtime complete without claiming AK has already closed the campaign
13. tests prove planner behavior, safety fences, materialization, rollback, and verification
14. a later status/proof note can close the umbrella without overstating Workstream C as PR automation or AK lifecycle automation

### Explicitly included in this done-state

- one package-local finalization plan artifact
- one explicit finalization orchestration surface
- explicit approval-before-mutation behavior
- deterministic branch creation from merge-base
- union-verification against the original final tree
- bounded local runtime completion on success

### Explicitly **not** included in this done-state

- AK task completion/failure mutation
- automatic PR creation or remote pushes
- dirty-tree auto-stashing as hidden package behavior
- broad whole-tree add/clean/revert workflows
- cross-repo finalization
- Prompt Vault becoming the branch executor
- local finalization artifacts becoming the durable system of record

---

## Finalization artifact model

Workstream C should keep the append-only runtime history artifacts and add exactly one current finalization-plan projection.

| Artifact | Kind | Role in Workstream C | Authority posture |
|---|---|---|---|
| `autoresearch.jsonl` | append-only receipt log | source for kept-run history and commit context | reconstructible runtime projection only |
| `autoresearch.events.jsonl` | append-only event ledger | source for machine/runtime posture and local completion projection | reconstructible runtime projection only |
| `autoresearch.runtime.json` | latest runtime snapshot | control overlay and resumable machine posture | checked current-state projection only |
| `autoresearch.finalization.json` | latest finalization plan snapshot | current grouped finalization plan, approval state, and materialization status | checked orchestration projection only |
| `groups.json` | compatibility payload only | serialized downstream materialization payload inside the plan or temp runtime state when needed | not the root authority |

### Why `autoresearch.finalization.json` is the plan artifact

The finalize template already emits a draft `groups.json` payload.
That is useful, but it is **not enough** as the package-local current-state artifact because it does not naturally carry:

- current runtime identity/freshness facts
- approval state
- materialization status
- source branch and control-overlay alignment
- package-local verification results

So Workstream C should not make a raw root-level `groups.json` file the new authority.
Instead:

- `autoresearch.finalization.json` is the package-local checked orchestration artifact
- a `groups.json`-compatible payload can live **inside** it or be emitted temporarily during materialization

That keeps provenance and staleness visible.

---

## Finalization plan contract

A truthful first shape is:

```ts
type AutoresearchFinalizationApprovalState =
  | "pending"
  | "approved"
  | "materialized"
  | "superseded";

interface AutoresearchFinalizationGroupV1 {
  index: number;
  title: string;
  slug: string;
  branchName: string;
  lastCommit: string;
  commits: string[];
  files: string[];
  metricEffect: string;
  dependencyNotes: string[];
  body: string;
}

interface AutoresearchFinalizationPlanV1 {
  type: "finalization_plan";
  version: 1;
  phase: "bounded_runtime_kernel";
  cwd: string;
  sourceBranch: string;
  trunkRef: string;
  baseRef: string;
  finalTree: string;
  goalSlug: string;
  segmentKey: string | null;
  runtimeKey: string | null;
  projectionSource: "ledger" | "receipt_fallback";
  createdAt: number;
  decision: {
    templateName: "pi-autoresearch-finalize";
    overallResult: string;
    groupingRationale: string[];
    riskNotes: string[];
    cleanupHints: string[];
  };
  groups: AutoresearchFinalizationGroupV1[];
  groupsJsonDraft: {
    base: string;
    trunk: string;
    final_tree: string;
    goal: string;
    groups: Array<{
      title: string;
      body: string;
      last_commit: string;
      slug: string;
    }>;
  };
  approval: {
    required: true;
    state: AutoresearchFinalizationApprovalState;
    reason: string | null;
    approvedAt: number | null;
  };
  materialization: {
    status: "not_started" | "succeeded" | "failed";
    createdBranches: string[];
    verifiedAt: number | null;
    failureReason: string | null;
  };
}
```

### Field interpretation

#### `sourceBranch`
This is the branch whose final tree the plan is meant to preserve.
Materialization must fail closed if the operator later runs it from a different branch.

#### `baseRef`
This is the merge-base commit the independent review branches should start from.
It must match current repo truth at plan time.

#### `finalTree`
This is the exact `HEAD` commit the union-verification step compares against.
If `HEAD` changes, the plan is stale.

#### `runtimeKey`
This keeps Workstream C aligned with Workstream B.
If the bounded runtime posture changes materially after plan generation, approval/materialization must not silently reuse the old plan.

#### `approval`
Approval is intentionally separate from planning.
Generating a plan does **not** mean branch mutation is now lawful.

#### `materialization`
This is bounded local orchestration state only.
It should not be mistaken for AK campaign completion or PR publication.

---

## Finalization control surface contract

Workstream C should add one explicit write/read surface above the existing status + control surfaces.
A truthful first shape is:

```ts
interface AutoresearchRuntimeFinalizeInput {
  action?: "status" | "plan" | "approve" | "materialize";
  reason?: string;
}
```

A truthful first output should include at least:

- current runtime posture
- source branch / base / final tree summary
- whether the existing plan was reused, refreshed, or discarded as stale
- approval state
- group count and proposed branch names
- current materialization status
- the shortest truthful next-step explanation

### Why this needs its own surface

This keeps Workstream C explicit:

- `autoresearch_runtime_status` remains the main read surface and the place to request the governed finalize packet
- `autoresearch_runtime_control` remains the place to choose `finalize` as operator intent
- the new finalization surface owns the **plan/approve/materialize** workflow itself

That prevents finalization orchestration from hiding inside generic status text or ad hoc side effects.

---

## Entry and freshness rules

The finalization surface must treat planning and materialization as **freshness-bound** operations.

### `action=plan`
Allowed when either of the following is true:

- the runtime projection is already `finalize_candidate`, or
- the operator has already selected `control.kind = "finalize"`

`plan` may be used before explicit approval so the operator can inspect the grouped proposal.

### `action=approve`
Allowed only when all of the following are true:

- a current plan exists
- the plan still matches `sourceBranch`, `finalTree`, and `runtimeKey` truthfully
- the operator has selected `control.kind = "finalize"`

### `action=materialize`
Allowed only when all of the following are true:

- the plan is still fresh
- approval state is `approved`
- `control.kind = "finalize"`
- git preflight passes

### Required stale-plan behavior

The plan must be rejected, cleared, or superseded when any of the following is true:

- current branch no longer matches `sourceBranch`
- current `HEAD` no longer matches `finalTree`
- current merge-base no longer matches `baseRef`
- current runtime posture / `runtimeKey` no longer matches
- the normalized groups no longer agree with the current repo/decision facts
- the operator changed control intent away from finalization in a way that invalidates the current plan

If the plan is stale, the package must explain that it needs a fresh plan.
It must not silently reuse a stale approved plan for branch mutation.

---

## Planner contract

The planner is the first executable part of Workstream C.
It turns the finalize-worthy runtime posture into a **checked** plan, not directly into branches.

### Required planner inputs

The planner should derive and validate at least these facts:

- current runtime posture from ledger/receipts/snapshot
- current `control.kind`
- current source branch name
- current trunk target
- current merge-base against trunk
- current `HEAD` / final tree
- kept-run receipts and commit identities
- the governed finalize proposal packet for the same repo/runtime posture

### Required planner behavior

1. obtain or refresh the governed finalize proposal through the existing package runtime seam
2. normalize short/raw commit references into full hashes
3. verify every referenced commit exists and is reachable from the current source branch history
4. compute each group's effective file set
5. exclude `autoresearch.*` files by basename regardless of directory depth
6. fail closed if any two groups overlap on a non-session file
7. fail closed if a proposed group has no remaining non-session files after exclusion
8. produce deterministic branch names from goal slug + ordinal + group slug
9. validate that the `GROUPS_JSON_DRAFT` and the normalized grouped view still agree on base/trunk/group identity facts
10. write `autoresearch.finalization.json` with `approval.state = "pending"`

### Group-order rule

The planner must preserve application order.
Group 1 comes before Group 2.
The order is part of the review narrative even though each branch is independently created from merge-base.

### Dependency rule

Dependencies between groups are allowed only when they are explicitly named and still reviewable.
But if the dependency is tight enough that one branch would be misleading or broken in isolation, the planner must merge the groups instead of pretending the split is clean.

### Blocked-plan rule

The planner must return blocked/fail-closed behavior instead of a half-plan when any of the following is true:

- no truthful kept-run set exists
- merge-base or trunk cannot be resolved
- finalize proposal parsing or normalization fails
- overlapping files remain after normalization
- commit identity cannot be resolved to full hashes
- a group would be empty after excluding session artifacts

---

## Materialization contract

Materialization is the second executable part of Workstream C.
It consumes an approved fresh plan and creates real review branches.

### Required preflight before any git mutation

Before creating branches, the package must fail closed unless all of the following are true:

1. current branch equals `plan.sourceBranch`
2. current branch is **not** trunk
3. `HEAD` equals `plan.finalTree`
4. current merge-base equals `plan.baseRef`
5. the repo is **clean**
   - no unstaged changes
   - no staged-but-uncommitted changes
   - no untracked files
6. every destination branch name is free
7. the plan still has no overlapping non-session files
8. `control.kind = "finalize"`
9. approval state is `approved`

### Dirty-tree rule

Workstream C should **not** auto-stash dirty state as hidden package behavior.
If the tree is dirty, materialization must stop before mutation and tell the operator to clean or stash intentionally.

This is stricter than the upstream prototype on purpose.
It keeps the first package-owned materialization slice more legible and less surprising.

### Branch creation rule

For each approved group, materialization should:

1. start from `plan.baseRef`
2. create the deterministic branch name from the plan
3. materialize only that group's enumerated non-session files from `group.lastCommit`
4. create exactly one commit using the group's title/body from the plan
5. record the created branch name in materialization status

### Mutation-discipline rule

Workstream C must not use broad whole-tree operations such as:

- `git add -A`
- broad `git clean`
- broad `git checkout -- .`
- broad revert/reset against the whole repo as the main materialization path

The package should materialize only the exact files in each approved group.

### Creation-failure rollback rule

If branch creation fails midway:

- delete any branches created in this materialization attempt
- return the operator to the original source branch
- record the failure in the plan/status projection if possible
- return non-zero

This is the rollback path for **creation** failures.

### Verification-failure rule

After all branches are created, the package must run bounded verification.
If verification fails:

- return non-zero
- return the operator to the original source branch
- keep the created branches intact for inspection
- record failure details in the plan/status projection

This is intentionally different from creation rollback.
Once the branches exist, inspection is more useful than silently deleting the evidence.

---

## Required verification after materialization

Materialization is only truthful when it proves the created branches preserve the source branch's final tree, excluding session artifacts.

### Required verification checks

1. **union matches final tree**
   - replay the approved groups from `baseRef`
   - compare the resulting tree to `finalTree`
   - ignore only session artifacts matched by basename `autoresearch.*`
2. **no session artifacts leaked**
   - each created branch must exclude `autoresearch.*` files at any directory depth
3. **no empty group commits**
   - each created branch must contain at least one non-session file
4. **branch independence**
   - each created branch must start from `baseRef`, not from the previous group branch

### Success behavior

Only after verification passes may the package:

- mark plan materialization `succeeded`
- record created branch names in the plan/status projection
- consume `control.kind = "finalize"`
- mark the **package-local** campaign complete

### Important completion boundary

A local successful finalization means only:

- the package runtime finished its bounded finalization slice
- review branches now exist locally

It does **not** mean:

- AK is already closed
- remote branches were pushed
- PRs exist
- review/merge has happened

---

## Safety fences that must stay explicit

Workstream C must not silently weaken the following fences.

## 1. Source-branch fence

Reject detached HEAD and reject trunk execution.
Finalization materializes from a feature/campaign branch only.

## 2. Freshness fence

Reject stale plans whenever `sourceBranch`, `HEAD`, `baseRef`, or `runtimeKey` drift.
Approval does not survive freshness drift automatically.

## 3. Approval fence

A plan is not executable until explicit operator approval is recorded.
Prompt Vault's `APPROVAL_REQUIRED: yes` must remain real package behavior.

## 4. Full-hash fence

Materialization must use full commit hashes in the normalized plan.
Do not trust short hashes as execution truth.

## 5. File-overlap fence

No two groups may touch the same non-session file.
If they do, the split is not safe yet.

## 6. Session-artifact fence

Never materialize `autoresearch.*` files into review branches, even when they live in nested directories.
They are runtime/session artifacts, not review output.

## 7. Narrow-mutation fence

Do not reintroduce upstream whole-tree defaults.
Materialize exact approved files only.

## 8. Clean-worktree fence

Do not auto-stash in this first package slice.
A dirty tree is a preflight failure, not a silent runtime convenience.

## 9. Collision fence

Reject destination branch-name collisions before mutation begins.
Do not overwrite or repurpose an existing branch.

## 10. Verification fence

Do not report success until union-verification passes.
Creating branches is not enough.

---

## Projection and local-artifact rule

Workstream C may add the finalization plan artifact because it is useful for:

- explicit operator inspection before mutation
- freshness checking across fresh sessions
- recording approval/materialization state without re-reading every raw source each time
- later upper-layer supervision that wants one bounded finalization summary artifact

But Workstream C must **not** use the plan artifact to:

- replace git as mutation truth
- replace AK as durable campaign truth
- replace Prompt Vault as grouping-guidance truth
- hide remote publication/review state inside local JSON
- smuggle broad autonomous git behavior back into the package

The plan artifact is for **checked local orchestration**, not for becoming a second campaign system of record.

---

## Verification contract for tasks 1539–1541

Workstream C is only truthful when it proves all four layers below.

## 1. Planner proof

Tests should prove:

- a finalize-worthy runtime posture can generate `autoresearch.finalization.json`
- stale plans are discarded or superseded when `HEAD`/`runtimeKey` drift
- overlapping groups fail closed
- empty post-exclusion groups fail closed
- full commit-hash normalization is enforced

## 2. Git-safety proof

Tests should prove:

- detached HEAD is rejected
- trunk execution is rejected
- dirty trees are rejected before mutation
- branch collisions are rejected before mutation
- session artifacts are excluded at nested paths

## 3. Materialization proof

Tests should prove:

- each materialized branch starts from `baseRef`
- each group yields exactly one non-empty review commit
- the union of groups matches the source branch final tree excluding session artifacts
- creation failures roll back branches and restore the source branch
- verification failures leave branches intact but return non-zero

## 4. Bounded end-to-end proof

The final proof/status task should show at least one bounded path where:

1. the runtime reaches `finalize_candidate`
2. the operator selects `finalize`
3. the package generates a checked finalization plan
4. the operator approves the plan explicitly
5. the package materializes review branches safely
6. verification passes and the package marks the local runtime complete truthfully

---

## Non-goals for this workstream

Workstream C must not silently grow into any of the following:

- automatic AK task completion/failure
- PR creation, remote pushes, or review-request automation
- cross-repo finalization orchestration
- hidden dirty-tree stashing/restoration flows as the default package path
- broad repo cleanup or branch deletion after success
- Prompt Vault owning branch names or git mutation directly
- a generic git-orchestration framework for unrelated packages

The upstream finalize shell script remains a **reference artifact**, not the required package implementation dependency or the authority for safety posture.

---

## Implementation sequence for the child tasks

### Task `#1539` — finalization planner and grouped artifact runtime

Implement:

- `autoresearch.finalization.json` read/write helpers
- fresh-plan generation from current runtime + governed finalize packet
- normalized grouped plan output with deterministic branch names
- stale-plan invalidation and planner negative-path tests
- the dedicated finalization orchestration surface with at least `status` and `plan`

### Task `#1540` — safe materialization and branch workflow

Implement:

- explicit approval handling
- clean-tree and branch-collision preflight
- narrow file-by-file branch materialization from merge-base
- creation rollback rules and verification rules
- package-local completion/intent-consumption on successful verified materialization

### Task `#1541` — proof + status update

Prove and record:

- plan freshness behavior
- git-safety fence behavior
- successful branch materialization + verification
- what changed in package/runtime behavior
- what still remains outside Workstream C
- update:
  - `packages/pi-autoresearch/docs/project/finalization-orchestration-status.md`
  - `packages/pi-autoresearch/docs/project/current-vs-target.md`

---

## Bottom line

The next truthful finalization slice for `pi-autoresearch` is **not** “just run the upstream finalize script” and **not** “let the finalize prompt directly drive git.”

It is a bounded package-owned orchestration layer where:

- Prompt Vault still owns the durable finalization guidance
- the package turns that guidance into one checked fresh plan artifact
- explicit approval remains real before any branch mutation
- git mutation stays narrow, deterministic, and verified
- successful materialization can complete the **package-local** runtime without pretending the larger control plane has already finished

That is the smallest truthful contract that makes safer finalization real without collapsing owners or reviving upstream broad git defaults.

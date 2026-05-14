---
summary: "Governance contract for a level-1.5 post-fan-in finalizer that performs deterministic scoped cleanup only after explicit review and validation gates."
read_when:
  - "You are designing or reviewing post-fan-in campaign finalizer automation."
  - "You need the exact boundary between managed fan-in review and deterministic lifecycle cleanup."
  - "You are checking whether commit, evidence, task close, peer tab, or worktree cleanup may be automated after a matrix/candidate campaign."
type: "contract"
task_id: 2959
system4d:
  container: "Package-local governance contract for post-fan-in finalizer automation in pi-society-orchestrator."
  compass: "Reduce manual post-fan-in residue without turning finalization into hidden execution, promotion, release, or source-owner mutation."
  engine: "Read completed fan-in review -> verify validation receipts and owner authorization -> execute only deterministic scoped lifecycle actions -> emit one auditable result taxonomy."
  fog: "The main risks are treating peer text as authority, closing tasks before owner review, cleaning worktrees before evidence is durable, or letting a cleanup helper become hidden campaign automation."
---

# Contract — level-1.5 post-fan-in finalizer governance

## Decision in one sentence

`pi-society-orchestrator` may add a **level-1.5 post-fan-in finalizer** that executes a predeclared deterministic cleanup bundle only after explicit fan-in review, validation receipts, and operator authorization; it must return exactly one of `committed_cleaned`, `review_blocked`, or `failed_closed` and must not launch peers, run releases, activate toolbox capabilities, or mutate Prompt Vault, ROCS, Oracle, or KES.

## Why this contract exists

Managed candidate-wave and matrix-campaign slices have reduced the unsafe part of parallel work: raw peer claims no longer count as final evidence, and matrix cells now route through candidate-result packets, cockpit/closeout summaries, and owner review.

The remaining operator pain is **post-fan-in residue**:

```text
review accepted -> validate -> commit -> evidence/task close -> stop/close peer tabs -> delete stale worktrees
```

Today that tail is still chat-managed and easy to do out of order. The finalizer exists to make that tail boring and gated, not to add a new executor.

## Level-1.5 meaning

Level-1.5 is intentionally between manual playbook and full autonomy:

- **More than a checklist:** it may perform deterministic local lifecycle actions after gates pass.
- **Less than autonomous execution:** it may not spawn peers, run benchmarks, choose winners, promote branches, release packages, or infer missing authority.
- **Fail-closed by default:** any missing review, missing validation receipt, dirty/ambiguous scope, absent exact command, or owner-surface mismatch returns `review_blocked` before mutation or `failed_closed` after a partial deterministic failure.

## Owner split

| Concern | Owner | Finalizer posture |
|---|---|---|
| Candidate measurement receipts and candidate-result packets | `pi-autoresearch` | read verified artifacts only |
| Fan-in review, matrix closeout, and above-seam lifecycle bundle | `pi-society-orchestrator` | plan and gate finalizer actions |
| Visible peer launch and candidate worktree creation | peer tooling / `pi-little-helpers` | no launch; cleanup only when explicitly listed |
| Git commit objects in the target repo | target repo git graph | deterministic scoped commit only |
| Task/evidence lifecycle authority | AK / society authority surfaces | exact predeclared write commands only, never inferred |
| Prompt Vault, ROCS, Oracle, KES | their owner repos/surfaces | non-actions; no mutation in this finalizer |
| Release/publish | package release owners | non-action |

Interpretation rule:

> The finalizer is a post-review janitor with a signed work order. It is not a reviewer, runner, promoter, release manager, or authority owner.

## Preconditions

A finalizer request is eligible only when every precondition is true:

1. **Exact identity:** request includes exact `taskId`, `cwd`, target branch/ref, and fan-in artifact path.
2. **Completed fan-in review:** artifact kind is one of the accepted managed review/closeout outputs, such as `autoresearch.candidate_wave_review.v1`, `autoresearch.matrix_campaign_review.v1`, or `autoresearch.matrix_campaign_closeout.v1`.
3. **Owner decision present:** review names the selected lane/cell or explicit no-op outcome and records owner approval for finalizer consideration.
4. **Measured artifacts only:** selected inputs are candidate-result packets or lower-plane receipts, not raw peer text or intercom messages.
5. **Validation receipts present:** the request includes exact validation commands, cwd, exit codes, and timestamps from after the selected patch was applied.
6. **Scoped diff:** every file to commit is inside the operator-approved allowlist; generated/session residue is either excluded or explicitly classified as cleanup.
7. **Exact lifecycle commands:** any AK evidence or task-close write is provided as an exact command or typed payload from the owning AK gate. If absent, the finalizer may commit but must block evidence/task close.
8. **Cleanup manifest:** every peer tab or worktree cleanup action names the peer/run id, path, branch/base, selected/non-selected posture, and rollback note.
9. **Final operator authorization:** the operator approves the finalizer plan after seeing planned writes and non-actions.

## Explicit non-actions

The finalizer must always report these as non-actions:

- no hidden peer launch;
- no benchmark/run execution;
- no candidate selection or winner scoring;
- no branch merge, push, PR creation, or release/publish;
- no toolbox activation;
- no Prompt Vault mutation;
- no ROCS mutation;
- no Oracle mutation;
- no KES mutation;
- no treating intercom, visible peer tabs, or session memory as durable evidence.

## Result taxonomy

Every run returns exactly one result status.

| Status | Meaning | Mutation posture |
|---|---|---|
| `committed_cleaned` | All authorized deterministic actions completed: scoped commit, requested evidence/task close writes, and requested peer/worktree cleanup. | Completed writes are listed with receipts. |
| `review_blocked` | Preconditions failed before mutation, or the plan required an owner decision/validation/command that was missing or stale. | No mutation occurred. |
| `failed_closed` | A deterministic action failed after mutation began, rollback was attempted where safe, and no further action was attempted. | Partial writes and required manual recovery are listed. |

`committed_cleaned` is not promotion authority. It means the accepted post-fan-in cleanup bundle finished locally and/or through exact owner commands.

## Planned artifact model

The implementation should use one current plan artifact and one immutable-ish result receipt. Paths are illustrative; package code should choose the final on-disk location consistently with existing orchestrator artifacts.

```text
.autoresearch/finalizer/post-fan-in-finalizer.plan.json
.autoresearch/finalizer/post-fan-in-finalizer.result.json
```

The plan artifact is a projection and gate object, not durable society truth.

## Schema sketch

```ts
type PostFanInFinalizerStatus =
  | "committed_cleaned"
  | "review_blocked"
  | "failed_closed";

interface PostFanInFinalizerPlanV1 {
  kind: "autoresearch.post_fan_in_finalizer_plan.v1";
  taskId: number;
  cwd: string;
  targetRef: string;
  fanInArtifact: {
    path: string;
    kind:
      | "autoresearch.candidate_wave_review.v1"
      | "autoresearch.matrix_campaign_review.v1"
      | "autoresearch.matrix_campaign_closeout.v1";
    sha256: string;
  };
  ownerDecision: {
    selectedLaneId: string | null;
    selectedCellId: string | null;
    approvedForFinalizer: boolean;
    approvedBy: "operator" | "owner_review_surface";
    approvedAt: string;
  };
  validationReceipts: Array<{
    cwd: string;
    command: string;
    exitCode: number;
    completedAt: string;
    logPath?: string;
  }>;
  scopedCommit: {
    enabled: boolean;
    branch: string;
    allowedPaths: string[];
    excludedPaths: string[];
    message: string;
    expectedDiffSummary: string[];
  };
  lifecycleWrites: {
    evidence: Array<{ command: string; purpose: string }>;
    taskClose: Array<{ command: string; purpose: string }>;
  };
  cleanup: {
    peerTabs: Array<{ peerRunId: string; action: "close_tab"; reason: string }>;
    worktrees: Array<{
      path: string;
      branch: string;
      baseRef: string;
      selected: boolean;
      action: "delete_worktree" | "keep_for_inspection";
      reason: string;
    }>;
  };
  nonActions: string[];
  finalAuthorization: {
    required: true;
    granted: boolean;
    grantedAt: string | null;
    operatorStatement: string | null;
  };
}

interface PostFanInFinalizerResultV1 {
  kind: "autoresearch.post_fan_in_finalizer_result.v1";
  taskId: number;
  cwd: string;
  status: PostFanInFinalizerStatus;
  planSha256: string;
  startedAt: string;
  completedAt: string;
  applied: {
    commit?: { sha: string; message: string; paths: string[] };
    evidence: Array<{ command: string; exitCode: number; receipt?: string }>;
    taskClose: Array<{ command: string; exitCode: number; receipt?: string }>;
    peerTabs: Array<{ peerRunId: string; result: "closed" | "kept" | "failed" }>;
    worktrees: Array<{ path: string; result: "deleted" | "kept" | "failed" }>;
  };
  blockedReasons: string[];
  recoveryNotes: string[];
  metric: {
    name: "manual_post_fanin_residue";
    before: number;
    after: number;
    target: 0;
  };
  nonActions: string[];
}
```

## Deterministic execution order

When all gates pass, actions run in this order:

1. Re-read plan and fan-in artifact; verify hash, `taskId`, `cwd`, and target ref.
2. Re-run cheap freshness checks: clean/expected worktree, target branch, no unapproved paths.
3. Create scoped commit from exactly `scopedCommit.allowedPaths` and verify commit contents.
4. Run exact AK evidence commands, if present.
5. Run exact AK task-close commands, if present and evidence commands succeeded.
6. Close listed peer tabs only when their peer/run ids match the reviewed fan-in manifest.
7. Delete only listed non-selected worktrees, and only when path/branch/base still match the cleanup manifest.
8. Write finalizer result receipt and print the result taxonomy status.

If a step fails after mutation begins, stop immediately, write `failed_closed`, and include recovery notes. Do not continue to later cleanup steps.

## Blocking rules

Return `review_blocked` before mutation when any of the following is true:

- fan-in artifact is missing, stale, not hash-matched, or not a supported kind;
- review has missing planned lanes without an explicit owner replan/no-op decision;
- selected lane lacks candidate-runner lineage or candidate-result packet proof;
- validation receipts are absent, failed, or older than the selected commit/diff;
- target branch/ref or cwd no longer matches the plan;
- unapproved paths appear in the diff;
- lifecycle write commands are required but absent;
- cleanup paths are outside the manifest or no longer match branch/base;
- final operator authorization is missing;
- requested action would touch release, toolbox, Prompt Vault, ROCS, Oracle, or KES surfaces.

## Operator contract

The operator-facing plan must show this exact contract before authorization:

```text
This finalizer will only run deterministic post-fan-in cleanup for task <taskId> in <cwd>.
It will not launch peers, run benchmarks, choose winners, merge, push, release, activate toolbox, or mutate Prompt Vault/ROCS/Oracle/KES.
It will use fan-in artifact <path>@<sha256> and validation receipts <n>.
It will commit exactly <allowedPaths> with message <message>.
It will run these exact AK lifecycle commands: <commands or none>.
It will close/delete only these listed peer tabs/worktrees: <manifest rows>.
If any gate fails before mutation, result is review_blocked.
If a deterministic action fails after mutation starts, result is failed_closed and later cleanup stops.
```

The operator authorization should be an explicit statement, not a default button:

```text
I authorize the level-1.5 post-fan-in finalizer for task <taskId> using fan-in artifact <sha256> and validation receipts <ids>.
```

## Metric: `manual_post_fanin_residue`

`manual_post_fanin_residue` is a lower-is-better count of remaining manual tail actions after fan-in review.

Suggested count before this slice:

| Residue item | Count |
|---|---:|
| manually verify selected fan-in artifact against task/cwd | 1 |
| manually run/collect validation receipts | 1 |
| manually stage and commit scoped files | 1 |
| manually record evidence | 1 |
| manually close task | 1 |
| manually close peer tabs | 1 |
| manually delete/keep worktrees | 1 |

Expected product impact after implementation and successful gates:

```text
manual_post_fanin_residue before: 7
after committed_cleaned: 0
after review_blocked: >0 with exact blockers
after failed_closed: >0 with exact recovery notes
```

This document-only slice does not itself reduce the metric at runtime; it defines the governance contract needed for an implementation slice to target `0` safely.

## Validation and rollout expectations

Minimum implementation proof before enabling any write path:

- schema/unit tests for plan and result taxonomy;
- negative tests for each `review_blocked` rule;
- failure injection tests proving `failed_closed` stops later cleanup;
- scoped-commit tests proving only allowed paths enter the commit;
- lifecycle-command tests proving commands are exact inputs, not inferred;
- cleanup tests proving path/branch/base matching and no selected-worktree deletion by default;
- docs validation for this contract and product posture alignment.

Rollout should start as `plan` / dry-run only. Enable write actions only behind an explicit operator authorization gate and after package validation passes.

## Rollback

Rollback is straightforward:

- stop invoking the finalizer;
- use the plan artifact as a manual checklist;
- keep fan-in review, candidate packets, git commits, AK evidence/task state, and cleanup actions under their existing owner surfaces;
- remove or ignore finalizer result receipts because they are projections, not durable authority.

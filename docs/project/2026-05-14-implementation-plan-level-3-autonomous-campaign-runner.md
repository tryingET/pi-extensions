---
summary: "Implementation plan for the accepted level-3 governed autonomous campaign runner ADR."
read_when:
  - "Starting implementation after ADR 2026-05-14-level-3-autonomous-campaign-runner."
  - "Choosing slices/cells for level-3 autonomous campaign runner implementation."
  - "Checking how level-3 implementation must dogfood autoresearch campaigns."
type: "implementation_plan"
status: "planned"
date: "2026-05-14"
decision: "AK decision #45"
adr: "docs/adr/2026-05-14-level-3-autonomous-campaign-runner.md"
system4d:
  container: "Post-ADR implementation plan for level-3 governed autonomous campaign runner."
  compass: "Implement manifest-governed autonomy in measured campaigns, increasing autonomy only as gates land."
  engine: "Define campaign workflow -> implementation slices -> metrics -> gates -> rollback."
  fog:
    risks:
      - "Implementing the runner as a controller-inline patch instead of a measured autoresearch campaign."
      - "Dogfooding a not-yet-landed runner before its gates are validated."
      - "Bundling cleanup, AK writes, or promotion into ordinary campaign progress."
---

# Implementation plan — level-3 autonomous campaign runner

## Scope

Implement the accepted level-3 authorization from:

- ADR: `docs/adr/2026-05-14-level-3-autonomous-campaign-runner.md`
- AK decision: `#45`

This plan does not itself authorize code mutation. It defines implementation slices, metrics, gates, and the required implementation-by-autoresearch-campaign workflow.

## Implementation-by-autoresearch-campaign workflow

Yes: implementation must use the newer autoresearch/measured campaign substrate rather than falling back to ad hoc controller-inline patches.

For every implementation slice:

1. Create or select one bounded AK task for the slice.
2. Prepare an autoresearch campaign manifest/packet naming target, cells, candidate lanes, primary metric, files-in-scope, off-limits, rollback, and owner gates.
3. Launch visible candidate peers only when the slice campaign explicitly authorizes visible lanes.
4. Bind candidate results to candidate worktrees after visible peer reports; peer text remains communication only.
5. Run measurement/export/review through `pi-autoresearch` and current lawful level-2/level-3 surfaces.
6. Generate review packets and choose a parent synthesis only after controller/owner review.
7. Apply or synthesize only the accepted result into the parent checkout.
8. Validate package/root posture.
9. Record AK evidence only after controller verification.
10. Cleanup candidate worktrees/branches only through explicit cleanup authorization or, once implemented and validated, the accepted level-3 manifest cleanup policy.

### Bootstrap rule

Because the level-3 runner does not exist at Slice 1 start, Slice 1 must use the already-landed level-2 campaign surfaces and visible candidate-peer workflow.

After each slice lands, later slices may dogfood the newly landed level-3 surface only for the behavior already validated by prior slices.

## Non-negotiable boundaries

Do not implement or perform:

- hidden peer launch;
- hidden benchmark/export/review outside approved `pi-autoresearch` seams;
- finalizer action without exact `finalize_post_fanin` token;
- cleanup without exact cleanup token or validated manifest cleanup policy;
- AK evidence/task mutation without exact `ak_owner_write` policy/token;
- KES, Oracle/DSPx, Prompt Vault, or ROCS writes;
- merge, push, PR, release, or promotion without separate promotion token;
- toolbox changes while toolbox remains deferred.

## Campaign target

```text
Build a level-3 governed autonomous campaign runner that walks accepted campaign manifests through slice sequencing, visible candidate lifecycle, measurement/export/review, finalizer-token request/application, cleanup, and AK closeout only when exact policy gates allow it.
```

Primary metric:

```text
level3_autonomous_campaign_runner_blockers = 0
```

## Slice 1 — Manifest schema and read-only preflight

Owner: `pi-society-orchestrator`.

Metric:

```text
level3_manifest_preflight_blockers = 0
```

Goal: parse and validate `autoresearch.level3_campaign_manifest.v1` without executing actions.

Suggested campaign matrix:

| Cell | Focus | Cell metric |
| --- | --- | --- |
| `cell-01` | manifest schema, hash, task/cwd/files/off-limits validation | `manifest_schema_blockers = 0` |
| `cell-02` | policy posture and dangerous-action gate rendering | `manifest_policy_gate_blockers = 0` |
| `cell-03` | operator UX/read-only preflight report and level-2 fallback | `manifest_preflight_ux_blockers = 0` |

Expected outputs:

- manifest parser/validator;
- manifest hash;
- read-only policy posture;
- no-action preflight report;
- exact next legal actions.

Required tests:

- invalid/missing manifest fails closed;
- chat text cannot substitute for manifest acceptance;
- preflight does not launch peers, run measurements, cleanup, write AK, or promote;
- policy labels are not broad booleans for dangerous actions.

## Slice 2 — Autonomous slice sequencing dry-run

Owner: `pi-society-orchestrator`.

Metric:

```text
autonomous_slice_sequence_blockers = 0
```

Goal: walk manifest slices/cells and compute ready/blocked states without lower-plane actions.

Suggested campaign matrix:

| Cell | Focus | Cell metric |
| --- | --- | --- |
| `cell-01` | slice/cell DAG ordering and dependency gates | `slice_ordering_blockers = 0` |
| `cell-02` | transition receipts for dry-run state changes | `dry_run_receipt_blockers = 0` |
| `cell-03` | blocked-state and rerun/fallback UX | `slice_sequence_recovery_blockers = 0` |

Required tests:

- dry-run emits non-authoritative receipts;
- missing dependency/policy blocks the next state;
- no peer launch or measurement occurs in dry-run;
- rollback to level-2 surfaces is visible.

## Slice 3 — Visible candidate lifecycle automation

Owner: `pi-society-orchestrator` with visible peer/worktree seam.

Metric:

```text
candidate_lifecycle_automation_blockers = 0
```

Goal: launch and bind visible candidates only through accepted manifest policy or exact launch token, and prepare cleanup posture.

Suggested campaign matrix:

| Cell | Focus | Cell metric |
| --- | --- | --- |
| `cell-01` | authorized visible candidate launch packet/command execution | `visible_launch_policy_blockers = 0` |
| `cell-02` | candidate worktree/lane binding and duplicate/missing recovery | `candidate_binding_lifecycle_blockers = 0` |
| `cell-03` | stop/cancel/cleanup plan without unauthorized deletion | `candidate_cleanup_policy_blockers = 0` |

Required tests:

- no visible launch without policy/token;
- launched lanes are tied to task/cwd/files/off-limits/DoD;
- duplicate/missing lanes fail closed;
- cleanup plan does not delete worktrees unless cleanup gate is accepted.

## Slice 4 — Measurement/export/review packet automation

Owners: `pi-society-orchestrator` + `pi-autoresearch`.

Metric:

```text
candidate_measure_export_review_blockers = 0
```

Goal: run measurement/export/review only through manifest-approved `pi-autoresearch` seams.

Suggested campaign matrix:

| Cell | Focus | Cell metric |
| --- | --- | --- |
| `cell-01` | manifest-approved `autoresearch_runtime_run` calls | `measurement_policy_blockers = 0` |
| `cell-02` | candidate-result packet export and binding | `candidate_export_binding_blockers = 0` |
| `cell-03` | review packet generation and anti-authority boundaries | `review_packet_authority_blockers = 0` |

Required tests:

- no measurement/export without manifest permission;
- packets distinguish peer assertions from controller-verified facts;
- review packets are not durable evidence or promotion authority;
- stale/missing/duplicate/proof-only cases fail closed.

## Slice 5 — Authorized finalizer and cleanup automation

Owner: `pi-society-orchestrator` with cleanup owner seam clarified before mutation.

Metric:

```text
authorized_finalizer_cleanup_blockers = 0
```

Goal: consume exact finalizer/cleanup gates and execute only permitted post-fan-in actions.

Suggested campaign matrix:

| Cell | Focus | Cell metric |
| --- | --- | --- |
| `cell-01` | exact `finalize_post_fanin` token matching and finalizer scope | `finalizer_token_application_blockers = 0` |
| `cell-02` | cleanup token/manifest policy for exact worktrees/branches | `cleanup_execution_gate_blockers = 0` |
| `cell-03` | rollback receipt and dirty/off-limits preflight | `post_fanin_rollback_blockers = 0` |

Required tests:

- wrong/missing finalizer token blocks action;
- cleanup requires exact cleanup token or validated manifest policy;
- cleanup cannot imply merge/promotion;
- dirty/off-limits/stale review blocks finalizer/cleanup.

## Slice 6 — Authorized AK closeout automation

Owner: `pi-society-orchestrator` via AK owner-write gate.

Metric:

```text
authorized_ak_closeout_blockers = 0
```

Goal: record AK evidence and complete AK tasks only with exact AK owner-write policy and deterministic projection.

Suggested campaign matrix:

| Cell | Focus | Cell metric |
| --- | --- | --- |
| `cell-01` | exact evidence projection key and dedupe | `ak_evidence_projection_blockers = 0` |
| `cell-02` | task completion gate tied to task/cwd/manifest hash | `ak_task_completion_gate_blockers = 0` |
| `cell-03` | failure/rollback path when AK owner-write is absent | `ak_closeout_fallback_blockers = 0` |

Required tests:

- no AK evidence without `ak_owner_write`;
- no task completion without exact task/cwd/manifest hash;
- repeated closeout dedupes;
- failure leaves level-2 manual closeout route visible.

## Follow-on task creation guidance

Each slice should be an AK task with bounded scope. Prefer:

- `packages/pi-society-orchestrator/src/runtime/**`
- `packages/pi-society-orchestrator/extensions/society-orchestrator.ts`
- `packages/pi-society-orchestrator/tests/**`
- `packages/pi-society-orchestrator/README.md`
- `packages/pi-autoresearch/src/**` only when measurement/export support actually needs runtime changes
- `packages/pi-autoresearch/tests/**`
- package README/docs updates for operator-visible behavior

Do not include `packages/pi-toolbox-discovery/**` unless the toolbox deferral is explicitly lifted.

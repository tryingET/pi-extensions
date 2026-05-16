---
summary: "RFC for a governed level-3 autonomous campaign runner that can sequence campaign slices and candidate lifecycle steps through explicit policy gates."
read_when:
  - "Reviewing whether to authorize level-3 autonomous campaign execution after level-2 closeout."
  - "Designing manifest-driven slice sequencing, visible candidate lifecycle, cleanup, AK evidence, or task closeout automation."
  - "Checking which actions remain token/policy gated in a more autonomous campaign runner."
type: "rfc"
status: "proposed"
date: "2026-05-14"
problem_intent: "docs/project/2026-05-14-level-3-autonomous-campaign-runner-problem-intent.md"
predecessor_closeout: "docs/project/2026-05-14-level-2-checkpointed-campaign-closeout.md"
system4d:
  container: "Repo-scoped RFC for level-3 autonomous campaign runner design in pi-extensions."
  compass: "Increase autonomy by manifest and policy, not by hidden authority inference."
  engine: "Define options -> choose recommended envelope -> specify manifest/state/tokens/receipts/rollback -> identify implementation slices."
  fog:
    risks:
      - "A runner treats chat, peer text, or packet presence as authorization."
      - "Cleanup/evidence/task closeout happens without exact manifest policy or owner token."
      - "The design skips durable receipts and becomes hard to audit or roll back."
---

# RFC — Level-3 autonomous campaign runner

## Status

Proposed.

Problem intent: [`2026-05-14-level-3-autonomous-campaign-runner-problem-intent.md`](2026-05-14-level-3-autonomous-campaign-runner-problem-intent.md)

Predecessor closeout: [`2026-05-14-level-2-checkpointed-campaign-closeout.md`](2026-05-14-level-2-checkpointed-campaign-closeout.md)

## Context

Level 2 is closed. It proved checkpointed packet preparation, candidate binding, review packets, finalizer-token requests, operator UX/dashboard posture, and a visible candidate-peer dogfood campaign.

The remaining friction is manual orchestration:

```text
slice sequencing -> visible candidate lifecycle -> measurement/export/review -> finalizer-token request -> cleanup -> evidence/task closeout
```

A level-3 runner should advance that chain from an explicit manifest while preserving owner authority boundaries.

## Goals

A level-3 runner should:

- consume a durable campaign manifest;
- sequence declared slices/cells in order;
- launch visible candidate peers only when manifest policy or exact token authorizes it;
- bind candidate worktrees and candidate-result packets;
- run measurement/export/review through approved owner seams;
- generate review packets and finalizer-token requests;
- apply finalizer, cleanup candidates, record AK evidence, and complete AK tasks only through explicit policy gates;
- emit receipts for every transition;
- fail closed on missing policy, stale packets, duplicate lanes, dirty/off-limits drift, or incomplete matrix state;
- support rollback/downgrade to level 2.

## Non-goals

This RFC does not propose:

- hidden peer launch;
- treating chat text, PEER_FINAL, intercom messages, review packets, or local receipts as durable authority;
- bypassing `pi-autoresearch` for metric receipts and candidate-result packets;
- automatic KES, Oracle/DSPx, Prompt Vault, or ROCS writes;
- merge/release/promotion without explicit owner promotion token;
- making `pi-society-orchestrator` the owner of lower-plane runtime semantics.

## Options

### Option A — Stay at level 2

Keep level-2 packet/checkpoint surfaces and continue manual sequencing.

Pros:
- lowest new automation risk;
- preserves current explicitness.

Cons:
- keeps repeating already-proven manual glue;
- operator still has to walk slices and candidate cleanup/closeout by hand;
- increases chance of controller drift or inconsistent closeout.

### Option B — Level-3 governed manifest runner (recommended)

Add a manifest-driven runner that advances slices and candidate lifecycle through typed policy gates and receipts.

Pros:
- moves faster without hidden authority;
- makes authorization durable and reviewable;
- centralizes stop/fail-closed conditions;
- can automate cleanup/evidence/task closeout when exact policy allows it.

Cons:
- requires schema, state machine, receipts, and tests;
- policy UX must be precise;
- rollout must be staged to avoid authority drift.

### Option C — Full autonomous agent controller

Let the controller infer and execute campaign steps from chat/session context.

Pros:
- fastest apparent operation.

Cons:
- rejects the core lesson from levels 1 and 2;
- treats ambiguous context as authority;
- high risk of hidden cleanup/evidence/promotion and rollback gaps.

## Recommendation

Adopt **Option B: Level-3 governed manifest runner**.

Short form:

```text
Let a runner execute the manifest, not the vibes.
Every dangerous transition must be authorized by typed manifest policy or exact owner token, and every transition must emit a receipt.
```

## Proposed manifest contract

Initial manifest kind:

```text
autoresearch.level3_campaign_manifest.v1
```

Required top-level fields:

```json
{
  "kind": "autoresearch.level3_campaign_manifest.v1",
  "campaignId": "level3-autonomous-campaign-runner",
  "autonomyLevel": 3,
  "taskId": 0,
  "cwd": "/absolute/repo/path",
  "objective": "...",
  "primaryMetric": {
    "name": "level3_autonomous_campaign_runner_blockers",
    "direction": "lower",
    "target": 0
  },
  "filesInScope": [],
  "offLimits": [],
  "rollback": [],
  "slices": [],
  "policy": {}
}
```

Policy fields should be explicit, for example:

```json
{
  "launchVisibleCandidatePeers": "token_required",
  "runMeasurements": "manifest_allowed",
  "exportCandidateResults": "manifest_allowed",
  "generateReviewPackets": true,
  "prepareFinalizerTokenRequest": true,
  "applyFinalizer": "token_required",
  "cleanupCandidates": "token_required_or_manifest_allowed",
  "recordAkEvidence": "ak_owner_write_required",
  "completeAkTask": "ak_owner_write_required",
  "mergeReleasePromotion": "promotion_token_required"
}
```

The RFC deliberately uses policy labels rather than booleans for dangerous actions so generated manifests cannot accidentally widen authority by setting `true` everywhere.

## State machine

Proposed runner states:

1. `manifest_loaded`
2. `policy_preflight_passed`
3. `slice_ready`
4. `candidate_lanes_launched`
5. `candidate_results_bound`
6. `measurements_exported`
7. `review_packets_generated`
8. `finalizer_token_requested`
9. `finalizer_applied_if_authorized`
10. `cleanup_done_if_authorized`
11. `ak_evidence_recorded_if_authorized`
12. `task_completed_if_authorized`
13. `campaign_closed`

Terminal failure states:

- `blocked_missing_policy`
- `blocked_missing_token`
- `blocked_missing_lane`
- `blocked_duplicate_lane`
- `blocked_off_limits_or_dirty_drift`
- `blocked_validation_failed`
- `blocked_stale_packet`
- `blocked_owner_surface_error`

## Receipts

Each transition should emit a local non-authoritative receipt under a campaign-owned path such as:

```text
.autoresearch/level3-campaign/<campaignId>/receipts/<sequence>-<transition>.json
```

Receipt kind:

```text
autoresearch.level3_campaign_transition_receipt.v1
```

Receipts are audit inputs, not AK evidence. AK evidence requires the explicit AK owner-write gate.

Each receipt should include:

- manifest hash;
- task id and cwd;
- transition name;
- policy decision and token reference, if any;
- inputs and output packet paths;
- metric posture;
- changed files / off-limits check summary when applicable;
- next state;
- rollback hint.

## Token and policy rules

- `launch_visible_candidate_lanes` authorizes visible candidate peer launch only for named lanes/cwd/files/off-limits/DoD.
- `finalize_post_fanin` authorizes only named finalizer action scope.
- `candidate_cleanup` authorizes cleanup only for named worktrees/branches after archival/review.
- `ak_owner_write` authorizes exact AK evidence/task operation and evidence source.
- `promotion` authorizes merge/cherry-pick/push/PR/release/promotion only for named repo paths and rollback.

No token may be inferred from chat text, peer text, or checkpoint labels. Manifest policy may permit selected actions only when the manifest is durable, scoped, validated, and explicitly accepted by the controller/operator.

## Rollback and downgrade

Every campaign must expose:

- current state;
- last successful receipt;
- safe rerun command;
- cleanup status;
- level-2 fallback route;
- blocked dangerous actions.

Rollback to level 2 should mean:

```text
stop autonomous runner -> preserve packets/receipts -> use existing level-2 packet/review/finalizer-token surfaces manually -> do cleanup/evidence/task closeout only through owner gates
```

## Implementation slices

### Slice 1 — Manifest schema and read-only preflight

Metric: `level3_manifest_preflight_blockers = 0`

Scope:
- parse and validate manifest;
- compute policy posture;
- emit no actions;
- render next legal steps.

### Slice 2 — Autonomous slice sequencing dry-run

Metric: `autonomous_slice_sequence_blockers = 0`

Scope:
- walk slice/cell graph;
- compute ready/blocked states;
- create transition receipts for dry-run only;
- no peers or lower-plane actions.

### Slice 3 — Visible candidate lifecycle automation

Metric: `candidate_lifecycle_automation_blockers = 0`

Scope:
- launch visible candidate peers only with exact launch policy/token;
- bind candidate worktrees;
- stop/fail closed on missing/duplicate lanes;
- prepare cleanup plan but do not cleanup unless policy/token allows.

### Slice 4 — Measurement/export/review packet automation

Metric: `candidate_measure_export_review_blockers = 0`

Scope:
- run pi-autoresearch measurement/export only through manifest-allowed policy;
- generate review packets;
- keep packets non-authoritative.

### Slice 5 — Authorized finalizer and cleanup automation

Metric: `authorized_finalizer_cleanup_blockers = 0`

Scope:
- consume exact `finalize_post_fanin` token;
- apply finalizer only within permitted scope;
- cleanup candidates only with exact cleanup policy/token;
- preserve rollback receipt.

### Slice 6 — AK closeout automation

Metric: `authorized_ak_closeout_blockers = 0`

Scope:
- record AK evidence and complete AK task only with `ak_owner_write` policy/token;
- deterministic projection key/deduping;
- fail closed when task/cwd/manifest hash mismatch.

## Validation expectations

Implementation must include tests proving:

- no hidden launch without launch token/policy;
- no measurement/export without manifest permission;
- no finalizer action without exact finalizer token;
- cleanup requires cleanup token or accepted manifest cleanup policy;
- AK writes require AK owner-write policy;
- promotion remains separate and never bundled;
- receipts are non-authoritative until projected;
- stale, duplicate, missing, proof-only, or off-limits cases fail closed;
- rollback to level 2 is visible.

## Open questions

1. Should accepted manifest policy be represented as an AK decision artifact, an AK task-scoped contract, or a package-local signed/hashed file referenced by AK evidence?
2. Which package owns candidate worktree cleanup execution: `pi-society-orchestrator`, `pi-little-helpers`, or a narrow shared seam?
3. Should launch policy be per campaign, per slice, or per lane?
4. How much automatic AK task closeout should be allowed before it risks turning implementation campaigns into hidden task lifecycle mutation?

## Decision requested

Should `pi-society-orchestrator` implement a level-3 governed manifest runner under Option B, with staged implementation slices and exact policy gates for candidate lifecycle, cleanup, evidence, and task closeout?

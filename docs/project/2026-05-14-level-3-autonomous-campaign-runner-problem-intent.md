---
summary: "Problem intent for graduating from level-2 checkpointed campaign automation to a governed level-3 autonomous campaign runner."
read_when:
  - "After closing the level-2 checkpointed campaign automation implementation wave."
  - "Before drafting an RFC or ADR for autonomous slice sequencing, candidate lifecycle, cleanup, or closeout automation."
  - "When deciding which actions may be automated only through explicit policy gates."
type: "problem-intent"
status: "active"
date: "2026-05-14"
predecessor_closeout: "docs/project/2026-05-14-level-2-checkpointed-campaign-closeout.md"
predecessor_decision: "AK decision #44"
system4d:
  container: "Repo-scoped problem intent for level-3 autonomous campaign runner design in pi-extensions."
  compass: "Name the next autonomy problem after level 2: manual slice sequencing and candidate lifecycle are now the bottleneck, but owner authority must stay explicit and auditable."
  engine: "State observed level-2 limit -> identify owner surfaces -> define desired level-3 outcome -> constrain non-goals -> hand off to RFC/design."
  fog:
    risks:
      - "Informally widening level 2 into hidden peer launch, cleanup, evidence writes, or promotion."
      - "Building a runner that treats chat text or peer reports as authorization."
      - "Automating cleanup/closeout without durable manifests, exact tokens, rollback, and AK owner posture."
---

# Problem intent — level-3 autonomous campaign runner

## Problem

Level-2 checkpointed campaign automation is now complete enough to close. It reduced manual glue by generating planning packets, binding candidate results, producing review packets, preparing finalizer-token requests, surfacing operator UX, and dogfooding visible candidate-peer campaigns.

The remaining bottleneck is different:

```text
The controller still manually sequences slices, launches/monitors visible candidate peers, binds/export/reviews results, requests and consumes scoped tokens, cleans candidate worktrees, records closeout evidence, and completes AK tasks.
```

That manual sequencing is now the slow part. It also creates a new risk: operators expect the system to keep moving through a declared campaign, while the level-2 authorization keeps forcing each transition back into manual glue.

The next problem is therefore:

```text
How do we let a governed runner walk an explicit campaign manifest end-to-end, including visible candidate lifecycle and authorized cleanup/closeout, without turning peer text, packets, or chat into hidden authority?
```

## Why this matters now

Continuing to add level-2 slices would be a step backward. The packet/checkpoint surfaces have enough proof. What remains is a more autonomous execution substrate with a new authorization envelope.

Without a level-3 decision, the repo has two bad defaults:

- keep asking the operator to manually step through already-proven slice choreography;
- informally automate peer launch, cleanup, evidence, or task closeout without a durable policy gate.

Neither is acceptable.

## Owner surfaces

| Concern | Owner |
| --- | --- |
| Campaign manifest interpretation and slice sequencing | `pi-society-orchestrator` if authorized by a level-3 decision |
| Metrics, receipts, candidate-result export, dashboard artifacts | `pi-autoresearch` |
| Visible candidate peer/worktree launch and cleanup mechanics | `candidate_peer_spawn` / `pi-little-helpers` / git worktree owner surfaces |
| Durable task/evidence/decision/direction authority | AK, only through explicit owner-write policy |
| KES learning materialization | package-owned KES adapter only after explicit owner route |
| Oracle/DSPx empirical memory | Oracle/DSPx owner surfaces, never implicit campaign side effects |
| Prompt Vault / ROCS writes | respective owner surfaces only |
| Merge, push, PR, release, promotion | explicit owner promotion gate |

## Desired outcome

A valid level-3 design should allow a runner to consume a durable campaign manifest and advance through the campaign while each action is authorized by manifest policy, exact token, or owner surface.

Success looks like:

- campaign slices are declared in one manifest with files-in-scope, off-limits, metrics, rollback, and owner policy;
- the runner can execute slices in order and stop/fail closed on blockers;
- visible candidate peers can be launched only when manifest policy or an exact launch token allows it;
- candidate results are bound, measured, exported, and reviewed through approved seams;
- review packets and finalizer-token requests are generated as non-authoritative inputs;
- finalizer actions, cleanup, AK evidence, and task completion can be performed only when exact scoped policy/tokens allow them;
- every automated transition emits auditable receipts and preserves rollback posture;
- no chat text, peer/intercom text, local packet, or checkpoint label is treated as durable authority by itself.

## Candidate level-3 matrix

| Cell | Focus | Metric |
| --- | --- | --- |
| `cell-01` | Autonomous slice sequencing from campaign manifest | `autonomous_slice_sequence_blockers = 0` |
| `cell-02` | Candidate-peer lifecycle: launch, bind, stop, cleanup | `candidate_lifecycle_automation_blockers = 0` |
| `cell-03` | Authorized closeout: finalizer, evidence, task completion | `authorized_closeout_automation_blockers = 0` |

Primary metric:

```text
level3_autonomous_campaign_runner_blockers = 0
```

## Policy-gated manifest sketch

A level-3 RFC should refine a manifest shape similar to:

```json
{
  "autonomyLevel": 3,
  "campaignId": "level3-autonomous-campaign-runner",
  "taskId": 0,
  "cwd": "/absolute/repo/path",
  "primaryMetric": "level3_autonomous_campaign_runner_blockers",
  "slices": [],
  "allowedActions": {
    "launchVisibleCandidatePeers": "policy_or_token_required",
    "runMeasurements": "policy_or_token_required",
    "exportCandidateResults": "policy_or_token_required",
    "generateReviewPackets": true,
    "prepareFinalizerTokenRequest": true,
    "applyFinalizer": "token_required",
    "cleanupCandidates": "token_required_or_manifest_policy",
    "recordAkEvidence": "ak_owner_write_required",
    "completeAkTask": "ak_owner_write_required",
    "mergeReleasePromotion": "promotion_token_required"
  }
}
```

The exact schema belongs in the RFC, not this problem intent.

## Non-goals

This problem intent does not authorize implementation or runtime behavior by itself.

It does not authorize:

- hidden peer launch;
- treating `PEER_FINAL`, intercom text, or chat text as authorization;
- automatic cleanup without exact manifest policy or `candidate_cleanup` token;
- automatic AK evidence/task writes without `ak_owner_write` policy;
- automatic KES, Oracle/DSPx, Prompt Vault, or ROCS writes;
- automatic merge, push, PR, release, or promotion;
- bypassing `pi-autoresearch` for metrics, receipts, or candidate-result packets.

## Hand-off

The RFC should answer this problem with a governed level-3 runner design, including:

- manifest schema;
- state machine;
- token/policy model;
- receipt/audit model;
- rollback and cleanup semantics;
- AK evidence/task closeout boundaries;
- candidate peer lifecycle contract;
- failure modes and stop conditions;
- explicit downgrade path back to level 2.

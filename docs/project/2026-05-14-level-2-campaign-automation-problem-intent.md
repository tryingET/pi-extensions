---
summary: "Problem intent for deciding whether measured campaign automation should graduate from level 1 to a checkpointed level-2 substrate."
read_when:
  - "Before reviewing the level-2 checkpointed campaign automation RFC."
  - "When deciding whether more automation should preserve whole-matrix pressure instead of producing proof-only work."
  - "When checking why the level-2 decision exists after the level-1 campaign arc."
type: "problem-intent"
status: "active"
date: "2026-05-14"
decision: "AK decision #44"
system4d:
  container: "Repo-scoped problem intent for level-2 measured campaign automation in pi-extensions."
  compass: "Name the real problem before choosing an automation design: level-1 campaigns work, but manual glue still lets controllers narrow away from real matrix pressure."
  engine: "State the observed problem -> identify owner surfaces -> constrain success -> hand off to RFC/design."
  fog:
    risks:
      - "Treating a decision packet as if it were both problem intent and RFC."
      - "Automating hidden execution instead of automating visible checkpoints."
      - "Forgetting that the operator had to force the first real whole-matrix campaign back on track."
---

# Problem intent — level-2 checkpointed campaign automation

## Problem

The level-1 measured campaign route is now proven enough to use, but it is still too manual at the glue layer.

Manual level-1 operation successfully produced:

1. a root compatibility/release control-plane campaign;
2. a missing/stalled/late lane recovery campaign;
3. a Target 3 whole-matrix visible-candidate campaign and controller runbook.

However, the path exposed a serious operating risk: the controller can drift into baseline-only or proof-only work even when real matrix implementation tasks already exist. The operator had to challenge that drift and force the campaign back to visible candidate lanes and whole-matrix fan-in.

That means the next question is not simply whether more automation is convenient. The actual problem is:

```text
How do we automate enough campaign glue to preserve real whole-matrix implementation pressure, without giving the substrate hidden execution, evidence, promotion, or source-owner authority?
```

## Why this matters now

Without a level-2 decision, the repo has two bad defaults:

- stay at level 1 forever, repeating manual packet binding, lane validation, metric computation, export, and review preparation;
- jump informally into automation without a governed boundary.

Neither is acceptable. The first wastes the proven substrate and allows proof-only drift. The second risks hidden peer launch, hidden evidence writes, and promotion authority drift.

## Owner surfaces

| Concern | Owner |
| --- | --- |
| Matrix choreography, candidate-wave planning, fan-in review packet shape | `pi-society-orchestrator` |
| Receipts, metric computation, candidate-result packets, dashboard/export state | `pi-autoresearch` |
| Visible peer/worktree launch | `candidate_peer_spawn` / `pi-little-helpers` |
| Durable task/evidence/decision authority | AK, only after explicit controller action |
| KES, Oracle/DSPx, Prompt Vault, ROCS, release/promotion | respective owner surfaces, never implicit campaign side effects |

## Desired outcome

A valid design should authorize checkpointed preparation and measurement while preserving explicit human/controller tokens for every dangerous transition.

Success looks like:

- matrix plans are generated or refreshed from a target packet;
- visible candidate launch packets are prepared with explicit lineage, scope, and DoD;
- candidate results are bound to lanes after controller-visible peer reports;
- blocker metrics are computed from bound packets;
- candidate-wave and matrix-review packets are prepared;
- finalizer-token requests are prepared;
- no peer launch, evidence write, finalizer action, cleanup, merge, release, or promotion occurs without explicit authorization.

## Non-goals

This problem intent does not authorize:

- hidden peer launch;
- hidden benchmark/export/review;
- automatic AK task/evidence/decision/direction mutation;
- automatic KES, Oracle/DSPx, Prompt Vault, or ROCS writes;
- automatic merge, push, PR, release, cleanup, or promotion;
- treating intercom/peer text as durable evidence.

## Hand-off

The RFC should answer this problem with a bounded level-2 authorization envelope, not by widening to general autonomy.

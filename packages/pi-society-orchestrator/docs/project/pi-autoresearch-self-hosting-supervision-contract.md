---
summary: "Contract for pi-society-orchestrator's evidence-only observation surface over pi-autoresearch supervised self-hosting artifacts."
read_when:
  - "Before changing autoresearch_self_hosting_supervision."
  - "When deciding whether orchestrator should observe, record evidence, approve, rotate, or execute a pi-autoresearch self-hosting campaign."
type: "reference"
system4d:
  container: "Orchestrator-side contract for self-hosting artifact supervision above the pi-autoresearch package seam."
  compass: "Witness package-local self-hosting truth and project evidence without becoming the experiment runner, judge, or promoter."
  engine:
    invariants:
      - "Exact cwd identifies the package-local self-hosting artifact set."
      - "Evaluator lock and snapshot hashes are verified before evidence is projectable."
      - "AK evidence recording requires exact task context and remains deduped/evidence-only."
  fog:
    risks:
      - "Orchestrator accidentally reclassifies applicability instead of reading package-local truth."
      - "Evidence projection drifts into approval, controller rotation, rollback, candidate execution, or task lifecycle mutation."
---

# Contract — `autoresearch_self_hosting_supervision`

## Purpose

`autoresearch_self_hosting_supervision` is the orchestrator-side witness surface for `pi-autoresearch` supervised self-hosting campaigns.

It observes the package-local self-hosting artifact family:

- `autoresearch.self-hosting.json`
- `autoresearch.self-hosting.evaluator.lock.json`
- `autoresearch.self-hosting.promotion.json` when present

and optionally records bounded AK evidence from exact task context.

## Ownership split

| Concern | Owner |
|---|---|
| Self-hosting contract shape, evaluator lock legality, applicability classification, candidate execution helpers, promotion/rollback record writing | `packages/pi-autoresearch` |
| Above-seam observation and deduped evidence-only AK projection from verified artifacts | `packages/pi-society-orchestrator` |
| Durable task/evidence truth | AK / evidence owner surfaces |
| Approval, controller rotation, and rollback authority | operator / external controller authority |

## Actions

### `observe`

Read-only.

Inputs:

- `cwd`: exact package cwd containing `autoresearch.self-hosting.json`
- optional `taskId`: used only to shape the next-step message

Behavior:

- load and validate package-local self-hosting contract + evaluator lock through `@tryinget/pi-autoresearch` helpers;
- verify evaluator snapshot manifest/file hashes before declaring the campaign observable;
- load and validate the promotion record if present;
- summarize campaign id, controller ref, candidate worktree/branch, evaluator suite ids, promotion posture, and projection key;
- return the next legal evidence action.

Must not:

- run candidate commands;
- run evaluator suites;
- mutate evaluator locks;
- classify applicability independently;
- approve promotion;
- rotate or roll back controllers;
- spawn peers;
- record AK evidence;
- complete tasks.

### `record_evidence`

Evidence-only write.

Inputs:

- `cwd`: exact package cwd containing self-hosting artifacts
- `taskId`: exact AK task id anchor

Behavior:

- performs the same observation/verification as `observe`;
- verifies the task anchor through `ak task show`;
- rejects evidence if the self-hosting cwd is outside the anchored task repo;
- builds an evidence payload with `kind=autoresearch.self_hosting_supervision.v1`;
- dedupes by `projection_key` for the current task/check type;
- records AK evidence only when the projection key is new.

Must not:

- run candidates or evaluator suites;
- mutate package-local self-hosting artifacts;
- reclassify applicability;
- approve, rotate, roll back, merge, delete worktrees, or complete tasks.

## Evidence payload

The projected AK evidence uses a check type shaped as:

```text
autoresearch:self-hosting:<promotion-posture>
```

where `<promotion-posture>` is one of:

- `missing`
- `planned`
- `approved`
- `rotated`
- `rolled_back`
- `superseded`

The details include:

- `kind: autoresearch.self_hosting_supervision.v1`
- `projection_key`
- campaign id and cwd
- contract/evaluator/promotion artifact paths
- promotion status and approval/rollback fields
- controller ref
- candidate worktree/branch/base ref
- evaluator manifest hash and suite ids
- execution model
- an explicit evidence-only boundary marker

## Boundary rule

This surface is not a self-hosting controller. It is a witness/evidence clerk above the package seam.

If future work needs candidate execution, applicability classification, promotion approval, controller rotation, rollback, or task completion, it must use the owning surface and pass through a separate explicit decision/gate.

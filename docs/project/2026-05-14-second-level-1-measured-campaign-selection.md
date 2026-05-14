---
summary: "Selection packet for the second non-meta level-1 measured campaign after missing-lane recovery proof."
read_when:
  - "You need the selected second real campaign target under SF5/IW3."
  - "You are about to run the pi-society-orchestrator loop/nexus boundary hardening matrix."
  - "You need to distinguish this target from deferred toolbox and guarded-bootstrap work."
type: "selection-packet"
system4d:
  container: "Repo-scoped selection packet for the second SF5/IW3 measured campaign adoption wave."
  compass: "Select a real matrix implementation wave in pi-society-orchestrator without touching deferred toolbox or guarded-bootstrap work."
  engine: "Inspect deferrals and dirty posture -> select target -> seed bounded matrix execution task."
  fog:
    risks:
      - "Accidentally absorbing deferred toolbox rollback work."
      - "Treating existing dirty files as authoritative without isolating candidate workspaces."
      - "Running another baseline-only campaign instead of a real candidate matrix."
---

# Second level-1 measured campaign selection

## Context

After decision `#42`, the root compatibility/release-control adoption wave, and the missing/stalled/late-lane recovery proof, the next campaign should be a real whole-matrix implementation wave.

Toolbox remains deferred, so `packages/pi-toolbox-discovery/**` is out of scope for this selection.

## Selected target

**pi-society-orchestrator loop/nexus boundary hardening matrix**

Why this target:

- current dirty posture already includes real `pi-society-orchestrator` loop/nexus changes;
- the files are package-owned orchestrator surfaces, not deferred toolbox work;
- the problem has multiple plausible hypotheses: command dispatch semantics, tool activation/reporting, and boundary regression coverage;
- focused tests can provide a blocker metric without release or external mutation.

## Campaign objective

```text
Harden pi-society-orchestrator loop/nexus command boundaries so operator commands dispatch through lawful tools, tool activation is explicit and failure-closed, and nexus boundary tests cover queued/idle behavior without hidden execution or source-owner drift.
```

Primary metric:

```text
orchestrator_loop_boundary_blockers  (lower is better, target 0)
```

## Matrix sketch

| Cell | Scenario | Hypothesis family | Candidate posture |
|---|---|---|---|
| `cell-01-01` | command dispatch semantics | Dispatch slash commands through tool invocations instead of only inserting editor text. | Candidate peers compare direct send/queued follow-up behavior and operator notification style. |
| `cell-02-01` | tool activation and missing-tool gates | Required tools should be activated when registered and fail closed when absent. | Candidate peers compare activation helper shape and missing-tool UX. |
| `cell-03-01` | nexus boundary regression coverage | Focused tests should prove idle vs non-idle dispatch, no duplicate active tools, and no hidden execution. | Candidate peers compare test harness and assertion breadth. |

## Boundaries

Authorized:

- visible candidate worktrees;
- focused orchestrator tests;
- candidate-result packet export and matrix review;
- AK evidence after owner review.

Not authorized:

- toolbox rollback or source mutation;
- guarded-bootstrap work blocked by decision #8;
- hidden whole-matrix executor;
- release publication;
- AK/KES/Oracle/Prompt Vault/ROCS mutation from candidate lanes;
- merging or applying candidate output without controller verification and owner review.

## Next seeded task

Seed a bounded execution task:

```text
Run pi-society-orchestrator loop/nexus boundary hardening matrix campaign
```

The execution task should use level-1 whole-matrix flow: plan cells, spawn visible candidate lanes, measure/export packets, review per cell, review matrix, and only then decide whether any patch should be applied.

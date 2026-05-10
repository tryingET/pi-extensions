---
summary: "ADR accepting a bounded campaign-endurance proof before matrix automation widens beyond plan-only choreography."
read_when:
  - "You are changing pi-autoresearch bounded-loop/campaign runtime behavior."
  - "You are deciding whether matrix campaigns may execute cells automatically."
type: "adr"
system4d:
  container: "Package-local ADR for campaign endurance proof."
  compass: "Prove sustained bounded execution before broader matrix automation."
  engine: "Accept proof tiers, runtime ownership, dashboard/receipt requirements, and stop/resume checks."
  fog: "Autonomy can become authority drift if local receipts or matrices are treated as truth owners."
---

# ADR — bounded campaign endurance proof before matrix automation

## Status

Accepted for first smoke proof.

## Context

Matrix campaign planning and visible candidate lanes are useful, but they do not by themselves prove that the core campaign loop can run for a sustained supervised budget.

The operator observed that the system still feels like a single-loop/manual stepping flow rather than a campaign that can run for a couple of hours and remain useful.

The package vision already says `pi-autoresearch` should be:

```text
autonomous in execution, governed in authority
```

This ADR defines how to prove that claim incrementally.

## Decision

`pi-autoresearch` will treat campaign endurance as an explicit proof track before matrix campaigns are widened beyond plan-only choreography.

The proof has two tiers:

1. **Smoke proof** — short bounded segment proving runtime receipts, event ledger, dashboard data, resume/closeout posture, and evidence boundary.
2. **Endurance proof** — hour-scale supervised segment proving the loop remains useful under longer budgets and stop gates.

The first implementation wave may complete the smoke proof. It must not claim hour-scale endurance until that longer proof is actually run.

## Ownership rules

| Concern | Owner |
|---|---|
| Bounded campaign loop, benchmark/check execution, receipts, event ledger, dashboard/export, closeout and resume/finalize plan surfaces | `pi-autoresearch` |
| Exact-task live supervision, evidence projection, matrix/candidate-wave choreography | `pi-society-orchestrator` |
| Strategy/task/decision/evidence authority | AK |
| Candidate worktree creation | visible peer/controller tooling |
| Durable promotion, task completion, learning persistence | external owner surfaces |

## Proof requirements

A valid campaign proof must define and record:

- bounded objective;
- metric name/unit/direction;
- benchmark command that emits a fresh `METRIC` line;
- checks command or explicit no-check choice;
- iteration and/or wall-clock budget;
- stop-gate behavior;
- dashboard/export path after receipts exist;
- resume/finalize/closeout posture after the run;
- AK evidence or equivalent external record that labels the proof accurately.

## Smoke proof acceptance

A smoke proof is enough to say:

```text
The runtime wiring can produce receipts, event-ledger entries, non-empty dashboard state, and inspectable follow-up posture under AK-governed dogfood.
```

A smoke proof is not enough to say:

```text
The campaign can run productively for hours.
```

## Endurance proof acceptance

An endurance proof requires a longer supervised run, normally `60-120` minutes or an equivalent explicit budget agreed by the operator.

It should demonstrate:

- repeated useful iterations;
- live dashboard/overlay usefulness during the run;
- clean stop/resume/finalize posture;
- no hidden daemon or authority write;
- no source-control pollution beyond ignored local runtime projections.

## Matrix relationship

Matrix campaigns stay plan-only until the single-campaign endurance proof is accepted.

A later matrix-execution decision may compose:

```text
matrix cell -> bounded pi-autoresearch campaign segment -> packet/dashboard review -> owner decision
```

That future decision must not move metrics, receipts, or benchmark/check execution into `pi-society-orchestrator`.

## Consequences

- The immediate next step is a bounded smoke dogfood under AK task `#2749`.
- Runtime artifacts such as `autoresearch.jsonl`, `autoresearch.events.jsonl`, `autoresearch.runtime.json`, and `.autoresearch/` remain local projections and should not be committed as source truth.
- Matrix automation is deliberately deferred until the campaign runtime earns trust.
- The proof can discover implementation gaps, but should not preemptively add new autonomy architecture.

## Rollback

If the campaign smoke proof fails, do not widen matrix automation. Keep using plan-only matrix choreography and fix the package-owned campaign runtime first.

---
summary: "RFC/design for proving bounded pi-autoresearch campaign endurance before matrix automation."
read_when:
  - "You are implementing or reviewing campaign endurance dogfood in pi-autoresearch."
  - "You are deciding whether a matrix campaign may run cells automatically."
type: "rfc"
system4d:
  container: "Package-local RFC for campaign-endurance proof."
  compass: "Separate sustained execution from authority and from matrix choreography."
  engine: "Define endurance contract, stop gates, dashboard proof, resume proof, and evidence boundary."
  fog: "The system may appear autonomous while still needing explicit budgets and owner gates."
---

# RFC — bounded campaign endurance runtime proof

## Proposal

Adopt a campaign-endurance proof contract for `pi-autoresearch` before allowing matrix campaigns to become anything more than plan-only choreography.

The proof should demonstrate that the package-owned bounded runtime can run a sustained campaign segment under explicit budgets while preserving owner boundaries.

## Ownership split

| Concern | Owner |
|---|---|
| Campaign setup, run loop, benchmark/check execution, receipts, event ledger, dashboard/export, resume/finalize plans | `pi-autoresearch` |
| Exact-task supervision, AK evidence projection, matrix/candidate-wave choreography | `pi-society-orchestrator` |
| Strategy, tasks, decisions, evidence authority | AK |
| Prompted setup/next/finalize procedures | Prompt Vault via governed package/orchestrator routes |
| Candidate worktree production | visible peer tooling / controller |
| Promotion, rollback, task completion, learning persistence | external owner surfaces |

## Endurance contract

A campaign-endurance run is valid only when the request defines:

- exact `cwd`;
- bounded objective;
- metric name/unit/direction;
- benchmark command that emits a fresh `METRIC <name>=<number>` line;
- checks command or an explicit `checksCommand: null` decision;
- `maxIterations` and/or `maxWallClockMinutes`;
- stop gates;
- files in scope and off-limits paths when candidate work is involved;
- authority boundary for evidence/learning/promotion.

## Execution modes

### Smoke proof

Purpose: prove the artifacts and dashboard are wired.

Suggested budget:

```text
maxIterations: 2-5
maxWallClockMinutes: 1-10
```

A smoke proof may validate receipt/dashboard/resume mechanics. It must not be claimed as hour-scale endurance.

### Endurance proof

Purpose: prove operator-trustworthy sustained execution.

Suggested budget:

```text
maxWallClockMinutes: 60-120
maxIterations: enough to exercise repeated state transitions without unbounded behavior
peerMode: plan or off
```

The endurance proof should be run only from a clean enough checkout and with a cheap, causal benchmark/check pair that will not mutate source authority.

## Dashboard and artifact proof

The proof must verify that the following become non-empty and meaningful after execution:

- `autoresearch.jsonl` local receipt log;
- `autoresearch.events.jsonl` local event ledger;
- `.autoresearch/autoresearch-dashboard.html` browser dashboard export;
- runtime status dashboard/overlay summaries;
- closeout or resume/finalize plan surfaces.

Dashboard usefulness depends on runtime receipts. The dashboard must not be treated as a primary review surface before receipt-producing runs exist.

## Stop and resume semantics

A valid proof must show at least one of:

- budget stop;
- machine/control gate stop;
- checks/benchmark failure stop;
- explicit operator stop;
- resume plan explaining why a stopped segment is reusable or blocked.

Resume is not required to apply in the first proof, but resume posture must be inspectable.

## Relationship to matrix campaigns

Matrix campaigns should remain plan-only until the single campaign runtime proof is accepted.

After acceptance, matrix automation may be considered only as a separate decision that composes:

```text
matrix cell -> bounded pi-autoresearch campaign segment -> dashboard/packet review -> final owner decision
```

The matrix layer must not own benchmark execution, receipts, candidate-result semantics, or promotion.

## Candidate/lane posture

For the first endurance proof, candidate peers are optional and should default to `peerMode: "plan"` or off. The objective is campaign endurance, not candidate quality.

If candidate lanes are included, each measured candidate must bind controller-verified metadata and export a candidate-result packet before matrix or owner review.

## Decision recommendation

Accept this RFC for a first bounded proof with two tiers:

1. smoke proof now, to verify wiring and dashboard state under AK task `#2749`;
2. hour-scale proof next, only after the smoke proof and dirty checkout/repo artifact posture are reconciled.

This keeps the operator's big-picture concern visible without pretending a short smoke run proves hours-long autonomous usefulness.

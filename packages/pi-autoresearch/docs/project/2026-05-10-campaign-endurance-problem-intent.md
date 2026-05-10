---
summary: "Problem intent for proving bounded pi-autoresearch campaign endurance before matrix automation."
read_when:
  - "Before widening matrix campaigns into longer-running campaign execution."
  - "When deciding whether pi-autoresearch can run for hour-scale supervised budgets."
type: "problem-intent"
system4d:
  container: "Package-local problem-intent for campaign endurance proof in pi-autoresearch."
  compass: "Prove sustained bounded execution without turning local runtime into authority."
  engine: "AK strategy -> discovery/design -> ADR -> bounded dogfood proof -> evidence handoff."
  fog: "The main risk is mistaking plan-only matrix choreography or one-off runs for campaign endurance."
---

# Problem-intent — bounded campaign endurance proof

## Operator question

The matrix planner and visible candidate lanes now work as choreography, but the operator observed that the current flow still feels like a single-loop/manual stepping system rather than something that can run for hours under supervision.

The key question is:

```text
Can pi-autoresearch run a useful bounded campaign for hour-scale budgets while staying autonomous in execution and governed in authority?
```

## Current facts

- `pi-autoresearch` owns the local experiment runtime, receipts, event ledger, dashboard/export, bounded loop, candidate binding, candidate-result packets, resume plans, and closeout packets.
- `pi-society-orchestrator` owns above-seam observation/choreography/evidence projection, including matrix planning and exact-task live supervision.
- Matrix campaigns in `pi-society-orchestrator` are currently plan-only choreography; they should not become the campaign runtime by convenience.
- A short dashboard-data dogfood segment proved that the HTML dashboard becomes useful only after runtime receipts exist.
- The existing campaign surfaces support explicit budgets (`maxIterations`, `maxWallClockMinutes`) and stop gates, but hour-scale endurance has not been treated as a first-class AK-governed proof.

## Problem

The system has pieces that look campaign-shaped, but no current AK-governed proof answers whether a supervised campaign can:

1. run for a sustained bounded budget without babysitting every turn;
2. keep producing fresh receipts and event-ledger entries;
3. keep the HTML dashboard/overlay useful during and after execution;
4. stop on budgets, posture gates, machine gates, or owner-control gates;
5. resume or explain why resume is blocked;
6. emit closeout/evidence/learning/candidate packets without claiming external authority;
7. remain compatible with matrix/candidate-wave choreography without moving runtime ownership into the orchestrator.

## Intent

Create an AK-governed campaign-endurance proof that keeps package ownership truthful:

```text
AK direction/task/decision authority
-> pi-autoresearch campaign runtime proof
-> orchestrator observation/evidence only after verified runtime artifacts
-> matrix automation only after the single-campaign loop earns trust
```

## Smallest truthful success state

The first proof is successful when:

1. AK contains a strategic frame/work wave and exact task for campaign endurance.
2. A problem-intent, RFC/design, review, and ADR define the endurance contract.
3. A bounded dogfood campaign runs under explicit budgets and records receipts/event-ledger state.
4. The dashboard shows non-empty campaign/run history after the dogfood run.
5. Resume/finalize/closeout posture can be inspected after the run.
6. AK evidence records what was proven and what remains unproven.
7. No hidden daemon, peer launch, worktree mutation, AK/KES write from `pi-autoresearch`, or promotion occurs.

## Non-goals

- Do not make `pi-society-orchestrator` the campaign runtime owner.
- Do not create an unbounded daemon.
- Do not auto-spawn candidate peers or auto-merge/promote candidate work.
- Do not treat local receipts as canonical AK truth.
- Do not claim hour-scale endurance from a short smoke run; record smoke evidence as smoke only.
- Do not widen matrix campaigns into automatic whole-matrix execution before the single campaign loop is proven.

## Open design question

The first design question is not whether autonomy should exist. The question is how much sustained execution can be allowed while preserving:

- explicit budgets;
- interruptible foreground/live-supervised control;
- inspectable local artifacts;
- truthful dashboard state;
- external owner authority for evidence, learning, and promotion.

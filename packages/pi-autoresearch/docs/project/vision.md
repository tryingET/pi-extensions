---
summary: "North-star vision for @tryinget/pi-autoresearch: governed autonomous research that stays bounded by explicit authority seams."
read_when:
  - "You need the final end-state / north-star direction for pi-autoresearch."
  - "You are deciding whether a new autonomy, self-hosting, orchestration, or evidence feature fits the long-term product direction."
  - "Before changing product-posture.md in ways that might redefine the package's destination rather than its current maturity."
type: "reference"
system4d:
  container: "Package-local north-star direction for the governed auto-research capability."
  compass: "Make autonomous research powerful in execution while keeping authority external, inspectable, and reversible."
  engine:
    invariants:
      - "Research loops are bounded by explicit objectives, budgets, measurement contracts, and review gates."
      - "Package-local runtime evidence is projected upward; durable truth remains with owner surfaces."
      - "Self-hosting uses stable-controller/candidate/evaluator/promotion separation, never package-local self-ratification."
  fog:
    risks:
      - "Confusing autonomous execution with self-sovereign authority."
      - "Letting local receipts become campaign truth by convenience."
      - "Adding orchestration surfaces that secretly re-own the experiment instead of witnessing it."
---

# Vision — `@tryinget/pi-autoresearch`

## North star

`pi-autoresearch` should become the governed autonomous research workbench for Pi: a local runtime that can turn a bounded objective into measured experiments, candidate evidence, closeout packets, and next-hypothesis decisions while preserving explicit authority boundaries.

The guiding phrase is:

```text
autonomous in execution, governed in authority
```

The end state is not a self-sovereign package that plans, edits, judges, promotes, records durable truth, and evolves itself in one closed loop. The end state is a powerful experiment runtime that remains interruptible, inspectable, reversible, and routed through the owner surfaces that hold durable truth.

## Desired end-state loop

A mature auto-research campaign should be able to move through this loop under explicit budgets and gates:

```text
operator objective
-> bounded campaign contract
-> measurement design
-> baseline / calibration
-> candidate creation or candidate binding
-> benchmark / checks / evaluator suites
-> empirical interpretation
-> closeout / evidence / learning packets
-> governed next-hypothesis decision
-> external promotion, rollback, or follow-up task
```

In mature form, the package should help an operator or controller agent:

1. decompose a bounded research/development objective into an explicit experiment contract;
2. choose or prepare truthful metrics, including threshold-style success criteria;
3. run baseline and calibration samples without overclaiming noisy timing changes;
4. bind visible candidate worktrees or visible peer-produced candidates;
5. execute benchmark/check/evaluator suites under bounded subprocess and posture gates;
6. distinguish operational success from empirical meaning;
7. produce reviewable closeout, evidence, candidate-result, and learning packets;
8. request governed setup / next-hypothesis / finalization decisions through Prompt Vault where useful;
9. expose live status, dashboard, widget, overlay, and export surfaces without turning them into control authority;
10. support supervised self-hosting under frozen evaluator truth and external promotion/rollback gates;
11. hand evidence upward to orchestrator/AK/KES/other owner surfaces without directly owning their durable writes;
12. stop cleanly when budgets, checks, posture gates, evaluator locks, or authority gates fail.

## Authority architecture

The long-term product direction depends on keeping these owner seams visible.

| Concern | Long-term owner |
|---|---|
| Local experiment runtime, XState machine, run execution, receipts, empirical interpretation, package-local closeout packets | `packages/pi-autoresearch` |
| Above-seam observation, coordination, and evidence projection from verified context | `packages/pi-society-orchestrator` |
| Durable campaign/task/evidence truth and exact-task authority | AK / evidence owner surfaces |
| Reusable setup, next-hypothesis, finalization, and other governed decision procedures | Prompt Vault |
| Governed experiment semantics and controlled vocabulary | ROCS / ontology owner repos |
| Empirical behavior analysis and program-generation advisory evidence | DSPx / Oracle surfaces |
| Learning persistence and activation | KES, notes, KMS, or selected learning adapters |
| Operator approval, controller rotation, and promotion/rollback authorization | Operator / external controller authority |

The package may emit packets that make external writes easy to review, dedupe, and apply. It must not quietly become the writer of every external truth surface.

## Autonomy ladder

The intended path to fuller auto-research is staged.

1. **Bounded local runtime** — package-owned setup/run/status/loop/finalize surfaces with receipts and an explicit runtime machine.
2. **Supervised dogfood** — the package measures package-local candidates under ordinary campaign contracts.
3. **Supervised self-hosting** — a stable controller evaluates a separate candidate worktree under snapshot-owned evaluator locks and external promotion gates.
4. **Evidence-only overwatch** — `pi-society-orchestrator` observes runtime/self-hosting artifacts and projects verified evidence above the package seam without re-owning the experiment.
5. **Visible candidate production** — peers or helper tooling may create candidate worktrees, but candidate launch, merge, discard, and cleanup remain explicit.
6. **Bounded coordinated campaigns** — orchestrator-level flows may coordinate multiple package-local research steps under exact scope, budgets, and review gates.
7. **Limited autonomous execution** — later campaigns may run longer bounded loops, but only with explicit budgets, posture gates, inspectable state, and interruptible operator control.
8. **Institutional learning handoff** — accepted closeouts and learnings move through owner-routed KES/AK/notes/Prompt Vault/ontology processes instead of being absorbed into local runtime state.

The ladder does not include hidden daemonized self-improvement, automatic whole-repo mutation, direct AK/KES writes from the package runtime, or package-local self-promotion.

## Self-hosting destination

Self-hosting is part of the vision, but only in the supervised controller/candidate/judge/promotion shape accepted by the package ADR.

A mature self-hosting wave should preserve all of these facts:

- the active controller is stable for the wave;
- the candidate lives in a separate worktree/ref;
- evaluator entrypoints and lock hashes are snapshot-owned outside candidate mutation;
- applicability classes distinguish reject, variant candidate, and default-promotion candidate;
- local success is evidence, not adoption authority;
- operator approval and controller rotation are explicit external acts;
- rollback truth is explicit and reversible.

The package can make this workflow ergonomic. It must not make it self-ratifying.

## Orchestrator relationship

`pi-society-orchestrator` belongs in the end vision as a witness/coordinator above the package seam, not as the owner of `pi-autoresearch` runtime mechanics.

A self-hosting supervision surface in orchestrator fits the vision when it is narrow and evidence-oriented:

```text
autoresearch_self_hosting_supervision({ action: "observe" | "record_evidence", cwd, ... })
```

Such a surface should:

- read exact package-local self-hosting artifacts from an explicit `cwd`;
- verify contract, evaluator-lock, promotion, and rollback posture;
- summarize whether the package-local campaign is observable and evidence-ready;
- require exact verified task/evidence context before recording external evidence;
- dedupe evidence projection;
- avoid candidate execution, evaluator-lock mutation, applicability reclassification, approval, rotation, rollback, peer launch, or task completion.

This keeps the split clean:

```text
pi-autoresearch = lab / experiment runtime
pi-society-orchestrator = witness / coordinator / evidence projector
AK/KES/Prompt Vault/ROCS = durable institutional owner surfaces
operator = approval, rotation, and promotion authority
```

## Non-negotiable invariants

Future work remains in-bounds only if these invariants hold:

1. bounded objectives, budgets, and stop conditions are explicit;
2. measurement contracts identify metric direction, freshness, causal linkage, and caveats;
3. calibration and candidate runs are semantically separate;
4. threshold-style success is represented truthfully instead of forced into improvement-only semantics;
5. candidate binding records source, worktree/ref/base, changed files, and caveats when relevant;
6. status/dashboard/observe paths are read-only unless an action explicitly says otherwise;
7. local receipt/runtime/self-hosting files remain projections, not canonical campaign truth;
8. external writes require owner-routed authority and dedupe posture;
9. self-hosting evaluator truth cannot be candidate-owned;
10. local success never implies package-local promotion authority;
11. hidden daemonized autonomy and unbounded resume loops remain out of scope;
12. rollback remains explicit and reviewable.

## Relationship to current posture

This document names the destination. It is not the live task queue, release gate, or current maturity claim.

Use:

- [product-posture.md](./product-posture.md) for current product promise, maturity, strategic line, next product bets, and boundary reminders;
- [dogfood-playbook.md](./dogfood-playbook.md) for the canonical supervised operator flow;
- [adapter-contracts.md](./adapter-contracts.md) for packet shapes consumed by external owner surfaces;
- [supervised self-hosting ADR](../adr/2026-04-22-supervised-self-hosting-contract.md) for the accepted self-hosting legality contract;
- [root RFC](../../../../docs/project/pi-autoresearch-rfc.md), [architecture correction](../../../../docs/project/pi-autoresearch-architecture-correction.md), and [foundation status](../../../../docs/project/pi-autoresearch-foundation-status.md) for the root-level boundary history;
- [root monorepo vision](../../../../docs/project/vision.md) for root-owned package-policy direction rather than package-local auto-research direction.

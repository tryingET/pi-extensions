---
summary: "Canonical operator playbook for dogfooding pi-autoresearch on a bounded local candidate change."
read_when:
  - "You are about to run a supervised pi-autoresearch campaign."
  - "You need the canonical setup -> baseline -> calibration -> candidate -> run -> closeout -> evidence/learning promotion flow."
  - "You need to decide whether a measured result is review-ready, calibration-only, or blocked by metric readiness."
type: "playbook"
system4d:
  container: "Package-local operator playbook for the pi-autoresearch dogfood loop."
  compass: "Turn one bounded candidate into trustworthy empirical evidence without hidden autonomy or authority drift."
  engine:
    invariants:
      - "Every campaign starts from an explicit measurement contract."
      - "Duration metrics require baseline/calibration caution before candidate claims."
      - "Candidate binding and external promotion remain explicit."
  fog:
    risks:
      - "A faster single run is mistaken for a candidate win."
      - "A peer worktree or packet is treated as promoted evidence before controller verification."
      - "The package is widened into an adapter, task mutator, or daemon by convenience."
---

# pi-autoresearch dogfood playbook

This is the canonical supervised dogfood flow for `@tryinget/pi-autoresearch`.
It operationalizes the package posture in [product-posture.md](./product-posture.md):

```text
bounded objective -> explicit measurement contract -> baseline/calibration -> candidate binding -> ordinary run -> empirical decision -> closeout/evidence/learning packet -> explicit external promotion
```

Use this playbook for one bounded local candidate at a time. It is deliberately not a hidden daemon, a whole-campaign runner, a peer spawner, or an AK/KES writer.

When the target is broader than one candidate patch — for example a command family, latency surface, or scenario/hypothesis sweep — use [benchmark-matrix-runbook.md](./benchmark-matrix-runbook.md) to define the campaign matrix, then use this playbook for each bounded candidate segment.

## Process gate: do not bypass missing Prompt Vault bindings

The package has governed Prompt Vault templates, but the lawful execution path is the package-owned runtime seam, not ad hoc template interpretation.

If `vault_execute_template` reports that a `pi-autoresearch-*` workflow template has no executable orchestrator binding, treat that as a **process stop**, not permission to continue manually. Loop back through:

```text
discovery/design -> architecture/UX/AX -> implement -> execute; if it does not work, loop back to discovery/design -> verify -> commit
```

Use these owner routes instead:

| Prompt Vault template | Lawful owner route |
|---|---|
| `pi-autoresearch-setup` | `autoresearch_runtime_status({ action: "setup", ... })` |
| `pi-autoresearch-next-hypothesis` | `autoresearch_runtime_run(...)` or `autoresearch_runtime_loop(...)` with `decisionGoal` |
| `pi-autoresearch-finalize` | `autoresearch_runtime_status({ action: "finalize", ... })` or `autoresearch_runtime_finalize(...)` |

Do not treat retrieved workflow-template prose as execution. Either use the owner route above or first land the missing execution binding as its own architecture/UX/AX slice.

## Product boundary in one sentence

`pi-autoresearch` owns the local experiment runtime, receipts, empirical interpretation, and reviewable packets; external systems own candidate creation, durable task/evidence state, learning persistence, and promotion.

## Preflight: decide whether a campaign is lawful

Start only when all of these are true:

1. **Bounded objective exists** — one measurable improvement target, not a broad refactor wish.
2. **Files in scope are known** — include likely implementation files and explicitly name off-limits paths when risk exists.
3. **Metric can be emitted freshly** — the benchmark command must print `METRIC <name>=<number>` for the current run.
4. **Metric has causal linkage** — the metric should move because of the candidate, not because of unrelated environment drift.
5. **Optimization authority is explicit** — know whether lower or higher metric values are better.
6. **Promotion owner is known** — decide up front whether AK, KES, notes, an issue tracker, or manual review will consume the packet later.

If the benchmark is a generic command such as `npm test`, add a wrapper only when it can emit a fresh, causal metric. Do not let static artifacts or stale logs drive optimization.

## Canonical tool flow

### 1. Autoplan the measurement contract

Use autoplan to turn the objective into a proposed campaign setup:

```ts
autoresearch_runtime_autoplan({
  cwd,
  objective: "Reduce <specific cost> for <specific path> without changing <constraint>",
  filesInScope: ["path/in/scope/**"],
  offLimits: ["path/not/to/touch/**"],
  constraints: ["Keep external authority writes out of pi-autoresearch."],
})
```

Review the returned setup for:

- metric name and unit;
- direction (`lower` or `higher`);
- benchmark command;
- checks command;
- metric-readiness warnings;
- duplicate benchmark/check warnings;
- exact proposed next setup call.

Do not continue if autoplan cannot identify a fresh causal metric.

### 2. Apply setup and collect baseline samples

Apply the setup, then run at least one baseline before any candidate binding:

```ts
autoresearch_runtime_setup({
  cwd,
  action: "baseline",
  name: "<campaign-name>",
  metricName: "<metric>",
  metricUnit: "ms",
  direction: "lower",
  benchmarkCommand: "bash autoresearch.sh",
  checksCommand: "npm run check",
  description: "Baseline before candidate changes",
})
```

For duration metrics, prefer multiple baseline/calibration samples before reading a small timing delta as signal. One faster run is usually only a hint.

### 3. Add calibration runs when duration noise matters

Use calibration when the metric is timing-like, noisy, or workstation-sensitive:

```ts
autoresearch_runtime_run({
  cwd,
  runKind: "calibration",
  description: "Calibration sample on unchanged baseline",
  hypothesisId: "baseline-noise-001",
  hypothesis: "Estimate duration noise before candidate evaluation.",
  interventionSummary: "No candidate change; unchanged baseline timing sample.",
  expectedPrimaryEffect: "No intentional metric movement.",
})
```

Interpretation rule:

- calibration runs inform baseline drift/noise;
- calibration-only faster samples are not candidate wins;
- candidate claims require an ordinary candidate run with candidate binding.

### 4. Produce or bind a candidate explicitly

Candidate work may come from a human edit, a controller-supplied patch, or a visible peer worktree. `pi-autoresearch` does not spawn peers or promote their work.

When a visible candidate lane produced the change, bind only controller-verified facts:

```ts
autoresearch_runtime_run({
  cwd,
  runKind: "ordinary",
  description: "Measure candidate after verified diff review",
  hypothesisId: "candidate-001",
  hypothesis: "<why this candidate should improve the metric>",
  interventionSummary: "<what changed>",
  expectedPrimaryEffect: "<expected metric movement>",
  hypothesisTargetFiles: ["path/changed.ts"],
  experimentRisk: "<validity caveat>",
  candidateSource: "candidate_peer_spawn",
  candidateWorktree: "/absolute/path/to/candidate-worktree",
  candidateBranch: "candidatepeer/<branch>",
  candidateBaseRef: "<base-ref>",
  candidateDiffSummary: "<controller-verified summary>",
  candidateFilesChanged: ["path/changed.ts"],
})
```

Never treat raw peer/intercom output as evidence. Verify the diff, changed files, and candidate claim first.

### 5. Read empirical posture, not just run success

After each run, inspect status:

```ts
autoresearch_runtime_status({ cwd })
```

Look for the empirical posture sentence and recommended next action. Important classes include:

| Posture | Meaning | Usual next step |
|---|---|---|
| `calibration_only` | Timing evidence updated noise interpretation only. | Run/continue candidate evaluation only after candidate binding. |
| `baseline_drift_suspected` | Candidate-looking improvement may be explained by baseline/calibration drift. | Rebaseline or collect more calibration samples. |
| `candidate_review_ready` | Candidate evidence is strong enough for review handoff. | Build closeout and external evidence/learning packets. |
| blocked/check failure states | Operational or validation failure prevents empirical claim. | Fix checks, benchmark, posture gate, or scope before continuing. |

Operational success means the command ran. It does not automatically mean the result is a measured candidate win.

### 6. Close out the segment

When the segment is review-ready or intentionally stopped, build the closeout packet:

```ts
autoresearch_runtime_status({
  cwd,
  action: "closeout",
})
```

Review the closeout for:

- campaign identity and metric contract;
- run count and successful run count;
- baseline, best metric, and direction;
- empirical decision class;
- empirical posture summary and recommended action;
- candidate binding and files changed;
- caveats and adapter boundary.

### 7. Promote evidence or learning through the owning surface

`pi-autoresearch` packets are non-mutating. Promotion is a separate explicit owner-surface action.

For AK-shaped evidence, request a packet and then use the suggested external call only after verifying the exact task id:

```ts
autoresearch_runtime_status({
  cwd,
  action: "ak_evidence",
  akTaskId: 1234,
})
```

For learning/KMS promotion:

```ts
autoresearch_runtime_status({
  cwd,
  action: "learning",
})
```

For candidate review or issue/task comments:

```ts
autoresearch_runtime_status({
  cwd,
  action: "candidate_result",
})
```

Adapters should follow [adapter-contracts.md](./adapter-contracts.md): exact target ids, explicit dry-run/apply posture, target-system receipts, and no inferred authority.

## Stop conditions

Stop or rebaseline instead of continuing when:

- the metric is stale, absent, or not causally linked;
- checks fail and the result cannot be interpreted as a valid candidate run;
- duration results are under-sampled or calibration explains the movement;
- candidate metadata is missing for a candidate claim;
- posture gates fail;
- external promotion would require guessing task, issue, note, or KES identity;
- the next useful step is a new product surface rather than a better measurement of the current candidate.

## What good dogfood evidence looks like

A review-ready dogfood packet should let a reader answer:

1. What was the bounded objective?
2. Which metric was optimized, in what direction, and why was it authoritative?
3. How many baseline/calibration/candidate runs happened?
4. What candidate changed, where, and why was it expected to work?
5. What empirical decision class did the package assign?
6. What caveats or noise risks remain?
7. Which external owner surface should persist evidence or learning, and through what explicit call?

If those answers are not clear, keep the segment local and collect better evidence before promotion.

## Minimal successful dogfood transcript

A minimal truthful run usually has this shape:

```text
1. autoplan proposes a fresh METRIC contract
2. setup writes/uses benchmark wrapper and records baseline
3. calibration samples establish timing noise if needed
4. candidate diff is bound with verified files changed
5. ordinary run records candidate measurement and checks result
6. status says candidate_review_ready or explains why not
7. closeout packet summarizes evidence and caveats
8. AK/KES/issue adapter promotion happens explicitly outside pi-autoresearch
```

That is the dogfood loop to preserve. New capabilities should make this loop clearer and harder to overclaim, not broader by default.

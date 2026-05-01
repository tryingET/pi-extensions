---
summary: "Runbook for turning a promising pi-autoresearch fix into a scenario x hypothesis benchmark matrix."
read_when:
  - "A performance or quality target is broader than one bounded candidate patch."
  - "You need to prevent a lucky first optimization from being overpromoted as a whole campaign result."
  - "You are planning repeated measurements across scenarios, hypotheses, or candidate peers."
type: "runbook"
system4d:
  container: "Package-local operator runbook for matrix-shaped optimization campaigns using pi-autoresearch as the measured-run substrate."
  compass: "Make broad optimization truthful: define surfaces, scenarios, hypotheses, repetitions, and promotion gates before coding."
  engine:
    invariants:
      - "A campaign matrix is planned outside pi-autoresearch; pi-autoresearch measures bounded candidate runs and packets the evidence."
      - "Every matrix cell has an explicit command, scenario, metric, and interpretation caveat."
      - "A single high-impact patch can be promoted as a slice, but not claimed as full-surface optimization."
  fog:
    risks:
      - "The first obvious bottleneck is mistaken for the whole latency surface."
      - "Scenario coverage is added after the code lands instead of shaping candidate safety."
      - "Candidate peers, AK evidence, and promotion are conflated with the measurement runtime."
---

# Benchmark matrix runbook

This runbook extends the canonical [dogfood playbook](./dogfood-playbook.md) for cases where the objective is broader than one bounded candidate. It keeps `pi-autoresearch` in its product boundary:

```text
campaign matrix planning -> bounded candidate measurements -> empirical closeout packets -> explicit external promotion
```

`pi-autoresearch` does not become a whole-campaign winner authority, a peer spawner, or an AK writer. It is the measured-run substrate for each bounded candidate and the source of reviewable packets.

## When to use this runbook

Use this runbook when any of these are true:

- the operator asks why only one intervention was tried;
- the target is a surface, not a single code path, such as "make lane-op feel fast";
- multiple scenarios matter for correctness or user experience;
- timing noise or workstation state can change the interpretation;
- candidate peers or isolated worktrees will compare alternative implementations;
- a first patch looks good but you need to know whether it is the best safe slice or merely the easiest one.

Do **not** use this runbook when the work is genuinely one small correctness fix with one authoritative validation path. Use the dogfood playbook directly instead.

## Campaign roles and boundaries

| Concern | Owner |
|---|---|
| Matrix definition, candidate selection, promotion decision | Controller/operator + owning repo task surface |
| Local measurements, receipts, empirical posture, closeout packets | `pi-autoresearch` |
| Visible candidate worktrees and peer communication | Peer tooling / controller |
| Durable task/evidence state | AK or the owning external evidence system |
| Long-lived repo-specific campaign notes | Owning repo docs |

The matrix is a planning artifact. Each candidate measurement still runs as a bounded `pi-autoresearch` segment with explicit metric, checks, candidate binding, and caveats.

## Step 1 — Name the optimization surface

Write one sentence before benchmarking:

```text
Optimize <surface> as experienced by <user/operator> without violating <safety/semantic constraint>.
```

Example:

```text
Optimize workstation lane-op perceived latency for status commands without weakening GPU-budget safety on requested or active profile paths.
```

Then define:

- **primary metric**: one fresh metric printed by the benchmark, for example `METRIC lane_op_current_posture_ms=137.4`;
- **direction**: lower or higher is better;
- **secondary correctness gates**: focused tests, safety assertions, or posture checks;
- **off-limits paths/actions**: services, secrets, destructive runtime changes, unrelated dirty files.

## Step 2 — Build the scenario matrix

Scenarios are the states under which the surface must remain correct. Define them before choosing candidate code.

Template:

| Scenario id | State | Benchmark command | Correctness gate | Why it matters |
|---|---|---|---|---|
| S1 | Idle/no request | `<command>` | `<test/check>` | Fast common path. |
| S2 | Requested profile present | `<command>` | `<test/check>` | Must preserve policy/admission behavior. |
| S3 | Active profile present | `<command>` | `<test/check>` | Must not misreport running state. |
| S4 | Cache warm | `<command>` | `<test/check>` | Measures normal repeated use. |
| S5 | Cache cold | `<command>` | `<test/check>` | Prevents hiding first-use cost. |
| S6 | Degraded/invalid registry | `<command>` | `<test/check>` | Fail-closed behavior still matters. |

Only include scenarios you can reproduce or simulate truthfully. Mark unreproducible scenarios as open, not covered.

## Step 3 — Build the hypothesis matrix

Hypotheses are candidate intervention families, not just individual commits.

Template:

| Hypothesis id | Candidate idea | Expected effect | Risk | Candidate lane |
|---|---|---|---|---|
| H1 | Skip unused live probe on idle path | Large idle latency reduction | Might skip policy when requested | Controller or candidate peer |
| H2 | Defer expensive validation until deep status | Faster shallow status | Might hide degraded state | Candidate peer |
| H3 | Cache repeated registry/status reads | Faster warm path | Stale posture risk | Candidate peer |
| H4 | Lazy import heavy modules | Faster command start | Import-time regressions elsewhere | Controller |
| H5 | Split fast summary from deep diagnostics | Better perceived UX | Two surfaces to document | Design/review first |
| H6 | Combine H1 + H3 | Larger warm-path win | Interaction risk | Only after H1/H3 are understood |

Prefer testing simple hypotheses before combinations. A combination is not interpretable if the component effects are unknown.

## Step 4 — Set sample-size and promotion rules

For duration metrics, set the sampling contract before looking at candidate results:

| Run kind | Minimum successful runs | Purpose |
|---|---:|---|
| Baseline | 3 | Establish current central tendency and obvious noise. |
| Calibration | 3 | Estimate no-change timing drift when the machine is noisy. |
| Candidate/scenario | 10 | Support a candidate claim for that scenario. |
| High-variance candidate/scenario | 20+ | Reduce overclaiming when spread is large. |

Promotion requires all of these:

1. candidate effect is larger than the observed noise/drift band;
2. relevant scenario correctness gates pass;
3. requested/active safety scenarios are tested or explicitly out of scope;
4. candidate binding records branch/worktree/ref, diff summary, files changed, and caveats;
5. closeout packet states whether the result is a full-surface win or a promoted slice.

A candidate may be promoted as a **slice** when it is safe and high impact, even if the full matrix is not complete. Do not describe it as campaign completion unless all required matrix cells have evidence.

## Step 5 — Execute the matrix as bounded segments

Use one `pi-autoresearch` campaign name per surface, and stable hypothesis ids per candidate family. Depending on repository constraints, either:

- run one segment per candidate over a benchmark wrapper that iterates scenarios and emits one primary aggregate metric; or
- run one segment per candidate/scenario pair and compare closeouts externally.

The second pattern is slower but clearer when scenarios have different commands or safety gates.

For each candidate segment:

```ts
autoresearch_runtime_run({
  cwd,
  runKind: "ordinary",
  description: "Measure H1 under S1 idle/no-request current-posture",
  hypothesisId: "H1-S1",
  hypothesis: "Skipping the unused GPU-budget probe reduces idle current-posture latency.",
  interventionSummary: "Avoid live GPU-budget policy call when no requested profile or active demand exists.",
  expectedPrimaryEffect: "Lower wall-clock runtime for idle current-posture.",
  hypothesisTargetFiles: ["scripts/phasee/lane-op.py"],
  experimentRisk: "Does not by itself prove requested-profile behavior; covered by S2 tests.",
  candidateSource: "candidate_peer_spawn",
  candidateWorktree: "/absolute/path/to/worktree",
  candidateBranch: "candidate/<branch>",
  candidateBaseRef: "<base-ref>",
  candidateDiffSummary: "Controller-verified diff summary.",
  candidateFilesChanged: ["scripts/phasee/lane-op.py", "tests/..."],
})
```

Use `autoresearch_runtime_status({ cwd, action: "closeout" })` after meaningful segment boundaries, then promote packets through AK/KES/issue surfaces explicitly.

## Step 6 — Compare and classify outcomes

Use these classifications in the repo-specific campaign note:

| Classification | Meaning |
|---|---|
| `promoted_slice` | Safe, validated, high-impact candidate promoted for a subset of the matrix. |
| `candidate_review_ready` | Evidence strong enough for review, but not yet promoted. |
| `needs_more_samples` | Effect exists but sample/noise contract is not met. |
| `scenario_gap` | Candidate is promising but lacks required scenario coverage. |
| `rejected_regression` | Candidate failed correctness, safety, or performance threshold. |
| `deferred_combo` | Combination idea waits until component hypotheses are understood. |

Always state whether the current result covers:

- one command path;
- one scenario;
- one hypothesis family;
- a combination;
- the whole surface.

## Step 7 — Record the minimum durable artifacts

Avoid artifact sprawl. A healthy campaign leaves:

1. **Generic runbook** in this package — this document;
2. **Repo-specific campaign note** in the owning repo, with matrix and current status;
3. **Local pi-autoresearch receipts** in that repo, treated as projections;
4. **External evidence/learning records** through AK/KES/owner systems when accepted;
5. **One diary entry** in repos that require diary capture after docs/runbook work.

Do not create a new process document for every hypothesis. Update the campaign note instead.

## Review checklist

Before promoting a candidate from a matrix campaign, answer:

- Which surface was optimized?
- Which scenarios were covered, skipped, or blocked?
- Which hypotheses were tested or deliberately left for later?
- How many successful baseline, calibration, and candidate runs support the claim?
- What is the best/median/spread, not just the best number?
- Which correctness and safety tests passed?
- Is this a promoted slice or a full-surface win?
- Where is the external evidence record, and what did it claim?
- Are candidate branches/worktrees deleted only after promotion and validation?

If these answers are not obvious, keep the result local and do not overclaim it.

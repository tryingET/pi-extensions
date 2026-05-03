---
summary: "Product posture for @tryinget/pi-autoresearch: promise, audience, maturity, trust gates, boundaries, and strategic line."
read_when:
  - "Before choosing the next pi-autoresearch product or implementation slice."
  - "When deciding whether work belongs in pi-autoresearch, an adapter, AK, Prompt Vault, peer tooling, or another owner surface."
  - "When aligning package-level direction with root monorepo vision and AK execution memory."
type: "reference"
system4d:
  container: "Package-local product posture for the pi-autoresearch experiment controller."
  compass: "Make the package useful as a trustworthy bounded experiment workbench, not a sprawling autonomy or adapter platform."
  engine:
    invariants:
      - "Candidate changes become measured runs, empirical interpretations, and reviewable packets."
      - "Metric authority, calibration, candidate binding, and evidence promotion stay explicit."
      - "External persistence and semantic authority remain with their owning systems."
  fog:
    risks:
      - "Capability expansion masquerades as product progress."
      - "Noisy baselines are overclaimed as candidate wins."
      - "Adapter or peer lifecycle ownership drifts into pi-autoresearch by convenience."
---

# Product posture — `@tryinget/pi-autoresearch`

## Product promise

`pi-autoresearch` turns bounded candidate changes into trustworthy empirical evidence and reviewable handoff packets.

A healthy loop is:

```text
bounded objective -> explicit measurement contract -> baseline/calibration -> candidate binding -> ordinary run -> empirical decision -> closeout/evidence/learning packet -> explicit external promotion
```

## Primary users

- Pi operators running local supervised experiments.
- Controller agents coordinating bounded candidate/evidence loops.
- Visible peer lanes producing candidate worktrees without owning promotion.
- Adapter authors consuming stable packets for AK, Beads, KES, notes, issue trackers, or custom evidence systems.

## Job to be done

When I have a candidate change, I want to measure it under an explicit contract, understand whether the result is trustworthy, and produce evidence another owner surface can consume without hidden autonomy.

## Current product maturity

- maturity: `supervised dogfood / internal alpha`
- target control plane: landed
- current strategic line: measurement trust and operator clarity before new surfaces
- release posture: package checks pass, but product posture is still pre-public until the canonical dogfood playbook is exercised against real campaigns and metric-readiness UX is clearer

## Product success criteria

The package is product-healthy when:

1. an operator can tell the current empirical posture from one status screen;
2. duration metrics cannot easily overclaim noisy or stale baselines as candidate wins;
3. every candidate result records what was tested, why, against which metric contract, and with which caveats;
4. closeout/evidence/learning packets are stable enough for adapters without making this package own those adapters;
5. visible peer, AK, Prompt Vault, KES, ROCS, and issue-tracker ownership boundaries remain explicit;
6. new work lands through AK-backed bounded tasks rather than chat-local feature drift.

## Current landed capability baseline

The package currently owns:

- `/autoresearch` operator entrypoint; with an objective it now prepares the supervised campaign-start tool call instead of silently ignoring arguments;
- `autoresearch_campaign_start` as the first package-owned front door that composes autoplan, optional governed setup, optional baseline, and optional bounded loop modes;
- bounded runtime status, setup, run, loop, control, and finalization surfaces;
- XState campaign machine plus append-only local event ledger;
- Prompt Vault decision bridge for setup, next-hypothesis, and finalize decisions;
- measurement-contract checks, calibration semantics, duplicate benchmark/check detection, and baseline-drift-aware duration interpretation;
- operator-facing empirical posture classification with promotion-readiness and recommended-next-action text;
- hypothesis/result lineage and controller-verified candidate binding metadata;
- adapter-ready packet family:
  - `autoresearch.closeout.v1`
  - `autoresearch.ak_evidence.v1`
  - `autoresearch.learning.v1`
  - `autoresearch.candidate_result.v1`
  - `autoresearch.adapter_contracts.v1`
  - `autoresearch.adapter_validation.v1`
- visible peer-lane planning without automatic peer launch;
- bounded self-hosting and manifest-driven llama.cpp campaign helper/control seams.

Adjacent external proof now exists in `pi-society-orchestrator`: one-shot exact-manifest observation plus idempotent evidence-only AK projection from verified task context above the package seam. That proof is product-relevant boundary evidence, not a new ownership claim for this package.

## Product non-goals

`pi-autoresearch` must not become:

- a hidden daemon or unbounded autonomy loop;
- an automatic visible-peer spawner;
- a direct AK, Beads, KES, notes, issue-tracker, or HTTP writer;
- an ontology or semantic-winner authority;
- a package-local self-promotion mechanism;
- a hidden unbounded daemon or automatic whole-campaign runner above explicit budgets and review gates;
- a catch-all adapter platform that adds packet families without real consumers.

## Trust gates

A result is promotion-ready only when the relevant gates are explicit:

1. **Metric contract** — metric freshness, causal linkage, and optimization authority are known.
2. **Baseline/calibration posture** — duration metrics are sampled enough to distinguish candidate effect from drift/noise.
3. **Run kind** — calibration and ordinary candidate runs are semantically separate.
4. **Candidate binding** — candidate source, worktree/ref/branch, diff summary, and files changed are recorded when relevant.
5. **Empirical decision class** — operational run status does not masquerade as measured meaning.
6. **Closeout packet** — the segment can be reviewed without scraping raw receipt logs.
7. **External promotion** — AK/KES/adapter writes happen only through explicit owner surfaces.

## Current strategic line

Stop adding packet families by default.

The manifest-campaign follow-on above this package is now proven externally in `pi-society-orchestrator`; do not read that as permission to widen `pi-autoresearch` into a hidden unbounded daemon, AK lifecycle writer, or adapter platform. The package should own bounded supervised campaign mode, but execution depth must remain explicit through `runMode`, budgets, machine gates, and reviewable next tool calls.

Prioritize:

1. dogfood and harden the new `/autoresearch <objective>` + `autoresearch_campaign_start` front door;
2. operator posture clarity;
3. metric readiness and baseline-drift protection;
4. one canonical dogfood playbook;
5. one external adapter proof only after a real consumer needs it.

## Next product bets

### Bet 1 — Supervised campaign front door — landed first slice

The first integrated product front door now exists in package-owned code:

```text
/autoresearch <objective> -> reviewable autoresearch_campaign_start({ ... }) call
```

```ts
autoresearch_campaign_start({
  cwd,
  objective,
  setupMode: "autoplan" | "prompt_vault_setup",
  runMode: "plan_only" | "baseline" | "bounded_loop",
  maxIterations,
  maxWallClockMinutes,
})
```

The initial version is intentionally conservative:

- default slash-command behavior prepares a plan-only tool call for operator review;
- the optional `$$ autoresearch <objective>` / `$$ ar <objective>` pi-interaction picker lets the operator select plan-only, governed setup plan, baseline, or bounded-loop mode before the exact tool call is inserted;
- the tool reports the measurement contract, scope, candidate lifecycle policy, warnings, status, and next exact call;
- default candidate policy is explicit and worktree-first: keep preserves the candidate branch, discard suggests cleanup after receipt review, and rewind resets the candidate worktree to base;
- Replay Fabric remains observer/history/recovery-clue projection and ASC rewind remains live Pi/session recovery, so neither becomes candidate accept/discard authority;
- baseline and bounded-loop execution are explicit `runMode` choices;
- peer launch, commits, worktree deletion/merge, AK/KES/evidence writes, and durable promotion remain outside this front door.

A compact read-only dashboard slice is now also landed:

```text
/autoresearch dashboard
autoresearch_runtime_status({ action: "dashboard" })
```

The dashboard summarizes current posture, metric contract, confidence/noise interpretation, candidate lifecycle policy, and next legal surfaces without running benchmarks or mutating worktrees.

A first live-progress slice is now landed for bounded loops: `autoresearch_runtime_loop` and `autoresearch_campaign_start({ runMode: "bounded_loop" })` stream compact live progress cards during execution and return a final dashboard in the result. This is not yet a persistent contrib-style widget, but it gives an operator a truthful "start a bounded run, step away, and come back to final posture" path inside the active tool call.

Next product work: dogfood this front door against real campaigns, then add persistent TUI/dashboard affordances and interactive candidate keep/discard/rewind decisions.

### Bet 2 — Operator posture sentence — landed first slice

Runtime status and closeout packets now include an `empiricalPosture` object with:

- classification, for example `calibration_only`, `baseline_drift_suspected`, or `candidate_review_ready`;
- promotion readiness;
- a compact summary sentence;
- a recommended next action.

The remaining product work is to dogfood the wording against real campaigns and keep it concise enough for operators to trust at a glance.

### Bet 3 — Canonical dogfood playbook — documentation landed

The canonical supervised operator flow now lives in [dogfood-playbook.md](./dogfood-playbook.md):

```text
setup -> baseline samples -> calibration -> candidate lane/binding -> ordinary run -> closeout -> evidence/learning promotion
```

The next product work is to dogfood that playbook against real campaigns and tighten wording where operators still overclaim noisy or under-bound results.

### Bet 4 — Metric readiness policy

Make duration metrics report whether they are:

- under-sampled;
- calibration-only;
- baseline-drift-suspect;
- candidate-ready;
- review-ready.

### Bet 5 — Consumer-driven adapter proof

Pick exactly one adapter target after demand is concrete. Until then, keep adapters external and packet contracts stable.

## Ownership map

| Concern | Owner |
|---|---|
| Local experiment runtime, receipts, empirical interpretation, closeout packets | `packages/pi-autoresearch` |
| Manifest-campaign one-shot supervision and evidence-only AK projection above the package seam | `packages/pi-society-orchestrator` |
| Visible peer launch and candidate worktree creation | `packages/pi-little-helpers` / peer tooling |
| Peer/intercom communication | `packages/pi-peer-messaging` |
| Durable task truth and evidence lifecycle | AK / evidence owner surfaces |
| Reusable prompt procedures | Prompt Vault |
| Ontology and controlled semantics | ROCS / ontology owner repos |
| Learning persistence and promotion | KES, notes, KMS, or selected adapter |
| Root monorepo validation/release/policy | `pi-extensions` root |

## Read map

- Product posture: `packages/pi-autoresearch/docs/project/product-posture.md`
- Package public surface: `packages/pi-autoresearch/README.md`
- Dogfood playbook: `packages/pi-autoresearch/docs/project/dogfood-playbook.md`
- Benchmark matrix runbook: `packages/pi-autoresearch/docs/project/benchmark-matrix-runbook.md`
- Adapter contract: `packages/pi-autoresearch/docs/project/adapter-contracts.md`
- External manifest-campaign supervision status: `packages/pi-society-orchestrator/docs/project/pi-autoresearch-manifest-campaign-supervision-status.md`
- Root monorepo vision: `docs/project/vision.md`

## Compatibility note

A compatibility redirect remains for the former alignment anchor. Treat it as historical link support only; this product posture is now the package-level alignment anchor for new work.

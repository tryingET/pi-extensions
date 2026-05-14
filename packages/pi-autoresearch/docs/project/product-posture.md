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

## Vision relation

The package north star / final end-state direction lives in [vision.md](./vision.md).

This document is the current posture bridge from that vision into maturity, trust gates, boundaries, strategic line, and next product bets. Do not use this posture file as a competing live task queue or as the only statement of the long-term destination.

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

- maturity: `supervised dogfood proven / internal alpha`
- target control plane: landed
- current strategic line: measurement trust, operator clarity, threshold-style success semantics, confirmation UX, and consumer-driven external proof before broader autonomy
- release posture: package checks pass and the canonical dogfood loop has now been exercised against the package itself; product posture remains pre-public until metric-readiness UX, confirmation affordances, and at least one non-AK consumer adapter proof are clearer

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
- `autoresearch_candidate_bind` as a read-only / plan-only candidate intake surface that inspects a controller-verified worktree/branch/base ref and prepares the exact measurement call before lifecycle decisions;
- `autoresearch_candidate_decision` as a read-only / plan-only candidate lifecycle workbench for keep/discard/rewind/rebaseline/sample/finalize recommendations from current runtime status, closeout, and candidate-result evidence;
- bounded runtime status, setup, run, loop, control, campaign-goal, and finalization surfaces;
- optional `autoresearch.goal.json` package-local campaign-goal ledger for Codex-goal-inspired long-running objectives: projection-only objective/status/budget/usage/continuation state across explicit foreground segments, not AK truth;
- XState campaign machine plus append-only local event ledger;
- Prompt Vault decision bridge for setup, next-hypothesis, and finalize decisions;
- measurement-contract checks, explicit optional `metricThreshold` targets, calibration semantics, duplicate benchmark/check detection, and baseline-drift-aware duration interpretation;
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

Adjacent external proof now exists in `pi-society-orchestrator`: live runtime supervision for exact `taskId` + `cwd`, one-shot exact-manifest observation plus idempotent evidence-only AK projection, and supervised self-hosting observation/evidence projection from verified task context above the package seam. Those proofs are product-relevant boundary evidence, not new ownership claims for this package.

Latest package-local dogfood proof also exists: `self-hosting-dogfood-workflow-001` used the accepted supervised self-hosting shape — stable controller, separate candidate worktree, snapshot-owned evaluator suites, applicability classification, explicit operator approval, and external controller rotation. The candidate was classified `default_promotion_candidate`, rotated only after `operator_review`, reloaded, and then verified from the committed main package path. This proves the self-hosting seam can work under supervision; it does not weaken the non-goal against package-local self-promotion.

## Product non-goals

`pi-autoresearch` must not become:

- a hidden daemon or unbounded autonomy loop;
- an automatic visible-peer spawner;
- a direct AK, Beads, KES, notes, issue-tracker, or HTTP writer;
- an ontology or semantic-winner authority;
- a package-local self-promotion mechanism;
- a hidden unbounded daemon or automatic whole-campaign runner above explicit budgets and review gates;
- a package-local replacement for AK task/campaign/evidence truth via `autoresearch.goal.json`;
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

1. harden the dogfooded `/autoresearch <objective>` + `autoresearch_campaign_start` front door around the issues real traversal exposed;
2. operator posture clarity, especially when success is threshold-satisfied rather than metric-improving;
3. metric readiness, threshold-style success semantics, and baseline-drift protection;
4. keep the canonical dogfood playbook and workflow-contract benchmark current with actual tool schemas;
5. keep orchestrator-side live/manifest/self-hosting supervision proofs aligned with real package artifacts and exact-task evidence boundaries;
6. one external adapter proof only after a real consumer needs it.

## Next product bets

### Bet 1 — Supervised campaign front door — landed first slice

The first integrated product front door now exists in package-owned code:

```text
/autoresearch run <objective> -> direct bounded foreground campaign
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

- `/autoresearch run|loop|go|start <objective>` is the explicit first-entrypoint path for "autoresearch should autoresearch": it starts a bounded foreground loop directly with a three-iteration/default 30-minute budget and planned-only peer lane, then stops on budget/gates;
- default `/autoresearch <objective>` behavior remains conservative and prepares a plan-only tool call for operator review;
- the optional `$$ autoresearch <objective>` / `$$ ar <objective>` pi-interaction picker lets the operator select plan-only, governed setup plan, baseline, or bounded-loop mode before the exact tool call is inserted;
- the tool reports the measurement contract, scope, candidate lifecycle policy, warnings, status, and next exact call;
- default candidate policy is explicit and worktree-first: keep preserves the candidate branch, discard suggests cleanup after receipt review, and rewind resets the candidate worktree to base;
- Replay Fabric remains observer/history/recovery-clue projection and ASC rewind remains live Pi/session recovery, so neither becomes candidate accept/discard authority;
- baseline and bounded-loop execution are explicit `runMode` choices or the explicit `run|loop|go|start` first-entrypoint verb;
- direct baseline/bounded-loop campaign-start execution fails closed instead of reusing a stale active segment when the requested campaign, metric, benchmark, or checks contract differs; pass `reconfigure: true` to start a fresh segment deliberately;
- peer launch, commits, worktree deletion/merge, AK/KES/evidence writes, and durable promotion remain outside this front door.

A compact read-only dashboard slice is now also landed:

```text
/autoresearch dashboard
autoresearch_runtime_status({ action: "dashboard" })
```

The dashboard summarizes current posture, metric contract, metric-readiness/trust posture, confidence/noise interpretation, candidate decision summary, candidate lifecycle policy, the learning export -> owner-routed KES adapter handoff, and next legal surfaces without running benchmarks or mutating worktrees.

A first live-progress slice is now landed for bounded loops: `autoresearch_runtime_loop` and `autoresearch_campaign_start({ runMode: "bounded_loop" })` stream compact live progress cards during execution and return a final dashboard in the result. This gives an operator a truthful "start a bounded run, step away, and come back to final posture" path inside the active tool call.

A bounded DSPx planning slice is now landed for the campaign front door: `autoresearch_campaign_start({ planner: "dspx_program", runDspxProgramGen: true, ... })` materializes the DSPx intent, runs local DSPx `program-gen` with a timeout, reads the generated `behavior_results.json`, and uses that proposal as the campaign setup plan before baseline or bounded-loop execution. DSPx owns the program-shaped setup proposal; pi-autoresearch remains the outer controller for setup application, receipts, bounded runs, peer gates, and stop conditions.

A first persistent widget slice is also landed: session start registers an above-editor status widget unless `PI_AUTORESEARCH_WIDGET=0` is set, and `/autoresearch widget on|off` controls it for the current session. The widget is read-only and shows machine state, run counts, best metric, confidence, empirical posture, and promotion readiness.

A first fullscreen/overlay slice is also landed: `/autoresearch overlay` and `/autoresearch fullscreen` open a read-only live TUI dashboard overlay with periodic refresh, compact posture, metric contract, recent-run table, candidate decision summary, and candidate policy summary. It closes with `q`/Escape and supports simple keyboard scrolling.

A browser export slice is now landed: `/autoresearch export` writes `.autoresearch/autoresearch-dashboard.html`, opens it in the browser when possible, and refreshes the file every ~2s for the current Pi session. It includes a metric-readiness/trust card so long-running campaigns can be watched for threshold readiness, duration under-sampling, and baseline-drift blockers without scraping candidate-decision text. When matrix artifacts are present, the export switches into matrix-campaign mode: matrix cell progress, selected lanes, packet inventory, visibility blockers, and next legal actions become the primary progress cards, while empty local single-segment runtime fields are labeled as an auxiliary snapshot. `/autoresearch export off` stops that session-local refresher. The export is read-only and does not own execution or promotion.

A first candidate intake planner slice is now landed:

```text
autoresearch_candidate_bind({ candidateWorktree, candidateBaseRef, action: "plan_run" })
```

The surface inspects a controller-verified worktree/path, detects git worktree status, same-repository posture, branch/ref, HEAD, optional or inferred base-ref resolution, changed files, and a diff summary. When `candidateBaseRef` is omitted it conservatively infers a base from `merge-base(HEAD, upstream|main|master)` and warns the operator to verify it before destructive rewind planning. It reports intake readiness as `ready`, `needs_review`, or `blocked` so trunk/controller-cwd/broad/unresolved candidates do not look as clean as isolated candidate worktrees. It prepares the exact `autoresearch_runtime_run({ ...candidate binding metadata... })` call needed to measure the candidate and then return to candidate decisions. It is read-only/plan-only: no benchmark, merge, worktree deletion, reset/recreate, peer launch, AK/KES/evidence write, or promotion is applied by the package.

A first candidate decision workbench slice is also landed:

```text
autoresearch_candidate_decision({ action: "status" | "plan_keep" | "plan_discard" | "plan_rewind" })
```

The surface consumes runtime status, closeout, and candidate-result evidence to show the current candidate binding, empirical posture, promotion readiness, confidence/noise interpretation, checks status, baseline-drift risk, and the next legal lifecycle decision. Keep/discard/rewind outputs are command plans only: no merge, worktree deletion, reset/recreate, peer launch, AK/KES/evidence write, or promotion is applied by the package. The dashboard, overlay, and browser export now surface a compact candidate decision summary so the next bind/keep/discard/rewind/rebaseline/sample/finalize move is visible without scraping receipts.

A first slash-command confirmation affordance is also landed: `/autoresearch next` prepares the recommended next candidate call from current runtime posture, `/autoresearch bind [current|<worktree>]` prepares the exact `autoresearch_candidate_bind({ ... })` call, `/autoresearch measure [current|<worktree>]` prepares the exact `autoresearch_runtime_run({ ...candidate metadata... })` measurement call only when candidate intake readiness is `ready` and otherwise falls back to intake review, and `/autoresearch candidate|decision|keep|discard|rewind` prepares the exact `autoresearch_candidate_decision({ ... })` call in the editor for review. `/autoresearch review` and `/autoresearch review keep|discard|rewind` now add a read-only overlay selector before the editor checklist when TUI overlays are available, with editor fallback otherwise. This makes candidate intake, measurement, and lifecycle planning discoverable from the operator surface without applying any destructive or durable action.

A first optional interaction-picker affordance is now also landed: `$$ autoresearch candidate`, `$$ ar candidate`, and `$$ autoresearch keep|discard|rewind` open a candidate-decision picker when `@tryinget/pi-interaction` / `@tryinget/pi-trigger-adapter` is loaded. It offers status/keep/discard/rewind planning choices, decorates direct/recommended choices where runtime receipts make that possible, and inserts the exact `autoresearch_candidate_decision({ ... })` call selected by the operator. A deterministic non-slash `$$ autoresearch ...` input fallback also exists so PTX's `$$ /template` namespace does not steal candidate-decision inputs. The picker/fallback still applies no worktree or durable owner-surface mutation.

Dogfood status: the front door, self-hosting surfaces, explicit foreground resume executor, and campaign-goal ledger have now been exercised against `pi-autoresearch` itself; the extension-command slash resume review surface has been exercised against an isolated resumable runtime snapshot, and the visible-candidate handoff path has been exercised through the `pi-autoresearch` runtime with an isolated synthetic controller repo plus candidate worktree. The runs found and fixed stale playbook action wording, unsafe/misleading next-call generation around `reconfigure: true`, direct campaign-start stale-segment execution when a configured runtime receives a different objective/metric/benchmark without `reconfigure: true`, candidate-lane handoff wording that sounded like scout review instead of one bounded candidate patch, evaluator-snapshot brittleness, live package-rotation dependency hydration, and stale workflow-contract checks. `scripts/dogfood-foreground-resume-contract.mjs` proves the reviewed resume path can inspect `resume_apply_plan`, apply exactly one foreground segment with exact keys/budgets/confirmation, keep peer launch off, and preserve the zero-blocker threshold. `scripts/dogfood-resume-ui-contract.mjs` checks that `/autoresearch resume` prepares the foreground resume review text with the resume-apply packet, concrete reviewed executor-call keys, required budget placeholders, exact confirmation, and explicit no-daemon/no-peer/no-external-write boundary language without invoking any registered tool executor. `scripts/dogfood-candidate-handoff-contract.mjs` checks that an isolated visible candidate can move through candidate bind, candidate measurement, candidate-result packet, and keep/discard/rewind decision planning while lifecycle state remains unchanged and returned commands stay plan-only. `scripts/dogfood-long-supervised-campaign-contract.mjs` proves the larger campaign journey: `autoresearch_campaign_start` runs two bounded iterations, `resume_apply_plan` gates an explicit foreground continuation for two more iterations, four controller-measured candidate-result packets feed orchestrator matrix review, and the final closeout exposes learning, AK-evidence, owner-decision, and exact evidence-handoff packets without hidden peer launch or promotion. `scripts/dogfood-campaign-goal-ledger-contract.mjs` proves the smaller Codex-goal-inspired primitive: one `autoresearch.goal.json` goal accumulates two explicit foreground loop segments, surfaces `active`, `paused`, `budget_limited`, and `complete`, emits an exact next continuation call with `peerMode: "off"`, and reports `METRIC unresolved_campaign_goal_blockers=0`. `scripts/dogfood-contract-suite.mjs` runs the strict workflow, foreground-resume, extension-command slash resume review, candidate-handoff, long-supervised-campaign, and campaign-goal-ledger contracts together with suite-owned temporary roots; the current expected clean result is `METRIC unresolved_autoresearch_dogfood_suite_blockers=0`. Next product work is to improve only the UX friction repeated dogfood runs expose.

### Bet 2 — Operator posture sentence — landed first slice

Runtime status and closeout packets now include an `empiricalPosture` object with:

- classification, for example `calibration_only`, `baseline_drift_suspected`, or `candidate_review_ready`;
- promotion readiness;
- a compact summary sentence;
- a recommended next action.

The first threshold-style success slices are now landed. Zero-target blocker/failure/error-style metrics such as `unresolved_dogfood_blockers` still infer a threshold of zero, and setup/run/loop/campaign-start surfaces now also accept an explicit optional `metricThreshold`. Lower-is-better metrics satisfy the target with `value <= metricThreshold`; higher-is-better metrics satisfy it with `value >= metricThreshold`. A candidate can be `threshold_satisfied`, `threshold_preserved`, `threshold_regressed`, or `threshold_not_met` instead of being forced into generic improvement/neutral/regression posture. The candidate-decision workbench now includes a metric-readiness review section and confirmation checklist item so threshold, duration under-sampling, and baseline-drift caveats stay visible before keep/discard/rewind planning.

### Bet 3 — Canonical dogfood playbook — documentation landed

The canonical supervised operator flow now lives in [dogfood-playbook.md](./dogfood-playbook.md):

```text
setup -> baseline samples -> calibration -> candidate lane/binding -> ordinary run -> closeout -> evidence/learning promotion
```

The playbook has now been dogfooded against a real package-local campaign. The next product work is to keep its examples synchronized with tool schemas and to distinguish ordinary metric-improvement campaigns from workflow-traversal and self-hosting campaigns.

### Bet 4 — Metric readiness and threshold success policy — first threshold slice landed

Duration metrics already report whether they are under-sampled, calibration-only, baseline-drift-suspect, candidate-ready, or review-ready.

Threshold-style posture is now landed for both inferred and explicit targets. Zero-target blocker/failure/error-style metrics where lower is better still infer `0` from the metric name. For other threshold-style metrics, the measurement contract can set `metricThreshold`; lower metrics satisfy `value <= metricThreshold`, and higher metrics satisfy `value >= metricThreshold`. These can now classify as:

- `threshold_satisfied` — the candidate reaches the success threshold from a non-satisfied baseline;
- `threshold_preserved` — the candidate preserves an already-satisfied success threshold;
- `threshold_regressed` — the candidate breaks an already-satisfied success threshold;
- `threshold_not_met` — the candidate may have moved but has not satisfied the explicit threshold, so it is not promotion-ready.

The status/dashboard/export/setup/autoplan surfaces show the success threshold, and candidate-decision confirmation checklists require threshold review. The empirical classifier now keeps explicit threshold misses out of generic promotion-ready improvement, including duration metrics after duration/noise gates pass. The candidate-decision workbench and browser dashboard export also summarize metric readiness for threshold, duration-under-sampled, duration-baseline-drift, duration-review-ready, and generic non-duration metrics without letting explicit thresholds bypass duration/noise gates.

### Bet 5 — Consumer-driven adapter proof — owner-routed KES proof landed

The first non-AK consumer proof started as a dry-run repo-notes adapter example:

```text
examples/learning-notes-adapter-consumer.mjs
```

It consumes `autoresearch.learning.v1`, validates that the packet targets notes, confines the planned destination to `docs/learnings/`, and emits an `autoresearch.notes_adapter_dry_run.v1` receipt without writing files. This proved the packet contract could support a non-AK consumer while keeping durable learning persistence external to `pi-autoresearch`.

The productionized owner-routed proof now lives above the package seam in `pi-society-orchestrator`:

```text
autoresearch_learning_kes_adapter({ action: "plan" | "materialize", packetPath })
```

It consumes the same `autoresearch.learning.v1` packet, validates the `kes` target and `docs/learnings/` suggested path, plans through `pi-society-orchestrator`'s package-owned KES contract, and materializes only explicit candidate-only KES diary/learning artifacts under that owner package. The public tool does not accept a caller-selected KES root; alternate roots are internal test harness configuration only. `pi-autoresearch` remains the non-mutating packet producer; it does not write KES, promote learning, mutate AK, or own the adapter platform.

`pi-autoresearch` now also provides `autoresearch_runtime_status({ action: "learning_export", ... })` as the first-class local packet export path for that owner-routed handoff. The export writes only under `cwd/.autoresearch/`, is overwrite-gated, is unavailable in the read profile, and returns an exact suggested `autoresearch_learning_kes_adapter({ action: "plan", packetPath })` call.

Remaining work: add other owner adapters only when a concrete notes/KMS owner is ready.

### Bet 6 — Visible-candidate production seam — clarified

`pi-autoresearch` measures and interprets visible candidates; it does not create peer lanes or own candidate worktree lifecycle.

The intended handoff is:

```text
operator/controller objective
-> peer/helper tooling creates a visible candidate worktree/ref
-> controller verifies diff, base ref, changed files, and claim
-> pi-autoresearch binds candidate metadata and measures it
-> candidate decision workbench plans keep/discard/rewind/finalize
-> operator/external owner applies worktree, merge, evidence, promotion, or cleanup actions
```

Current owner split:

| Step | Owner | Boundary |
|---|---|---|
| visible peer launch / isolated worktree creation | `pi-little-helpers` / peer tooling | returns launch/worktree facts only; no promotion authority |
| peer messages | intercom / peer messaging | communication only; not evidence until controller verifies |
| candidate binding and measurement | `pi-autoresearch` | records verified metadata and empirical receipts; does not launch peers |
| lifecycle planning | `pi-autoresearch` candidate decision workbench | plans keep/discard/rewind/finalize with confirmation checklist; no worktree mutation |
| merge/delete/reset/promotion/evidence | operator / target owner surface | explicit external action with owner receipts |

This keeps candidate production visible without making `pi-autoresearch` an automatic peer spawner or candidate authority.

### Bet 7 — Orchestrator evidence overwatch — landed slices

The above-seam observability gap is no longer only a future gap. `pi-society-orchestrator` now carries three product-relevant supervision seams above `pi-autoresearch`:

```text
autoresearch_live_supervision({ action: "observe" | "start" | "status" | "stop", taskId, cwd, ... })
autoresearch_manifest_campaign_supervision({ action: "observe" | "record_evidence", manifestPath, taskId?, ... })
autoresearch_self_hosting_supervision({ action: "observe" | "record_evidence", cwd, taskId?, ... })
```

The live supervision seam observes one exact runtime `cwd` under one exact AK `taskId`, can poll within explicit session bounds, records package-derived milestone evidence, and may complete a task only through its verified completion lifecycle gate. The manifest and self-hosting seams remain one-shot evidence-only observers: they read exact package-local artifacts, verify package-derived projection/evaluator/promotion truth, and can project deduped AK evidence only from exact verified task context. None of these seams may run candidates, mutate evaluator locks, reclassify applicability independently, approve promotion, rotate or roll back the controller, spawn peers, or widen into hidden whole-campaign control.

### Bet 8 — Longer bounded campaigns — long campaign contract landed

The longer-campaign boundary is explicit in [longer-bounded-campaign-resume-interrupt-design.md](./longer-bounded-campaign-resume-interrupt-design.md), and the first read-only implementation slice is now available through:

```text
autoresearch_runtime_status({ action: "resume_plan", cwd })
```

The design keeps longer campaigns as reviewed foreground continuations:

```text
bounded loop segment -> stop reason -> resume plan -> explicit operator control -> next foreground segment
```

The resume plan reports snapshot reuse, segment/runtime keys, machine/control state, blocking reasons, authority warnings, and the explicit foreground loop call shape that would be reviewed next. The dashboard, browser export, and runtime-control output now surface the same read-only resume-plan summary so operators can see continuation posture before requesting the full packet. Regression coverage now proves stale snapshots, `stop`, `rebaseline`, `finalize`, and awaiting-operator gates stay blocked while reviewed `continue` from a ready reused snapshot can produce a reusable foreground plan. A separate plan-only proposal is available through `autoresearch_runtime_status({ action: "resume_apply_plan", cwd })`; it emits `autoresearch.resume_apply_plan.v1`, requires explicit budgets/confirmation, and points to the only callable executor: `autoresearch_runtime_resume_apply`. That executor rechecks exact segment/runtime keys, requires `maxIterations`, `maxWallClockMinutes`, and `operatorConfirmation: "RUN FOREGROUND RESUME"`, runs with peer launch off, and executes only inside the foreground tool call. `/autoresearch resume` and `$$ autoresearch resume` now open a non-mutating editor review with the plan packet and foreground call skeleton before execution. Hidden daemons, automatic restart after Pi/session exit, unbounded resume, direct external writes, peer auto-launch, candidate lifecycle mutation, and package-local promotion remain forbidden.

The first larger end-to-end contract now lives in `scripts/dogfood-long-supervised-campaign-contract.mjs`. It creates an isolated controller repo, runs a two-iteration `autoresearch_campaign_start`, resumes with an explicit two-iteration foreground `autoresearch_runtime_resume_apply`, measures four visible-candidate worktree lanes, exports candidate-result packets, reviews them through the orchestrator matrix closeout, and verifies local learning / AK-evidence packet handoffs. Its output now includes a compact human-readable checkpoint timeline before the deterministic metric/JSON payload. Expected clean metric: `unresolved_long_supervised_campaign_blockers=0`.

### Bet 9 — Remaining big-picture product gaps

The next gaps are deliberately bigger than one package-local patch:

1. dogfood the owner-routed KES adapter proof against real closeout packets and keep it candidate-only until an explicit promotion owner says otherwise;
2. land real orchestrator execution bindings for governed Prompt Vault setup/next/finalize paths when that owner surface is ready;
3. improve visible-candidate handoff ergonomics across peer tooling and candidate binding only where the strict dogfood contract exposes repeated friction, without changing ownership;
4. dogfood `/autoresearch resume` in the live Pi UI after reload, then decide whether budget presets or broader reviewed campaign-continuation UX are warranted.

## Ownership map

| Concern | Owner |
|---|---|
| Local experiment runtime, receipts, empirical interpretation, closeout packets | `packages/pi-autoresearch` |
| Runtime live supervision, manifest-campaign observation/evidence-only projection, self-hosting observation/evidence-only projection, and owner-routed KES adapter proof above the package seam | `packages/pi-society-orchestrator` |
| Visible peer launch and candidate worktree creation | `packages/pi-little-helpers` / peer tooling |
| Peer/intercom communication | `packages/pi-peer-messaging` |
| Durable task truth and evidence lifecycle | AK / evidence owner surfaces |
| Reusable prompt procedures | Prompt Vault |
| Ontology and controlled semantics | ROCS / ontology owner repos |
| Learning persistence and promotion | KES, notes, KMS, or selected adapter |
| Root monorepo validation/release/policy | `pi-extensions` root |

## Read map

- Vision / end-state anchor: `packages/pi-autoresearch/docs/project/vision.md`
- Product posture: `packages/pi-autoresearch/docs/project/product-posture.md`
- Package public surface: `packages/pi-autoresearch/README.md`
- Dogfood playbook: `packages/pi-autoresearch/docs/project/dogfood-playbook.md`
- Benchmark matrix runbook: `packages/pi-autoresearch/docs/project/benchmark-matrix-runbook.md`
- Adapter contract: `packages/pi-autoresearch/docs/project/adapter-contracts.md`
- External manifest-campaign supervision status: `packages/pi-society-orchestrator/docs/project/pi-autoresearch-manifest-campaign-supervision-status.md`
- Root monorepo vision: `docs/project/vision.md`

## Compatibility note

A compatibility redirect remains for the former alignment anchor. Treat it as historical link support only; this product posture is now the package-level alignment anchor for new work.

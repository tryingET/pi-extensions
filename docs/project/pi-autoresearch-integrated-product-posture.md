---
summary: "Cross-package product posture for making owned pi-autoresearch feel like one supervised campaign product while preserving package-owner boundaries."
read_when:
  - "Choosing the next pi-autoresearch product slice after comparing owned pi-autoresearch with contrib/pi-autoresearch."
  - "Designing a one-command supervised autoresearch campaign UX across pi-autoresearch, pi-society-orchestrator, ASC, Prompt Vault, and pi-interaction."
  - "Deciding whether an autoresearch feature belongs in pi-autoresearch, pi-society-orchestrator, pi-autonomous-session-control, pi-interaction, Prompt Vault, AK, or KES."
type: "product-posture"
system4d:
  container: "Cross-package autoresearch product posture for the pi-extensions monorepo."
  compass: "Make the governed owned stack feel like one coherent supervised autoresearch product without collapsing runtime, execution, evidence, and UI ownership."
  engine: "Compare contrib product promise -> freeze owner split -> define target UX -> identify gaps -> sequence next slices."
  fog: "The main risk is mistaking many correct low-level tools for a coherent operator product, or copying contrib's hidden autonomy while losing owned-stack governance."
---

# Product posture — integrated supervised autoresearch

## Why this note exists

The owned `@tryinget/pi-autoresearch` package has many of the right governed runtime pieces, but the operator experience is still fragmented compared with `~/ai-society/softwareco/contrib/pi-autoresearch`.

The immediate goal is not to copy the upstream/contrib package wholesale. The goal is to keep the stronger owned-stack boundaries while recovering the simple product promise:

```text
Try an idea, measure it, keep what works, discard what does not, repeat — with bounded budgets, explicit gates, and reviewable evidence.
```

This is a cross-package product posture because the product cannot truthfully belong to one package alone.

## Candidate owner model C

Adopt the split-owner model:

| Layer | Owner | Product responsibility |
|---|---|---|
| Experiment runtime | `packages/pi-autoresearch` | campaign setup/run/loop/finalize primitives, metrics, receipts, event ledger, empirical posture, closeout packets |
| Above-package workflow/supervision | `packages/pi-society-orchestrator` | optional campaign workflow composition, Prompt Vault workflow-gate routing, AK/evidence projection, exact-manifest observation, society-level supervision |
| Execution substrate | `packages/pi-autonomous-session-control` | subagent execution, prompt-envelope provenance, execution failure taxonomy, session/runtime visibility, public execution contract |
| Operator interaction/UI | `packages/pi-interaction/*` and package-local commands | pickers, forms, dashboards, trigger/command ergonomics, editor/overlay surfaces |
| Durable procedures | Prompt Vault | setup / next-hypothesis / finalize decision procedures and future routers where vocabulary supports them |
| Durable task/evidence truth | AK / evidence owner surfaces | task lifecycle, evidence writes, completion authority |
| Learning persistence | KES / notes / selected adapters | durable learning promotion after explicit closeout |

Rule of thumb:

```text
pi-autoresearch owns experiment truth.
pi-society-orchestrator owns cross-system choreography.
ASC owns agent execution.
pi-interaction owns operator affordance building blocks.
External owner surfaces own durable promotion.
```

## Current product problem

The owned stack has an engine-room shape:

```text
autoresearch_runtime_autoplan
-> autoresearch_runtime_setup
-> autoresearch_runtime_run
-> autoresearch_runtime_loop
-> autoresearch_runtime_status
-> autoresearch_runtime_peer_assist
-> autoresearch_runtime_finalize
-> autoresearch_manifest_campaign_supervision
-> autoresearch_live_supervision
```

A capable operator can use these tools, but the product does not yet feel like:

```text
/autoresearch <objective>
```

or:

```text
autoresearch_campaign_start({ objective, budget, scope, policies })
```

The missing product layer is an integrated supervised campaign UX that composes the pieces without hiding their gates.

## What is missing compared to contrib

| Capability | contrib/pi-autoresearch | owned/pi-autoresearch now |
|---|---|---|
| One-command start UX | yes | weak / fragmented |
| Skill that creates session files and starts loop | yes | partly via setup/autoplan, not as one UX |
| Autonomous edit-run-log-repeat | yes | bounded loop exists, but not equivalent product mode |
| Auto keep/revert/commit loop | yes | no; candidate/promotion kept explicit |
| Widget/live dashboard | yes | no comparable polished surface |
| Confidence score in widget | yes | empirical posture exists, but no product UI |
| Hooks before/after iterations | yes | no general hook surface |
| Finalize kept runs into branches | yes | bounded finalize exists, but not as simple workflow |
| Prompt Vault governed decisions | no / simpler | yes |
| AK/KES/adapter boundaries | no / simpler | yes |
| Peer candidate planning | no / simpler | plan-only, explicit |
| Whole campaign manifest UX | simple generic loop | only special bounded llama.cpp helpers; not generic |

Interpretation:

- contrib has the stronger simple UX;
- owned has the stronger governance and evidence model;
- the product target is **contrib-like usability with owned-stack trust gates**.

## Target product promise

A healthy owned supervised campaign should look like:

```text
objective
-> guided setup / manifest / metric contract
-> baseline + calibration
-> candidate loop with explicit budget
-> run/check/log with empirical posture
-> keep / discard / rebaseline / finalize decisions
-> closeout packets
-> explicit commit / branch / evidence / learning promotion handoff
```

Operator-facing version:

```text
/autoresearch <objective>
```

Tool-facing version:

```ts
autoresearch_campaign_start({
  cwd,
  objective,
  maxIterations,
  maxWallClockMinutes,
  filesInScope,
  offLimits,
  candidatePolicy,
  finalizationPolicy,
  uiPolicy,
})
```

The campaign may be long-running only when explicitly budgeted and visible. It must not become a hidden unbounded daemon.

## Product invariants

1. **Budgeted by default** — every integrated campaign has `maxIterations`, wall-clock budget, or both.
2. **Metric contract first** — no candidate claim before a fresh, causal metric and direction are explicit.
3. **Baseline/calibration before timing claims** — duration metrics require noise posture.
4. **Candidate binding is explicit** — peer, human, or controller changes must record source/ref/diff/files.
5. **Prompt Vault decisions are typed** — setup / next-hypothesis / finalize use owner routes and parsers, not ad hoc prose interpretation.
6. **Peer launch remains visible** — candidate peers may be planned or explicitly launched, but not hidden inside a black-box loop.
7. **No direct durable promotion** — AK/KES/evidence/task writes remain explicit owner-surface actions.
8. **UI reports meaning, not just command success** — status must show empirical posture, confidence/noise, promotion readiness, and next legal move.
9. **Commit/finalize stays reviewable** — finalization may plan/materialize review branches only through explicit gates.

## Non-goals, revised

Do **not** build:

- hidden unbounded autonomy;
- automatic AK task mutation or evidence writes;
- automatic KES/notes promotion;
- automatic peer spawning without visible operator control;
- semantic winner authority detached from metric evidence;
- generic workflow execution inside `vault_execute_template` without owner-specific typed bindings;
- a second execution runtime competing with ASC.

Do build:

- bounded supervised campaign mode;
- one-command start UX;
- generic manifest/matrix UX where the optimization spans surfaces/scenarios/hypotheses;
- visible dashboard/status affordances;
- explicit owner-route composition;
- reviewable closeout/finalization handoff.

## Target surface sketch

### Phase 1 — product front door

Owner: `packages/pi-autoresearch` with optional `pi-interaction` affordances.

First integrated start surface, now landed as an initial conservative slice:

```ts
autoresearch_campaign_start({
  cwd,
  objective,
  maxIterations,
  maxWallClockMinutes,
  filesInScope,
  offLimits,
  setupMode: "autoplan" | "prompt_vault_setup",
  runMode: "plan_only" | "baseline" | "bounded_loop",
})
```

Current behavior:

1. `/autoresearch <objective>` opens a reviewable `autoresearch_campaign_start({ ... })` call instead of ignoring arguments;
2. the tool calls existing setup/autoplan decision seams;
3. it reports the measurement contract, scope, warnings, status, and next legal move;
4. it can explicitly apply setup and run a baseline;
5. it can explicitly enter a bounded loop;
6. it does not auto-spawn peers, commit, mutate AK/KES/evidence, or promote durable learning.

### Phase 2 — guided interaction UX

Owner: `packages/pi-autoresearch` + `packages/pi-interaction/*`.

Use interaction surfaces for:

- setup review form;
- metric contract confirmation;
- candidate policy selection;
- stop/promotion rule confirmation;
- dashboard/status display.

This should replace chat-local guessing with operator-visible choices.

### Phase 3 — campaign workflow composition

Owner: `packages/pi-society-orchestrator`.

Add an optional cross-system workflow that composes:

```text
Prompt Vault setup
-> pi-autoresearch setup/run/loop
-> ASC-backed scout/reviewer/candidate lanes where explicitly selected
-> manifest supervision / AK-ready evidence packet
-> finalization planning
```

This layer should orchestrate calls; it must not own experiment receipts or metric semantics.

### Phase 4 — generic manifest/matrix mode

Owner: `packages/pi-autoresearch` for runtime model, `pi-society-orchestrator` for above-package supervision if AK/evidence is involved.

Generalize beyond the current llama.cpp-specific helpers:

```json
{
  "surfaces": [],
  "scenarios": [],
  "hypotheses": [],
  "candidate_lanes": [],
  "sample_counts": {},
  "measurement_matrix": {},
  "stop_rules": [],
  "promotion_rules": []
}
```

The manifest mode should execute boundedly and summarize per-surface/per-scenario evidence, but promotion remains explicit.

### Phase 5 — finalization UX

Owner: `packages/pi-autoresearch` + optional `pi-society-orchestrator` evidence projection.

Make finalization as simple as contrib's `autoresearch-finalize`, but governed:

```text
kept runs -> proposed groups -> operator approval -> review branches/materialized plan -> evidence/learning packet handoff
```

## First next slices

### Slice 1 — Update `packages/pi-autoresearch` product posture — landed

Package-local posture now names bounded supervised campaign mode, the front door, and the durable-promotion boundaries.

### Slice 2 — Add first product front-door slash command + tool — landed

The minimal front door is now:

- `/autoresearch <objective>` for slash-command ergonomics and editor review;
- `autoresearch_campaign_start` for LLM/tool execution;
- plan-only first by default;
- optional governed setup packet route;
- bounded baseline option;
- bounded loop option;
- no peer auto-launch;
- no direct external promotion.

### Slice 3 — Add interaction/TUI affordances — first picker slice landed

The first `pi-interaction` affordance now exists:

- `$$ autoresearch <objective>` and `$$ ar <objective>` register through `@tryinget/pi-interaction` / `@tryinget/pi-trigger-adapter` when that optional runtime is loaded;
- the picker offers plan-only, governed setup plan, baseline, and bounded-loop campaign-start modes;
- the selected mode replaces editor text with the exact `autoresearch_campaign_start({ ... })` call;
- the trigger degrades safely when the optional interaction runtime is unavailable.

The second interaction/policy slice is also now package-owned in the campaign front door:

- `autoresearch_campaign_start` accepts and reports a policy-only `candidatePolicy`;
- default policy is worktree-first: keep preserves the candidate branch, discard suggests cleanup after receipt review, and rewind resets the candidate worktree to base;
- Replay Fabric stays observer/history/recovery-clue projection, not the accept/discard/rewind executor;
- ASC rewind stays live Pi/session recovery, not candidate lifecycle authority;
- the exact next tool call carries the candidate policy forward.

The third interaction/dashboard slice is now also landed:

- `/autoresearch dashboard` opens a compact read-only operator dashboard in the editor;
- `autoresearch_runtime_status({ action: "dashboard" })` exposes the same dashboard through the tool surface;
- the dashboard shows current machine/control posture, empirical posture, metric contract, confidence/noise interpretation, candidate decision summary, candidate policy, and next legal surfaces;
- it is explicitly read-only and does not run benchmarks, spawn peers, mutate worktrees, write AK/KES/evidence, or promote results.

The fourth interaction/progress slice is now also landed:

- bounded loops stream compact live progress cards during the active tool call;
- each loop update carries a current dashboard snapshot in tool-update details;
- loop and campaign-start bounded-loop results include a final dashboard after the run summary;
- this supports the practical "start a bounded run, step away, and come back to final posture" use case without adding hidden background autonomy.

The fifth interaction/widget slice is now also landed:

- session start registers a persistent above-editor status widget unless `PI_AUTORESEARCH_WIDGET=0` disables it;
- `/autoresearch widget on|off` controls the widget for the current session;
- the widget shows machine state, run counts, best metric, confidence, empirical posture, and promotion readiness;
- the widget is read-only and uses local runtime receipts/projection only.

The sixth interaction/overlay slice is now also landed:

- `/autoresearch overlay` and `/autoresearch fullscreen` open a read-only live TUI dashboard overlay;
- the overlay periodically refreshes from local runtime receipts/projection;
- it shows posture, metric contract, recent runs, and candidate policy;
- it closes with `q`/Escape and supports simple keyboard scrolling.

The seventh interaction/browser-export slice is now also landed:

- `/autoresearch export` writes `.autoresearch/autoresearch-dashboard.html`;
- it opens the file in the browser when the platform opener is available;
- a session-local refresher rewrites the HTML every ~2s so browser meta-refresh sees updated runtime posture;
- `/autoresearch export off` stops that refresher;
- the browser dashboard is read-only and does not own execution, worktree mutation, evidence writes, or promotion.

The eighth candidate decision workbench slice is now also landed:

- `autoresearch_candidate_decision` exposes `status`, `plan_keep`, `plan_discard`, and `plan_rewind` actions;
- it consumes package-local runtime status, closeout, and candidate-result evidence;
- it shows candidate source, worktree, branch/ref/base, changed files, diff summary, empirical posture, promotion readiness, confidence/noise interpretation, checks status, and baseline-drift risk;
- it recommends keep, discard, rewind, rebaseline, collect more samples, finalize, or no candidate bound yet;
- it returns exact next tool calls plus plan-only git commands when a worktree/base/branch is known;
- it does not merge, delete worktrees, reset/recreate worktrees, spawn peers, write AK/KES/evidence, or promote;
- the editor dashboard, overlay, and browser export now include a compact candidate decision summary/next surface.

Still next in this slice: richer interactive confirmation affordances for candidate keep/discard/rewind decisions.

### Slice 4 — Orchestrator workflow wrapper — next after richer Slice 3/owner review

Add an orchestrator-level wrapper only after the package-owned front door exists, so orchestration composes owner surfaces rather than inventing a second runtime.

## Borrowing from contrib

Borrow these product ideas:

- one-command start;
- visible dashboard/status;
- confidence/noise display;
- simple finalization story;
- hooks as optional iteration-boundary context.

Do not borrow blindly:

- unbounded repeat forever by default;
- implicit keep/revert/commit without owned-stack review gates;
- hidden durable state mutation;
- branch/finalization behavior that bypasses explicit owner approval.

## Success criteria

The integrated product posture is successful when an operator can say:

1. "I know how to start a bounded autoresearch campaign with one command/tool."
2. "I can see the metric contract, current posture, and next legal move without reading raw receipts."
3. "I can choose whether peer lanes are planned or visibly launched."
4. "I can stop/rebaseline/finalize without knowing every low-level tool."
5. "I can produce reviewable branches/evidence packets without pi-autoresearch directly owning AK/KES/promotion."

Until then, the owned stack remains powerful but under-productized.

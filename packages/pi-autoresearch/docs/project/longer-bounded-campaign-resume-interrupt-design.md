---
summary: "Design boundary for longer bounded pi-autoresearch campaigns with resume and interrupt semantics."
read_when:
  - "Before extending autoresearch_runtime_loop beyond one in-call bounded loop."
  - "When deciding how resume, interrupt, budgets, and orchestrator coordination should work for pi-autoresearch."
type: "design"
system4d:
  container: "Design boundary for longer bounded campaign execution."
  compass: "Allow longer campaigns only when they stay budgeted, inspectable, interruptible, and externally governed."
  engine: "Read current runtime snapshot/control model -> add only explicit budgeted resume semantics -> keep durable authority external."
  fog: "The risk is rebranding a hidden daemon or self-ratifying loop as a longer campaign."
---

# Longer bounded campaign resume/interrupt design

`pi-autoresearch` already supports one bounded in-call loop, append-only receipts/events, runtime snapshots, and explicit operator control actions. Longer campaigns should extend those primitives without creating a daemon, background scheduler, or package-local promotion authority.

## Current primitives to preserve

- `autoresearch_runtime_loop` runs within the active tool call and stops on explicit budgets, blocked decisions, checks failures, crash, rebaseline, finalize, wall-clock limit, or max iterations.
- `autoresearch.runtime.json` stores a reusable control/snapshot overlay keyed to cwd, segment, runtime state, and last decision.
- `autoresearch.goal.json` stores optional package-local campaign-goal continuity state: objective, legal status (`active`, `paused`, `budget_limited`, `complete`), explicit aggregate budgets, accumulated usage across foreground segments, and the next exact continuation call.
- `autoresearch_runtime_control` exposes explicit `continue`, `rebaseline`, `finalize`, and `stop` intent; it also exposes explicit goal pause/resume/complete actions when a package-local campaign goal ledger exists.
- Receipts, event ledger, runtime snapshot, and campaign-goal ledger remain package-local projections; AK/KES/notes/Prompt Vault/ROCS keep their own authority.

## Non-negotiable semantics

A longer campaign is lawful only when all of these are true:

1. **Explicit budget** — max iterations, max wall-clock minutes, and stop conditions are present before execution.
2. **Foreground execution** — no hidden daemon, cron, background watcher, or automatic restart after Pi/session exit.
3. **Inspectable resume packet** — resume reports what will continue, from which segment/runtime key, and why the saved snapshot is reusable.
4. **Interrupt first** — `stop`, `rebaseline`, `finalize`, blocked Prompt Vault decisions, failed checks, and posture gates stop before another run.
5. **Operator approval at gates** — `awaiting_operator`, `rebaseline`, and `finalize` require explicit control action before more ordinary runs.
6. **External authority unchanged** — no direct AK/KES/issue/notes writes, no candidate merge/delete/reset, no controller rotation, no peer auto-launch.

## Proposed lifecycle

```text
campaign_start(plan/baseline/bounded_loop)
-> bounded foreground loop segment
-> stop reason captured in receipts/status
-> inspect resume packet
-> operator chooses continue/rebaseline/finalize/stop
-> next foreground loop segment, if still budgeted and lawful
```

The key design point is that resume is a **reviewed continuation**, not automatic persistence of intent.

## Campaign-goal ledger shape

The first Codex-goal-inspired primitive is intentionally smaller than a planner, daemon, or peer orchestrator. When `campaignGoalId` or a campaign-goal budget is supplied to `autoresearch_runtime_loop` or `autoresearch_campaign_start`, the package writes one local `autoresearch.goal.json` projection next to the existing receipts/snapshot artifacts. The ledger is justified separately from `autoresearch.runtime.json` because it tracks cross-segment operator intent and aggregate budget/usage, while the runtime snapshot is keyed to a single resumable machine posture.

The ledger shape is:

| Field | Meaning |
|---|---|
| `goalId` / `objective` | package-local continuity handle and human objective |
| `status` | `active`, `paused`, `budget_limited`, or `complete` |
| `budget` | explicit iteration / wall-clock / token-like limits when supplied |
| `usage` | accumulated foreground segment count, completed iterations, elapsed seconds, and token-like usage |
| `segments` | append-like summaries of explicit foreground loop calls; not background work |
| `nextContinuationCall` | exact next `autoresearch_runtime_loop({ ... })` call, or `null` when budget-limited/complete |
| `exactControlActions` | explicit `autoresearch_runtime_control({ action: "goal_*" })` calls |

This primitive is inspired by Codex goals only in the sense that it gives a long-running objective an inspectable local goal/ledger/status contract. It does not depend on Codex runtime and does not become AK truth, evidence truth, research-agenda authority, promotion authority, or a hidden scheduler.

## Resume packet shape

A future `autoresearch_runtime_loop({ action: "resume_plan" | "resume_apply", ... })` or narrow successor should expose:

| Field | Meaning |
|---|---|
| `campaign` | current configured segment name |
| `segmentKey` / `runtimeKey` | snapshot identity proving the saved control applies to the current receipts/events |
| `lastStopReason` | why the previous loop stopped |
| `remainingBudget` | remaining iterations / wall-clock budget, if known |
| `allowedControlActions` | current legal operator choices |
| `wouldRun` | exact next `autoresearch_runtime_run` or loop call |
| `blockingReasons` | why resume cannot apply |
| `authorityWarnings` | external writes/promotions/peer launches still out of scope |

`resume_plan` must be read-only. `resume_apply` may run only in the foreground call and only after budget/control checks pass.

## Interrupt semantics

Interrupts are ordered:

1. operator-selected `stop`, `rebaseline`, or `finalize`;
2. current machine state not ready for an ordinary run;
3. wall-clock / iteration budget exhausted;
4. posture gate failure;
5. benchmark/check failure;
6. governed Prompt Vault decision requests `blocked`, `rebaseline`, or `finalize`;
7. candidate lifecycle confirmation says more evidence or external review is required.

A stopped campaign may remain resumable only when the stop reason is compatible with another ordinary run and the snapshot still matches the current segment/runtime key.

## Orchestrator relationship

`pi-society-orchestrator` may coordinate a longer campaign above the package seam by observing status, requesting foreground loop calls, and projecting evidence. It must not:

- mutate local receipts directly;
- override `autoresearch_runtime_control` gates;
- infer promotion authority from package-local success;
- turn loop continuation into an unbounded background process.

## First implementation slice status

The first code slice is now landed as a read-only status action:

```text
autoresearch_runtime_status({ action: "resume_plan", cwd })
```

It builds a resume plan from current status/snapshot/control and reports whether the current segment is reusable, why it is blocked, and what explicit foreground loop call shape would be reviewed next. It does not run benchmarks or resume a loop.

The follow-up surfacing slice is also landed: the read-only operator dashboard, browser dashboard export, and `autoresearch_runtime_control` status/set output now include a resume-plan summary. Control output shows whether a saved segment is reusable before and after explicit decisions such as `stop`, and the dashboard exposes the exact `action: "resume_plan"` read surface before any resume executor exists.

The gate regression slice is landed too. Tests now cover stale runtime snapshots, explicit `continue`, `stop`, `rebaseline`, and `finalize` controls, plus awaiting-operator `rebaseline_needed` and `finalize_candidate` states. These tests preserve the rule that only a ready machine with a reused snapshot and no blocking control gate can produce a reusable foreground plan.

A plan-only `resume_apply` proposal surface is now available through:

```text
autoresearch_runtime_status({ action: "resume_apply_plan", cwd })
```

It emits `autoresearch.resume_apply_plan.v1`, requires explicit budgets and operator confirmation, and names the only allowed executor path.

The plan-only proposal is surfaced in the operator dashboard, browser dashboard export, and runtime-control output. That keeps the executor contract visible at the same gates where operators already inspect resume posture, while preserving `executionAuthorized=false` for the plan surface.

The explicit foreground executor is now available through:

```text
autoresearch_runtime_resume_apply({
  cwd,
  segmentKey,
  runtimeKey,
  maxIterations,
  maxWallClockMinutes,
  operatorConfirmation: "RUN FOREGROUND RESUME"
})
```

It rechecks the reusable resume plan immediately, requires exact segment/runtime keys, requires explicit budgets, requires the exact operator confirmation phrase, uses `peerMode="off"`, and runs only inside the foreground tool call. It still does not authorize hidden daemons, automatic restart, peer launch, candidate lifecycle mutation, package-local promotion, or direct external evidence/learning writes.

Operator review affordances are also available: `/autoresearch resume` and `$$ autoresearch resume` prepare an editor review with the current `resume_apply_plan`, exact segment/runtime keys when reusable, and the foreground apply call skeleton. The editor output remains non-mutating and requires the operator to replace explicit budgets before execution.

Dogfood status: the foreground executor has now been exercised against `pi-autoresearch` itself through strict `scripts/dogfood-foreground-resume-contract.mjs`. By default the script uses the package root and appends ignored local projection receipts; tests set `PI_AUTORESEARCH_DOGFOOD_CWD` to a temporary directory to avoid package-root mutation. The script creates a fresh baseline using the executable workflow contract, inspects `resume_apply_plan`, applies exactly one foreground resume with exact segment/runtime keys, `maxIterations`, `maxWallClockMinutes`, and `operatorConfirmation: "RUN FOREGROUND RESUME"`, and emits:

```text
METRIC unresolved_foreground_resume_blockers=0
```

The dogfood result proved the reviewed executor path can run one more bounded foreground segment with `peerMode="off"`, explicit authority warnings, and threshold-preserved posture. That is enough evidence not to add budget presets yet; explicit budgets remain the safer UX until repeated operator runs show a real preset need.

A first campaign-goal ledger slice is now also landed. `autoresearch_runtime_loop` and `autoresearch_campaign_start({ runMode: "bounded_loop" })` can receive `campaignGoalId` plus aggregate iteration/wall-clock/token-like budgets. Each explicit foreground segment records into `autoresearch.goal.json`, pauses after the segment for operator review, becomes `budget_limited` when the aggregate budget is exhausted, and exposes the exact next continuation call while budget remains. `autoresearch_runtime_status({ action: "campaign_goal" })` is read-only, and `autoresearch_runtime_control({ action: "goal_pause" | "goal_resume" | "goal_complete" })` is the explicit control surface. The strict dogfood contract `scripts/dogfood-campaign-goal-ledger-contract.mjs` proves `active -> paused -> active -> budget_limited -> complete`, two accumulated foreground segments under one goal, metric `unresolved_campaign_goal_blockers=0`, and no daemon/automatic peer behavior.

Next implementation work, when justified:

1. dogfood the slash/editor review in the live Pi UI after reload;
2. consider budget presets only after repeated reviewed resume runs show the manual budget fields are the bottleneck.

Do not add a scheduler or a multi-session daemon.

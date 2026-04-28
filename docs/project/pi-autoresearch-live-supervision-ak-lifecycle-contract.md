---
summary: "Contract for Workstream D of pi-autoresearch: orchestrator-owned live supervision, bounded polling, and complete-only first AK lifecycle automation above the package runtime."
read_when:
  - "Before implementing or reviewing tasks 1544, 1545, or 1546 in the live supervision / AK lifecycle workstream."
  - "When deciding how pi-society-orchestrator may poll pi-autoresearch live without turning the package or AK into a shadow control plane."
  - "When you need the exact runner, polling, lifecycle, and operator-surface contract for Workstream D."
type: "reference"
system4d:
  container: "Repo-root cross-package contract note for Workstream D of the pi-autoresearch target control-plane rollout."
  compass: "Make live supervision and first AK lifecycle automation real above the package runtime while preserving the owner split across pi-autoresearch, pi-society-orchestrator, AK, Prompt Vault, and ASC."
  engine: "State current truth -> freeze owner split -> define the read-only runner + polling policy -> define the first lifecycle mutation set -> define the operator-facing supervision surface -> bound proof and non-goals."
  fog: "The main risks are creating a hidden always-on daemon, letting supervision mutate package artifacts, or over-claiming coarse AK automation as a full autonomous control plane."
---

# Contract — live supervision, polling, and AK lifecycle automation for `pi-autoresearch`

## Why this note exists

The lower layers that Workstream D must build on are now already explicit and landed:

- the package-local runtime machine, ledger, and status seam
  - [2026-04-16 pi-autoresearch runtime machine and event-ledger status](./2026-04-16-pi-autoresearch-runtime-machine-and-ledger-status.md)
- the bounded orchestrator supervisor and AK milestone projector
  - [2026-04-16 pi-autoresearch supervision and AK projection status](./2026-04-16-pi-autoresearch-supervision-and-ak-projection-status.md)
  - [pi-autoresearch AK milestone projection contract](./pi-autoresearch-ak-projection-contract.md)
- the package-local decision, resume/control, and finalization layers
  - [Prompt Vault runtime-decision status](../../packages/pi-autoresearch/docs/project/prompt-vault-runtime-decision-status.md)
  - [resume/control-surface status](../../packages/pi-autoresearch/docs/project/resume-control-surface-status.md)
  - [finalization-orchestration status](../../packages/pi-autoresearch/docs/project/finalization-orchestration-status.md)
- the living target map
  - [current-vs-target](../../packages/pi-autoresearch/docs/project/current-vs-target.md)

Those notes already froze the key boundary:

- `packages/pi-autoresearch` owns executable runtime state, local control overlay, and local finalization orchestration
- `pi-society-orchestrator` owns higher-order supervision above that runtime
- AK owns durable campaign/task truth
- Prompt Vault owns durable decision procedures
- ASC remains the adjacent generic execution/session-lifecycle seam

What is still missing is the exact contract for the final target-control-plane workstream:

> how `pi-society-orchestrator` should observe `pi-autoresearch` live through a bounded polling runner, how far it may automate AK task lifecycle mutations, and what operator-facing supervision surface may exist without reviving a hidden autonomous daemon or collapsing owners.

This note freezes that contract for Workstream D.

---

## Current truthful starting point

Today the repo truth is:

- `pi-autoresearch` can already:
  - derive a bounded runtime status from receipts + ledger
  - persist a checked runtime snapshot for package-owned resume/control behavior
  - accept explicit `continue` / `rebaseline` / `finalize` / `stop` operator intent
  - plan, approve, and materialize safe local finalization branches
  - mark the **package-local** runtime complete after successful verified local finalization materialization
- `pi-society-orchestrator` can already:
  - classify one bounded runtime snapshot into coarse supervision states
  - project coarse milestones into AK evidence with exact anchoring, repo-boundary checks, and projection-key idempotence
- the repo does **not** yet have:
  - a live orchestrator-owned polling runner above the package runtime
  - an operator-started supervision session surface
  - a bounded first AK task lifecycle mutation contract above milestone evidence
  - a truthful end-to-end proof that a live poll can drive the allowed lifecycle mutation path

So Workstream D is **not** about inventing the supervisor, inventing the projector, or moving package-local runtime ownership into AK.
It is about adding the first orchestrator-owned **live supervision layer** above the already-landed package/runtime and projector seams.

---

## Contract in one sentence

`pi-society-orchestrator` should add one read-only live supervision runner plus one bounded in-memory polling/session surface that repeatedly observes exact `pi-autoresearch` campaign state from source-level package exports, reuses the existing coarse milestone projector idempotently, and performs only the first truthful AK lifecycle mutation — `ak task complete` after verified package-local completion — while all other runtime, prompt, git, and broader autonomy ownership stays where the earlier workstreams already placed it.

---

## Governing owner split

| Concern | Owner in Workstream D | Why |
|---|---|---|
| Executable runtime state, receipts, ledger, control overlay, finalization plan/materialization | `packages/pi-autoresearch` | This remains the domain runtime/orchestration owner |
| Live observation, polling/session bookkeeping, milestone projection reuse, and first AK lifecycle mutation | `pi-society-orchestrator` | This is the higher-order supervision layer above the package runtime |
| Durable campaign/task identity, task status, scope truth, evidence attachment, and final completion state | AK | Workstream D still must not move campaign truth into local files or extension memory |
| Durable setup / next-hypothesis / finalize procedures | Prompt Vault | These remain governed decision procedures, not supervision timers |
| Generic long-lived execution/session lifecycle patterns | ASC | Workstream D must not recreate a second generic session runtime under a new name |
| In-memory active supervision sessions while the orchestrator extension is loaded | `pi-society-orchestrator` extension runtime | Useful live control-plane state only; not durable campaign truth |
| Optional visible peer launch | `packages/pi-little-helpers` | `pi-autoresearch` may recommend exact peer calls; orchestrator supervision must not auto-spawn or choreograph peers |
| Peer/intercom report-back | `packages/pi-peer-messaging` plus the controller that verifies findings | Communication only; raw `PEER_ACK`/`PEER_FINAL` or legacy `QUEST_*` delivery is not AK evidence or completion truth |

Interpretation rule:

> `pi-autoresearch` owns **what the campaign currently is**.
> `pi-society-orchestrator` owns **how to watch it live and when to emit the first allowed AK lifecycle mutation**.
> AK still owns **whether the campaign task is durably open or complete**.

---

## Workstream D target done-state

Workstream D is done when all of the following are true:

1. the orchestrator can observe one exact `pi-autoresearch` campaign cwd through a read-only runtime seam
2. the runner can poll that campaign repeatedly with an explicit bounded interval policy
3. the runner never needs to shell the extension tool surface just to observe package truth
4. each poll can reuse the existing bounded supervisor + AK milestone projector path
5. repeated unchanged polls stay idempotent and do not spam AK evidence
6. the runner keeps only bounded in-memory session state, not an unbounded event history or a new package artifact
7. a poll may perform the first allowed AK lifecycle mutation only when package completion is verified strongly enough
8. the first allowed lifecycle mutation is **complete-only** in v1
9. blocked, rebaseline, finalize-candidate, decision-required, projection-blocked, and already-terminal cases remain evidence-only or supervision-state-only in v1
10. the operator can start, inspect, one-shot observe, and stop live supervision through one explicit orchestrator surface
11. the live surface reports last runtime state, last projection action, last lifecycle action, next step, and last error truthfully
12. tests prove read-only observation, polling/session policy, lifecycle preflight/idempotence, and one bounded live end-to-end completion path
13. the final status note can close umbrella `#1542` without overstating Workstream D as a general autonomous daemon, auto-fail framework, or remote review control plane

### Explicitly included in this done-state

- one read-only orchestrator runner for observing package runtime truth
- one bounded in-memory polling/session model
- reuse of the existing milestone projector inside live polling
- one first AK lifecycle mutation path: complete-on-verified-package-completion
- one operator-facing supervision surface for `observe` / `start` / `status` / `stop`
- one bounded proof/status closure for the full workstream

### Explicitly **not** included in this done-state

- auto-create AK task
- fuzzy task search or automatic task retargeting
- auto-claim, lease-renewal, or auto-unclaim behavior
- automatic `ak task fail` in v1
- prompt execution inside the orchestrator polling loop
- git mutation, branch cleanup, PR creation, push automation, or review choreography
- a daemon that survives Pi reload/process exit
- a generic session-supervision framework for unrelated packages

---

## Source seam the live runner may trust

The live runner should read package truth from source-level exports in:

- [`packages/pi-autoresearch/src/runtime.ts`](../../packages/pi-autoresearch/src/runtime.ts)

The runner may trust the following bounded read surfaces:

- [`buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false })`](../../packages/pi-autoresearch/src/core/runtime.ts)
- [`loadAutoresearchLedger(...)`](../../packages/pi-autoresearch/src/core/ledger.ts)
- [`inspectAutoresearchFinalization(...)`](../../packages/pi-autoresearch/src/core/finalize.ts)

### Why these are enough

Together they provide the live runner the bounded facts it needs:

- current runtime machine state
- current control overlay and segment summary
- ledger integrity and replay context
- current finalization-plan/materialization status when present
- package-local completion posture tied to real local finalization output

### Read-only observation rule

The runner must observe package truth **without mutating package artifacts**.

So Workstream D should explicitly call:

```ts
buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false })
```

and should pass the already-built status into finalization inspection where possible.
The live runner must **not** poll by repeatedly calling package mutation surfaces such as:

- `autoresearch_runtime_run`
- `autoresearch_runtime_control`
- `autoresearch_runtime_finalize`

and must not write/refresh package snapshots merely because polling is happening.

### Integrity rule

A live poll may reuse milestone projection or lifecycle mutation only when the package snapshot is coherent enough to trust.
At minimum, the runner must fail closed when any of the following is true:

- ledger replay reports rejected events
- ledger has invalid lines that make the snapshot unreliable
- runtime cwd is missing or cannot be resolved
- the anchored AK task is unavailable
- the campaign cwd falls outside the anchored task repo
- the completion path is being considered but finalization/materialization truth cannot be verified

Those are supervision failures, not campaign successes.

---

## Live supervision runner contract

The first runtime file for this workstream should be:

- `packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts`

A truthful first internal model is:

```ts
type AutoresearchLiveSessionState =
  | "running"
  | "blocked"
  | "stopped"
  | "completed";

interface AutoresearchLiveSupervisionPolicyV1 {
  intervalSeconds: number; // default 30, min 5, max 300
  autoStopOnTerminal: true;
  lifecycleMode: "complete_on_verified_completion";
}

interface AutoresearchLiveSupervisionSessionV1 {
  type: "autoresearch_live_supervision";
  version: 1;
  taskId: number;
  cwd: string;
  policy: AutoresearchLiveSupervisionPolicyV1;
  state: AutoresearchLiveSessionState;
  startedAt: number;
  lastPolledAt: number | null;
  pollCount: number;
  lastRuntimeState: string | null;
  lastProjectionAction: "recorded" | "already-projected" | "noop" | "blocked" | null;
  lastLifecycleAction:
    | "none"
    | "completed_task"
    | "already_terminal"
    | "stopped"
    | "blocked";
  lastSummary: string | null;
  lastError: string | null;
}
```

### Session identity rule

The supervision session key is the exact pair:

- resolved absolute `cwd`
- exact AK `taskId`

V1 should keep at most one active session per key.
That prevents duplicate timers for the same anchored campaign.

### Poll execution order

A truthful first poll sequence is:

1. resolve the exact campaign cwd
2. build package runtime status read-only
3. load ledger context when available
4. inspect finalization state read-only using the current status
5. derive the coarse supervision snapshot
6. reuse `projectAutoresearchAkMilestone(...)`
7. derive the lifecycle decision candidate
8. if lifecycle completion is lawful, execute it exactly once
9. update bounded in-memory session state
10. stop automatically when the session reaches a terminal supervision outcome

### Bounded-memory rule

The runner may retain only compact current session state such as:

- poll count
- last observation time
- last runtime/supervision summary
- last projector/lifecycle outcome
- last error

It must **not** accumulate unbounded per-poll history in memory and must not create a new campaign artifact file just to remember polling state.

---

## Polling policy contract

Polling is how live supervision becomes real in Workstream D.
But it must stay explicit and bounded.

### Required polling bounds

- default interval: `30` seconds
- minimum allowed interval: `5` seconds
- maximum allowed interval: `300` seconds
- no overlapping polls for the same session key
- `start` performs one immediate observe cycle before scheduling later ticks
- `stop` cancels future ticks for that exact session key
- extension unload / reload / process exit implicitly ends all live sessions

### Why this is still "live"

The first live slice is an **operator-started in-process polling service** while the orchestrator extension is loaded.
It is live enough to supervise changing campaign state over time.
It is **not** a hidden daemon that must survive host restarts or Pi reloads.

### Stop conditions

The runner should stop automatically when any of the following is true:

- the operator explicitly stops the session
- the session reaches `completed`
- the session reaches `blocked` because the supervision/lifecycle preflight failed closed
- the anchored task is already terminal in AK
- a lifecycle completion action succeeds

A mere `noop` or `already-projected` projector result is **not** itself a stop condition.
It just means the live session is still monitoring without new durable change.

---

## AK lifecycle automation contract

The first lifecycle file for this workstream should be:

- `packages/pi-society-orchestrator/src/runtime/autoresearch-ak-lifecycle.ts`

This file owns the policy for when a live observation may mutate AK task status instead of only attaching evidence.

## V1 lifecycle decision

V1 permits exactly one automated task-status mutation:

- `ak task complete`

V1 does **not** permit:

- `ak task fail`
- `ak task claim`
- `ak task unclaim`
- task title/description/scope mutation

### Why complete-only is the first truthful slice

The package now has one bounded success path that is strong enough to justify AK completion:

- successful verified local finalization materialization
- package runtime moves to `completed`
- created review branches are known locally

The repo does **not** yet have an equally strong general rule for automatically failing a task from every blocked posture.
So blocked states remain durable evidence and supervision signals in v1, not auto-fail triggers.

### Completion preconditions

A live poll may call `ak task complete` only when **all** of the following are true:

1. the anchored AK task exists and is not already terminal
2. the campaign cwd is within the anchored task repo
3. the current supervision candidate is projectable as milestone `completed`
4. the completed milestone evidence was recorded successfully in the same poll or was already present with the same projection key
5. package runtime state is `completed`
6. package completion reason is non-empty
7. finalization inspection reports a current plan whose `materialization.status` is `succeeded`
8. the package-local finalization artifact can name the created review branches

If those facts are not all available, the live session must stay evidence-only.
It must not guess that completion is safe.

### Completion result payload contract

The `ak task complete --result ...` payload should stay compact and derived from the same verified snapshot.
A truthful first shape is:

```json
{
  "contract_version": 1,
  "completion_owner": "pi-society-orchestrator",
  "runtime_owner": "pi-autoresearch",
  "lifecycle_key": "complete|segment:latency|runs:4|completed:campaign%20finalized|branches:2",
  "cwd": "/absolute/path/to/campaign/repo",
  "summary": "Autoresearch campaign completed after verified local finalization materialization.",
  "runtime": {
    "state": "completed",
    "completion_reason": "campaign finalized",
    "run_count": 4,
    "best_metric": 18.4
  },
  "finalization": {
    "materialization_status": "succeeded",
    "created_branches": ["widget-speed-01-core", "widget-speed-02-docs"]
  }
}
```

### Result-field rules

- `lifecycle_key`
  - deterministic from the verified completion snapshot
  - used for idempotent reasoning and audit, not wall-clock uniqueness
- `summary`
  - short and stateful
  - do not embed prompt text, git logs, or large artifact dumps
- `finalization.created_branches`
  - list only the branch names already verified by the package-local materialization path
  - do not dump full plan bodies

### Idempotence rule

The lifecycle layer must stay idempotent under repeated polls.
So it must:

1. load current task status first
2. do nothing if the task is already `completed` or `failed`
3. complete only after the `completed` milestone evidence path is successful or already deduped
4. emit the same deterministic result shape from the same verified completion snapshot
5. update the live session to `completed` after success so later polls do not retry

---

## Operator-facing supervision surface contract

The first operator-facing surface for this workstream should live in:

- `packages/pi-society-orchestrator/extensions/society-orchestrator.ts`

A truthful first tool surface is:

```ts
interface AutoresearchLiveSupervisionInput {
  action?: "status" | "observe" | "start" | "stop";
  taskId?: number;
  cwd?: string;
  intervalSeconds?: number;
}
```

### Tool name

Use one explicit orchestrator-level tool name:

- `autoresearch_live_supervision`

That keeps the package-local runtime surfaces (`autoresearch_runtime_*`) separate from the orchestrator-level live supervision surface above them.

### Action semantics

#### `action=status`

- if `taskId` + `cwd` are provided, inspect that exact session key
- if neither is provided, report all currently active live supervision sessions compactly
- do not create or mutate a session

#### `action=observe`

- requires exact `taskId` + `cwd`
- performs one immediate read-only supervision cycle
- may record milestone evidence and may complete the task if the lifecycle preconditions are met
- does **not** create a background polling session

#### `action=start`

- requires exact `taskId` + `cwd`
- resolves interval bounds and creates/reuses the exact session key
- performs one immediate observe cycle
- if that first cycle blocks or completes terminally, do not keep a timer running
- otherwise schedule future polls in memory

#### `action=stop`

- requires exact `taskId` + `cwd`
- stops that exact in-memory polling session if present
- returns the last known session snapshot instead of pretending the campaign disappeared

### Required output facts

The operator-facing surface should report at least:

- session state
- task id and cwd
- polling interval
- last poll timestamp
- poll count
- last runtime state
- last projection action
- last lifecycle action
- last summary
- last error
- shortest truthful next-step explanation

### Why this surface belongs in orchestrator, not the package

`pi-autoresearch` already owns the package-local runtime, control, and finalization surfaces.
The live supervision surface belongs in orchestrator because it is the upper-layer concern that:

- watches the package over time
- binds the watcher to AK
- exposes live session state above the package runtime

That keeps Workstream D from smuggling a second supervision/control plane into the package itself.

---

## Safety fences that must stay explicit

Workstream D must not silently weaken these fences.

## 1. Exact-anchor fence

Every live session and every lifecycle mutation must use:

- one exact `taskId`
- one exact resolved `cwd`

No fuzzy task lookup, title matching, or repo-wide auto-discovery.

## 2. Read-only package-observation fence

Polling must not mutate package artifacts.
Use read-only status/finalization inspection and keep `persistSnapshot: false` during observation.

## 3. No-hidden-daemon fence

Do not auto-start supervision on extension load, Pi session start, or package runtime activity.
Live polling begins only from an explicit operator-facing start/observe action.

## 4. Complete-only lifecycle fence

V1 may complete a task when completion is strongly verified.
It must not auto-fail blocked campaigns just because a poll saw a blocked state.

## 5. Evidence-before-completion fence

If a poll wants to complete the task, it must first ensure the `autoresearch:milestone:completed` evidence path succeeded or was already deduped.

## 6. Verified-finalization fence

A plain runtime state of `completed` is not enough by itself in v1.
The lifecycle layer must also verify successful finalization materialization from the package-local plan state.

## 7. Terminal-task fence

If AK already says the task is terminal, the live runner must stop and report that fact.
It must not append new lifecycle mutations.

## 8. Bounded-session-state fence

Keep only compact in-memory session state.
Do not create a new durable supervision artifact file or retain unbounded per-poll history.

## 9. No-prompt / no-git-mutation fence

The live runner must not invoke Prompt Vault decisions, run benchmarks, or perform git mutation.
Those remain owned by the package runtime and explicit package surfaces.

## 10. No remote-review fence

Task completion in v1 is about package-local verified completion only.
It does not imply pushes, PRs, merges, or review completion.

## 11. Peer-assisted lane fence

`pi-autoresearch` may recommend exact visible peer calls such as `scout_peer_spawn(...)`, `candidate_peer_spawn(...)`, or `fork_peer_spawn(...)`, but orchestrator live supervision must not launch those peers automatically, supervise them as a hidden review choreographer, or treat their intercom messages as durable truth. `PEER_ACK` / `PEER_FINAL` and legacy `QUEST_ACK` / `QUEST_FINAL` messages are communication snapshots only. If a peer report should affect AK evidence, the controller must verify the finding and then record a bounded summary through the appropriate evidence surface.

---

## Verification contract for tasks 1544–1546

Workstream D is only truthful when it proves all three layers below.

## 1. Runner + polling proof

Tests for `#1544` should prove:

- the runner observes package truth through source-level imports
- observation uses `persistSnapshot: false`
- polling session keys are exact `taskId` + `cwd`
- duplicate `start` does not create overlapping timers for the same key
- unchanged polls stay bounded and do not spam AK writes
- blocked preflight stops the session fail-closed

## 2. AK lifecycle proof

Tests for `#1545` should prove:

- non-terminal milestones remain evidence-only
- a verified completed runtime + succeeded finalization plan can complete the anchored AK task exactly once
- the completed-milestone evidence path runs before task completion
- already-terminal tasks do not get mutated again
- repo/task mismatch and missing finalization proof fail closed
- blocked states do **not** auto-fail the task in v1

## 3. Live control-plane proof

The final proof/status task `#1546` should show at least one bounded end-to-end path where:

1. the operator starts or one-shot observes an exact live supervision session
2. the runner reads current package runtime truth read-only
3. a live poll records or dedupes the expected AK milestone evidence
4. a later live poll sees verified package-local completion
5. the lifecycle layer completes the anchored AK task exactly once
6. the operator-facing surface reports the resulting live session state truthfully
7. the workstream status note and `current-vs-target` are updated in the same closure pass

---

## Non-goals for this workstream

Workstream D must not silently grow into any of the following:

- a background daemon or scheduler outside the orchestrator process lifetime
- auto-running the package benchmark/check/finalization surfaces on a timer
- Prompt Vault router insertion or prompt execution inside the polling loop
- automatic AK task creation, fuzzy anchoring, or scope rewriting
- automatic task failure for every blocked condition
- git mutation, branch cleanup, remote push, PR creation, or merge automation
- a generic campaign-supervision framework for unrelated domains
- automatic visible peer spawning or peer-review choreography
- treating peer/intercom messages as AK evidence without controller verification
- a second durable control plane parallel to AK + package artifacts + Prompt Vault

---

## Implementation sequence for the child tasks

### Task `#1544` — live supervision runner and polling policy

Implement:

- the read-only runtime/finalization observation helper
- exact session-keyed polling state
- bounded interval validation and timer policy
- projector reuse inside each poll
- runner/session negative-path tests

### Task `#1545` — bounded AK lifecycle automation

Implement:

- the complete-only lifecycle candidate derivation
- task-status preflight and repo-boundary checks
- completion-result payload generation
- evidence-before-completion ordering
- lifecycle negative-path and idempotence tests

### Task `#1546` — operator-facing surface + proof/status update

Implement:

- `autoresearch_live_supervision` with `status` / `observe` / `start` / `stop`
- truthful rendering of live session state and next-step guidance
- one bounded end-to-end live proof of polling + lifecycle completion
- update:
  - `docs/project/pi-autoresearch-live-supervision-ak-lifecycle-status.md`
  - `packages/pi-autoresearch/docs/project/current-vs-target.md`

---

## Bottom line

The next truthful supervision/lifecycle slice for `pi-autoresearch` is **not** “make the package autonomous” and **not** “turn AK into the runtime.”

It is a bounded orchestrator-owned live layer where:

- the package remains the owner of runtime/control/finalization truth
- the orchestrator can watch that truth live through a read-only polling runner
- the existing milestone projector becomes reusable inside that live loop
- AK receives the first allowed automated lifecycle mutation only when package-local completion is strongly verified
- the operator can inspect and control the live supervision session explicitly

That is the smallest truthful contract that makes live supervision and first AK lifecycle automation real without reviving a hidden daemon or collapsing the earlier owner split.

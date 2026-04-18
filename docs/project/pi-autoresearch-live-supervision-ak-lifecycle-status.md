---
summary: "Status note for Workstream D of pi-autoresearch: orchestrator-owned live supervision, bounded polling, complete-only AK lifecycle automation, and the operator-facing supervision surface are now landed and proven."
read_when:
  - "You need the shortest truthful answer to what Workstream D of pi-autoresearch actually landed."
  - "Before claiming that pi-society-orchestrator can now supervise pi-autoresearch live and complete anchored AK tasks after verified package-local completion."
  - "When closing or reopening the final target-control-plane workstream for pi-autoresearch."
type: "reference"
system4d:
  container: "Repo-root closure note for the live supervision and AK lifecycle automation workstream above the pi-autoresearch package runtime."
  compass: "State exactly what live supervision and complete-only lifecycle automation are now real without overstating this slice as a hidden daemon, auto-fail framework, or remote review control plane."
  engine: "Summarize the landed runner + lifecycle + operator surface -> record the bounded proof -> name the operator/runtime change -> bound what remains outside the workstream."
  fog: "The main risk is over-claiming bounded live polling as a general autonomous control plane or forgetting that package/runtime truth still remains below the orchestrator layer."
---

# Status — live supervision, polling, and AK lifecycle automation for `pi-autoresearch`

## Why this note exists

Workstream D in [`current-vs-target`](../../packages/pi-autoresearch/docs/project/current-vs-target.md) is now landed across these tasks:

- `#1543` — write the live supervision / polling / AK lifecycle contract
- `#1544` — implement the orchestrator live supervision runner and polling policy
- `#1545` — implement bounded AK task lifecycle automation for pi-autoresearch campaigns
- `#1546` — add the operator-facing supervision surface and prove live lifecycle automation

This note closes umbrella `#1542` / Workstream D by answering four questions:

1. what is now real above the package runtime
2. what the bounded proof actually proved
3. how the operator/control-plane surface changed
4. what still remains outside this workstream

## Umbrella closure snapshot

`#1542` is truthful to close because all four child tasks are now done and their outputs are visible in the repo:

- `#1543` froze the contract in [pi-autoresearch-live-supervision-ak-lifecycle-contract](./pi-autoresearch-live-supervision-ak-lifecycle-contract.md)
- `#1544` landed the read-only live supervision runner plus bounded polling/session policy in `packages/pi-society-orchestrator/src/runtime/autoresearch-supervisor-runner.ts`
- `#1545` landed the complete-only AK lifecycle evaluator in `packages/pi-society-orchestrator/src/runtime/autoresearch-ak-lifecycle.ts`
- `#1546` landed the operator-facing `autoresearch_live_supervision` surface in `packages/pi-society-orchestrator/extensions/society-orchestrator.ts`, added live control-plane proof coverage, and updated package status truth

So this note is both the Workstream D status artifact and the umbrella-closure artifact for `#1542`.

## What is now real

## 1. The orchestrator now owns one live read-only supervision layer above the package runtime

`packages/pi-society-orchestrator` now exposes a bounded in-memory supervision runner that can:

- observe exact `pi-autoresearch` campaign state through source-level package exports
- poll an exact `taskId` + `cwd` session with bounded interval policy
- keep only compact in-memory session state such as poll count, last runtime state, last projection/lifecycle action, and last error
- stop automatically when the session becomes blocked or completed

That runner still does **not** mutate package artifacts during observation.
It keeps `persistSnapshot: false`, reuses the already-landed projector/lifecycle seams, and remains an in-process supervision service rather than a hidden daemon.

## 2. AK lifecycle automation is now real, but still complete-only and fail-closed

`packages/pi-society-orchestrator/src/runtime/autoresearch-ak-lifecycle.ts` now makes the first truthful task-status mutation above the package runtime real:

- `ak task complete` after verified package-local completion

That lifecycle layer is still intentionally narrow.
It now:

- requires one exact anchored AK task id
- loads current task status before mutation
- refuses to mutate already-terminal tasks
- requires completed-milestone evidence to be durable first
- verifies runtime completion plus succeeded finalization materialization plus created review branches
- fails closed on repo mismatch, missing proof, or projector/lifecycle preflight failure

What it still does **not** do is auto-fail blocked campaigns, fuzzy-search tasks, rewrite task scope, or create a second durable control plane.

## 3. The operator now has one truthful live supervision surface above the package runtime

`packages/pi-society-orchestrator/extensions/society-orchestrator.ts` now registers:

- `autoresearch_live_supervision`

That orchestrator-level surface supports the exact actions contracted for Workstream D:

- `status`
- `observe`
- `start`
- `stop`

It reports, for an exact live session key or for the current active set:

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
- next-step guidance

This keeps live supervision where it belongs: above the package-local `autoresearch_runtime_*` surfaces rather than hidden inside the package itself.

## 4. The full live path is now proven with operator-surface coverage

The repo now has bounded proof across all three layers named in the contract:

- runner and polling behavior
  - `packages/pi-society-orchestrator/tests/autoresearch-supervisor-runner.test.mjs`
- complete-only AK lifecycle behavior
  - `packages/pi-society-orchestrator/tests/autoresearch-ak-lifecycle.test.mjs`
- operator-facing live supervision/control-plane behavior
  - `packages/pi-society-orchestrator/tests/autoresearch-live-control-plane.test.mjs`

The new live control-plane proof shows that the operator-facing surface can now:

1. list active sessions without creating new ones
2. enforce exact `taskId` + `cwd` pairing fail-closed
3. run one-shot observation without leaving a background session behind
4. start a bounded live session, inspect it truthfully, and stop it explicitly
5. report a later scheduled poll that reaches verified completion and transitions the live session to `completed`

Together with the earlier runner/lifecycle tests, this closes the Workstream D proof obligation without claiming a host-persistent daemon or remote review automation.

## Verification commands run for closure

From `packages/pi-society-orchestrator`:

```bash
node --test tests/autoresearch-live-control-plane.test.mjs tests/autoresearch-supervisor-runner.test.mjs tests/autoresearch-ak-lifecycle.test.mjs
npm run check
```

From the repo root:

```bash
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs --strict
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/pi-autoresearch/docs --strict
```

These checks verified:

- live operator-surface action semantics
- runner polling/session safety and read-only observation behavior
- complete-only AK lifecycle preflight, idempotence, and fail-closed behavior
- package lint/typecheck/test surface for `pi-society-orchestrator`
- doc metadata/structure validity for the updated status notes

## What changed in operator/runtime behavior

Before Workstream D, the repo had:

- a bounded package runtime with decision, resume/control, and finalization layers
- a bounded orchestrator supervisor + AK milestone projector
- no live polling session above the package runtime
- no operator-facing live supervision surface
- no bounded automated AK task completion path after verified package-local success

After Workstream D, the repo now has:

- a live orchestrator-owned polling/session layer above exact package runtime truth
- complete-only AK task lifecycle automation after verified local finalization success
- one explicit operator-facing supervision surface for `status` / `observe` / `start` / `stop`
- truthful live-session reporting for runtime/projection/lifecycle state and next-step guidance

So `pi-autoresearch` now reaches the target control-plane state described in `current-vs-target`, while still staying bounded.

## What this workstream does **not** mean

This workstream should **not** be read as having implemented:

- a daemon that survives Pi reloads or process exit
- automatic benchmark/check/finalization execution on a timer
- Prompt Vault execution inside the polling loop
- automatic AK task creation, fuzzy anchoring, or scope mutation
- automatic task failure for blocked states in v1
- git mutation, branch cleanup, push, PR, or merge automation
- a generic supervision framework for unrelated domains
- a new durable control plane parallel to AK + package artifacts + Prompt Vault

Those remain outside Workstream D.

## Bottom line

Workstream D is complete when read as the bounded slice that gave `pi-autoresearch`:

- a live read-only orchestrator supervision runner with bounded polling/session policy
- complete-only, fail-closed AK lifecycle automation after verified package-local completion
- an operator-facing `autoresearch_live_supervision` surface for exact `status` / `observe` / `start` / `stop`
- bounded proof that the live control-plane surface reports the resulting session truthfully

What still comes next is **not** “make live supervision real.”
That is now landed for the target described in this repo.
What remains outside this workstream is only any later widening that would require a new contract, such as:

- broader autonomy than the current bounded in-process runner
- auto-fail policy beyond evidence-only blocked states
- remote review or PR automation above local finalization proof

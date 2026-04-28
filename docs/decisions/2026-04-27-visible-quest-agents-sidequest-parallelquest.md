---
summary: "ADR for adopting visible quest-agent launch tools in pi-little-helpers while preserving manual /sidequest editability, ASC execution ownership, intercom communication-only semantics, and AK authority."
status: accepted
read_when:
  - "Before implementing or reviewing sidequest_spawn or parallelquest_spawn."
  - "When deciding whether visible peer Pi session launch belongs in pi-little-helpers, pi-autoresearch, pi-society-orchestrator, or ASC."
  - "When reviewing how manual /sidequest differs from controller-spawned sidequests and parallelquests."
system4d:
  container: "Concern-local ADR for visible quest-agent launch surfaces in the pi-extensions monorepo."
  compass: "Preserve manual sidequest operator freedom while adding safe controller-spawned visible peer agents."
  engine: "state context -> choose owner/surfaces -> define guardrails -> record implementation and validation consequences."
  fog: "The biggest risks are silently making /sidequest read-only, letting autonomous controllers mutate a shared checkout, or turning visible peer messages into authority."
---

# ADR — Visible quest agents: `/sidequest`, `sidequest_spawn`, and `parallelquest_spawn`

## Status

Accepted as the concern-local architecture decision for visible quest-agent launch tools.

- date: 2026-04-27
- owner: `pi-extensions`
- implementation owner: `packages/pi-little-helpers`
- accepted_by: operator direction in the 2026-04-27 Pi session
- related_docs:
  - [`../project/2026-04-27-rfc-visible-quest-agents-sidequest-parallelquest.md`](../project/2026-04-27-rfc-visible-quest-agents-sidequest-parallelquest.md)
  - [`../../packages/pi-little-helpers/docs/project/2026-04-16-sidequest-ghostty-launch-contract.md`](../../packages/pi-little-helpers/docs/project/2026-04-16-sidequest-ghostty-launch-contract.md)
  - [`peer-session-messaging-primitive.md`](peer-session-messaging-primitive.md)
  - [`../../packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`](../../packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md)

This ADR records the accepted repo-local architecture judgment. No AK decision id is recorded in this ADR. If an AK decision is later opened or accepted for this concern, AK remains the canonical decision-runtime authority.

## Alpha naming update

After validating Pi CLI fork semantics, the alpha API moved to boundary-explicit peer names:

| Canonical surface | Compatibility alias | Context behavior | Workspace/mutation boundary |
|---|---|---|---|
| `/forkpeer` / `fork_peer_spawn` | `/sidequest` / `sidequest_spawn` | Forks the current Pi conversation/context. | Operator/tool intentionally inherits current context. |
| `/scoutpeer` / `scout_peer_spawn` | — | Clean new Pi context. | Same workspace, read-only by prompt contract. |
| `/candidatepeer` / `candidate_peer_spawn` | `parallelquest_spawn` | Clean new Pi context. | Isolated git worktree; mutations only inside that worktree. |

Older sections below use the original `sidequest_spawn` / `parallelquest_spawn` proposal vocabulary. Interpret them through this alpha naming update: `sidequest_spawn` now preserves the forked-context sidequest meaning, while `scout_peer_spawn` owns the clean read-only peer behavior.

## Decision

Adopt visible quest-agent launch surfaces in `packages/pi-little-helpers`:

1. preserve the existing manual `/sidequest` command as an operator-directed forked Pi session that remains editable when the operator steers it that way
2. add `sidequest_spawn` as an LLM-callable tool for controller-spawned same-workspace scouting/review, read-only by default
3. add `parallelquest_spawn` as an LLM-callable tool for mutation-capable visible peer work in isolated git worktrees

Do not move quest launch ownership into `pi-autoresearch`, `pi-society-orchestrator`, or ASC.

## Executive summary

`/sidequest` is a human affordance. It should stay flexible.

`sidequest_spawn` is an autonomous/controller affordance. Because it launches into the controller's current checkout, it should default to read-only scouting or review.

`parallelquest_spawn` is the mutation-safe autonomous/controller affordance. It should create an isolated git worktree and launch the peer there.

The rule is:

> Manual sidequests preserve operator freedom. Controller-spawned sidequests default to safe scouting. Parallelquests are for visible candidate mutation.

## Context

`packages/pi-little-helpers` already owns `/sidequest` through `extensions/sidequest.ts`.

The existing manual command:

- requires a saved parent Pi session file
- launches `pi --fork <session-file> ... <prompt>`
- opens a same-window Ghostty tab when the current Ghostty session truthfully supports `+new-tab`
- falls back to a new Ghostty window when tab attach is unavailable or fails
- uses `PI_SESSION_PRESENCE_TITLE_BASE` for useful visible session titles
- does not talk to Niri directly

The owned stack also already has adjacent lower-plane owners:

| Concern | Owner |
|---|---|
| Headless subagent execution | `packages/pi-autonomous-session-control` |
| Workflow composition over ASC | `packages/pi-society-orchestrator` |
| Same-machine peer messaging | `packages/pi-peer-messaging` |
| Experiment runtime | `packages/pi-autoresearch` |
| Durable task/evidence truth | AK |

The missing capability is not a new execution runtime. The missing capability is an LLM-callable way for a controller to launch visible peer Pi sessions using the already-governed `/sidequest` launch mechanics.

## Problem

A controller session such as `pi-autoresearch` may need visible peer help:

- a scout to inspect failed run artifacts
- a reviewer to critique a hypothesis or candidate patch
- a candidate lane to try a bounded implementation while the controller remains untouched

Today the controller can use headless ASC subagents, but cannot directly launch a visible peer tab/window as a tool call.

Adding that ability naively would be unsafe. A peer launched in the same checkout can race the controller, mutate files during benchmarks, corrupt keep/discard semantics, and make receipts ambiguous.

The architecture must therefore distinguish:

- human-opened `/sidequest` tabs, where the operator is in charge
- controller-spawned same-checkout sidequests, which must be conservative
- mutation-capable peer work, which needs a separate worktree

## Decision details

### Surface 1 — manual `/sidequest`

Manual `/sidequest` remains a human/operator command.

It must not become read-only by default. If the operator opens a sidequest and manually steers it to edit files, that is normal operator-directed Pi work, subject to the usual repo and tool guardrails.

### Surface 2 — `sidequest_spawn`

`sidequest_spawn` is an LLM-callable tool that launches a visible peer in the current workspace.

Default posture:

- role: `scout`
- mutation policy: `read_only`
- return value: launch facts only
- enforcement: truthfully reported as prompt-contract-only unless hard enforcement is actually implemented

### Surface 3 — `parallelquest_spawn`

`parallelquest_spawn` is an LLM-callable tool that creates an isolated git worktree and launches a visible peer in that worktree.

Default posture:

- base ref: `HEAD`
- generated branch: `parallelquest/<slug>`
- workspace root: user state directory unless configured otherwise
- mutation allowed only in the worktree
- no auto-merge, push, PR, AK mutation, or promotion
- return value: launch/worktree facts only

Dirty parent state must be detected. If `requireCleanParent` is true, dirty parent state fails closed. Otherwise the tool may proceed from `HEAD`, but both the prompt and response details must say that uncommitted parent changes are not included.
The resolved worktree path must not be inside the parent checkout, inside `.git`, or produced through path traversal. Existing target paths must fail closed unless `reuseExisting` is explicitly true and the existing path is verified as the intended git worktree.


## Ownership and boundary rules

| Concern | Decision |
|---|---|
| Ghostty visible peer launch | Owned by `packages/pi-little-helpers`. |
| Core autoresearch loop | Remains same-session and owned by `packages/pi-autoresearch`. |
| Headless helper execution | Remains ASC-owned. |
| Workflow composition | Remains orchestrator-owned over ASC. |
| Intercom report-back | Communication only; never completion/evidence truth by itself. |
| Quest result durability | Controller must record through the appropriate owning surface if needed. |

Quest agents may call `dispatch_subagent`, `workflow_execute`, or `intercom` inside their own session when those tools are available. That does not transfer ownership of launch, execution, workflow composition, or authority.

## Prompt contract

The launch tools must generate contract-rich prompts rather than pass through a bare objective.

A `sidequest_spawn` prompt must include:

- identity as a visible sidequest agent, not the controller
- role (`scout` or `reviewer`)
- objective
- context/artifacts to inspect
- files in scope
- off-limits
- mutation policy
- allowed tools
- report-back instructions
- definition of done
- anti-goals

A `parallelquest_spawn` prompt must additionally include:

- parent/controller cwd
- worktree cwd
- branch name
- base ref
- dirty-parent warning when applicable
- mutation allowed only in the worktree
- no merge/push/PR/AK mutation
- report requirements for branch, worktree, diff, commands, metric/check result, risks, and recommended controller action

## Controller-spawned launch isolation

Manual `/sidequest` remains a fork of the current Pi session. Controller-spawned quest tools intentionally do not fork the controller conversation. They launch a clean Pi session with the quest prompt as the first user turn.

This distinction is required because `pi --fork <session-file> <prompt>` copies the controller's current conversation branch first. For autonomous quest tools, that inherited context can include the controller's just-finished tool call and supervision instructions, causing the spawned peer to continue as the controller instead of obeying the boot ACK as its first action.

## Intercom policy

Intercom is optional only when the caller explicitly sets `reportBack` to `manual` or `none`.

For the default controller-spawned `intercom` report-back mode, the tool must fail closed unless the caller supplies an exact `parentPeerTarget`. The launched prompt must instruct the peer to send at most:

1. `PEER_ACK peer_run_id=...` as its first action
2. `PEER_FINAL peer_run_id=...` as the final DoD report

Legacy `QUEST_ACK quest_id=...` / `QUEST_FINAL quest_id=...` remains accepted by peer messaging for compatibility, but beta visible-peer prompts should prefer the canonical peer vocabulary. An intercom report is communication. It becomes durable evidence only if the controller records it through an appropriate authority surface.

## Autoresearch policy

`pi-autoresearch` may consume quest tools opportunistically:

- scout sidequest for failed run artifact inspection
- review sidequest for critique
- parallelquest for bounded candidate patch exploration

It must not:

- move the main experiment loop into a quest agent
- let controller-spawned same-cwd sidequests mutate files
- let multiple sessions run keep/discard semantics over one checkout
- treat peer messages as evidence without controller verification
- auto-merge or auto-promote parallelquest results

## Consequences

### Positive consequences

- Controllers can launch visible peer cognition without improvising Ghostty commands.
- Manual `/sidequest` remains flexible and operator-directed.
- Autoresearch gets an optional visible scout/review/candidate lane without moving its core loop.
- Candidate mutation has a clear worktree boundary.
- ASC and orchestrator ownership remain intact.
- Intercom remains communication-only.

### Negative consequences / costs

- `pi-little-helpers` gains more responsibility and tests around launch contracts.
- Read-only sidequest mode is initially prompt-contract-only unless later hardened.
- Parallelquest worktrees need cleanup/review discipline.
- Controllers must still verify peer results before treating them as durable evidence or merge candidates.

## Alternatives considered

### Keep only `/sidequest`

Rejected. It preserves human ergonomics but leaves controller agents unable to launch visible peers when the need arises.

### Use ASC subagents for all helper work

Rejected. ASC subagents are headless bounded executions with structured results. They do not provide visible peer tabs/windows and should not absorb Ghostty launch behavior.

### Put quest launch in `pi-autoresearch`

Rejected. Autoresearch is a likely consumer, not the owner of visible session launch mechanics.

### Put quest launch in `pi-society-orchestrator`

Rejected. Orchestrator owns coordination and workflow composition, not Ghostty launch mechanics.

### Let `sidequest_spawn` mutate the shared checkout freely

Rejected. Manual `/sidequest` already supports operator-directed editable work. Autonomous/controller-spawned same-checkout mutation is unsafe; candidate mutation belongs in `parallelquest_spawn`.

### Require intercom

Rejected. Intercom is useful for report-back, but visible quest launch should not fail merely because peer messaging is unavailable.

## Implementation order

1. Refactor `extensions/sidequest.ts` to extract reusable launch helpers without changing `/sidequest` behavior.
2. Add `sidequest_spawn` over the shared launch helper.
3. Add deterministic git worktree preparation helpers.
4. Add `parallelquest_spawn` over the worktree helper and shared launch helper.
5. Update `pi-autoresearch` guidance to mention quest tools as optional stuck-state helpers after the tools exist.

## Validation expectations

Minimum implementation validation:

```bash
cd packages/pi-little-helpers
node --test tests/sidequest.test.mjs
npm run check
npm run release:check:quick
```

Add or extend tests for:

- preservation of manual `/sidequest` behavior
- `sidequest_spawn` registration and prompt contract
- read-only default and truthful enforcement reporting
- structured launch-result details
- `parallelquest_spawn` registration
- branch/workspace sanitization
- path traversal prevention
- dirty parent handling
- existing worktree handling
- unchanged Ghostty fallback behavior

## Explicit deferrals

The following are deferred beyond the first accepted slice:

- hard read-only enforcement through a guard extension or active-tool restriction
- quest status dashboards beyond launch details/session-presence
- worktree cleanup helpers
- patch import/cherry-pick helpers
- Prompt Vault governance for quest prompt templates
- automatic autoresearch stuck-state quest spawning
- automatic parent peer discovery through a public peer-messaging seam

## Decision text

Adopt visible quest-agent launch tools in `pi-little-helpers`: preserve manual `/sidequest` as an operator-directed editable forked session, add `sidequest_spawn` for controller-spawned same-workspace scouting/review with a read-only default, and add `parallelquest_spawn` for mutation-capable visible peer work in isolated git worktrees. Keep ASC as the headless execution owner, orchestrator as workflow/supervision owner, intercom as communication-only, and AK as durable authority.

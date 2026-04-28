---
summary: "RFC for LLM-callable visible quest agents, now recorded by the accepted quest-agent ADR."
status: adr-recorded
read_when:
  - "You are implementing or reviewing sidequest_spawn or parallelquest_spawn in pi-little-helpers."
  - "You are deciding the boundary between manual sidequest tabs, controller-spawned sidequests, parallelquest worktrees, ASC subagents, workflow execution, and intercom peer messaging."
  - "You are preparing an ADR or AK decision for visible quest-agent launch tools."
type: "rfc"
system4d:
  container: "Cross-package RFC for visible peer-agent launch tools in the pi-extensions monorepo."
  compass: "Preserve manual /sidequest operator freedom while giving controllers safe visible-peer launch tools."
  engine: "Name the surfaces -> assign owners -> specify tool contracts -> specify prompt boundaries -> implement in pi-little-helpers."
  fog: "The main failure modes are accidentally making manual /sidequest read-only, letting autonomous controllers mutate the shared checkout, duplicating ASC execution ownership, or treating intercom/tab launch as completion truth."
---

# RFC — visible quest agents: `/sidequest`, `sidequest_spawn`, and `parallelquest_spawn`

## Status

ADR recorded.

This RFC is now recorded by the accepted ADR at [`../decisions/2026-04-27-visible-quest-agents-sidequest-parallelquest.md`](../decisions/2026-04-27-visible-quest-agents-sidequest-parallelquest.md). It began as proposed future behavior; the current implementation has landed `sidequest_spawn` and `parallelquest_spawn` in `packages/pi-little-helpers`.

## Alpha naming update

The implementation migrated to boundary-explicit peer names while keeping compatibility aliases:

| Canonical surface | Compatibility alias | Context behavior | Workspace/mutation boundary |
|---|---|---|---|
| `/forkpeer` / `fork_peer_spawn` | `/sidequest` / `sidequest_spawn` | Forks the current Pi conversation/context. | Inherited context is intentional. |
| `/scoutpeer` / `scout_peer_spawn` | — | Clean new Pi context. | Same workspace, read-only by prompt contract. |
| `/candidatepeer` / `candidate_peer_spawn` | `parallelquest_spawn` | Clean new Pi context. | Isolated git worktree; mutations only inside that worktree. |

Older proposal sections below predate the rename and may still say `sidequest_spawn` for what is now `scout_peer_spawn`. The canonical alpha vocabulary is the table above.

## Decision summary

Add LLM-callable visible peer launch tools to `packages/pi-little-helpers`:

1. `sidequest_spawn` — launches a visible peer Pi session in the current workspace. For autonomous/controller-spawned use, it defaults to a read-only scouting/review contract.
2. `parallelquest_spawn` — launches a visible peer Pi session in an isolated git worktree. This is the safe path when the peer should try code changes.

Keep the existing human command:

```text
/sidequest "prompt"
```

as a normal operator-directed forked Pi session. Manual `/sidequest` must remain editable when the operator steers it that way.

The final rule:

> Manual sidequests preserve operator freedom. Controller-spawned sidequests default to safe scouting. Parallelquests are for visible candidate mutation.

## Context

`packages/pi-little-helpers/extensions/sidequest.ts` already registers `/sidequest`. The command:

- requires a saved parent Pi session file
- launches `pi --fork <session-file> ... <prompt>`
- opens a same-window Ghostty tab when the current Ghostty session truthfully supports `+new-tab`
- falls back to a new Ghostty window when tab attach is unavailable or fails
- uses `PI_SESSION_PRESENCE_TITLE_BASE` for useful visible session titles
- does not talk to Niri directly

The launch contract is documented in:

```text
packages/pi-little-helpers/docs/project/2026-04-16-sidequest-ghostty-launch-contract.md
```

The missing capability is an LLM-callable surface. A controller such as `pi-autoresearch` can currently suggest that the operator run `/sidequest`, but it cannot call a tool to launch a visible peer itself.

## Ownership

| Concern | Owner | Rule |
|---|---|---|
| Visible Ghostty helper launch | `packages/pi-little-helpers` | Owns `/sidequest`, `sidequest_spawn`, and `parallelquest_spawn`. |
| Headless subagent execution | `packages/pi-autonomous-session-control` | Owns `dispatch_subagent` and the public execution runtime. |
| Workflow composition over ASC | `packages/pi-society-orchestrator` | Owns `workflow_execute`, loops, routing/team composition, and supervision above lower-plane owners. |
| Same-machine peer messaging | `packages/pi-peer-messaging` | Owns `intercom`; communication only. |
| Experiment runtime | `packages/pi-autoresearch` | Owns the core same-session autoresearch loop/runtime. May consume quest tools opportunistically. |
| Durable task/evidence truth | AK | Owns canonical task/evidence/lifecycle authority. |

Quest agents are visible peer Pi sessions. They are not ASC subagents. They may call `dispatch_subagent` or `workflow_execute` inside their own session when useful, but that does not move execution ownership out of ASC/orchestrator.

## Vocabulary

| Term | Definition |
|---|---|
| **controller session** | The primary Pi session responsible for the task or campaign. For autoresearch, this is the session running the experiment loop. |
| **quest agent** | A visible Pi peer session launched into a Ghostty tab/window. Manual `/sidequest` is forked; controller-spawned quest tools use a clean session so the quest prompt is the first user turn. Umbrella term for sidequest and parallelquest agents. |
| **manual sidequest** | A sidequest launched by the operator through `/sidequest`; editable if the operator steers it that way. |
| **controller-spawned sidequest** | A sidequest launched by the `sidequest_spawn` tool; read-only by default because it shares the controller checkout. |
| **parallelquest agent** | A quest agent launched in an isolated git worktree; may mutate only inside that worktree. |
| **ASC subagent** | A headless bounded execution unit owned by ASC and invoked through `dispatch_subagent`, `workflow_execute`, or orchestrator adapters. |
| **peer session** | A live Pi session addressable through `intercom`. |

Recommended roles:

- **scout** — diagnose, inspect artifacts, research, identify likely root cause
- **reviewer** — critique a plan, patch, or result
- **candidate** — implement and validate a bounded change in an isolated worktree

## Scope

### In scope

- Add `sidequest_spawn` as an LLM-callable tool in `packages/pi-little-helpers`.
- Add `parallelquest_spawn` as an LLM-callable tool in `packages/pi-little-helpers`.
- Reuse the existing `/sidequest` Ghostty launch behavior.
- Preserve manual `/sidequest` behavior.
- Generate strong launch prompts with objective, boundaries, files in scope, off-limits, constraints, DoD, and report-back guidance.
- Return structured launch/workspace details.

### Out of scope

- making manual `/sidequest` read-only
- replacing the same-session `pi-autoresearch` loop
- making quest agents required for autoresearch
- creating a background daemon or hidden scheduler
- direct Niri control
- a swarm, room, or multi-agent authority model
- auto-merging or auto-promoting parallelquest changes
- direct AK mutation from quest launch tools
- treating Ghostty launch, intercom delivery, or intercom reply as completion truth
- cross-machine messaging

## Surface 1 — existing `/sidequest`

`/sidequest` remains a human/operator command.

When the operator runs:

```text
/sidequest "work on this"
```

and then manually steers the new tab, that tab is a normal forked Pi session. It may edit files if the operator instructs it to, subject to the usual repo and tool guardrails.

This RFC must not be implemented in a way that silently downgrades manual `/sidequest` into read-only mode. Manual `/sidequest` is the operator-directed shared-cwd path.

## Surface 2 — `sidequest_spawn`

### Purpose

Launch a visible peer Pi session in the current workspace for controller-spawned scouting or review.

Because it shares the controller checkout, the default contract is read-only.

### Request shape

```ts
sidequest_spawn({
  role?: "scout" | "reviewer",
  objective: string,
  cwd?: string,
  reportBack?: "intercom" | "manual" | "none",
  parentPeerTarget?: string,
  context?: {
    campaignGoal?: string,
    primaryMetric?: string,
    currentBest?: string,
    blocker?: string,
    filesInScope?: string[],
    offLimits?: string[],
    constraints?: string[],
    artifactsToRead?: string[],
    currentFindings?: string[],
  },
  dod?: string[],
})
```

### Defaults

- `role`: `scout`
- `cwd`: current Pi cwd
- `reportBack`: `intercom`; requires an exact `parentPeerTarget` unless the caller explicitly sets `reportBack` to `manual` or `none`

### Mutation policy

`sidequest_spawn` is read-only by design. Editable shared-cwd work remains the job of manual `/sidequest`, not the tool surface.

Read-only mode is a prompt/contract policy unless the implementation later adds hard enforcement through active-tool restriction or a guard extension. The tool response must report the enforcement level truthfully.

### Behavior

The tool should:

1. build a contract-rich sidequest prompt
2. call the same Ghostty launch core used by `/sidequest`
3. launch a clean Pi session in the requested cwd using `pi ... <prompt>` rather than `pi --fork <session-file> ... <prompt>`
4. return structured launch details

The clean launch is deliberate: forking the controller session copies the controller's just-finished tool call and supervision context before the quest prompt, which can cause the peer to continue acting as the controller instead of sending the boot ACK as its first action. The beta prompt vocabulary is now canonical `PEER_ACK peer_run_id=...`, while legacy `QUEST_ACK quest_id=...` remains accepted by peer messaging for compatibility.

The tool must not wait for completion, inspect the peer’s later behavior, record AK evidence, or claim sandbox enforcement it does not provide.

### Response shape

Representative response:

```json
{
  "ok": true,
  "tool": "sidequest_spawn",
  "launchMode": "tab",
  "cwd": "/path/to/repo",
  "sessionMode": "clean",
  "titleBase": "Sidequest: inspect backtracking failure",
  "enforcement": "prompt_contract",
  "promptSummary": "Inspect failing backtracking_easy_1 artifacts",
  "reportBack": "intercom",
  "nextStep": "Watch the visible sidequest tab or use intercom/list to receive its report."
}
```

If launch falls back from tab to window, include the fallback reason from the existing sidequest launch logic.

## Surface 3 — `parallelquest_spawn`

### Purpose

Launch a visible peer Pi session in an isolated git worktree for bounded candidate mutation.

Parallelquest agents may edit, test, and optionally commit inside their worktree. They must not merge, push, mutate the parent checkout, mutate AK, or claim promotion.

### Request shape

```ts
parallelquest_spawn({
  objective: string,
  baseRef?: string,
  branchName?: string,
  workspaceRoot?: string,
  workspaceName?: string,
  filesInScope?: string[],
  offLimits?: string[],
  constraints?: string[],
  dod?: string[],
  reportBack?: "intercom" | "manual" | "none",
  parentPeerTarget?: string,
  requireCleanParent?: boolean,
  reuseExisting?: boolean,
})
```

### Defaults

- `baseRef`: `HEAD`
- `branchName`: generated as `parallelquest/<slug>`
- `workspaceRoot`: user state directory, not the parent checkout, unless explicitly configured
  - recommended default: `${XDG_STATE_HOME:-~/.local/state}/pi-quests/worktrees/<repo-slug>-<repo-hash>/`
- `requireCleanParent`: `false`, but dirty parent state must be detected and reported
- `reuseExisting`: `false`
- `reportBack`: `intercom`; requires an exact `parentPeerTarget` unless the caller explicitly sets `reportBack` to `manual` or `none`

Dirty parent state must not silently leak into the parallelquest. A worktree based on `HEAD` can still be safe, but the launched prompt and response details must say when uncommitted parent changes are not included.
The resolved worktree path must not be inside the parent checkout, inside `.git`, or produced through path traversal. Existing target paths must fail closed unless `reuseExisting` is explicitly true and the existing path is verified as the intended git worktree.


### Behavior

The tool should:

1. locate the git repo containing the parent cwd
2. derive and sanitize branch/workspace names
3. detect dirty parent state and either fail (`requireCleanParent: true`) or include a warning
4. create a worktree outside the parent checkout, equivalent to:

   ```bash
   git worktree add <worktree-path> -b <branch-name> <base-ref>
   ```

5. build a contract-rich parallelquest prompt
6. launch a clean Pi session in the worktree cwd using `pi ... <prompt>` rather than inheriting the controller conversation with `--fork`
7. return structured launch/worktree details

The tool must not auto-merge, push, open PRs, mutate AK, or decide whether the candidate should be kept.

### Response shape

Representative response:

```json
{
  "ok": true,
  "tool": "parallelquest_spawn",
  "launchMode": "window",
  "parentCwd": "/path/to/repo",
  "worktreePath": "/home/user/.local/state/pi-quests/worktrees/repo-a1b2c3/qwen36-backtracking-guard",
  "branchName": "parallelquest/qwen36-backtracking-guard",
  "baseRef": "HEAD",
  "parentDirty": true,
  "parentDirtyWarning": "Parent checkout has uncommitted changes; this worktree is based on HEAD and does not include them.",
  "sessionMode": "clean",
  "nextStep": "Inspect the reported branch/worktree before cherry-pick or merge."
}
```

## Prompt contract

The launch tools should generate prompts rather than pass through the objective alone. The prompt is part of the safety boundary.

### `sidequest_spawn` prompt requirements

A `sidequest_spawn` prompt must include:

- identity: visible sidequest agent, not the controller
- role: scout or reviewer
- mission/objective
- context and artifacts to inspect
- files in scope
- off-limits
- mutation policy
- allowed tools
- report-back instructions
- definition of done
- anti-goals

Required read-only policy language:

```md
## Mutation Policy

You are in the controller's working tree. This sidequest is read-only for controller-spawned use.

In read-only mode, do not edit files, run destructive commands, commit, revert, install dependencies, restart services, or change running model services. If a mutation seems necessary, report the exact proposed mutation back to the controller instead of applying it.
```

Required definition of done:

```md
## Definition of Done

Return a concise report with:

1. Answer or recommendation
2. Evidence inspected — exact files, artifacts, and commands
3. Most likely root cause or key finding
4. One concrete next experiment or controller action
5. Expected impact
6. Risks and rollback notes
7. What not to try again
```

### `parallelquest_spawn` prompt requirements

A `parallelquest_spawn` prompt must include:

- identity: visible parallelquest agent
- objective
- parent/controller cwd
- worktree cwd
- branch name
- base ref
- dirty-parent warning when applicable
- files in scope
- off-limits
- mutation allowed only in worktree
- no merge/push/PR/AK mutation
- expected report includes branch/worktree/diff/commands

Required workspace policy language:

```md
## Workspace Boundary

You are working in an isolated git worktree.

- Parent/controller cwd: <parent>
- Your worktree cwd: <worktree>
- Branch: <branch>
- Base: <base>

All mutations must stay inside your worktree. Do not modify the parent checkout.
```

Required definition of done:

```md
## Definition of Done

Return a concise report with:

1. Branch name
2. Worktree path
3. Files changed
4. Commands run and results
5. Metric/check result if applicable
6. Patch summary
7. Risks and rollback notes
8. Recommended controller action: ignore, inspect, cherry-pick, or merge after review
```

### Tool policy inside quest agents

Quest prompts should allow the peer to use available tools, with role-specific boundaries:

- `read` and bounded `bash` for inspection/validation
- `dispatch_subagent` for one focused headless helper when it reduces risk
- `workflow_execute` for a small explicit chain/parallel plan when useful
- `intercom` for reporting back when available

Quest agents should be told not to spawn more quest agents unless explicitly instructed.

## Intercom integration

Intercom is optional only when the caller explicitly selects `reportBack: "manual"` or `reportBack: "none"`.

For the default `intercom` mode, the tool fails closed unless `parentPeerTarget` is provided. When present, include that exact target in the prompt and require a bounded two-message protocol: one `PEER_ACK peer_run_id=...` as the peer's first action and one `PEER_FINAL peer_run_id=...` as the final DoD report. Legacy `QUEST_ACK quest_id=...` / `QUEST_FINAL quest_id=...` remains a compatibility path, but new visible peer prompts should prefer the canonical peer vocabulary.

Boundary rule:

> Intercom reports are communication. They become durable evidence only when the controller records them through the appropriate authority surface.

## Autoresearch integration

`pi-autoresearch` should consume quest tools opportunistically and conservatively.

Correct use:

- launch a scout sidequest to inspect failing run artifacts
- launch a review sidequest to critique a candidate plan
- launch one or more parallelquests to try bounded candidate patches in isolated worktrees
- copy useful findings into `autoresearch.ideas.md`, ASI, receipts, diary, or AK evidence only through the controller’s normal surfaces

Incorrect use:

- moving the main experiment loop into a sidequest
- having autoresearch/controller-spawned same-cwd sidequests mutate files
- letting two sessions call keep/discard semantics over the same checkout
- treating a peer message as evidence without controller verification
- auto-merging a parallelquest branch because it reported success

Example scout sidequest:

```ts
sidequest_spawn({
  role: "scout",
  objective: "Inspect why backtracking_easy_1 hits REPL timeout or context-window blowup in the latest stock-RLM pilot runs.",
  reportBack: "intercom",
  context: {
    campaignGoal: "Improve Qwen3.6-35B-A3B inference/control quality on the RTX PRO 6000 Blackwell workstation.",
    primaryMetric: "pilot2 overall_accuracy with failed == 0; latency is secondary",
    artifactsToRead: [
      "runtime/m14-longcot-local-benchmark/runs/20260426T215328Z--qwen36-vllm-main-auto--stock-rlm--autoresearch-qwen36-vllm-main-auto-pilot2-action-contract/",
      "runtime/m14-longcot-local-benchmark/runs/20260426T220302Z--qwen36-vllm-main-auto--stock-rlm--autoresearch-qwen36-vllm-main-auto-pilot2-repl360/"
    ],
    offLimits: [
      ".env",
      "stable workstation baseline services",
      "unrelated direction/governance docs"
    ]
  },
  dod: [
    "Identify the likely root cause",
    "Propose one bounded next experiment",
    "Do not mutate the shared checkout"
  ]
})
```

Example candidate parallelquest:

```ts
parallelquest_spawn({
  objective: "Try a bounded host-code/REPL guard so generated brute-force code cannot run until timeout on backtracking_easy_1.",
  filesInScope: [
    "scripts/phasee/64-longcot-stock-rlm-smoke.py",
    "runtime/m14-longcot-local-benchmark/benchmark-stock-rlm-target.sh"
  ],
  offLimits: [
    ".env",
    "governance/work-items.json",
    "docs/project/** unless documenting command evidence is explicitly requested"
  ],
  dod: [
    "Candidate change stays only in isolated worktree",
    "Focused backtracking_easy_1 diagnostic is run or a blocker is reported",
    "Report diff summary and command evidence",
    "No auto-merge or promotion"
  ],
  reportBack: "intercom"
})
```

## Implementation plan

### Phase 1 — refactor sidequest launch core

Extract reusable helpers from `extensions/sidequest.ts` without changing command behavior.

Helper responsibilities:

- prompt/title summarization
- model/thinking argument construction
- Ghostty binary resolution
- tab/window fallback launch
- structured launch result

Existing `/sidequest` tests must continue to pass.

### Phase 2 — add `sidequest_spawn`

Add a tool that builds the sidequest prompt and calls the shared launch helper.

Acceptance criteria:

- registers `sidequest_spawn`
- preserves `/sidequest` behavior
- launches a clean peer Pi session in current/requested cwd without inheriting the controller conversation
- defaults to read-only prompt for controller/tool-spawned use
- reports whether read-only is prompt-contract-only or actually enforced
- returns launch facts only
- tests cover prompt generation and launch response shape

### Phase 3 — add worktree preparation helpers

Add deterministic helper logic for parallelquest worktrees.

Acceptance criteria:

- detects repo root
- derives safe branch/workspace names
- creates worktree under the configured/default quest workspace root
- handles existing target path fail-closed unless reuse is explicit
- detects parent dirty state and reports or fails according to `requireCleanParent`
- tests cover path traversal, branch sanitization, dirty parent behavior, and existing workspace behavior

### Phase 4 — add `parallelquest_spawn`

Add the launch tool over the worktree helper and shared quest launch core.

Acceptance criteria:

- registers `parallelquest_spawn`
- creates or reuses a safe worktree according to policy
- launches Pi in the worktree cwd
- prompt includes parent/worktree/branch/base boundaries
- no auto-merge/push/AK mutation
- returns worktree and launch facts only

### Phase 5 — update autoresearch guidance

After tools exist, update `pi-autoresearch` active-mode/help guidance to mention quest tools as optional stuck-state helpers.

Acceptance criteria:

- core autoresearch loop remains same-session
- quest use is framed as optional
- sidequest is read-only for controller-spawned use
- parallelquest is isolated mutation

## Package placement

Primary implementation package:

```text
packages/pi-little-helpers
```

Likely files:

```text
packages/pi-little-helpers/extensions/sidequest.ts
packages/pi-little-helpers/lib/quest-launch.ts
packages/pi-little-helpers/lib/quest-prompts.ts
packages/pi-little-helpers/lib/parallelquest-worktree.ts
```

A separate `extensions/parallelquest.ts` is not necessary for the first slice unless keeping both tools in `sidequest.ts` becomes unwieldy.

## Validation

Minimum validation for implementation changes:

```bash
cd packages/pi-little-helpers
node --test tests/sidequest.test.mjs
npm run check
npm run release:check:quick
```

Add or extend tests for:

- `sidequest_spawn` registration
- sidequest prompt contract
- preservation of manual `/sidequest` behavior
- read-only default and truthful enforcement reporting
- structured launch-result details
- `parallelquest_spawn` registration
- branch/workspace sanitization
- path traversal prevention
- dirty parent handling
- existing worktree handling
- unchanged Ghostty fallback behavior

For docs-only changes at repo root:

```bash
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs docs --strict
```

## Alternatives rejected

### Only keep `/sidequest`

Rejected. Human ergonomics remain, but controller agents still cannot launch visible peer investigations when they are the ones that know a side branch is useful.

### Use ASC subagents for everything

Rejected. ASC subagents are headless bounded execution units with structured return. They do not provide a visible peer tab/window and should not absorb Ghostty launch behavior.

### Put quest launch in `pi-autoresearch`

Rejected. Autoresearch is a consumer, not the owner of Ghostty visible-session launch.

### Put quest launch in `pi-society-orchestrator`

Rejected. Orchestrator owns coordination and workflow composition above lower-plane owners. It should not own Ghostty launch mechanics or duplicate `pi-little-helpers` behavior.

### Let `sidequest_spawn` mutate the shared checkout freely

Rejected. Manual `/sidequest` already gives the operator an editable forked Pi session when they choose to steer it that way. The LLM-callable `sidequest_spawn` should not grant same-checkout mutation to autonomous controllers. Candidate mutation belongs in `parallelquest_spawn`; manual `/sidequest` remains the operator-directed shared-cwd escape hatch.

### Make intercom required

Rejected. Intercom is valuable for report-back, but visible quest launch should not fail just because peer messaging is unavailable or not loaded.

## Explicit deferrals

These are not part of the first ADR acceptance criteria:

- hard read-only enforcement through a guard extension or active-tool restriction
- quest status dashboards beyond launch details/session-presence
- worktree cleanup helpers
- patch import/cherry-pick helpers
- Prompt Vault governance for quest prompt templates
- automatic autoresearch stuck-state quest spawning
- automatic parent peer discovery through a public peer-messaging seam

They may be handled later if the first tool surfaces prove useful.

## ADR-ready conclusion

This RFC is ready for an ADR / AK decision with the following decision text:

> Adopt visible quest-agent launch tools in `pi-little-helpers`: preserve manual `/sidequest` as an operator-directed editable forked session, add `sidequest_spawn` for controller-spawned same-workspace scouting/review with a read-only default, and add `parallelquest_spawn` for mutation-capable visible peer work in isolated git worktrees. Keep ASC as the headless execution owner, orchestrator as workflow/supervision owner, intercom as communication-only, and AK as durable authority.

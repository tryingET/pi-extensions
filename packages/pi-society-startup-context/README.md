---
summary: "Overview and quickstart for the read-only AI Society startup context package."
read_when:
  - "Starting work in this package workspace."
  - "Installing or configuring the AI Society startup context extension."
system4d:
  container: "Pi extension package for read-only AI Society session-start orientation."
  compass: "Give fresh Pi sessions compact runtime context without creating shadow authority or startup mutations."
  engine: "session_start read-only probes -> compact semantic packet -> before_agent_start prompt injection."
  fog: "The main risks are treating projections as authority, parsing raw human CLI output, or hiding degraded AK state."
---

# @tryinget/pi-society-startup-context

Read-only AI Society startup context for Pi sessions.

When a Pi session starts inside `~/ai-society`, this package gathers a bounded orientation packet from canonical/read-only surfaces and injects the compact packet into the next LLM turn. It is intentionally an orientation layer, not a runtime authority or repair tool.

- Package path: `packages/pi-society-startup-context`
- Package name: `@tryinget/pi-society-startup-context`
- Extension entrypoint: `extensions/society-context.ts`
- Manual command: `/society-context [refresh]`
- Release component key: `pi-society-startup-context`

## What the startup packet does

On `session_start`, the extension checks whether `ctx.cwd` is under `~/ai-society`.

Outside `~/ai-society`:
- it stays quiet by default
- it does not run AK or git probes
- no context is injected unless `PI_SOCIETY_CONTEXT_INJECT_OUTSIDE=1` is set

Inside `~/ai-society`, startup is two-tiered:

1. `session_start` builds a fast/minimal packet immediately from path-local facts and starts the full refresh in the background.
2. `before_agent_start` uses the full packet if ready; otherwise it waits only `PI_SOCIETY_CONTEXT_FULL_WAIT_MS` and injects the explicitly labeled fast packet.

The fast packet includes:
- cwd and path-inferred repo identity
- authority orientation reminders
- existing capability-map and read-first file pointers
- explicit warnings that AK, git dirty state, direction, task, and decision posture are pending full refresh

The background full packet gathers the richer compact packet with:
- cwd, git repo root, and path-derived company/lane/repo identity
- read-only dirty git posture from `git status --short`
- canonical AK repo resolution plus runtime/task posture from strict machine envelopes
- direction export/check posture
- ready queue count/sample plus claimed/running/blocked counts from `startup.snapshot` v1 (which intentionally emits no active/blocked task samples)
- active decision warnings and bounded passport summaries when active decisions are found
- capability-map and read-first file pointers, without pasting those docs
- bounded warnings for unavailable tools, unregistered repos, timeouts, or missing machine surfaces
- recommended next legal reads/actions
- an explicit statement that startup performed no mutations

The LLM-facing packet is rendered as markdown. Raw AK machine JSON is parsed in extension code and compressed into semantic bullets before it reaches the model.

See [startup context contract](docs/project/startup-context-contract.md) for the detailed boundary.

## Read-only safety contract

Automatic startup must not:
- mutate AK, git, docs, tasks, decisions, projections, receipts, or evidence
- create, claim, complete, defer, or rebaseline tasks
- advance decisions
- repair direction drift
- refresh work-item projections
- write session-derived state into AK
- treat Pi session JSONL, runtime registry data, Prompt Vault, docs, or capability maps as canonical authority

The implementation enforces this by only using no-shell read commands:
- `git rev-parse --show-toplevel`
- `git status --short`
- `ak repo resolve <cwd> --machine`
- `ak startup snapshot --repo <canonical-repo> --ready-sample <n> --machine`
- `ak direction export --repo <canonical-repo> --machine`
- `ak direction check --repo <canonical-repo> --machine`
- `ak decision list --machine --limit 10`
- `ak decision passport <id> --machine` only for a small number of active relevant decisions

All commands are timeout-bounded and parsed as JSON/machine output when available. Human CLI output is not parsed for canonical facts.

## Failure and degraded mode

Failures degrade into warnings in the packet:
- full refresh pending -> fast packet says AK/git/direction/task/decision posture is not checked yet
- AK missing or timing out -> AK sections say unavailable and include a bounded warning
- repo not registered -> repo registration is unknown/not registered; no bootstrap is attempted
- unsupported machine/json surface -> warning, no invented truth
- git unavailable -> dirty state says unavailable
- direction drift -> reported only; no repair or rebaseline is attempted

The packet never presents stale or incomplete data as canonical truth. Fast packets are labeled `packet_tier: fast/minimal` and `full_refresh_status: pending|failed`; full packets are labeled `packet_tier: full` / `full_refresh_status: complete`. Each packet includes `captured_at` so the model can see that it is a snapshot.

## Configuration

Environment variables:

| Variable | Default | Meaning |
|---|---:|---|
| `PI_SOCIETY_STARTUP_CONTEXT` | `1` | Set to `0`/`false`/`off` to disable all startup probing/injection. |
| `PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS` | `4000` | Timeout for each git/AK command in the full refresh. |
| `PI_SOCIETY_CONTEXT_FULL_WAIT_MS` | `250` | Bounded wait in `before_agent_start` for a background full packet before falling back to the fast packet. |
| `PI_SOCIETY_CONTEXT_MAX_TASKS` | `5` | Ready-task sample size shown in the packet. |
| `PI_SOCIETY_CONTEXT_MAX_GIT_LINES` | `12` | Dirty git sample size shown in the packet. |
| `PI_SOCIETY_CONTEXT_MAX_WARNINGS` | `10` | Warning count included in the packet. |
| `PI_SOCIETY_CONTEXT_AK` | unset | Explicit AK executable override. |
| `PI_SOCIETY_CONTEXT_INJECT_OUTSIDE` | `0` | Inject a minimal not-applicable packet outside `~/ai-society`. |
| `PI_SOCIETY_CONTEXT_NOTIFY_OUTSIDE` | `0` | Show a UI notification outside `~/ai-society`. |

The extension invokes the configured/installed `ak` executable and inherits `AK_DB` unchanged when the operator sets it. It does not inject a database filename or prefer a local build; AK owns selection of its configured fsqlite-backed runtime.

## Live package activation

Install the package into Pi from this package directory:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-society-startup-context
```

Then in Pi:

```text
/reload
/society-context refresh
```

## Package checks

Run from package directory:

```bash
npm install
npm run docs:list
npm run check
```

Run from monorepo root through the canonical package gate:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-society-startup-context
```

## Future explicit mutation commands

A future command such as `/society-rebaseline` could explicitly repair direction drift, refresh projections, or write AK evidence. That must be a separate operator-command path with its own safety contract. It is intentionally out of scope for automatic startup.

## Copier lifecycle policy

This package was scaffolded from `~/ai-society/softwareco/owned/pi-extensions-template` in `simple-package` mode.

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

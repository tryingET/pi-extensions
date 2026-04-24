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

Inside `~/ai-society`, it gathers a compact packet with:
- cwd, git repo root, and path-derived company/lane/repo identity
- read-only dirty git posture from `git status --short`
- AK health/repo posture from bounded machine/json surfaces
- direction export/check posture
- ready task posture and task status counts
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
- `ak doctor --machine`
- `ak machine schema task-ready -F json`
- `ak repo show <repo> --machine`
- `ak direction export --repo <repo> --machine`
- `ak direction check --repo <repo> --machine`
- `ak task ready --repo <repo> --machine`
- `ak task list --repo <repo> --machine`
- `ak decision list --machine --limit 10`
- `ak decision passport <id> --machine` only for a small number of active relevant decisions

All commands are timeout-bounded and parsed as JSON/machine output when available. Human CLI output is not parsed for canonical facts.

## Failure and degraded mode

Failures degrade into warnings in the packet:
- AK missing or timing out -> AK sections say unavailable and include a bounded warning
- repo not registered -> repo registration is unknown/not registered; no bootstrap is attempted
- unsupported machine/json surface -> warning, no invented truth
- git unavailable -> dirty state says unavailable
- direction drift -> reported only; no repair or rebaseline is attempted

The packet never presents stale or incomplete data as canonical truth. Each packet includes `captured_at` so the model can see that it is a startup snapshot.

## Configuration

Environment variables:

| Variable | Default | Meaning |
|---|---:|---|
| `PI_SOCIETY_STARTUP_CONTEXT` | `1` | Set to `0`/`false`/`off` to disable all startup probing/injection. |
| `PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS` | `4000` | Timeout for each git/AK command. |
| `PI_SOCIETY_CONTEXT_MAX_TASKS` | `5` | Ready-task sample size shown in the packet. |
| `PI_SOCIETY_CONTEXT_MAX_GIT_LINES` | `12` | Dirty git sample size shown in the packet. |
| `PI_SOCIETY_CONTEXT_MAX_WARNINGS` | `10` | Warning count included in the packet. |
| `PI_SOCIETY_CONTEXT_AK` | unset | Explicit AK executable override. |
| `PI_SOCIETY_CONTEXT_INJECT_OUTSIDE` | `0` | Inject a minimal not-applicable packet outside `~/ai-society`. |
| `PI_SOCIETY_CONTEXT_NOTIFY_OUTSIDE` | `0` | Show a UI notification outside `~/ai-society`. |

AK uses `AK_DB` when set, otherwise `~/ai-society/society.v2.db`.

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

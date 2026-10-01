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
2. `before_agent_start` waits at most `PI_SOCIETY_CONTEXT_FULL_WAIT_MS` for background collection. It uses current-identity context only: healthy fresh full context, explicitly degraded full context, or a fast/not-checked packet. Expired prior facts may appear only as labelled stale orientation during refresh.

The fast packet includes:
- cwd and path-inferred repo identity
- authority orientation reminders
- existing capability-map and read-first file pointers
- explicit warnings that AK, git dirty state, direction, task, and decision posture are pending full refresh

The background full packet gathers the richer compact packet with:
- cwd, git repo root, and path-derived company/lane/repo identity
- read-only dirty git posture from `git status --short`
- canonical AK repo resolution plus runtime/task posture from strict machine envelopes and original-value payload checks (safe integer IDs/counts, non-overflowing derived totals, integer priorities 0–4 and typed emitted optional fields)
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

All commands are timeout-bounded and parsed as JSON/machine output when available. Successful transport also requires both output streams to reach EOF; incomplete draining is a typed `output_incomplete` failure, not a successful partial read. Human CLI output is not parsed for canonical facts.

## Failure and degraded mode

Failures degrade into warnings in the packet:
- full refresh pending -> fast packet says AK/git/direction/task/decision posture is not checked yet
- AK missing or timing out -> AK sections say unavailable and include a bounded warning
- repo not registered -> repo registration is unknown/not registered; no bootstrap is attempted
- unsupported machine/json surface -> warning, no invented truth
- git unavailable -> dirty state says unavailable
- direction drift -> reported only; no repair or rebaseline is attempted

Collection completion is not source health: a completed full packet can be degraded. Packets separately label `source_health: healthy|degraded|not_checked`, `freshness: fresh|stale`, and `refresh_state: idle|refreshing|backoff`. Only healthy, fresh full context is ready/checkmarked (not while refreshing). Unknown direction checks never imply observed drift. Passport failures count toward health and the uncapped warning total, even when displayed warnings are suppressed.

AK reads run serially per controller through the configured installed wrapper; git can run independently. The 45 s AK command default allows for admission plus execution; the whole refresh has a 120 s budget, independent of the 250 ms prompt wait. External command/collection elapsed times do not claim AK internal timing.

Healthy context expires 5 min after collection **starts**, using a monotonic clock. Failed/degraded collections retry only on subsequent prompt/command activity after exponential 15 s backoff, with 0–25% jitter applied before a hard 120 s cap. Only healthy collection resets the failure counter; no idle polling occurs. A generation-bound one-shot UI expiry timer removes idle ready/checkmark status at the TTL deadline without launching any read or retry. Replacement, manual collection and shutdown cancel that timer. Manual refresh bypasses age/backoff but concurrent manual requests coalesce. Cwd/config changes invalidate old context immediately, cancel the old generation and wait for its cleanup before new reads. Publication and every consumption path recheck generation/identity/shutdown.

Each generation snapshots normalized cwd, resolved executable/PATH, caller `AK_DB`, enable flag, limits and time/recovery budgets. There is no cross-session canonical cache or consumer database lock. Source health describes successful typed observations, not direction conformance or authorization to mutate AK.

The extracted runner owns a detached POSIX process group. Cancellation/command timeout/refresh expiry are distinct failures. It sends TERM, waits 250 ms, escalates to SIGKILL even if the leader exited, and checks both direct-child settlement and absence of live group members for at most 2 s after escalation. Unproven settlement reports `cleanup_failure`, never successful cleanup. Its owned-resource handle survives the completed transport/collection promise: the controller enters `blocked_cleanup` with degraded, stale, not-checked facts, and blocks manual refresh, due retry and config/session replacement reads until demand-time observation proves actual settlement. Cwd/config changes, controller restart and extension-factory reload do not clear the ownership barrier. A process/realm-local `Symbol.for` registry scopes receipts by source-module owner and the host's retained `SessionManager` object identity, not cwd/config/session-id strings; unrelated SDK sessions remain independent. Weak owner entries contain only receipt registries, never authority packets. Unresolved receipts strongly pin their owner until demand-time settlement; no timeout, shutdown or GC eviction is treated as release. Unavailable ownership proof remains blocked; no unsafe re-signalling or automatic ownership release occurs. Linux `/proc` checks guard PID/group ownership using leader start time, session and UID. Empty non-atomic censuses do not establish settlement or suppress signals: corroborate them with the kernel group-existence check. Zombie-only settlement requires successful ownership-guarded SIGKILL escalation followed by two stable, nonempty identity-matched censuses; matching zombie subsets before KILL never prove completeness or bypass TERM/KILL. Only atomic group absence is cached. Non-Linux POSIX has only group-existence checks; Windows uses a direct-child fallback, not equivalent tree proof. A descendant deliberately escaping into another process group/session is **outside containment**; supported AK readers must not daemonize.

## Configuration

Environment variables:

| Variable | Default | Meaning |
|---|---:|---|
| `PI_SOCIETY_STARTUP_CONTEXT` | `1` | Set to `0`/`false`/`off` to disable all startup probing/injection. |
| `PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS` | `45000` | Per-AK-command admission-plus-execution budget; git root/status retain 2 s/3 s bounds. |
| `PI_SOCIETY_CONTEXT_REFRESH_TIMEOUT_MS` | `120000` | Whole-collection wall budget; aborts the owned reader and prevents later launches. Cleanup can add up to 250 ms + 2 s, plus scheduling/observation overhead. |
| `PI_SOCIETY_CONTEXT_TTL_MS` | `300000` | Freshness age from collection start. |
| `PI_SOCIETY_CONTEXT_RETRY_BASE_MS` | `15000` | Demand-driven failure backoff base. |
| `PI_SOCIETY_CONTEXT_RETRY_CAP_MS` | `120000` | Backoff cap; cannot exceed 120 s even with jitter. |
| `PI_SOCIETY_CONTEXT_FULL_WAIT_MS` | `250` | Bounded wait in `before_agent_start` for a background full packet before falling back to the fast packet. |
| `PI_SOCIETY_CONTEXT_MAX_TASKS` | `5` | Ready-task sample size shown in the packet. |
| `PI_SOCIETY_CONTEXT_MAX_GIT_LINES` | `12` | Dirty git sample size shown in the packet. |
| `PI_SOCIETY_CONTEXT_MAX_WARNINGS` | `10` | Warning count included in the packet. |
| `PI_SOCIETY_CONTEXT_AK` | unset | Explicit AK executable override. |
| `PI_SOCIETY_CONTEXT_INJECT_OUTSIDE` | `0` | Inject a minimal not-applicable packet outside `~/ai-society`. |
| `PI_SOCIETY_CONTEXT_NOTIFY_OUTSIDE` | `0` | Show a UI notification outside `~/ai-society`. |

The extension invokes the configured/installed `ak` executable (`PI_SOCIETY_CONTEXT_AK`, then legacy `AGENT_KERNEL`, then PATH lookup) and inherits caller `AK_DB` unchanged. This is configuration identity, not database-selection authority: the published AK gate selects its database and unsets `AK_DB`. No filename is injected or local build preferred.

Integer knobs accept zero: zero command/refresh budgets prevent launch, zero prompt wait is immediate, zero sampling/warning limits suppress samples/displayed warnings, and zero TTL/backoff allows immediate demand-driven expiry/retry. Negative, malformed or oversized values use defaults.

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
# First, from monorepo root: source scripts/select-gate-node.sh
npm ci
npm run docs:list
npm test
npm run check
```

Run from monorepo root through the canonical package gate:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-society-startup-context
```

Tests cover deterministic scheduling, registered adapters, actual controlled subprocess groups, and an extracted tarball loaded/registered on an isolated production Pi host (no repository/dev-dependency fallback). The tarball test installs the pinned production host in private scratch and therefore needs npm registry access. These are local candidate checks, **not live AK/Ghostty proof**; independent inspection and dogfood remain separate.

## Future explicit mutation commands

A future command such as `/society-rebaseline` could explicitly repair direction drift, refresh projections, or write AK evidence. That must be a separate operator-command path with its own safety contract. It is intentionally out of scope for automatic startup.

## Copier lifecycle policy

This package was scaffolded from `~/ai-society/softwareco/owned/pi-extensions-template` in `simple-package` mode.

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

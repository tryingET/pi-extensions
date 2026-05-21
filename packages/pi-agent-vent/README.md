---
summary: "Overview and quickstart for the pi-agent-vent package."
read_when:
  - "Starting work in this package workspace."
  - "Installing or using the agent_vent tool."
system4d:
  container: "Local pi extension for agent frustration capture."
  compass: "Surface recurring agent friction while preserving authority boundaries and privacy."
  engine: "Install package -> record minimized vents -> inspect recurrence summary -> human decides escalation."
  fog: "Vents can be mistaken for canonical incidents, tasks, or telemetry."
---

# @tryinget/pi-agent-vent

`pi-agent-vent` gives Pi agents a local `agent_vent` tool for recording and reviewing recurring frustrations they notice while working: long-lived bugs, repeated tool/runtime failures, brittle workflows, context-loss patterns, missing affordances, and documentation gaps.

It is intentionally local-first and advisory. It does **not** create AK tasks, GitHub issues, canonical evidence, external telemetry, ASC/self state, or real incidents.

- Workspace path: `packages/pi-agent-vent`
- Release component key: `pi-agent-vent`
- Package command: `/agent_vent` (`/agent-vent` remains a compatibility alias)
- LLM tool: `agent_vent`

## Why this exists

Agents often encounter the same friction repeatedly but have no durable low-cost place to say “this keeps hurting.” This package captures those observations as small local JSONL records, groups them by recurrence key, and lets a human mark local review state before deciding whether any owner surface should act.

## Install and activate

From this package directory:

```bash
npm install
npm run check
pi install /absolute/path/to/your/monorepo/packages/pi-agent-vent
```

Then in Pi:

```text
/reload
/agent_vent help
```

## Tool behavior

`agent_vent` supports eight actions:

| Action | Purpose |
|---|---|
| `record` | Append a minimized vent record. Requires `summary`. |
| `summary` | Show recurrence groups and advisory candidate incidents. |
| `list` | Show recent local records. |
| `path` | Show the store path and boundary contract. |
| `review` | Show recurrence groups as a local operator review queue. |
| `set_review` | Set local review state for a recurrence group. |
| `curate` | Append local recurrence merge/rename projection events without rewriting raw vents. |
| `draft` | Generate draft-only owner-surface text for a recurrence group. |
| `stats` | Show local store counts, byte sizes, malformed-line counts, curation counts, and review-state totals. |
| `export` | Produce a bounded local diagnostic projection in markdown or JSON. |

The tool prompt tells the agent to avoid ordinary status updates, raw logs, secrets, and private user payloads.

## Human command

```text
/agent_vent help
/agent_vent summary
/agent_vent list 20
/agent_vent review
/agent_vent review set acknowledged bug:reload-tools "seen locally"
/agent_vent curate merge bug:reload-tool-a bug:reload-tools "same local pattern"
/agent_vent draft github_issue bug:reload-tools
/agent_vent stats
/agent_vent export markdown
/agent_vent path
```

`/agent-vent` remains a compatibility alias for users who prefer kebab-case slash commands.

## Deeper Pi integration

`pi-agent-vent` is a companion to `pi-autonomous-session-control`, not part of it. ASC/`self` remains the execution and operational-mirror owner; this package owns only local vent diagnostics.

When `pi-toolbox-discovery` is installed, it exposes the `agent_vent` bundle so agents can discover or activate the same-named `agent_vent` tool on demand:

```ts
toolbox({ action: "search", query: "vent" })
toolbox({ action: "activate", bundle: "agent_vent" })
```

The owner extension must still be installed/reloaded so the `agent_vent` tool is registered before toolbox can activate it.

## Local data contract

Default store:

```text
~/.pi/agent/agent-vent/vents.jsonl
~/.pi/agent/agent-vent/review-events.jsonl
~/.pi/agent/agent-vent/curation-events.jsonl
```

Override:

```bash
PI_AGENT_VENT_DIR=/path/to/private/dir pi
```

Records are append-only JSONL with `schemaVersion: 1`. Review state changes are append-only local events in `review-events.jsonl`; recurrence curation changes are append-only local events in `curation-events.jsonl`. Recurrence review state and merged/renamed groups are projections from the latest local events; raw vent records are not rewritten.

Reads tolerate malformed old lines and report a malformed-line count. JSONL store files fail closed when replaced by symlinks. `curate`, `draft`, `stats`, and `export` are local diagnostic projection surfaces, not evidence, tasks, issues, incidents, publication, telemetry, or ASC/self state. Draft outputs are paste-ready text only; the owner system still decides acceptance, lifecycle, evidence, and publication.

The package applies conservative redaction heuristics for common token/password/API-key shapes, including review notes, but callers must still avoid submitting secrets.

Data classification: local diagnostic user data. No network calls are made by this package.

## Candidate incidents are not incidents

A recurrence group is flagged as a `candidateIncident` when it is repeated or high severity. That flag means “worth human review,” not “incident declared.” Escalation belongs to the appropriate owner surface.

## Engineering-core alignment

This package follows `engineering-core` lane `pi-ts`:

```bash
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core show pi-ts --prefer-repo
```

Package-specific selected disciplines are documented in [docs/engineering.local.md](docs/engineering.local.md), including `local-first-data`, `data-governance`, `domain-modeling`, and `observability` because this package owns durable local diagnostic records.

Product docs:

- [Vision](docs/project/vision.md)
- [Product posture](docs/project/product-posture.md)
- [Agent vent design](docs/project/2026-05-21-agent-vent-design.md)
- [Implementation plan](docs/project/2026-05-21-agent-vent-implementation-plan.md)

## Package checks

Run from package directory:

```bash
npm install
npm run check
```

Run from monorepo root through the canonical package gate:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-agent-vent
```

## AK task/work-item operations

This package is a monorepo member, not a git root. Use plain installed `ak` from the monorepo root or this package directory; repo identity still belongs to the monorepo root. Do not invent package-local AK wrappers.

## Release metadata

- npm package name: `@tryinget/pi-agent-vent`
- release component/tag stem: `pi-agent-vent` (for example `pi-agent-vent-vX.Y.Z`)
- release config mode: `component`

Keep `.copier-answers.yml` tracked and do not edit it manually.

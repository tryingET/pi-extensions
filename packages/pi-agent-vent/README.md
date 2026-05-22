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

`agent_vent` supports thirteen actions:

| Action | Purpose |
|---|---|
| `record` | Append a minimized vent record. Requires `summary`. |
| `summary` | Show recurrence groups and advisory candidate incidents. |
| `list` | Show recent local records. |
| `path` | Show the store path and boundary contract. |
| `review` | Show recurrence groups as a local operator review queue; optionally filter by local category/tag/tool/package facets; include a recurrence key to inspect bounded representative samples. |
| `outcomes` | Show read-only local follow-up grouped by review outcome state, including exact local next commands without owner-system mutation. |
| `facets` | Show read-only local category/tag/tool/package facet counts for triage. |
| `set_review` | Set local review state for a recurrence group. |
| `curate` | Append local recurrence merge/rename projection events without rewriting raw vents. |
| `draft` | Generate draft-only owner-surface text for a recurrence group. |
| `stats` | Show local store counts, byte sizes, malformed-line counts, curation counts, and review-state totals. |
| `export` | Produce a bounded local diagnostic projection in markdown or JSON. |
| `retention` | List read-only reviewed archive candidates, preview, confirmation-gate, archive, and restore reviewed local diagnostic records with local backups/receipts. |

The tool prompt tells the agent to avoid ordinary status updates, raw logs, secrets, and private user payloads.

## Human command

```text
/agent_vent help
/agent_vent summary
/agent_vent list 20
/agent_vent facets
/agent_vent review
/agent_vent review new 20 category=tool_failure tag=reload tool=pi-reload package=tryinget-pi-agent-vent
/agent_vent review show bug:reload-tools
/agent_vent review set acknowledged bug:reload-tools "seen locally"
/agent_vent outcomes all 10 category=tool_failure tag=reload tool=pi-reload package=tryinget-pi-agent-vent
# outcomes limit is per review-state bucket, not a global row cap
/agent_vent retention candidates reviewed 20 category=tool_failure tag=reload tool=pi-reload package=tryinget-pi-agent-vent
/agent_vent curate merge bug:reload-tool-a bug:reload-tools "same local pattern"
/agent_vent curate remove bug:reload-tool-a "undo local merge"
/agent_vent draft github_issue bug:reload-tools
/agent_vent stats
/agent_vent export markdown
/agent_vent retention preview bug:reload-tools
/agent_vent retention archive bug:reload-tools archive:<token> "reviewed locally"
/agent_vent retention restore /path/to/backups/<backup>.agent-vent-backup.json restore:<token>
/agent_vent path
```

`/agent-vent` remains a compatibility alias for users who prefer kebab-case slash commands. Review queue, outcome, retention-candidate, and detail output include advisory human-review hints, exact local next-action commands for review state, draft-only handoff targets, export prompts, and retention preview eligibility; generated commands quote dynamic recurrence keys/paths so legacy keys remain copyable. Outcome limits are explicit per review-state bucket so `outcomes all 1` can show one `new`, one `acknowledged`, one `dismissed`, and one `escalation_drafted` group. Review/outcome/retention-candidate command syntax fails closed before store reads for unknown filters, including unknown empty filters such as `owner=`, invalid states, or invalid category values. These surfaces are guidance only and do not route, file, create, declare, assign, record evidence, publish, or mutate owner systems.

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
~/.pi/agent/agent-vent/retention-events.jsonl
~/.pi/agent/agent-vent/backups/
```

Override:

```bash
PI_AGENT_VENT_DIR=/path/to/private/dir pi
```

Records are append-only JSONL with `schemaVersion: 1`. Optional `tool` and `packageName` record fields are local diagnostic facets only, not owner-routing truth. Review state changes are append-only local events in `review-events.jsonl`; recurrence curation changes are append-only local events in `curation-events.jsonl`. Retention lifecycle receipts are append-only local events in `retention-events.jsonl`; archive rollback artifacts are package-created local files under `backups/`. Recurrence review state, review outcome follow-up, and merged/renamed groups are projections from the latest local events; raw vent records are not rewritten except by explicit, confirmation-gated local retention archive/restore operations.

Reads tolerate malformed old lines, oversized lines, invalid records, and semantic curation corruption by reporting ignored/quarantined counts. JSONL store files fail closed when replaced by symlinks or when a store exceeds the package file-size guard. `facets`, `review`, `outcomes`, `curate`, `draft`, `stats`, `export`, and `retention` are local diagnostic surfaces, not evidence, owner routing, tasks, issues, incidents, publication, telemetry, or ASC/self state. Draft outputs are paste-ready text only; the owner system still decides acceptance, lifecycle, evidence, and publication.

Retention archive is intentionally destructive to the active local vents store, so it is confirmation-gated: use `retention candidates` for a read-only reviewed-group planning view that emits no archive tokens, preview a reviewed recurrence group first, copy the exact `archive:<token>`, then archive. The token includes the active store hash, archive and record append share a local lock, archive creates a backup before rewriting `vents.jsonl`, and receipt failures roll the active store back when the archive rewrite can still be identified. Restore requires the package-created backup path, exact derived `restore:<token>`, real backup-directory containment, and a current-store hash match so stale backups fail closed. The package intentionally has no hard-delete command in v0.1; permanent removal is operator-owned filesystem/data-lifecycle control, not evidence/task/incident lifecycle.

All display/export/draft/review-detail paths pass loaded records through a diagnostic-state membrane that normalizes schema, re-applies redaction on read, recomputes privacy metadata for loaded records, quarantines curation cycles, and keeps exact recurrence lookup separate from display limits. Review queue filters can use local category/tag/tool/package labels, but those filters are diagnostic focus aids only, not owner routing or owner assignment. Drafts include local diagnostic facets when present, but those facets are hints for human review rather than owner-routing truth.

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

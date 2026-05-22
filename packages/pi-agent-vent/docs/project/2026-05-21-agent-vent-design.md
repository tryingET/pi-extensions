---
summary: "Design for pi-agent-vent: local, privacy-aware agent frustration capture."
read_when:
  - "Changing the agent_vent tool or its persistence model."
  - "Reviewing whether vent records may become tasks, incidents, evidence, or telemetry."
system4d:
  container: "Pi extension package for local agent frustration capture."
  compass: "Make recurring agent friction visible without turning vents into authority."
  engine: "Agent records minimal vent -> append-only local JSONL -> local summary groups recurrence candidates -> human/operator decides escalation."
  fog: "Vents can be mistaken for incident authority, telemetry, or complete evidence if boundaries are unclear."
---

# Agent vent design

## Product intent

`pi-agent-vent` gives the assistant a narrow tool, `agent_vent`, for recording recurring frustrations it notices while working: long-lived bugs, brittle workflows, missing affordances, repeated permission/tool failures, documentation gaps, or context-loss patterns.

The design mirrors the useful part of the referenced Lovable experiment: let the agent complain in a structured way so patterns become visible. It deliberately does **not** let the agent create canonical incidents, GitHub issues, AK tasks, or evidence records by itself.

## Engineering-core basis

Selected guidance from `~/ai-society/core/engineering-core/`:

- `pi-ts` lane: Node 22 + npm, explicit `package.json#pi.extensions`, small deterministic package checks, no unnecessary runtime dependencies.
- `validation` + `testing`: pure grouping/redaction logic gets unit tests; package gate remains the handoff validation surface.
- `security-privacy`: records are local by default, minimized, redacted heuristically, and must not contain secrets or raw user payloads.
- `local-first-data`: durable state is append-only JSONL under an explicit local store path; export/delete posture is documented.
- `data-governance`: vent records are local audit/diagnostic events, not canonical task/evidence authority.
- `domain-modeling`: vocabulary distinguishes `vent`, `recurrence group`, and `candidate incident` to avoid authority drift.
- `observability`: the package emits useful local diagnostic summaries without cloud telemetry.

## Boundary model

| Concept | Meaning | Authority |
|---|---|---|
| Vent record | One agent-observed frustration/friction event. | Local append-only diagnostic event. |
| Recurrence key | Stable grouping key, explicit or derived from category + summary. | Local grouping aid only. |
| Review event | Append-only local state change for one recurrence group. | Local operator inbox state only. |
| Curation event | Append-only merge/rename projection for recurrence keys. | Local grouping projection only; raw vents are not rewritten. |
| Retention event | Append-only receipt for a local archive or restore operation. | Local lifecycle receipt only; not evidence or owner-system deletion. |
| Retention backup | Package-created local rollback artifact containing the pre-archive vents store. | Local rollback artifact only; not canonical evidence. |
| Candidate incident | A repeated/high-severity local pattern worth human review. | Recommendation only; not an incident declaration. |
| Task/issue/evidence | Canonical work or evidence artifact. | Owned by AK/GitHub/other owner surfaces, not this package. |

## Storage contract

Default path:

```text
~/.pi/agent/agent-vent/vents.jsonl
```

Override:

```text
PI_AGENT_VENT_DIR=/path/to/private/dir
```

Record shape is schema-versioned (`schemaVersion: 1`) and append-only. Each line is one JSON object.

Review-state, recurrence-curation, and retention lifecycle events are stored beside vents; retention backups are stored under a package-created local backup directory:

```text
~/.pi/agent/agent-vent/review-events.jsonl
~/.pi/agent/agent-vent/curation-events.jsonl
~/.pi/agent/agent-vent/retention-events.jsonl
~/.pi/agent/agent-vent/backups/
```

Review lifecycle is local-only:

```text
new -> acknowledged | dismissed | escalation_drafted
```

A missing review event means `new`; the latest event for a recurrence key is the projected local review state. Resetting to `new` appends another local event. Curation events project source recurrence keys onto target recurrence keys for merge/rename views; raw vent records keep their original keys. Curation rollback uses an append-only `remove` event for the source recurrence key.

Read behavior goes through a diagnostic-state membrane: malformed JSONL lines are ignored and counted, oversized lines are skipped, oversized files fail closed, schema-invalid records are ignored, stored display fields are redacted again on read, privacy metadata is recomputed for loaded vent records, and semantic curation cycles are quarantined instead of bricking all projections. JSONL store files fail closed if replaced by symlinks.

Retention/delete posture: no automatic deletion. Reviewed recurrence groups can be archived only after an explicit preview returns the exact affected record count/sample ids and an `archive:<token>` derived from the active store hash. Archive and vent-record append share a local lock, archive writes a package-created backup before replacing the active `vents.jsonl`, and receipt failures roll the active store back when the archive rewrite can still be identified. Restore requires the package-created backup path, exact derived `restore:<token>`, real backup-directory containment, and a current-store hash match so stale rollback attempts fail closed. Backup artifacts remain local diagnostic user data and are not evidence. The accepted retention/delete policy is [ADR 2026-05-22](../adr/2026-05-22-agent-vent-retention-delete-policy.md): no in-package hard-delete action for v0.1; permanent removal remains operator-owned filesystem/data-lifecycle control unless a future decision accepts a narrower purge design.

## Privacy contract

The tool prompt and runtime validation both bias toward minimal summaries:

- do not include secrets, tokens, credentials, or raw user payloads;
- use short summaries and concrete reproduction hints instead of copied logs;
- apply conservative redaction heuristics for common token/password/API-key shapes;
- keep everything local; no network calls and no cloud telemetry.

## Tool surface

### `agent_vent`

Actions:

- `record` — append a vent record.
- `summary` — summarize recurrence groups and candidate incidents.
- `list` — show recent records.
- `path` — show local store path and data contract.
- `review` — show recurrence groups as a local review queue, optionally focused by local category/tag/tool/package facet filters; when given a recurrence key, show bounded representative local samples for that group.
- `outcomes` — show read-only post-review follow-up grouped by local review outcome state, optionally focused by local category/tag/tool/package facet filters.
- `facets` — show read-only local category/tag/tool/package facet counts for triage.
- `set_review` — append a local review-state event for a recurrence group.
- `curate` — append a local recurrence merge/rename projection event.
- `draft` — generate draft-only owner-surface text for a recurrence group.
- `stats` — show local store counts, byte sizes, malformed-line counts, curation counts, and review-state totals.
- `export` — emit a bounded local diagnostic projection in markdown or JSON.
- `retention` — preview, confirmation-gate, archive, and restore reviewed local diagnostic records with local backup receipts.

Important behavior:

- `record` requires `summary`.
- `severity` defaults to `medium`.
- `category` defaults to `other`.
- `recurrenceKey` may be supplied by the agent; otherwise it is derived from category + summary.
- candidate incident flagging is local and advisory.
- `tool` and `packageName` are optional caller-supplied local diagnostic facets, not owner-routing truth.
- `facets` is read-only and summarizes local labels; it never mutates AK, GitHub, incident, evidence, telemetry, or ASC/self state.
- `review` facet filters are read-only local diagnostic focus aids; review command syntax fails closed before store reads for unknown filter keys, invalid states, and invalid category values, and filters do not assign owners, route work, mutate owner surfaces, or change review state.
- `review` queue/detail and `outcomes` output may show advisory human-review hints plus exact next-action commands for local review states, draft-only handoff targets, export prompts, and retention preview eligibility; generated commands quote dynamic recurrence keys/paths for legacy key safety. These are UX guidance only and do not route, submit, file, create, declare, assign owners, record evidence, publish, or mutate owner systems.
- `set_review` requires an existing recurrence group and never mutates AK, GitHub, incident, evidence, telemetry, or ASC/self state.
- `curate` requires an existing source group, rejects self/cycle aliases, supports append-only `remove` undo events, and stores local projection events only.
- `draft` supports `github_issue`, `ak_task`, `incident_review`, and `maintainer_note`; it includes local diagnostic facets when present, returns text only, and never submits, files, declares, records evidence, assigns owners, or changes review state automatically.
- `stats` and `export` are read-only projections and must not claim evidence, publication, task, issue, or incident authority.
- `retention preview` is read-only; `retention archive` mutates only the active local vents store after exact confirmation, lock acquisition, store-hash verification, and backup creation; `retention restore` mutates only the active local vents store after exact confirmation, realpath containment, and stale-state checks.

### `/agent_vent`

Human/operator command for lightweight inspection. `/agent-vent` remains a compatibility alias.

- `/agent_vent help`
- `/agent_vent summary`
- `/agent_vent list [limit]`
- `/agent_vent path`
- `/agent_vent facets [limit]`
- `/agent_vent review [new|acknowledged|dismissed|escalation_drafted|all] [limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]`
- `/agent_vent review show <recurrenceKey> [limit]`
- `/agent_vent review set <state> <recurrenceKey> [note]`
- `/agent_vent outcomes [new|acknowledged|dismissed|escalation_drafted|all] [limit] [category=bug] [tag=reload] [tool=pi-reload] [package=tryinget-pi-agent-vent]`
- `/agent_vent curate merge <sourceRecurrenceKey> <targetRecurrenceKey> [note]`
- `/agent_vent curate rename <sourceRecurrenceKey> <targetRecurrenceKey> [note]`
- `/agent_vent curate remove <sourceRecurrenceKey> [note]`
- `/agent_vent draft <github_issue|ak_task|incident_review|maintainer_note> <recurrenceKey> [limit]`
- `/agent_vent stats`
- `/agent_vent export [markdown|json] [state|all] [limit]`
- `/agent_vent retention preview <recurrenceKey>`
- `/agent_vent retention archive <recurrenceKey> <archive:token> [note]`
- `/agent_vent retention restore <backupPath> <restore:token> [note]`

## Candidate incident heuristic

A recurrence group is flagged as a candidate incident when:

- any record is `critical`; or
- the group has at least three records and max severity is at least `medium`; or
- the group has at least two records and max severity is at least `high`.

This heuristic intentionally errs toward surfacing review candidates, not asserting operational truth.

## Cross-package integration

`pi-agent-vent` remains separate from `pi-autonomous-session-control` by design:

- ASC/`self` owns operational introspection, subagent/runtime control, and mirror-only handoff/progress summaries.
- `pi-agent-vent` owns local diagnostic vent records, redaction, recurrence grouping, and advisory candidate-incident heuristics.
- `pi-toolbox-discovery` owns discovery/activation of the already-registered `agent_vent` tool through the same-named `agent_vent` bundle.

This keeps vent persistence from becoming hidden ASC state while still making the capability discoverable during autonomous work.

## Non-goals for v0.1

- No automatic GitHub issue creation.
- No AK task creation.
- No incident declaration in external systems.
- No model judging/evaluation loop.
- No remote telemetry or team sync.
- No UI dashboard beyond command/tool text output.

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

Review-state and recurrence-curation events are stored beside vents:

```text
~/.pi/agent/agent-vent/review-events.jsonl
~/.pi/agent/agent-vent/curation-events.jsonl
```

Review lifecycle is local-only:

```text
new -> acknowledged | dismissed | escalation_drafted
```

A missing review event means `new`; the latest event for a recurrence key is the projected local review state. Resetting to `new` appends another local event. Curation events project source recurrence keys onto target recurrence keys for merge/rename views; raw vent records keep their original keys.

Corruption behavior: malformed JSONL lines are ignored during reads and counted as `malformedLines`; new records append to the same file. JSONL store files fail closed if replaced by symlinks.

Retention/delete posture: no automatic deletion in v0.1. The `/agent_vent path` command shows the store paths so the operator can inspect, back up, or remove them. A future delete/export command should be explicit and confirmation-gated.

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
- `review` — show recurrence groups as a local review queue.
- `set_review` — append a local review-state event for a recurrence group.
- `curate` — append a local recurrence merge/rename projection event.
- `draft` — generate draft-only owner-surface text for a recurrence group.
- `stats` — show local store counts, byte sizes, malformed-line counts, curation counts, and review-state totals.
- `export` — emit a bounded local diagnostic projection in markdown or JSON.

Important behavior:

- `record` requires `summary`.
- `severity` defaults to `medium`.
- `category` defaults to `other`.
- `recurrenceKey` may be supplied by the agent; otherwise it is derived from category + summary.
- candidate incident flagging is local and advisory.
- `set_review` requires an existing recurrence group and never mutates AK, GitHub, incident, evidence, telemetry, or ASC/self state.
- `curate` requires an existing source group, rejects self/cycle aliases, and stores local projection events only.
- `draft` supports `github_issue`, `ak_task`, `incident_review`, and `maintainer_note`; it returns text only and never submits, files, declares, records evidence, or changes review state automatically.
- `stats` and `export` are read-only projections and must not claim evidence, publication, task, issue, or incident authority.

### `/agent_vent`

Human/operator command for lightweight inspection. `/agent-vent` remains a compatibility alias.

- `/agent_vent help`
- `/agent_vent summary`
- `/agent_vent list [limit]`
- `/agent_vent path`
- `/agent_vent review [new|acknowledged|dismissed|escalation_drafted|all] [limit]`
- `/agent_vent review set <state> <recurrenceKey> [note]`
- `/agent_vent curate merge <sourceRecurrenceKey> <targetRecurrenceKey> [note]`
- `/agent_vent curate rename <sourceRecurrenceKey> <targetRecurrenceKey> [note]`
- `/agent_vent draft <github_issue|ak_task|incident_review|maintainer_note> <recurrenceKey> [limit]`
- `/agent_vent stats`
- `/agent_vent export [markdown|json] [state|all] [limit]`

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

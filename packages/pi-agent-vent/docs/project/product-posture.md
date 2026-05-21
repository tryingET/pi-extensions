---
summary: "Product posture for pi-agent-vent: promise, maturity, trust gates, boundaries, and next bets."
read_when:
  - "Before choosing the next pi-agent-vent product or implementation slice."
  - "When deciding whether vent review, escalation drafting, retention, or routing belongs in pi-agent-vent."
  - "When aligning pi-agent-vent with ASC/self, toolbox, AK, GitHub, incidents, or evidence surfaces."
type: "reference"
system4d:
  container: "Package-local product posture for agent frustration diagnostics and operator review."
  compass: "Make recurring agent pain actionable without turning local diagnostics into authority."
  engine:
    invariants:
      - "Capture minimized local vents before they disappear."
      - "Group recurrence and route review without automatic escalation."
      - "Keep tasks, issues, incidents, evidence, and publication with their owner surfaces."
  fog:
    risks:
      - "A convenient vent log can become hidden incident/task/evidence authority."
      - "Raw logs or private payloads can leak into diagnostic records."
      - "Noisy one-off complaints can bury recurring maintenance signal."
---

# Product posture — `@tryinget/pi-agent-vent`

## Vision relation

The package north star lives in [vision.md](./vision.md). This posture file is the current bridge from that vision into promise, maturity, trust gates, boundaries, strategic line, and next product bets.

## Product promise

`pi-agent-vent` turns repeated agent frustration into a local, reviewable maintenance inbox.

Short form:

```text
surface pain; review before authority
```

## Primary users

- Pi operators who want recurring agent friction surfaced instead of lost in chat history.
- Controller agents that need a safe place to record repeated tool/runtime/workflow pain.
- Package/runtime maintainers reviewing patterns before deciding whether to file issues or tasks.
- Future adapter authors that may generate human-approved owner-surface draft text.

## Job to be done

When an agent keeps hitting the same bug, missing affordance, brittle workflow, context-loss pattern, or tool failure, I want it captured locally, grouped with similar observations, and presented for operator review without silently creating incidents, tasks, issues, evidence, or telemetry.

## Current product maturity

- maturity: `local diagnostic alpha, review-and-retention safety hardened`
- current capability baseline: local append-only vent capture, recurrence grouping, local operator review queue, review-state events, append-only recurrence curation projections with remove/undo events, diagnostic-state load membrane, draft-only owner-surface text generation, lifecycle stats/export projections, lock/hash-guarded confirmation-gated retention archive/restore with local backup receipts and rollback safeguards, advisory candidate-incident heuristic, redaction/minimization, `/agent_vent` inspection command, toolbox discovery, ASC/self companion routing
- release posture: first publishable package release at `0.1.0`; npm package not yet published at time of first release checks
- current strategic line: harden the local review workflow before adding owner-surface escalation adapters

## Product success criteria

The package is product-healthy when:

1. an agent can record a minimal vent without leaking secrets or raw user payloads;
2. an operator can see the top recurring pain points quickly;
3. recurrence groups separate repeated maintenance signal from one-off complaints;
4. candidate-incident language remains advisory and never implies an incident was declared;
5. review state, retention, export, and deletion behavior are explicit before data volume grows;
6. escalation surfaces generate drafts only and require human approval before owner-system mutation;
7. ASC/self, toolbox, AK, GitHub, incident, and evidence boundaries remain explicit.

## Current landed capability baseline

The package currently owns:

- `agent_vent` tool with `record`, `summary`, `list`, `path`, `review`, `set_review`, `curate`, `draft`, `stats`, `export`, and `retention` actions;
- `/agent_vent` command for local inspection and recurrence review, with `/agent-vent` retained as a compatibility alias;
- schema-versioned local JSONL storage at `~/.pi/agent/agent-vent/vents.jsonl`, local review events at `~/.pi/agent/agent-vent/review-events.jsonl`, local curation events at `~/.pi/agent/agent-vent/curation-events.jsonl`, local retention receipts at `~/.pi/agent/agent-vent/retention-events.jsonl`, and retention backups under `~/.pi/agent/agent-vent/backups/`, overridable via `PI_AGENT_VENT_DIR`;
- conservative redaction for common secret/token/password shapes;
- recurrence key derivation and grouping;
- advisory candidate-incident heuristic based on repetition/severity;
- malformed JSONL line tolerance, oversized-line/file guards, read-time schema normalization/redaction, and semantic curation quarantine during reads;
- package-local tests for redaction, record creation, JSONL round trip, recurrence summaries, review/curation/draft/retention projections, hostile legacy JSONL redaction, curation-cycle quarantine, file/line-size guards, confirmation-gated archive/restore, complete token-input requirements, stale token/restore failures, path-escape/symlink backup failures, receipt-failure rollback, stale lock cleanup, quoted rollback commands, and extension registration;
- `pi-toolbox-discovery` integration through the same-named `agent_vent` bundle;
- ASC/self capability-routing text that points frustration diagnostics to `agent_vent` instead of self/ASC state.

## Product non-goals

`pi-agent-vent` must not become:

- an automatic incident declaration system;
- a direct AK task/evidence writer;
- a GitHub issue creator without explicit human approval;
- a telemetry collector or team sync daemon by default;
- a replacement for ASC/self operational introspection;
- a canonical evidence, publication, KES, Prompt Vault, or ROCS owner;
- a dumping ground for ordinary progress updates or emotional noise with no maintenance signal.

## Trust gates

A vent-derived recommendation is trustworthy only when:

1. **Minimization** — summary/evidence are short and avoid raw logs or private payloads.
2. **Privacy** — known secret shapes are redacted and the operator still treats records as local diagnostic user data.
3. **Recurrence** — repeated groups are visible by stable recurrence key rather than just timestamp order.
4. **Review state** — operator review status is explicit before escalation.
5. **Owner seam** — draft escalation names the target owner surface but does not mutate it automatically.
6. **Boundary report** — output says what was not done: no task, issue, incident, evidence, telemetry, or ASC/self state mutation.

## Current strategic line

Prioritize review quality over escalation power.

The highest-leverage product line is:

```text
local vent capture -> operator review queue -> draft-only owner routing -> human-approved escalation
```

Do not add automatic GitHub/AK/incident writers. The local review queue, curation, draft-only routing, retention archive/restore, and privacy membrane now have package validation; the main remaining product gap is review ergonomics for inspecting representative vents and categories without broadening authority. Hard-delete beyond backup-backed archive is a separate policy decision, not the default next slice.

Current proof: `npm run check` passes with package tests and release dry-run, `npm run release:check` passed with isolated tarball install, docs strict check passes, and dogfood covered quoted rollback commands with whitespace/single-quote paths. Review follow-up also covered complete retention token inputs, stale-token/stale-restore failures, path-escape/symlink backup failures, receipt-failure rollback, stale lock cleanup, and backup restore.

## Next product bets

### Bet 1 — Operator review queue — landed baseline

The local review surface turns recurrence groups into an inbox:

```text
new -> acknowledged | dismissed | escalation_drafted
```

The landed baseline lists groups by recurrence priority, shows representative summaries/sample ids through recurrence projections, and records append-only local review-state events without mutating owner systems. Remaining product depth is operator ergonomics: richer representative-vent expansion and clearer review-flow affordances, not more authority.

### Bet 2 — Retention, export, and deletion controls — non-destructive baseline landed

Make local data lifecycle explicit before records accumulate:

- show store size/count — landed via `stats`;
- export JSON or markdown diagnostic projections — landed via `export`;
- archive reviewed groups with confirmation — landed through `retention preview|archive` with exact store/review/curation-hash tokens, local lock coordination with vent appends, local backups, append-only receipts, and receipt-failure rollback;
- restore archived groups from package backups — landed through `retention restore` with derived exact tokens, real backup-directory containment, current-store hash checks, and quoted rollback command support;
- delete reviewed groups without backup — explicitly deferred to AK task `#3318`; archive remains the destructive lifecycle baseline until a retention/delete policy decision exists;
- document backup/restore posture — covered by explicit paths, lifecycle stats, and retention command output;
- keep corruption behavior fail-soft and visible — landed for malformed lines, oversized lines, invalid entries, semantic curation quarantine, and fail-closed symlink/oversized-file checks.

### Bet 3 — Recurrence curation — merge/rename baseline landed

Improve signal quality without over-modeling:

- merge recurrence groups — landed as append-only local curation projection events;
- rename recurrence keys — landed as append-only local curation projection events;
- undo local curation aliases — landed as append-only `remove` curation events;
- dismiss noisy groups — already covered by local review state;
- show top categories/tools/packages — explicitly deferred to AK task `#3319` as review-ergonomics product depth;
- preserve append-only source records while treating curated summaries as local projections — landed; raw vents are not rewritten.

### Bet 4 — Draft-only owner escalation — landed baseline

Generate human-reviewable drafts for likely owner surfaces:

- GitHub issue draft — landed;
- AK task draft — landed;
- incident review draft — landed;
- package maintainer note — landed.

These drafts do not submit automatically. The package prepares local text and exact next-step guidance; the owner system performs any mutation only after explicit human/operator action. Producing a draft does not automatically mark review state; operators can set `escalation_drafted` explicitly when useful. This clarified the provenance seam: draft text is a local diagnostic projection, not evidence, task truth, issue truth, or incident truth.

## Next frontier guidance

The next highest-leverage slice should assume the review/draft/curation/retention membrane is the baseline and should not broaden authority. Retention now has transaction-oriented safeguards (store/review/curation-hash tokens, append/archive locking, stale-lock cleanup, receipt-failure rollback, derived restore tokens, realpath backup containment, quoted rollback commands, and stale-restore checks). The next slice should likely improve operator ergonomics for inspecting representative vents inside a curated group and/or surfacing category/tool/package facets. Treat hard-delete as decision-gated work via AK `#3318`, not as incidental cleanup.

## Ownership map

| Concern | Owner |
|---|---|
| Local vent records, recurrence grouping, review queue, local curation events, retention receipts/backups, draft text projections, diagnostic-state membrane | `packages/pi-agent-vent` |
| Tool discovery/activation | `packages/pi-toolbox-discovery` |
| Operational self mirror and subagent runtime | `packages/pi-autonomous-session-control` |
| Durable task/evidence/direction truth | AK / society authority surfaces |
| GitHub issues and repo issue policy | Target repo / GitHub owner workflow |
| Real incident declaration | Incident owner surface / human operator |
| Prompt/procedure reuse | Prompt Vault |
| Shared ontology/controlled semantics | ROCS / ontology owner repos |

## Read map

- Vision / north star: [vision.md](./vision.md)
- Design: [2026-05-21-agent-vent-design.md](./2026-05-21-agent-vent-design.md)
- Implementation plan: [2026-05-21-agent-vent-implementation-plan.md](./2026-05-21-agent-vent-implementation-plan.md)
- Extension SOP: [extension-sop.md](./extension-sop.md)

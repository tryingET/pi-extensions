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

- maturity: `local diagnostic alpha, review-and-retention safety hardened; privacy, review-command, outcome-follow-up, review-filter, destructive-selection, and public-contract parity membranes verified`
- current capability baseline: local append-only vent capture with optional local tool/package facets, recurrence grouping, local facet summary, local operator review queue with fail-closed-before-store-read command syntax and read-only category/tag/tool/package facet filters, read-only per-state review outcome follow-up buckets, read-only cross-state review comparison without archive/restore tokens, filter-preserving supported follow-up commands with explicit export-broadening notes, read-only reviewed-group retention candidate planning without archive tokens, advisory human-review hints, quoted state-aware local next-action guidance that round-trips legacy recurrence keys, bounded representative-sample detail, review-state events, append-only recurrence curation projections with remove/undo events, diagnostic-state load membrane with privacy metadata recomputation, facet-aware draft-only owner-surface text generation, lifecycle stats/export projections, lock/hash-guarded confirmation-gated retention archive/restore with duplicate-id-safe record selection, local backup receipts, and rollback safeguards, advisory candidate-incident heuristic, redaction/minimization, `/agent_vent` inspection command, toolbox discovery, ASC/self companion routing
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

- `agent_vent` tool with `record`, `summary`, `list`, `path`, `facets`, `review`, `outcomes`, `compare`, `set_review`, `curate`, `draft`, `stats`, `export`, and `retention` actions, including read-only local facet filters for review queues, outcome follow-up, cross-state comparison, and retention-candidate planning;
- `/agent_vent` command for local inspection and recurrence review, with `/agent-vent` retained as a compatibility alias;
- schema-versioned local JSONL storage at `~/.pi/agent/agent-vent/vents.jsonl`, local review events at `~/.pi/agent/agent-vent/review-events.jsonl`, local curation events at `~/.pi/agent/agent-vent/curation-events.jsonl`, local retention receipts at `~/.pi/agent/agent-vent/retention-events.jsonl`, and retention backups under `~/.pi/agent/agent-vent/backups/`, overridable via `PI_AGENT_VENT_DIR`;
- conservative redaction for common secret/token/password shapes;
- recurrence key derivation and grouping;
- advisory candidate-incident heuristic based on repetition/severity;
- malformed JSONL line tolerance, oversized-line/file guards, read-time schema normalization/redaction with privacy metadata recomputation, and semantic curation quarantine during reads;
- package-local tests for redaction, privacy metadata recomputation, record creation, JSONL round trip, recurrence summaries, local facet summaries, review filtering/detail/hints/next-action guidance, outcome follow-up buckets, explicit per-state outcome/compare limits, read-only cross-state comparison without archive/restore tokens, filter-preserving compare follow-ups plus explicit export-broadening wording, read-only retention-candidate planning without archive tokens, fail-closed review/outcome/compare/retention-candidate command syntax before store reads (including unknown empty filters), quoted legacy recurrence-key command round trips, review/curation/draft/retention projections, hostile legacy JSONL redaction, curation-cycle quarantine, file/line-size guards, confirmation-gated archive/restore, duplicate-id retention selection, complete token-input requirements, stale token/restore failures, path-escape/symlink backup failures, receipt-failure rollback, stale lock cleanup, quoted rollback commands, and extension registration;
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

Do not add automatic GitHub/AK/incident writers. The local facet summary, fail-closed facet-filtered local review queue, per-state review outcome follow-up, read-only cross-state review comparison, filter-preserving supported follow-up commands, read-only retention-candidate planning, advisory human-review hints, quoted state-aware next-action guidance, bounded review-detail samples, curation, facet-aware draft-only routing, retention archive/restore, and privacy membrane now have package validation; the remaining product gap is richer export/archive ergonomics after local review decisions, not more authority. Hard-delete beyond backup-backed archive is decided out of v0.1: permanent removal remains operator-owned filesystem/data-lifecycle control unless a future decision accepts a narrower purge design.

Current proof: `npm run check` passes with 55 package tests plus release dry-run, and docs strict check passes. Validation now covers quoted rollback commands, complete retention token inputs, stale-token/stale-restore failures, path-escape/symlink backup failures, receipt-failure rollback, stale lock cleanup, backup restore, duplicate-id-safe retention archive selection, retention-candidate planning without archive tokens, retention-candidate and compare tool-schema/command-contract parity, filter-preserving supported compare follow-ups, explicit export-broadening notes, tag/facet privacy metadata recomputation, hostile legacy JSONL privacy recomputation, fail-closed review/outcome/compare/retention-candidate syntax before store reads including unknown empty filters, invalid review category/state handling, explicit per-state outcome/compare limits, quoted legacy recurrence-key command round trips, tool-only maintainer-note hints, and local Pi subagent artifact ignore behavior. The same diagnostic-contract pass also hardened `pi-context-packer` dogfood evaluation (69 tests plus release dry-run), clarifying that local diagnostic projections must not classify contradictory observations as proof.

## Next product bets

### Bet 1 — Operator review queue — landed baseline

The local review surface turns recurrence groups into an inbox:

```text
new -> acknowledged | dismissed | escalation_drafted
```

The landed baseline lists groups by recurrence priority, supports fail-closed read-only category/tag/tool/package facet filters, shows advisory human-review hints, shows quoted state-aware local next-action guidance that remains safe for legacy recurrence keys, shows representative summaries/sample ids through recurrence projections, offers bounded read-only representative-sample expansion for a single group, records append-only local review-state events without mutating owner systems, provides read-only outcome follow-up buckets for `new`, `acknowledged`, `dismissed`, and `escalation_drafted` groups, and compares review-state buckets with filter-preserving supported follow-up commands. Remaining product depth is richer export ergonomics after review decisions while keeping owner-system mutation human-approved and external.

### Bet 2 — Retention, export, and deletion controls — non-destructive baseline landed

Make local data lifecycle explicit before records accumulate:

- show store size/count — landed via `stats`;
- export JSON or markdown diagnostic projections — landed via `export`;
- list reviewed groups for archive planning — landed through read-only `retention candidates` with state/facet filters, exact preview commands, and no archive confirmation tokens;
- archive reviewed groups with confirmation — landed through `retention preview|archive` with exact store/review/curation-hash tokens, local lock coordination with vent appends, duplicate-id-safe selected-record removal, local backups, append-only receipts, and receipt-failure rollback;
- restore archived groups from package backups — landed through `retention restore` with derived exact tokens, real backup-directory containment, current-store hash checks, and quoted rollback command support;
- delete reviewed groups without backup — decided out of the v0.1 package surface by [ADR 2026-05-22](../adr/2026-05-22-agent-vent-retention-delete-policy.md); archive remains the destructive package lifecycle baseline;
- document backup/restore posture — covered by explicit paths, lifecycle stats, and retention command output;
- keep corruption behavior fail-soft and visible — landed for malformed lines, oversized lines, invalid entries, semantic curation quarantine, and fail-closed symlink/oversized-file checks.

### Bet 3 — Recurrence curation — merge/rename baseline landed

Improve signal quality without over-modeling:

- merge recurrence groups — landed as append-only local curation projection events;
- rename recurrence keys — landed as append-only local curation projection events;
- undo local curation aliases — landed as append-only `remove` curation events;
- dismiss noisy groups — already covered by local review state;
- show top categories/tags/tools/packages — landed as read-only local facet summaries; owner hints remain deferred to AK task `#3319` as review-ergonomics product depth;
- preserve append-only source records while treating curated summaries as local projections — landed; raw vents are not rewritten.

### Bet 4 — Draft-only owner escalation — landed baseline

Generate human-reviewable drafts for likely owner surfaces:

- GitHub issue draft — landed;
- AK task draft — landed;
- incident review draft — landed;
- package maintainer note — landed.

These drafts do not submit automatically. The package prepares local text, local diagnostic facet hints, and exact next-step guidance; the owner system performs any mutation only after explicit human/operator action. Producing a draft does not automatically mark review state; operators can set `escalation_drafted` explicitly when useful. This clarified the provenance seam: draft text is a local diagnostic projection, not evidence, task truth, issue truth, incident truth, or owner-routing truth.

## Next frontier guidance

The next highest-leverage slice should assume the facets/review/outcomes/compare/filter/hint/detail/draft/curation/retention-candidate/retention-archive membrane is the baseline and should not broaden authority. Retention now has transaction-oriented safeguards (store/review/curation-hash tokens, append/archive locking, duplicate-id-safe selected-record removal, stale-lock cleanup, receipt-failure rollback, derived restore tokens, realpath backup containment, quoted rollback commands, and stale-restore checks) plus read-only reviewed-candidate and cross-state comparison surfaces that emit no archive tokens and preserve supported filter scope in follow-up commands. Local facet labels, filters, outcome states, comparison buckets, hints, generated commands, and draft text are diagnostic projections only; Prompt Vault, AK, GitHub, incident, evidence, ROCS, ASC/self, context-packer dogfood evidence, and toolbox surfaces remain separate owners. The next slice should likely improve export ergonomics for acknowledged/dismissed/escalation-drafted groups without treating local labels as canonical routing, and should preserve the contract-parity lesson from this iteration: command grammar, LLM tool schema, README examples, posture docs, and tests must change together; unknown syntax must fail closed before store reads even when values are empty. Do not spend the next slice on hard-delete unless a new decision explicitly supersedes [ADR 2026-05-22](../adr/2026-05-22-agent-vent-retention-delete-policy.md).

## Ownership map

| Concern | Owner |
|---|---|
| Local vent records, recurrence grouping, review queue/outcome projections, local curation events, retention receipts/backups, draft text projections, diagnostic-state membrane | `packages/pi-agent-vent` |
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

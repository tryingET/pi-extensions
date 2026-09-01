---
summary: "Overview and quickstart for @tryinget/pi-telemetry."
read_when:
  - "Starting work in this package workspace."
  - "Changing telemetry collection, shards, aggregation, review snapshots, or the dashboard."
system4d:
  container: "Monorepo package for Pi runtime telemetry."
  compass: "Make runtime behavior observable as bounded metadata, for the operator and the agent, without creating a new authority surface."
  engine: "Pi events -> metadata-only records -> day shards -> bounded aggregates -> dashboard/tool/review snapshot."
  fog: "The trap is telemetry drifting into payload capture, secret storage, evidence authority, or automatic KES promotion."
---

# @tryinget/pi-telemetry

Mirror-only runtime telemetry for Pi: compaction lifecycle, tool calls, Prompt Vault
queries, skill loads, self-driving follow-up outcomes, and subagent dispatches.

```text
pi events -> pi.telemetry.v1 records -> ~/.pi/agent/telemetry/<day>.jsonl shards
          -> /telemetry HTML dashboard (operator)
          -> telemetry tool aggregates (agent)
          -> /telemetry review digest-bound observation snapshot (explicit handoff)
```

## Surfaces

- **Collector** (`src/collector.ts`) — subscribes to `tool_call`/`tool_result`/
  `tool_execution_end`, `turn_start`, `session_before_compact`, `session_compact`.
  Metadata-only: tool names, ok/fail, duration, bounded error first-line signatures,
  skill names, typed delivery outcomes. Never payloads, message text, or secrets.
- **Store** (`src/store.ts`) — append-only NDJSON day shards with 2 MB rotation,
  30-day retention pruning, and windowed reads. `PI_TELEMETRY_DIR` overrides the
  directory; `PI_TELEMETRY_DISABLED=1` disables collection.
- **Aggregates** (`src/aggregate.ts`) — bounded summaries: per-day/per-kind counts,
  top failing tools, compaction pressure (including unresolved begins = failed/aborted
  passes and stalled-after-compaction counts), vault/skill usage, follow-up outcomes,
  subagent throughput per profile.
- **`/telemetry [days]`** — regenerates a self-contained HTML dashboard (inline data,
  no external assets, no server) at `<telemetry-dir>/dashboard.html`.
- **`/telemetry review [days]`** — writes a bounded
  `pi.telemetry-review-snapshot.v1` JSON artifact under `<telemetry-dir>/reviews/`.
  The snapshot binds the exact window, producer version, live/backfill coverage,
  controlled metrics, bounded breakdowns, source-event-set digest, explicit
  nonclaims, and a canonical snapshot digest. It excludes session IDs, working
  directories, raw errors, payloads, queries, and message text. Its reader rejects
  duplicate JSON members and final-component symlinks; files are owner-only,
  single-link regular files and are checked for mutation during reads.
- **`/telemetry backfill [days]`** — derives telemetry from persisted session JSONL
  into `<day>.backfill.jsonl` shards (idempotent per session file, skips sessions
  already covered by live collection). Backfilled events carry `source: "backfill"`
  so measured-live vs derived-from-history stays distinguishable in aggregates and
  the dashboard provenance line. Derivation coverage is honest: compaction, turns,
  tool calls (no durations), skill loads. Live-only kinds (follow-up, vault,
  subagent, compaction_failure, compaction_begin) are never backfilled because
  session JSONL does not hold them completely.
- **`telemetry` tool** — model-callable bounded aggregates:
  `telemetry({ window_days: 7, group_by: "day" | "kind" | "tool" })`.
- **Review API** (`@tryinget/pi-telemetry/review-snapshot`) — builds, validates,
  safely loads, and writes the published snapshot contract. The JSON Schema is
  `schemas/telemetry-review-snapshot-v1.schema.json`.

## Review and KES handoff

A review snapshot is an observation artifact, not an evidence receipt or learning.
An owning workflow may explicitly:

1. validate the snapshot and digest;
2. persist a bounded reference in Agent Kernel;
3. route it to the applicable owner-local KES adapter;
4. crystallize at most a candidate learning;
5. submit that candidate to a separate content-review lifecycle.

No step authorizes the next automatically. A crossed metric threshold is a review
trigger, not causality proof, verified evidence, KES acceptance, or content promotion.
See [`docs/telemetry-review-snapshots.md`](docs/telemetry-review-snapshots.md).

## Boundaries

- Telemetry is a **mirror-only projection**. It is not AK/KES evidence, not decision
  authority, and not a durable owner surface.
- Review snapshots preserve source coverage and metric-domain sample size. Most
  samples are event counts; message-omission rate uses compacted-message count and
  may exceed the number of telemetry events.
- Missing or zero events may reflect disabled collection, retention,
  malformed/unavailable shards, incomplete backfill, or no observed activity.
- The source-event-set digest excludes session IDs, working directories, and raw
  error signatures. Aggregate failures remain visible without making private origin
  or error prose observable through digest changes.
- Compaction failures are emitted at the source: pi-session-compaction records
  stage-tagged `compaction_failure` events (preset / preset_directive / default_preset /
  stock_fallback / final) through `@tryinget/pi-telemetry/emit` at every fallback and
  failure site. Unresolved-begin counts remain the fallback signal for hosts or
  versions without that emitter.
- Stall detection correlates `compaction` ends with subsequent `turn_start` events in
  the same session (10-minute threshold) and only covers sessions observed live by
  this collector.

## Development

```bash
npm run check     # lint + typecheck when configured + tests + release contract
node --test tests/*.test.mjs
```

Release alignment: npm state must catch up to manifest pins after blocked wave e30aea5.

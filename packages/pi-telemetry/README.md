---
summary: "Overview and quickstart for @tryinget/pi-telemetry."
read_when:
  - "Starting work in this package workspace."
  - "Changing telemetry collection, shards, aggregation, or the dashboard."
system4d:
  container: "Monorepo package for Pi runtime telemetry."
  compass: "Make runtime behavior observable as bounded metadata, for the operator and the agent, without creating a new authority surface."
  engine: "Pi events -> metadata-only records -> day shards -> bounded aggregates -> HTML dashboard + agent tool."
  fog: "The trap is telemetry drifting into payload capture, secret storage, or owner-surface authority."
---

# @tryinget/pi-telemetry

Mirror-only runtime telemetry for Pi: compaction lifecycle, tool calls, Prompt Vault
queries, skill loads, self-driving follow-up outcomes, and subagent dispatches.

```text
pi events -> pi.telemetry.v1 records -> ~/.pi/agent/telemetry/<day>.jsonl shards
          -> /telemetry HTML dashboard (operator)
          -> telemetry tool aggregates (agent)
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

## Boundaries

- Telemetry is a **mirror-only projection**. It is not AK/KES evidence, not decision
  authority, and not a durable owner surface.
- Compaction failures are now emitted at the source: pi-session-compaction records
  stage-tagged `compaction_failure` events (preset / preset_directive / default_preset /
  stock_fallback / final) through `@tryinget/pi-telemetry/emit` at every fallback and
  failure site. Unresolved-begin counts remain the fallback signal for hosts or
  versions without that emitter.
- Stall detection correlates `compaction` ends with subsequent `turn_start` events in
  the same session (10-minute threshold) and only covers sessions observed live by
  this collector.

## Development

```bash
npm run check     # lint + typecheck + tests + release contract
node --test tests/*.test.mjs
```

---
summary: P1 architecture for verified context, bounded continuity state, exact recall, and quality telemetry.
read_when:
  - Changing session compaction P1 ownership or cross-package boundaries.
system4d:
  container: "P1 continuity layer inside pi-session-compaction, spanning three packages."
  compass: "Compacted sessions keep exact, sanitized, anchor-addressable evidence."
  engine: "Build continuity/anchors -> assemble bounded packet -> verify with package tests."
  fog: "Overlay provenance and upstream pi host behavior may drift independently."
---

# P1 continuity architecture

`pi-session-compaction` remains the sole `session_before_compact` owner. P1 separates continuation into three layers:

1. **Orientation:** the bounded model or deterministic continuation body.
2. **Evidence:** lifecycle-aware continuity facts, execution receipts, and stable evidence anchors.
3. **Archive:** sanitized, queryable session history exposed through `session_compaction_recall` and `/compact-recall`.

## Cross-package boundaries

- `pi-context-packer` owns the versioned read-only provider contract, safe omissions, bounds, and live Git worktree projection.
- `pi-telemetry` owns metadata-only quality and recall event schemas, persistence, aggregation, and dashboard rendering.
- `pi-session-compaction` consumes those public surfaces through narrow best-effort adapters. Neither telemetry nor provider failure may cancel compaction.

The context-provider integration is optional at runtime and fails closed. When the public provider package is unavailable, worktree state is explicitly marked unverified rather than inferred from historical tool calls.

## Structured continuity

The `continuity-state` managed block uses lifecycle semantics:

- volatile facts (`intent`, `assistant_state`, `worktree`) are replaced by the current compacted span;
- durable bounded facts (`constraint`, `decision`, `failure`, `validation`) carry forward with explicit historical/carried status;
- live provider facts are marked verified only when the provider proves them;
- stale verified worktree facts are superseded by a current-unverified record when live collection fails.

Repeated exact prompts renew their recency instead of being masked by an earlier duplicate.

## Evidence and recall

Evidence anchors use `E:<entry-id>` for exact session records and `G:worktree-live` for the live Git snapshot. Recall defaults to the active lineage and fails closed when branch metadata exists but the active leaf cannot be proven.

Recall:

- excludes thinking/reasoning content;
- redacts secrets and absolute local paths;
- bounds source candidates, pages, snippets, expansion, and direct refs;
- supports lexical ranking and `files`, `failures`, and `commands` filters;
- lets an explicit evidence ref resolve an older entry outside the normal tail cap while preserving branch scope and sanitization;
- labels recalled material as untrusted historical evidence, never current instructions.

## Quality telemetry

Compaction emits counts and enums only: validation/fallback posture, selected and omitted messages, managed omissions, continuity/evidence density, redactions, truncations, budgets, worktree verification, and duration. Recall emits scope/mode and count metrics only. Queries, snippets, file contents, absolute paths, and secrets are never emitted.

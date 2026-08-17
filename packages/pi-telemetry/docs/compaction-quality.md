---
summary: Metadata-only compaction quality and historical recall telemetry contract.
read_when:
  - Emitting, aggregating, or displaying compaction quality metrics.
system4d:
  container: "Compaction quality/recall event schemas and projections owned by pi-telemetry."
  compass: "Mirror-only observability; no message text, queries, or absolute paths persisted."
  engine: "Emit from owning package -> aggregate in window -> render dashboard projection."
  fog: "Emitting packages and dashboard consumers may evolve independently."
---

# Compaction quality telemetry

`pi-telemetry` owns the `compaction_quality` and `compaction_recall` schemas and their best-effort emitters.

## Privacy boundary

These events contain numbers, booleans, and bounded enums only. They must never contain:

- message or summary text;
- recall queries or snippets;
- tool arguments or output;
- file contents or absolute paths;
- environment values, credentials, or secrets.

A session identifier is reduced to a bounded basename before persistence.

## Quality event

`compaction_quality` measures validation, fallback/repair posture, split-turn use, summary size, compacted/selected/omitted message counts, managed-record and block omissions, continuity facts, evidence anchors, redactions, truncations, input/final budgets, live worktree verification, and duration.

## Recall event

`compaction_recall` measures scope, mode, query-token count, bounded source coverage, candidate and hit counts, page, expansion count, direct evidence-ref count, explicit all-branch widening, and duration.

## Ownership

Owning packages import `@tryinget/pi-telemetry/emit`. Emission is best-effort and must never change the success, failure, or cancellation behavior of the owning operation. Aggregation and the HTML dashboard remain derived observability views, not authority.

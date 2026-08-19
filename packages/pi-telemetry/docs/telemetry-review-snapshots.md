---
summary: "Digest-bound pi.telemetry-review-snapshot.v1 contract for bounded review and downstream evidence/KES handoff."
read_when:
  - "Creating, validating, storing, or consuming telemetry review snapshots."
  - "Using Pi telemetry as a falsification or review signal."
system4d:
  container: "pi-telemetry review artifact contract."
  compass: "Make observations reproducible without turning telemetry into evidence or promotion authority."
  engine: "Select window -> aggregate exact event set -> bind coverage and metrics -> canonical digest -> explicit downstream review."
  fog: "The main risk is treating missing telemetry, a crossed threshold, or a KES candidate as verified truth or automatic promotion."
---

# Telemetry review snapshots

`pi.telemetry-review-snapshot.v1` freezes one bounded aggregate window into a canonical JSON artifact. It is intended for owner review, optional Agent Kernel evidence persistence, and explicit owner-local KES crystallization.

It remains a **mirror-only observation**. Creation of a snapshot does not establish causality, validate a content claim, record an AK transition, materialize a KES learning, or authorize promotion.

## Create a snapshot

```text
/telemetry review
/telemetry review 7
/telemetry review 30
```

The command reads the same retained telemetry shards used by the dashboard and writes:

```text
<telemetry-dir>/reviews/<generated-at>-<digest-prefix>.json
```

The file is created with owner-only permissions, no-clobber semantics, a canonical SHA-256 digest, and the producer package version. Re-running the same exact review window is idempotent only when the bytes match the digest-bound target.

## Contract contents

A snapshot records:

- exact UTC review-window bounds;
- producer package and telemetry schema version;
- total, live, backfilled, and source-unspecified event counts;
- first and last observed timestamps;
- retention ceiling and explicit coverage limitations;
- bounded per-kind and source counts;
- controlled count/rate metrics with sample size and numerator/denominator where available;
- bounded breakdowns without raw error signatures;
- a digest of the source event set after removing `sessionId` and `cwd`;
- explicit nonclaims;
- a digest over the complete snapshot payload.

The published JSON Schema is `schemas/telemetry-review-snapshot-v1.schema.json`. Runtime validation also checks cross-field invariants that JSON Schema alone does not express, including coverage sums, mode consistency, window bounds, metric relationships, and the canonical digest.

## Metrics

The controlled v1 metrics cover:

- total events and live/backfill share;
- tool failure rate;
- stalled compactions, unresolved begins, and explicit compaction failures;
- compaction validation, fallback, repair, and message-omission rates;
- recall zero-hit, degraded, and scope-widening rates;
- vault failure rate;
- blocked follow-up rate;
- subagent failure rate.

A zero value must be interpreted together with `sampleSize`, source coverage, retention, and limitations. A metric with a zero sample is unavailable, not proof that the undesirable outcome did not occur.

## Privacy and boundedness

The snapshot never includes:

- message or summary text;
- tool arguments or output;
- file contents;
- queries;
- environment values or credentials;
- absolute working-directory paths;
- session identifiers;
- raw error signatures.

Labels are control-character-normalized and capped. Breakdowns contain at most 20 rows each. The complete JSON artifact is capped at 256 KiB.

The source-event-set digest intentionally excludes `sessionId` and `cwd`, so those private origin values do not leak through digest changes when all review-relevant metadata is otherwise identical.

## Live and backfilled observations

Live telemetry and backfilled telemetry remain distinguishable:

- live records are measured by the active collector;
- backfilled records are derived from persisted session JSONL;
- backfill does not provide complete durations or live-only event kinds;
- older records without explicit source labels remain `unspecified`.

The snapshot does not estimate missing events. Disabled collection, pruned shards, inaccessible files, malformed lines, and incomplete backfill can all reduce coverage.

## Agent Kernel handoff

A downstream owner may persist a validated snapshot reference in Agent Kernel. Store the schema, snapshot digest, source-event-set digest, producer version, window, coverage mode, metric key/value/sample, subject/revision, and authority ceiling.

The AK record should describe what artifact was validated or reviewed. It must not claim that the measured correlation is causal or that the proposed engineering rule is correct merely because the snapshot was stored.

`pi-telemetry` itself does not call AK.

## KES handoff

KES remains federated by owner. A package or repository that owns the observed workflow may explicitly consume one snapshot through its own KES adapter. The adapter should:

1. validate the exact snapshot and digest;
2. select one controlled metric and minimum sample size;
3. preserve coverage and nonclaims;
4. require an explicit candidate claim and falsification condition;
5. default to a non-mutating plan;
6. materialize only at the owning package/repository surface;
7. produce at most a candidate learning;
8. leave AK, ontology, and promotion state unchanged unless a separate authorized operation acts.

A crossed threshold is a review trigger. It is not a KES claim, evidence verification, or promotion decision.

## Engineering-content lifecycle

When used to review shared engineering guidance, predeclare:

- metric and predicted relationship to the claim;
- baseline and pilot windows;
- minimum sample size;
- accepted missingness and source mix;
- relevant package/configuration versions;
- expected direction and threshold;
- falsification condition;
- complementary evidence required;
- review and expiry trigger.

A KES learning candidate produced from telemetry enters the engineering-content lifecycle at **Proposal**. Promotion to Pilot or Stable remains an owner decision informed by broader evidence.

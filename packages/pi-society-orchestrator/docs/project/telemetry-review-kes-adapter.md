---
summary: "Owner-local plan/materialize seam from pi.telemetry-review-snapshot.v1 to KES Proposal candidates and inert AK evidence handoffs."
read_when:
  - "Using or changing telemetry_learning_kes_adapter."
  - "Reviewing whether runtime telemetry may become a KES candidate or Agent Kernel evidence record."
system4d:
  container: "Package-owned integration contract between pi-telemetry observations, orchestrator KES, and optional AK evidence persistence."
  compass: "Turn bounded observations into reviewable candidates without converting measurements into authority."
  engine: "Validate snapshot -> bind subject/revision and explicit policy -> plan -> explicit materialize -> optional authorized AK record -> owner review."
  fog: "The failure mode is auto-promoting a threshold, KES artifact, or AK row into claim truth or shared doctrine."
---

# Telemetry review to KES adapter

`telemetry_learning_kes_adapter` consumes exactly one validated `pi.telemetry-review-snapshot.v1` file and evaluates one explicitly scoped metric trigger. It defaults to `plan`. `materialize` writes one package-owned KES diary and one candidate-only learning only when the metric sample, coverage policy, measured-live requirement, and threshold all pass.

## Required separation

```text
pi-telemetry observation
  -> digest-bound review snapshot
    -> telemetry_learning_kes_adapter plan
      -> explicit KES materialize
        -> optional authorized AK evidence record
          -> owner decision under engineering-core content lifecycle
```

No transition authorizes the next one.

- `pi-telemetry` remains mirror-only and never writes KES or AK.
- The adapter never mutates telemetry, calls AK, changes ontology, or promotes content.
- A KES learning is a **Proposal** candidate, not Pilot or Stable guidance.
- The returned `akEvidenceHandoff` is inert. Its `result=pass` means only that the telemetry package accepted the snapshot schema, consistency checks, file custody, and digests.
- Agent Kernel persistence records custody and lineage; it does not verify causality or the owner-authored claim.

## Explicit inputs

The caller supplies every policy-bearing value:

- snapshot path;
- stable subject identifier;
- immutable subject revision such as a commit or package/configuration version;
- optional configuration/profile reference;
- one v1 metric key;
- threshold and comparison;
- minimum sample size;
- source-coverage policy;
- minimum measured-live event count;
- owner-authored candidate claim;
- falsification condition;
- review trigger;
- retirement signal.

There is no hidden sample-size or source-coverage default. `live-required` requires `minimum_live_events >= 1`. `any-observed` is an explicit acceptance of backfill-only or otherwise non-live observations and requires `minimum_live_events = 0`. The selected policy remains visible in the KES candidate and AK handoff.

The subject/revision binding is required because the telemetry snapshot deliberately describes a bounded Pi observation rather than guessing repository authority from `cwd` or session identity. A reviewer must identify what code, package, workflow, experiment, or configuration the proposed learning is about.

## Runtime dependency

The adapter loads `@tryinget/pi-telemetry/review-snapshot` only when invoked. The orchestrator remains loadable without the telemetry package, but invoking this tool without a linked or installed compatible telemetry package fails with an explicit diagnostic. This keeps the integration optional rather than turning the public orchestrator package into a mandatory telemetry collector.

## Materialization boundaries

Materialization uses the existing package-owned KES seam under:

- `diary/` for the validation capture;
- `docs/learnings/` for the candidate.

The KES timestamp defaults to the snapshot generation time so the artifact remains tied to the reviewed window rather than the wall-clock time of a later invocation. Snapshot paths and raw telemetry payloads are not copied into the public KES prose. The candidate binds the subject/revision, optional configuration, snapshot and source-event-set digests, window, coverage, selected metric, sample policy, and trigger result. Private runtime evidence can remain in Agent Kernel or the owner-controlled telemetry store.

## Agent Kernel handoff

The returned `akEvidenceHandoff` uses the existing evidence-entry shape but is not executed. It binds:

- subject and immutable revision;
- optional configuration reference;
- snapshot and source-event-set digests;
- producer version;
- window and coverage;
- selected metric, threshold, comparison, sample policy, and review blockers;
- an explicit authority ceiling.

A separately authorized caller may submit the handoff through the normal Agent Kernel evidence path. `result=pass` means only that the snapshot contract and digest were validated; `review_ready` separately records whether the predeclared sample, source, and threshold gates passed. Neither field verifies causality or the candidate claim.

## Non-goals

The adapter does not:

- infer a claim from telemetry automatically;
- establish causality;
- infer the subject from a session or working directory;
- apply hidden sample or source-coverage defaults;
- treat missing or expired telemetry as zero failures;
- merge live and backfilled coverage invisibly;
- create a global KES writer for other packages;
- execute `ak evidence record`;
- mutate engineering-core guidance;
- perform ontology promotion;
- authorize a pilot, release, or production change.

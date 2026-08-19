---
summary: "Owner-local plan/materialize seam from pi.telemetry-review-snapshot.v1 to KES Proposal candidates and inert AK evidence handoffs."
read_when:
  - "Using or changing telemetry_learning_kes_adapter."
  - "Reviewing whether runtime telemetry may become a KES candidate or Agent Kernel evidence record."
system4d:
  container: "Package-owned integration contract between pi-telemetry observations, orchestrator KES, and optional AK evidence persistence."
  compass: "Turn bounded observations into reviewable candidates without converting measurements into authority."
  engine: "Validate snapshot -> evaluate predeclared trigger -> plan -> explicit materialize -> optional authorized AK record -> owner review."
  fog: "The failure mode is auto-promoting a threshold, KES artifact, or AK row into claim truth or shared doctrine."
---

# Telemetry review to KES adapter

`telemetry_learning_kes_adapter` consumes exactly one validated `pi.telemetry-review-snapshot.v1` file and evaluates one predeclared metric trigger. It defaults to `plan`. `materialize` writes one package-owned KES diary and one candidate-only learning only when the metric sample, coverage policy, and threshold all pass.

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

The caller supplies:

- the snapshot path;
- one v1 metric key;
- threshold and comparison;
- minimum sample size;
- coverage policy and minimum live-event count;
- an owner-authored candidate claim;
- falsification condition;
- review trigger;
- retirement signal.

The default `live-required` policy accepts live-only or mixed windows only when the minimum number of measured-live events is present. `any-observed` is an explicit owner decision to permit backfill-only or otherwise non-live observations. The distinction remains visible in the KES candidate and AK handoff.

## Runtime dependency

The adapter loads `@tryinget/pi-telemetry/review-snapshot` only when invoked. The orchestrator remains loadable without the telemetry package, but invoking this tool without a linked or installed compatible telemetry package fails with an explicit diagnostic. This keeps the integration optional rather than turning the public orchestrator package into a mandatory telemetry collector.

## Materialization boundaries

Materialization uses the existing package-owned KES seam under:

- `diary/` for the validation capture;
- `docs/learnings/` for the candidate.

Snapshot paths and raw telemetry payloads are not copied into the public KES prose. The candidate binds the snapshot and source-event-set digests, window, coverage, selected metric, sample, and trigger result. Private runtime evidence can remain in Agent Kernel or the owner-controlled telemetry store.

## Non-goals

The adapter does not:

- infer a claim from telemetry automatically;
- establish causality;
- treat missing or expired telemetry as zero failures;
- merge live and backfilled coverage invisibly;
- create a global KES writer for other packages;
- execute `ak evidence record`;
- mutate engineering-core guidance;
- perform ontology promotion;
- authorize a pilot, release, or production change.

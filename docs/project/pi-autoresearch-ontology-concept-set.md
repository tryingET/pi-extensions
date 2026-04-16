---
summary: "Proposed and now implemented repo-local ontology seed for the governed pi-autoresearch capability in pi-extensions."
read_when:
  - "Before extending the pi-autoresearch ontology beyond its first repo-local seed."
  - "When deciding whether experiment-loop concepts should stay in pi-extensions/ontology or be promoted to softwareco/core."
system4d:
  container: "Root-level ontology design note for the pi-autoresearch capability inside the pi-extensions monorepo."
  compass: "Keep semantics at the smallest truthful scope first, then promote only the stable subset later."
  engine: "Reassess scope from first principles -> choose repo-local topology -> define the concept/relation seed -> define promotion rules."
  fog: "The main risks are promoting repo-specific semantics into company ontology too early, choosing IDs that create future churn, or leaving tooling inconsistent across repo-local and dedicated ontology layouts."
---

# Ontology concept set — `pi-autoresearch`

## Final decision

The first ontology seed for the `pi-autoresearch` capability should live in:

- **repo-local ontology at `pi-extensions/ontology/`**

not in:

- `softwareco/ontology`

This was corrected after a first pass landed concepts in the company overlay and the topology was re-evaluated from first principles.

---

## First-principles reasoning

## What problem the ontology is solving

The ontology is not trying to model all experiment semantics for all of `softwareco` yet.
It is trying to make one emerging capability inside one monorepo governable:

- benchmarked optimization campaigns
- local experiment sessions
- individual measured runs
- benchmark metrics
- optimization hypotheses
- benchmark harnesses
- correctness gates
- durable receipts
- finalization groups

Those semantics are currently needed because `pi-autoresearch` is being designed and incubated inside `pi-extensions`.

## Smallest truthful scope

The smallest truthful scope is therefore:

- **repo scope**

Why:

1. the capability is currently specific to this repo and its package family
2. the monorepo already has an intended repo-local ontology home at `ontology/`
3. the semantics are not yet proven broad enough for the company overlay
4. promoting too early would turn an implementation-incubation concern into a company-wide contract prematurely

## Why company scope was the wrong first landing

Putting the first seed in `softwareco/ontology` would have created these second-order effects:

- other repos could begin depending on concepts that are not yet stable
- package or command renames inside `pi-extensions` would force wider ontology churn
- the company ontology would absorb repo-specific semantics too early
- future promotion would become harder because the first landing already widened authority unnecessarily

## Why repo-local ontology is better

Repo-local ontology keeps the semantic blast radius bounded:

- concepts stay close to the implementation wave
- the monorepo root can validate them in its own ROCS flow
- package work can consume them without implying company-wide adoption
- later promotion remains available if reuse is proven

---

## Topology decision

## Repo-local layout

The correct topology for this repo is:

- `ontology/manifest.yaml`
- `ontology/index.md`
- `ontology/src/system4d.yaml`
- `ontology/src/reference/concepts/*.md`
- `ontology/src/reference/relations/*.md`
- `ontology/src/bridge/mapping.yaml`

This matches:

- the monorepo root README / AGENTS structure
- the repo-local project template layout
- the root CI expectation in `scripts/ci/full.sh`

## Important tooling note

During the correction work, I also confirmed a real tooling issue:

- `pi-ontology-workflows` could already **resolve** dedicated company ontology repos with root `manifest.yaml`
- but its writer path logic still assumed nested `ontology/src/...`

That mismatch has now been fixed in package source and covered by tests.

---

## Naming decision

## Namespace

Use repo-local IDs under:

- `pi.extensions.*`

### Why this namespace

- it is stable relative to the monorepo identity
- it avoids pretending the concepts are already company-wide (`co.software.*`)
- it keeps room for other repo-local capabilities beyond `pi-autoresearch`
- it preserves a clean promotion path later

### Why not `co.software.*`

That would incorrectly signal company-overlay scope.

### Why not `pi.extensions.autoresearch.*`

That would be narrower than necessary.
The current concepts name a generic experiment-loop semantic layer that begins with `pi-autoresearch` but may remain useful even if the package or command surface broadens later.

---

## Implemented concept set

These concepts are now the first repo-local seed:

1. `pi.extensions.ExperimentCampaign`
2. `pi.extensions.ExperimentSession`
3. `pi.extensions.ExperimentRun`
4. `pi.extensions.BenchmarkMetric`
5. `pi.extensions.OptimizationHypothesis`
6. `pi.extensions.BenchmarkHarness`
7. `pi.extensions.CorrectnessCheck`
8. `pi.extensions.ExperimentReceipt`
9. `pi.extensions.FinalizationGroup`

## Implemented relation set

1. `pi.extensions.rel.belongs_to_campaign`
2. `pi.extensions.rel.belongs_to_session`
3. `pi.extensions.rel.tracks_metric`
4. `pi.extensions.rel.tests_hypothesis`
5. `pi.extensions.rel.uses_harness`
6. `pi.extensions.rel.guarded_by_check`
7. `pi.extensions.rel.emits_receipt`
8. `pi.extensions.rel.groups_run`

These relation IDs intentionally keep repo-local labels while avoiding collisions with other layers.

---

## What each concept means

## `pi.extensions.ExperimentCampaign`
A bounded optimization effort against a defined benchmark target, explicit scope, and explicit success criterion.

Most natural alignment:
- AK task or task family
- durable identity of the campaign

## `pi.extensions.ExperimentSession`
A local working session or branch-anchored execution stream inside an experiment campaign that accumulates receipts, notes, and benchmark configuration.

Most natural alignment:
- `autoresearch.jsonl`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- branch-local runtime state

## `pi.extensions.ExperimentRun`
One measured iteration inside an experiment session that records the attempted change, metric result, and disposition.

Most natural alignment:
- one `run_experiment` + `log_experiment` cycle

## `pi.extensions.BenchmarkMetric`
A named optimization metric definition, including unit and direction of improvement.

Most natural alignment:
- `total_ms`
- `bundle_kb`
- `compile_ms`
- other structured metric definitions

## `pi.extensions.OptimizationHypothesis`
An explicit claim about why a particular change should improve a benchmark outcome.

Most natural alignment:
- hypothesis / ASI / reasoning attached to a run

## `pi.extensions.BenchmarkHarness`
The reproducible executable benchmark surface used to evaluate runs.

Most natural alignment:
- `autoresearch.sh`
- or any future equivalent benchmark harness

## `pi.extensions.CorrectnessCheck`
A correctness or backpressure gate that constrains what outcomes may be kept.

Most natural alignment:
- `autoresearch.checks.sh`
- tests / typecheck / lint / invariant gates

## `pi.extensions.ExperimentReceipt`
A durable machine-readable record of one experiment run or session event.

Most natural alignment:
- JSONL receipt entries
- future signed/local receipts

## `pi.extensions.FinalizationGroup`
A bounded grouping of retained experiment runs or retained changes that should be reviewed and landed together.

Most natural alignment:
- kept-run grouping for review branches / mergeable changesets

---

## Why this is the smallest truthful set

This set is intentionally between two failure modes.

### Failure mode A — under-modeling
If we only model one generic experiment concept, we lose the distinction between:

- campaign
- local session
- run
- receipt
- finalization output

### Failure mode B — over-modeling
If we model every numeric observation, every status transition, every continuation object, and every report artifact up front, the ontology gets ahead of the implementation and becomes noisy.

### Chosen balance
This seed captures the main semantic layers without over-committing to later detail.

---

## Concepts explicitly deferred

The following are intentionally deferred for now.

### Metric observations as first-class ontology objects
Reason: raw numeric observations can remain inside receipts for the first slice.

### Keep/discard/crash/checks_failed as ontology objects
Reason: these are important statuses, but they do not yet need object-level semantics.

### Generic cross-domain evidence ontology
Reason: `ExperimentReceipt` is enough for the first slice and avoids widening scope.

### Prompt-continuation ontology
Reason: that belongs more naturally to Prompt Vault / prompt-plane follow-on work.

---

## Promotion rules

## Promote to `softwareco/ontology` when

- the same semantics are clearly useful across multiple softwareco repos
- the names and boundaries are stable beyond `pi-extensions`
- at least one second repo would be clearer by using the same concepts

## Promote to core when

- the semantics are stable across companies, not just across softwareco repos
- the concepts remain valuable even when the surrounding Pi/package context is removed

## Stay repo-local when

- the semantics are still tightly coupled to `pi-extensions`
- package and control-plane work is still evolving quickly
- promotion would widen authority faster than reuse justifies

---

## Verification status

This repo-local ontology seed is now implemented and verified through:

- repo-local ontology bootstrap under `pi-extensions/ontology/`
- ROCS validate/build at repo root
- `ontology_inspect` status for repo scope
- `ontology_inspect` pack retrieval for `pi.extensions.ExperimentCampaign`
- `pi-ontology-workflows` tests covering:
  - repo-local nested ontology layout
  - dedicated root-layout ontology repos

---

## Bottom line

The right first ontology move for `pi-autoresearch` was **not** company scope.

It was:

> land a small, repo-local, promotion-friendly experiment-loop ontology in `pi-extensions/ontology/`, fix the layout tooling seam, and only promote later if reuse proves it.

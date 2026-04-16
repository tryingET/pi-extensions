---
summary: "Session diary for proposing the ontology concept set for the future pi-autoresearch capability."
read_when:
  - "Reviewing the evidence and reasoning behind the proposed co.software experiment-loop concepts."
  - "Before turning the pi-autoresearch ontology proposal into actual ontology_change apply calls."
system4d:
  container: "Repo-root diary capture for the pi-autoresearch ontology-seeding follow-up."
  compass: "Keep the ontology proposal small, company-scoped, and aligned with the earlier problem statement and RFC."
  engine: "Inspect current ontology coverage -> identify missing experiment-loop nouns -> choose candidate concept IDs and relation labels -> record the proposal."
  fog: "The main risk is either leaving the domain unmodeled or over-modeling every runtime detail before the package exists."
---

# Session diary — pi-autoresearch ontology concept set

## Goal
Execute step 2 from the recommended next slices:

- propose the ontology concept set for the future `pi-autoresearch` capability

## AK context
- task: `#1362` — `Propose pi-autoresearch ontology concept set`

## Inputs used
- `docs/project/pi-autoresearch-integration-analysis.md`
- `docs/project/pi-autoresearch-problem-description.md`
- `docs/project/pi-autoresearch-rfc.md`

## Tooling checks performed
- `ontology_inspect({ kind: "status", scope: "company" })`
- `ontology_inspect({ kind: "search", scope: "company", query: ... })` for:
  - experiment
  - metric
  - session
  - evidence
  - hypothesis
- `ontology_inspect({ kind: "search", scope: "core", query: ... })` for the same relevant nouns

Result:
- no relevant hits in company or core scope for the experiment-loop domain

## Additional grounding
Inspected the current company ontology files and confirmed it is still very small and uses company-scoped IDs like:

- `co.software.Service`
- `co.software.SLO`
- `co.software.Incident`

That reinforced the decision to propose the new set in company scope first.

## Dry-run planning
Used `ontology_change(..., mode="plan")` for representative items.

Accepted candidate concepts:
- `co.software.ExperimentCampaign`
- `co.software.ExperimentRun`
- `co.software.BenchmarkMetric`
- `co.software.FinalizationGroup`

Accepted candidate relations:
- `tests_hypothesis`
- `emits_receipt`

No apply was performed.

## Final proposal summary
Proposed concepts:
1. `co.software.ExperimentCampaign`
2. `co.software.ExperimentSession`
3. `co.software.ExperimentRun`
4. `co.software.BenchmarkMetric`
5. `co.software.OptimizationHypothesis`
6. `co.software.BenchmarkHarness`
7. `co.software.CorrectnessCheck`
8. `co.software.ExperimentReceipt`
9. `co.software.FinalizationGroup`

Proposed minimal relations:
- `belongs_to_campaign`
- `belongs_to_session`
- `tracks_metric`
- `tests_hypothesis`
- `uses_harness`
- `guarded_by_check`
- `emits_receipt`
- `groups_run`

## Key design choice
Start in `co.software.*`, not `core.*`.

Reason:
- the capability is currently local to softwareco / pi-extensions
- current ontology coverage is missing the whole domain
- the first job is to govern this real implementation wave, not to universalize the vocabulary prematurely

## Output written
- `docs/project/pi-autoresearch-ontology-concept-set.md`

## Recommended next step
If accepted, the next move is to turn this proposal into actual `ontology_change apply` calls in company scope, then proceed to Prompt Vault template drafting against the approved concept set.

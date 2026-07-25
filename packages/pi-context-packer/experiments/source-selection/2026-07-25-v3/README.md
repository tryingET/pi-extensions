---
summary: "Pre-ranking index for the v3 source-selection refinement experiment."
read_when:
  - "Implementing or reviewing the v3 positive-evidence and eligibility-cost experiment."
type: "reference"
system4d:
  container: "Pre-ranking evidence index for one fresh source-selection refinement experiment."
  compass: "Keep treatment and cost gates frozen before fresh cases or rankings exist."
  engine: "Preregister -> review -> author cases -> prepare -> review -> rank once -> decide."
  fog: "A treatment prototype or bounded-output probe can be mistaken for production adoption evidence."
---

# Source-selection refinement experiment — 2026-07-25 v3

## Current state

**Pre-ranking case-review gate. Fifty fresh candidate cases exist; no prepared input, rankings, result, or adoption decision exists. Preparation remains blocked until independent case/truth review accepts every repository.**

The v2 owner decision was **REFINE**, with automatic `source-list` invocation and production wiring still **REJECTED**. V3 is a fresh non-production experiment under AK task `4207`; it does not rerun or overwrite v2.

Canonical preregistration:

- `../../../docs/project/2026-07-25-source-selection-refinement-preregistration.md`
- independent preregistration review: `dispatch-1784989187975` — ACCEPT after exact cost formulas were frozen

Candidate case source:

- `canonical-case-source.generated.json`
- SHA-256: `d2a19efd67058d54d250371860a2ec08af07eebc744a393dff00600b9f6cd6e5`
- 5 repositories / 50 cases / 50 unique normalized questions / 50 unique truth sets
- deterministic exact-commit validator: `validate-cases.mjs`
- authoring sessions: `dispatch-1784989778336`, `dispatch-1784989778336-1`, `dispatch-1784989778337`, `dispatch-1784989778338`, `dispatch-1784989778339`

Case authors did not inspect rankings or compute scores. Their proposals are not accepted truth until independent review.

## Frozen hypothesis

The existing source-list treatment always fills `maxItems`, including deterministic path-ordered candidates after remaining candidates have zero path and metadata evidence. V3 preregisters one primary revision:

```text
source_list_positive:
  preserve existing tokenization, scores, ordering, universe, and maxItems
  retain only candidates with pathScore + metadataScore >= 1
  never backfill zero-evidence candidates
  permit underfill or empty selection
```

`source_list_full` preserves v2-style behavior as a comparator. `paths` remains the adoption baseline. SCI structural and fusion arms remain diagnostics and cannot substitute for the primary source-list gate.

## Separate eligibility-cost question

V3 also measures the existing `source-list.v1` page contract with `--page 1 --page-size 100 --json`. The owner implementation performs complete inventory/metadata work before slicing output, so this is a bounded-output observation—not a claimed low-cost production preflight.

Automatic invocation remains rejected unless the preregistered quality and eligibility/cost gates both pass.

## Frozen repositories

| Repository | Commit | Planned cases | Initial role; preparation revalidates coverage |
|---|---|---:|---|
| agent-scripts | `36792de9195c86e6e8ae521efb5c952492278088` | 10 | small eligible |
| engineering-core | `f084fcc4981339893c302e13c8266313233a0e2b` | 10 | small eligible |
| DSPx | `326b2a555aac9f24ff54afcfd4adc87293b5218f` | 10 | large eligible |
| pi-extensions | `61ef4d2874e8ed3807667ae9edbc2e8c262575d5` | 10 | large ineligible control |
| agent-kernel | `8b9264a4032a79ff2194b6413de62f9ca410385c` | 10 | large ineligible control |

No metadata changes or cohort replacement are allowed after case authoring.

## Stage gates

1. Commit preregistration, treatment code, tests, and this index — complete.
2. Independent review accepts the frozen treatment and cost interpretation — complete.
3. Author 50 fresh cases with no v2 per-case ranking leakage — candidate set complete.
4. **Now:** independent reviewers accept or reject questions and truth before preparation.
5. Prepare new exact artifacts without retaining or printing rankings only after step 4 passes.
6. Commit strict pre-run hashes while the result path is absent.
7. Independent pre-run review accepts integrity and population.
8. Execute exactly once through the explicit ranking gate.
9. Independently review arithmetic and record `ADOPT`, `REFINE`, or `REJECT`.

## Non-authorizations

This directory currently authorizes no preparation, ranking, production wiring, provider registration, metadata editing, source-owner mutation, SCI expansion, or result claim. Passing a future experiment would still require a separate production task.

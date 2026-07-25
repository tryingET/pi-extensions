---
summary: "Preregistration for a fresh non-production source-selection refinement experiment targeting zero-evidence backfill and eligibility cost."
read_when:
  - "Implementing or reviewing the v3 source-selection REFINE experiment."
  - "Evaluating whether automatic source-list invocation has new evidence."
type: "reference"
system4d:
  container: "Fresh confirmatory source-selection experiment after the v2 REFINE decision."
  compass: "Reduce unnecessary selections without outcome leakage and price eligibility before any automatic invocation claim."
  engine: "Freeze treatment and gates -> author fresh cases -> independent review -> prepare evidence -> rank once -> decide."
  fog: "Visible v2 outcomes, zero-evidence backfill, and output pagination can be mistaken for a validated production policy."
---

# Source-selection refinement preregistration — 2026-07-25 v3

## Status and authority

This is a **new non-production experiment** under AK task `4207`. It follows the v2 owner decision to **REFINE** while continuing to **REJECT automatic `source-list` invocation and production wiring**.

This document freezes the treatment, populations, metrics, gates, and execution sequence **before fresh v3 questions or truth sets are authored**. It does not authorize ranking, provider registration, runtime wiring, metadata edits, SCI expansion, Agent Scripts changes, or production invocation.

Owner boundaries remain unchanged:

- Agent Scripts owns the factual `source-list.v1` provider and authored metadata grammar.
- Semantic Code Intelligence owns structural-evidence behavior.
- pi-context-packer owns this experiment's consumer ranking, cost interpretation, metrics, and decision.
- AK owns task/evidence lineage.
- FCOS is not reopened for this bounded experiment; a future cross-owner coordination need would require a new native item.

## Prior evidence and confirmatory posture

The v2 aggregate showed:

- precision delta `+0.106667` — passed;
- unnecessary-selection reduction `16.0494%` — failed the required `20%` gate;
- omission delta `-0.433333` per case — passed.

Only published v2 aggregate facts motivate this hypothesis. V3 case authors, reviewers, and implementers must not use v2 per-case rankings, selected paths, score distributions, or error cases to choose thresholds, weights, stop words, budgets, questions, or truth.

V3 is confirmatory only on fresh cases. Changed cases, truth, repository snapshots, producer artifacts, or evaluator bytes form a new experiment and may not be merged with v2 denominators.

## Frozen repository population

Each declared repository receives exactly 10 fresh, distinct, independently reviewed maintenance intents and truth sets.

| Repository | Frozen commit | Role expected from pre-case factual coverage observation |
|---|---|---|
| agent-scripts | `36792de9195c86e6e8ae521efb5c952492278088` | small metadata-eligible repository |
| engineering-core | `f084fcc4981339893c302e13c8266313233a0e2b` | small metadata-eligible repository |
| DSPx | `326b2a555aac9f24ff54afcfd4adc87293b5218f` | large metadata-eligible repository |
| pi-extensions | `61ef4d2874e8ed3807667ae9edbc2e8c262575d5` | large honest metadata-ineligible control |
| agent-kernel | `8b9264a4032a79ff2194b6413de62f9ca410385c` | large honest metadata-ineligible control |

Eligibility is not assumed from this table. Preparation must run and retain the exact full `source-list.v1` artifact, derive coverage as `present / totalCount`, and fail closed on producer or validation error. The positive treatment population requires at least three independently owned repositories at coverage `>= 60%`; both declared controls remain visible regardless of their observed coverage.

No repository metadata may be edited for this experiment. No repository may be silently replaced after case authoring. A missing commit, producer failure, coverage surprise, or insufficient eligible population makes preparation or the decision insufficient; it does not authorize cohort shopping.

## Pinned producer posture

Preparation must pin and record raw bytes, version output, executable hashes, repository refs, Git index/state observations, and cleanup evidence.

Current preregistration pins:

- Agent Scripts `source-list.mjs` SHA-256: `bf9234a9f797be23e808ed852a1806aae07078363e669b59d17ba7defd8f0c01`.
- Node SHA-256: `307ecf7726e330e53d68df6698c8a44f4799dfde9607104a3793448e896c9ce6`.
- Git SHA-256: `bb6007e89e15dad35cf623a203db26dde9e042cb2df844320055cad3cd2eb5d0`.
- SCI revision: `518d7cf473d5e9bd2c7c0b962d062adec300375d`.
- SCI executable SHA-256: `a93a54c7363151e9c87eced3381d97a39bf735d514e6bd272540dbac3d3c51ae`.
- ast-grep SHA-256: `5cdd704eab6a0e390d93f30b951ab0f5eafae81c7ebb119277f12be2c7995d58`.

Hashes establish integrity, not authentication. Preparation must retain the same trust, state-path, `.ontology`, process-group cleanup, and source-owner limitations as v2.

## Frozen selection treatment

### Existing comparator

`source_list_full` preserves v2 behavior: rank every candidate by the existing path and metadata scores, then select exactly `maxItems`, including deterministic path-ordered candidates when all remaining evidence scores are zero.

### Sole primary revision

`source_list_positive` uses the same:

- query tokenization and stop words;
- path and metadata score weights;
- candidate universe;
- source-list eligibility threshold;
- UTF-8 tie-breaking;
- case `maxItems` budget.

It changes only the final fill rule:

```text
positiveEvidence = pathScore + metadataScore
retain candidates where positiveEvidence >= 1
preserve existing source-list ordering
select at most maxItems
never backfill zero-evidence candidates
permit underfill or an empty selection
```

The threshold `1` is frozen from the existing integer score grammar: it means at least one exact query-token match in path or authored metadata. It was not chosen from v2 per-case outcomes. No alternate threshold or treatment may be promoted after rankings are visible.

### Arms

V3 retains these arms under identical candidate universes and per-case budgets:

1. `paths` — existing path-only control;
2. `source_list_full` — unchanged v2-style source-list comparator;
3. `source_list_positive` — sole primary refinement treatment;
4. `structural` — SCI diagnostic;
5. `fusion_full` — unchanged v2-style fusion diagnostic.

Structural and fusion results cannot substitute for the `source_list_positive` gate.

## Fresh-case contract

After this preregistration is committed and independently accepted:

- author exactly 10 fresh cases per repository, 50 total;
- use maintenance questions that are semantically distinct from all v2 normalized questions and truth sets;
- select truth only from the frozen Git-tracked source universe;
- keep questions, truth, and `maxItems` independent of all ranking outputs and score histograms;
- require unique case IDs, normalized questions, normalized intents, and canonical truth sets;
- retain the raw authored case source and a deterministic generated projection;
- obtain independent semantic review for every repository before preparation;
- reviewers may inspect source and truth but must not inspect rankings or treatment score distributions.

Truth is used only after selection to compute metrics.

## Quality metrics and conjunctive gates

Primary adoption evidence is the equal-repository macro over the `paths` and `source_list_positive` available intersection for metadata-eligible repositories.

All gates are conjunctive:

1. at least 3 independently owned metadata-eligible repositories;
2. exactly 10 reviewed cases per declared repository;
3. equal-repository macro precision delta versus `paths` `>= +0.10`;
4. unnecessary-selection reduction versus `paths` `>= 20%`, using
   `(pathsMacroUnnecessary - treatmentMacroUnnecessary) / pathsMacroUnnecessary`;
5. the paths unnecessary baseline must be strictly positive; zero means `not demonstrated`;
6. equal-repository omissions versus `paths` do not increase;
7. no individual eligible repository has an omission increase versus `paths`;
8. `zeroEvidenceSelectedCount == 0` for `source_list_positive`;
9. versus `source_list_full`, the positive treatment has strictly fewer unnecessary selections, no omission increase, and no precision decrease;
10. all eligible treatment cases are available; unavailable cases remain explicit denominators.

Report, without substituting for gates:

- macro recall;
- selected items per case;
- unused capacity per case;
- underfilled-case rate;
- empty-selection rate;
- positive-evidence candidate count;
- per-repository and pooled totals;
- all-arm diagnostic comparisons.

Passing quality gates does not self-authorize automatic invocation or wiring.

## Eligibility and invocation-cost study

### Full baseline

For each repository, retain one exact ranking artifact from:

```bash
node <pinned-source-list.mjs> --repo . --full-list --json
```

Measure producer duration, stdout/stderr/total bytes, parser/validation duration, Git/state corroboration duration, exact retained bytes, and `ceil(bytes/4)` only as a disclosure proxy.

### Bounded-output probe

Measure the existing contract only:

```bash
node <pinned-source-list.mjs> --repo . --page 1 --page-size 100 --json
```

The current owner implementation inventories and reads metadata for the complete supported Git-tracked population before output slicing. Therefore this probe is **not preregistered as an I/O or producer-work preflight**. It measures bounded transport/output and whether the first 100 canonical records can prove an exact eligibility result.

For full-baseline total `N`, threshold `H = ceil(0.60 * N)`, page-present count `P`, and page non-present count `A`:

```text
eligible   if P >= H
ineligible if A > N - H
unknown    otherwise
```

Errors, malformed envelopes, duplicates, mismatched total counts, target drift, or bounds become `unknown`. Page records never replace the full ranking artifact.

Run five deterministic AB/BA fresh-subprocess pairs per repository. Separate first and repeated observations. Do not call them cache-cold unless the environment proves cache control.

### Cost gates for automatic-invocation evidence

Automatic invocation remains rejected unless all of these are demonstrated:

1. zero false-eligible and zero false-ineligible probe decisions;
2. conclusive probe decisions for every declared repository, including both large ineligible controls and the large eligible repository;
3. equal-repository macro ineligible policy-cost reduction `>= 20%` versus the full baseline;
4. equal-repository macro eligible policy tax `<= 10%`;
5. no hidden full invocation is charged outside the policy denominator;
6. output, retained-evidence, and model-input bytes are reported separately;
7. staleness, executable identity, trust, and maintenance obligations are independently reviewed.

Because the existing page mode performs full inventory work, failure or `unknown` on these gates is expected to remain honest evidence. It must not be reclassified as a successful preflight or used to request production wiring.

## Preparation and execution freeze

The experiment must use the v2 safety architecture with new v3 bytes:

1. commit this preregistration, the treatment implementation, tests, and a reproduction index;
2. obtain independent preregistration/treatment review;
3. author fresh cases and obtain independent pre-ranking review;
4. prepare exact source-list, probe-cost, Git, SCI, trace, and cleanup evidence without retaining or printing rankings;
5. commit the complete prepared input, strict allowlist, hashes, and preparation summary while the result path is absent;
6. obtain an independent pre-run integrity review;
7. execute the frozen prepared bytes exactly once through an explicit `--execute-ranking` gate;
8. refuse an existing result path;
9. independently recompute arithmetic and review result/cost/staleness limitations;
10. record an explicit `ADOPT`, `REFINE`, or `REJECT` owner decision.

Any failed, timed-out, aborted, or effect-indeterminate ranking attempt forbids mechanical retry. Changed inputs or evaluator bytes require a new experiment identity.

## Decision matrix

- Quality gate fails: `REFINE` or `REJECT`; automatic invocation and wiring remain rejected.
- Quality passes but eligibility/cost gate fails or is unknown: `REFINE`; automatic invocation and wiring remain rejected.
- Both quality and eligibility/cost gates pass: an owner may record `ADOPT`, but implementation still requires a separate bounded production task and fresh review.
- Integrity, population, or review gate fails: no decision from the result; repair requires new frozen bytes.

## Non-authorizations

This preregistration does not authorize:

- production provider registration or automatic invocation;
- metadata authoring or tuning;
- changes to Agent Scripts, SCI, or source-owner repositories;
- source-list or SCI semantic expansion;
- treating page output as a partial full artifact;
- using structural/fusion diagnostics to rescue source-list adoption;
- ranking before the frozen preparation and independent review gates;
- rerunning v2 or overwriting any result;
- an implementation task based solely on passing metrics.

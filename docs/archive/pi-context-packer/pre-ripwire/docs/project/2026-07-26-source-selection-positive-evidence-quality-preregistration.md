---
summary: "Preregistration for a new quality-only v4 test of positive-evidence source selection after v3 was rejected before ranking."
read_when:
  - "Implementing or reviewing the v4 quality-only source-selection experiment."
  - "Checking whether v3 artifacts may be reused without reviving automatic invocation claims."
type: "reference"
system4d:
  container: "Fresh quality-only experiment identity after the unranked v3 integrity rejection."
  compass: "Test zero-evidence backfill removal once without laundering invalid cost evidence or authorizing production wiring."
  engine: "Preregister reuse and closure -> review -> freeze new prepared bytes -> review -> create attempt sentinel -> rank once -> decide."
  fog: "Unranked producer evidence can be useful, but v3 cost observations and prepared bytes cannot become confirmatory v4 evidence by relabeling."
---

# Positive-evidence source-selection quality preregistration — 2026-07-26 v4

## Status and authority

This document proposes a **new experiment identity**, `2026-07-26-v4`, under AK task `4207`. V3 was independently **REJECTED before ranking** by `dispatch-1785039595040`; no v3 ranking or result exists.

V4 is quality-only. Automatic `source-list` invocation and production wiring remain **REJECTED and out of scope**. V4 cannot produce `ADOPT` for automatic invocation, provider registration, or production wiring. It does not repair v3, reuse its cost denominators, or convert v3 observations into confirmatory cost evidence.

Owner boundaries remain unchanged: Agent Scripts owns the factual inventory contract; SCI owns unordered structural evidence; pi-context-packer owns ranking and quality metrics; AK owns execution/evidence lineage.

## Frozen question

Does the preregistered `source_list_positive` treatment reduce unnecessary selections while preserving or improving precision and omissions relative to `paths` and the unchanged `source_list_full` comparator?

The sole primary treatment remains:

```text
positiveEvidence = pathScore + metadataScore
retain candidates where positiveEvidence >= 1
preserve existing source-list ordering
select at most maxItems
never backfill zero-evidence candidates
permit underfill or an empty selection
```

Tokenization, stop words, score weights, candidate universes, UTF-8 tie-breaking, and case budgets remain unchanged. No alternate threshold or treatment may be promoted after rankings are visible.

## Explicit disposition of v3

V3 remains a frozen unranked rejection record. Its blockers are not repaired in place:

1. a discarded collector attempt exhausted the exactly-five cost-execution budget;
2. imported evaluator dependencies were not checksum-bound;
3. one-shot enforcement was bypassable and lacked a durable pre-evaluation sentinel; and
4. pooled totals were absent.

V4 removes the cost study entirely rather than recollecting or selecting replacement cost observations. The v3 retained cost artifact may be cited only as invalidated exploratory/audit material and must not enter v4 prepared input, metrics, gates, or decision arithmetic.

## Frozen repositories and cases

V4 proposes to reuse the 50 v3 case definitions because they have **never been ranked, scored, or exposed to a selection output**. They remain fresh relative to v2 and retain their independent semantic reviews.

| Repository | Frozen commit | Cases | Quality role |
|---|---|---:|---|
| agent-scripts | `36792de9195c86e6e8ae521efb5c952492278088` | 10 | metadata-eligible primary |
| engineering-core | `f084fcc4981339893c302e13c8266313233a0e2b` | 10 | metadata-eligible primary |
| DSPx | `326b2a555aac9f24ff54afcfd4adc87293b5218f` | 10 | metadata-eligible primary |
| pi-extensions | `61ef4d2874e8ed3807667ae9edbc2e8c262575d5` | 10 | honest ineligible diagnostic control |
| agent-kernel | `8b9264a4032a79ff2194b6413de62f9ca410385c` | 10 | honest ineligible diagnostic control |

Proposed canonical case bytes:

```text
d2a19efd67058d54d250371860a2ec08af07eebc744a393dff00600b9f6cd6e5  canonical-case-source.generated.json
```

Reuse is lawful only if an independent preregistration reviewer confirms all of the following before v4 preparation:

- no v3 result or attempt sentinel exists;
- no reviewer or implementer inspected v3 rankings or treatment score distributions;
- questions, truth, patterns, paths, `maxItems`, repositories, and commits are byte-for-byte unchanged;
- case-review dispatches remain applicable; and
- reuse does not introduce outcome leakage.

Any case change requires a new hash and fresh repository-specific semantic review.

## Producer-evidence reuse boundary

V4 may reuse only these v3 **pre-ranking producer observations** after exact validation:

- the five retained full `source-list.v1` artifacts and tracked-path evidence;
- metadata-staleness samples accepted by `dispatch-1785037127241`, `dispatch-1785037127242`, `dispatch-1785037127243`, `dispatch-1785037127243-1`, and `dispatch-1785037127244`; and
- the 50 complete SCI receipts, execution observations, and trace/cleanup evidence embedded in the uncompressed v3 prepared input identified by SHA-256 `cb5e2a8f4c6799c07ff2ff988ab03c58e4b7bbcb2c878dd6313a5ffaefa6a94f` and trace bundle SHA-256 `48270861e414bb2f92fc9963e4dc87dad7c7d44919473708fd25740d363639a8`.

Reuse avoids unnecessary source-owner execution and does not reuse rankings because none exists. V4 must extract and validate those observations into **new v4 prepared bytes** after this preregistration is independently accepted. V4 prepared input must exclude the v3 cost study entirely.

Fail closed on any hash, commit, candidate-universe, receipt, trace, cleanup, staleness, or source-state mismatch. No producer may be rerun selectively to replace a failed reused observation. A reviewer may require fresh all-or-nothing producer preparation under another identity instead.

## Arms and availability

V4 freezes five arms under identical per-case candidate universes and budgets:

1. `paths` — path-only control;
2. `source_list_full` — unchanged full-fill comparator;
3. `source_list_positive` — sole primary treatment;
4. `structural` — unordered SCI diagnostic;
5. `fusion_full` — unchanged fusion diagnostic.

Primary gates use only `paths` and `source_list_positive` on the equal-repository macro over the metadata-eligible available intersection. Structural/fusion arms and ineligible controls cannot rescue the primary gate.

## Frozen quality gates

All gates are conjunctive:

1. at least three independently owned metadata-eligible repositories;
2. exactly 10 reviewed cases per declared repository and 50 total;
3. all eligible treatment cases available;
4. equal-repository macro precision delta versus `paths` `>= +0.10`;
5. paths mean-repository unnecessary-per-case baseline strictly positive;
6. unnecessary-selection reduction versus `paths` `>= 20%`, using `(pathsMacroUnnecessary - treatmentMacroUnnecessary) / pathsMacroUnnecessary`;
7. equal-repository omissions versus `paths` do not increase;
8. no individual eligible repository has an omission increase;
9. `zeroEvidenceSelectedCount == 0`;
10. versus `source_list_full`, the treatment has strictly fewer unnecessary selections, no omission increase, and no precision decrease.

Report without substituting for gates:

- macro recall;
- selected items, unused capacity, positive-evidence candidates, underfilled cases, and empty selections;
- per-repository summaries;
- pooled totals across available eligible cases for every arm;
- equal-repository macros; and
- all-arm diagnostic comparisons.

Truth is applied only after selections are frozen in memory for each case.

## Complete evaluator closure

The pre-review and final checksum allowlists must bind every experiment file and every imported evaluator/preparation dependency, including the complete transitive closure of `src/source-selection-experiment-*.js` modules. The final run must refuse any unlisted, missing, duplicate, symlinked, or hash-mismatched dependency.

The prepared input, evaluator closure, allowlist, and final checksum bytes are frozen before ranking. Any evaluator or metric change after prepared-byte construction requires a new experiment identity.

## One-shot execution architecture

V4 must expose exactly one authorized execution command with fixed input, result, review, manifest, and sentinel paths. No standalone CLI may accept arbitrary input or output paths.

The authorized runner must:

1. verify the final strict checksum manifest and independent `ACCEPT` review;
2. refuse an existing result or attempt sentinel;
3. atomically create a durable attempt sentinel with exclusive-create semantics **before** decompressing input or calling the evaluator;
4. use only fixed canonical paths;
5. execute evaluation in the same gated process or through a non-CLI internal function with no alternate output path;
6. write the canonical result with exclusive-create semantics; and
7. never delete or overwrite the attempt sentinel.

A failed, timed-out, aborted, or effect-indeterminate attempt leaves the sentinel and permanently forbids mechanical retry under v4.

## Preparation and review sequence

1. Commit this preregistration and a v4 index while v4 prepared input, sentinel, and result are absent.
2. Obtain independent acceptance of case/evidence reuse, quality gates, closure requirements, pooled totals, and one-shot design.
3. Implement the evaluator and preparation harness without ranking.
4. Extract and validate exact reusable producer evidence into new v4 prepared bytes; do not include v3 cost observations.
5. Commit prepared bytes, complete closure hashes, and a strict pre-review manifest while sentinel and result are absent.
6. Obtain independent pre-run integrity review.
7. Add the accepted review to the final manifest and resume independent verification of the exact final bytes.
8. Execute the fixed authorized runner exactly once. The attempt sentinel is created before evaluation.
9. Independently recompute quality arithmetic and record `REFINE` or `REJECT`.

`ADOPT` is not available because automatic invocation and production wiring are outside v4 authority. A passing quality result supports `REFINE` with stronger treatment evidence only; production implementation would still require a separate owner decision and task after valid cost evidence from another experiment.

## Non-authorizations

V4 does not authorize cost recollection, automatic invocation, provider registration, production wiring, metadata changes, source-owner mutation, new SCI semantics, cohort shopping, truth changes, score inspection before the one shot, v3 ranking, or retry after a v4 attempt sentinel exists.

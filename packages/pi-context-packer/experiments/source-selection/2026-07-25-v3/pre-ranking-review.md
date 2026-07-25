---
summary: "Independent preregistration and fresh-case review receipts for the v3 source-selection refinement experiment."
read_when:
  - "Checking whether v3 may proceed from case authoring to evidence preparation."
type: "reference"
system4d:
  container: "Pre-ranking review membrane for the v3 treatment and 50 fresh cases."
  compass: "Accept questions and truth without exposing rankings or score distributions."
  engine: "Review preregistration -> revise formulas -> review each repository -> revise truth -> accept."
  fog: "Author proposals, exact-path existence, or self-consistent validators can be mistaken for independent semantic truth review."
---

# V3 pre-ranking review

## Gate result

**ACCEPT for evidence preparation. Ranking remains forbidden.**

The preregistered treatment/cost contract and all 50 fresh questions/truth sets have independent acceptance. No reviewer inspected a v3 ranking, score distribution, selected-path output, prepared input, or result. None exists.

Accepted case-source SHA-256:

```text
d2a19efd67058d54d250371860a2ec08af07eebc744a393dff00600b9f6cd6e5  canonical-case-source.generated.json
```

The deterministic exact-commit validator reports 5 repositories, 50 cases, 50 unique IDs, 50 unique normalized questions, and 50 unique truth sets, with no exact v2 question/truth reuse.

## Preregistration review

Reviewer `dispatch-1784989187975` initially returned **REVISE** because the eligibility-cost gates did not define exact policy-cost and policy-tax formulas. Commit `dfb48b38ef977768fc04997c0a26b6901655426a` froze:

- non-overlapping runtime components;
- probe/full/policy formulas;
- eligible tax and ineligible reduction ratios;
- five deterministic AB/BA pairs;
- repository medians and equal-repository macros;
- first/repeated disclosure;
- missing, false, unknown, and non-positive-baseline treatment; and
- separate runtime, transport, retained-evidence, and model-input costs.

The resumed review returned **ACCEPT**. It also confirmed threshold `1` follows the existing integer score grammar, the treatment preserves source-list ordering and removes only zero-evidence backfill, SCI/fusion cannot rescue the primary gate, and page-size 100 is output-bounded but still full-inventory producer work.

## Repository case reviews

| Repository | Reviewer | Final result | Notes |
|---|---|---|---|
| agent-scripts | `dispatch-1784990517616` | ACCEPT | Initial REVISE added `cli-output.mjs` and `docs-list-inventory.mjs`; resumed review accepted all 10. |
| engineering-core | `dispatch-1784990517617` | ACCEPT | Initial REVISE corrected malformed-`package.json` wording and added `test_work_packet.py`; resumed review accepted all 10. |
| DSPx | `dispatch-1784990517618` | ACCEPT | All 10 exact-commit truth sets and patterns accepted on first review. |
| pi-extensions | `dispatch-1784990517618-1` | ACCEPT | All 10 fresh control cases accepted on first review using exact Git objects. |
| agent-kernel | `dispatch-1784990517619` | ACCEPT | Initial REVISE replaced an ambiguous Rust pattern; resumed review confirmed a unique match and accepted all 10. |

Case revision commit `f11dfb5893d41ed76c60cae3a8f832cf1f3a2281` contains the accepted corrections. Truth/search sets may contain 1–4 paths under the frozen `maxItems=4` budget.

## Reviewer boundaries

Reviewers:

- used exact frozen Git commits rather than dirty worktree contents;
- checked plausibility, semantic distinctness, necessary/sufficient truth, path existence, and structural pattern focus;
- compared only case identities/questions/truth against v2 for leakage prevention;
- did not inspect v2 per-case outcomes or any v3 rankings;
- did not compute scores;
- did not mutate source owners or experiment files.

Exact Git-object review and ast-grep matching support case validity; they do not authenticate author intent or predict ranking quality.

## Next legal move

Preparation may now:

1. revalidate full source-list coverage and exact candidate universes;
2. perform the frozen full/probe cost observations;
3. obtain actual SCI receipts and retained trace/cleanup evidence;
4. perform independent metadata-staleness review;
5. build a new immutable prepared input without retaining or printing rankings; and
6. stop for an independent pre-run integrity review.

Preparation must fail closed on snapshot, producer, coverage, case, trace, cleanup, or availability drift. It must not execute ranking. Any changed question, truth set, treatment, threshold, gate, cost formula, or repository snapshot requires a new experiment identity and review.

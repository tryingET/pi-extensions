---
summary: "Independent pre-run integrity rejection for the unranked v3 source-selection refinement experiment."
read_when:
  - "Checking whether v3 ranking is authorized or why a successor identity is required."
type: "reference"
system4d:
  container: "Independent integrity gate over frozen v3 prepared bytes before any ranking."
  compass: "Refuse ranking when execution budgets, evaluator closure, one-shot enforcement, or required metrics are unsound."
  engine: "Verify prepared surface -> audit safety and arithmetic -> accept or reject first ranking."
  fog: "Valid checksums and complete SCI receipts can be mistaken for lawful ranking authorization."
---

# V3 independent pre-run integrity review

Decision: **REJECT**

```text
review: dispatch-1785039595040
reviewed commit: 627b789877f11a59443bae652091a1feac4c11b8
rankingExecuted: false
resultAbsent: true
pre-review manifest: c7b5c14e827c698d97665c8ad255baa0f6cfa75d914d6fcf1e33bd3311e08a04
```

No ranking command, evaluator, or positive-treatment selection was executed during review. The canonical result remains absent.

## Blocking findings

1. **Exactly-five cost budget exhausted.** The discarded collector attempt completed its subprocess loop before finalization failed. The later retained five-pair set therefore replaced already executed observations, contrary to the preregistered “do not retry or replace” rule. This is inadmissible under v3 and requires a new experiment identity.
2. **Evaluator dependency closure was not checksum-bound.** The pre-review allowlist omitted imported `src/source-selection-experiment-*.js` modules, allowing evaluator drift after review.
3. **One-shot architecture was bypassable.** `run-v3-ranking.mjs` was directly executable with arbitrary output paths, and no durable exclusive attempt marker was created before evaluation. Aborted attempts could be retried while the canonical result stayed absent.
4. **Required pooled totals were absent.** The evaluator implemented equal-repository and per-repository aggregates but not the preregistered pooled totals.

Any one blocker is sufficient to reject a v3 ranking. These findings must not be repaired in place after prepared bytes exist.

## Verified but non-curative evidence

- All 31 `SHA256SUMS.pre-review` entries passed.
- Canonical cases remained 5 repositories, 50 unique cases, and 10 per repository.
- Prepared gzip SHA-256: `29cb2b91f398e935baf3ab092d836b249859208723548d7746ae043e9fa9531b`.
- Uncompressed input SHA-256: `cb5e2a8f4c6799c07ff2ff988ab03c58e4b7bbcb2c878dd6313a5ffaefa6a94f`.
- Trace bundle SHA-256: `48270861e414bb2f92fc9963e4dc87dad7c7d44919473708fd25740d363639a8`.
- All 50 SCI receipts were complete; all process groups terminated; all temporary roots were removed; no prohibited SCI index/state access was found.
- Retained cost arithmetic was internally correct but is not confirmatory evidence because the execution budget was violated.
- Preparation called only the validation path and retained, printed, and inspected no rankings.

## Disposition

Do not create final `SHA256SUMS` and do not execute v3 ranking. Preserve all v3 bytes as an unranked rejected integrity record. A successor must use a new experiment identity, bind its complete evaluator closure, create a durable attempt sentinel before evaluation, report pooled totals, and obtain a fresh independent pre-run review.

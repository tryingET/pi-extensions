---
summary: "Independent post-ranking validation of the single v4 result and recommendation to reject the treatment."
read_when:
  - "Reviewing v4 result arithmetic or treatment disposition."
type: "reference"
system4d:
  container: "Independent arithmetic and integrity review after the sole authorized v4 ranking."
  compass: "Accept valid evidence without promoting a treatment that failed its conjunctive gates."
  engine: "Bind attempt/result -> recompute 250 arm-case records -> verify aggregates -> recommend disposition."
  fog: "A precision pass can obscure failed unnecessary-reduction and comparator gates."
---

# V4 independent post-ranking review

Result review: **ACCEPT**

Recommended treatment disposition: **REJECT**

```text
review: dispatch-1785042159907
ranking attempt sentinel: 4e4a11f9d82ba0b90261bf7dbb507abe3d6b75926bfafe73fb0aebb587c3faef
result: d1d592bc7dbb592a1b6d7b3151eefe079bdb41408cc3b02fda4c0f21d70061ca
independent audit digest: 1db9d91e122cf69fa6afe258390a48ea2ea8dd6bd2c28f01d0c8eedfe5b5228e
```

The reviewer did not rerun the evaluator or ranking. It independently recomputed metrics from the fixed selected paths and hash-bound truth.

## Integrity

- Exactly one regular attempt sentinel and one regular result exist.
- The sentinel binds final manifest `6e73ac83b4d1a425da390c3faed69877125c9a6f971a00b258d509d0dbf4870e`, prepared gzip `c8802e5bdfb5936fde8f31cc8b8469622df378af4fd5ca4eefd3dacbddd0402b`, and uncompressed input `286373698b4a41596a7076d5c296fbc60985e5900acbaf142b32927d407114ae`.
- `retryAuthorized` is false; v4 must never be rerun.
- All 30 final pre-run manifest entries and all 28 pre-review entries passed.
- 250 arm-case records, 190 available records, 1,140 metric fields, 30 positive-treatment diagnostics, all repository/pooled/macro summaries, all deltas, and all ten gates were independently checked with zero discrepancies.

## Primary result

Equal-repository macro over three eligible repositories and 30 cases:

| Metric | Paths | Positive | Delta/result |
|---|---:|---:|---:|
| precision | 0.216667 | 0.325000 | +0.108333 |
| recall | 0.408333 | 0.627778 | +0.219444 |
| unnecessary/case | 3.133333 | 2.700000 | reduction 13.829787% |
| omissions/case | 1.366667 | 0.933333 | -0.433333 |

Pooled eligible totals:

| Arm | Cases | Selected | Unnecessary | Omissions |
|---|---:|---:|---:|---:|
| paths | 30 | 120 | 94 | 41 |
| source_list_full | 30 | 120 | 81 | 28 |
| source_list_positive | 30 | 120 | 81 | 28 |
| structural | 30 | 120 | 86 | 33 |
| fusion_full | 30 | 120 | 73 | 20 |

## Gate result

Eight of ten gates passed. Two failed:

1. unnecessary-selection reduction was `13.829787%`, below the required `20%`;
2. `source_list_positive` did not strictly improve `source_list_full`—all metrics and all 30 eligible selected-path lists were identical.

Every eligible case had at least five positive-evidence candidates for a four-item budget. The treatment therefore never underfilled or abstained and did not activate its intended differentiator.

The fixed result is valid evidence, but the preregistered treatment failed. Automatic invocation and production wiring remain rejected and out of scope. Any new threshold or treatment requires a new leakage-safe experiment identity; this visible result cannot authorize tuning.

---
summary: "Independent acceptance of v4 case/evidence reuse and quality-only execution design before preparation."
read_when:
  - "Checking whether v4 preparation is authorized."
type: "reference"
system4d:
  container: "Independent pre-preparation review for the v4 quality-only experiment."
  compass: "Permit only leakage-free reuse while excluding invalid v3 cost evidence."
  engine: "Inspect preregistration and v3 record -> rule on reuse -> accept preparation only."
  fog: "Producer observations can be reused lawfully while associated invalid cost claims cannot."
---

# V4 preregistration review

Decision: **ACCEPT for preparation only**

```text
review: dispatch-1785040580010
reviewed commit: a66304d1c9f663e5214f5915145a9d7e4b2ff8ce
rankingExecuted: false
v3ResultAbsent: true
v3AttemptSentinelAbsent: true
```

The reviewer accepted reuse of the 50 never-ranked case definitions and exact pre-ranking source-list/SCI observations in new v4 prepared bytes. Reuse must be all-or-nothing and fail closed on every frozen hash, commit, universe, receipt, trace, cleanup, and staleness binding.

The complete v3 cost study is excluded: no probe pairs, timings, classifications, taxes, reductions, cost aggregates, or cost artifact may enter v4 input or decision arithmetic. Deterministic full source-list artifacts may be reused solely as candidate-universe inputs.

The reviewer accepted the conjunctive quality gates, required pooled all-arm totals, complete transitive dependency closure, and fixed-path one-shot design. The attempt sentinel must be created exclusively and made crash-durable by flushing the file and parent directory before decompression or evaluation.

This acceptance authorizes preparation only. It does not authorize ranking, automatic invocation, production wiring, or adoption.

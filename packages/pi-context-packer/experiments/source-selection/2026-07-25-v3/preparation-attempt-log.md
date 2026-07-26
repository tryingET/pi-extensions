---
summary: "Transparent log of non-ranking v3 preparation harness attempts before frozen prepared bytes exist."
read_when:
  - "Reviewing v3 pre-run integrity or deciding whether preparation observations are admissible."
type: "reference"
system4d:
  container: "Transparent pre-ranking record of v3 preparation harness attempts."
  compass: "Disclose discarded evidence collection rather than presenting later retained observations as the only executions."
  engine: "Record failure -> correct representation -> require independent admissibility review."
  fog: "A result-absent failed collector can still matter to an exactly-five-pair experimental claim."
---

# V3 preparation attempt log

## 2026-07-26 — discarded collector attempt

The first execution of `node source-list-observations.mjs` produced no observation artifact, no prepared input, and no ranking result. The harness completed its source-list subprocess loop but then failed during deterministic staleness-sample construction because the frozen Agent Kernel control has zero metadata-present paths:

```text
Error: agent-kernel: no metadata-present staleness sample
```

The work root was removed by the harness `finally` block, so no timing or producer output from this attempt was retained, selected, or used. The harness was corrected to represent an empty sample honestly and require independent review of the exact zero-present observation. The treatment, cases, repository snapshots, pair order, cost formulas, thresholds, and ranking bytes were not changed.

Any later observation artifact is the sole retained candidate set, but this discarded attempt must remain visible to the independent pre-run reviewer. The reviewer must decide whether the discarded non-ranking collector attempt is compatible with the preregistered five-pair gate; it must not be silently described as the only subprocess execution.

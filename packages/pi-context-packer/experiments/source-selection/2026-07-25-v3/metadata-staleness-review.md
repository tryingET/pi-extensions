---
summary: "Independent pre-ranking review of v3 metadata-staleness samples at frozen repository commits."
read_when:
  - "Checking whether v3 may build prepared ranking input."
type: "reference"
system4d:
  container: "Independent pre-ranking review of deterministic metadata samples at five frozen commits."
  compass: "Detect stale authored metadata without using truth or ranking outputs."
  engine: "Project samples -> inspect exact blobs -> record independent decisions."
  fog: "An empty sample may be either honest zero coverage or an unreviewed omission."
---

# V3 metadata-staleness review

## Gate result

**ACCEPT for prepared-input construction. Ranking remains forbidden.**

Reviewed projection:

```text
4076ec2c1dc1ab970b87e70fef82b8f74cfb3e7a942faa74cda3ca8556ea64c0  metadata-staleness-candidates.generated.json
```

Reviewers inspected exact Git blobs at the frozen commits. They did not inspect ranking output, compute ranking scores, execute ranking, or mutate source-owner repositories.

| Repository | Review | Dispatch | Sample | Stale paths |
|---|---|---|---:|---|
| agent-scripts | ACCEPT | `dispatch-1785037127241` | 10 | `[]` |
| engineering-core | ACCEPT | `dispatch-1785037127242` | 10 | `[]` |
| DSPx | ACCEPT | `dispatch-1785037127243` | 10 | `[]` |
| pi-extensions | ACCEPT | `dispatch-1785037127243-1` | 10 | `[]` |
| agent-kernel | ACCEPT | `dispatch-1785037127244` | 0 | `[]` |

The Agent Kernel empty sample is intentional: the reviewer independently scanned all 715 supported source blobs at commit `8b9264a4032a79ff2194b6413de62f9ca410385c` and confirmed that none contains qualifying `source-list` authored metadata. An empty sample is therefore the honest representation of an empty metadata-present population, not a skipped review.

These reviews assess metadata staleness only. They do not authenticate producers, establish relevance scoring, or rescue the already failed/unknown eligibility-cost gate.

---
summary: "Audited autoresearch evidence comparing numbered coordinates with raw snapshot occurrence selectors."
read_when:
  - "Choosing the next pi-snapshot-edit protocol candidate."
  - "Interpreting the Phase 1 encoding benchmark or Phase 2 model screens."
system4d:
  container: "Content-free empirical protocol comparison."
  compass: "Advance only designs that preserve correctness while reducing model-visible cost."
  engine: "Canonical encoding benchmark -> blinded model screen -> scale crossover -> bounded recommendation."
  fog: "One trial per crossover cell and one workload family do not establish universal superiority."
---

# Snapshot editing protocol autoresearch results

Date: 2026-07-11

AK task: `#3604`

## Question

Which snapshot-safe editing protocol minimizes model-visible token cost without ambiguous or stale mutation?

The campaign confronted five incompatible schools:

- **A — explicit coordinates:** revision plus a numbered gutter on every line;
- **B — exact occurrence:** raw text plus a revision; unique exact text needs no occurrence, duplicates require a 1-indexed occurrence;
- **C — adaptive coordinates:** raw read followed by a targeted numbered reread;
- **D — hashline identity:** a compact identity on every line;
- **E — context patch:** raw text plus a narrow validated patch grammar.

Correctness remained a hard gate. A token reduction could not compensate for a wrong target, malformed selector, or accepted stale base.

## Phase 1 — canonical transcript encoding

`js-tiktoken@1.0.21` with `o200k_base` counted oracle-authored canonical-correct protocol envelopes. This phase measured encoding only, not model usability or provider billing.

| Protocol | Tokens per correct mutation case | Relative to A |
|---|---:|---:|
| A | 265.857 | baseline |
| **B** | **246.000** | **-7.47%** |
| C | 323.571 | +21.71% |
| D | 269.571 | +1.40% |
| E | 248.429 | -6.56% |

B was the cheapest canonical contract. C was the most expensive after counting its additional interaction.

## Phase 2 — initial 30-call model screen

Two models—`zai/glm-5.2` and `openai-codex/gpt-5.6-sol`—each attempted all five protocols over duplicate-line, repeated-block, and batched-edit workloads.

- 30 attempts;
- 25 correct;
- A, B, and D each achieved 6/6 correctness;
- C achieved 3/6 and failed all GLM cells;
- E achieved 4/6;
- two GLM C process errors had no usage sample.

The run correctly failed closed because only 28/30 attempts had usage. Its observed `14,334` tokens are a lower bound, not an exact campaign total. The runtime aggregate remains an ignored local projection; AK evidence `3363` records the incomplete outcome.

This screen rejected C and E as promotion candidates. D preserved correctness but did not beat the simpler A/B frontier.

## Phase 2 — A/B scale crossover

The authorized exactly-once crossover ran 12 blinded calls:

```text
2 models × 2 protocols × 3 duplicate-target file sizes = 12 cells
```

Every cell produced strict JSON, correct bytes, and complete provider usage. No cell was retried.

| Model | Lines | A tokens | B tokens | B − A | Reduction |
|---|---:|---:|---:|---:|---:|
| GLM 5.2 | 20 | 561 | 559 | -2 | 0.36% |
| GLM 5.2 | 100 | 1,129 | 972 | -157 | 13.91% |
| GLM 5.2 | 500 | 4,413 | 3,182 | -1,231 | 27.89% |
| GPT-5.6-sol | 20 | 505 | 461 | -44 | 8.71% |
| GPT-5.6-sol | 100 | 1,065 | 861 | -204 | 19.15% |
| GPT-5.6-sol | 500 | 3,865 | 2,861 | -1,004 | 25.98% |

Combined results:

| Protocol | Correct | Total tokens | OpenAI reported cost |
|---|---:|---:|---:|
| A | 6/6 | 11,538 | $0.030175 |
| **B** | **6/6** | **8,896** | **$0.023990** |

B reduced complete observed usage by **2,642 tokens (22.90%)** with no observed correctness loss. Savings increased with file size. GLM reported zero cost; that is retained as provider output, not interpreted as independently verified free execution.

## MANY OF THE GREATS adjudication

### Contextual dominance

- C loses because an additional read round trip is expensive and model-fragile.
- D loses because per-line identities retain the same scaling problem as numbered gutters without a measured correctness advantage.
- E loses because compact canonical encoding did not survive model generation reliably.
- A remains a strong baseline for small, coordinate-friendly files.
- **B is the provisional leading design:** raw reads avoid per-line tax, snapshot binding preserves stale safety, and explicit occurrence resolves duplicate selectors.

The initial broad screen sometimes favored A on small tasks, while the controlled scale crossover favored B at every measured size. Therefore the evidence supports advancing B as an experimental candidate—not declaring universal replacement.

## Decision and next gate

Implement B behind an experimental namespaced or opt-in surface while retaining A as the baseline/fallback. Do not replace the live standard override yet.

Before promotion, repeat and broaden model trials across:

- insertions and deletions;
- batched mixed operations;
- long repeated blocks and formatting-sensitive text;
- stale-state rejection;
- cold and warm cache conditions;
- multiple trials per cell with confidence intervals.

Durable aggregates must remain content-free. Raw prompts, fixture text, model prose, request IDs, and session IDs must not be retained.

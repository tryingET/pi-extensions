---
ont:
  id: "pi.extensions.CorrectnessCheck"
  type: concept
  labels: ["Correctness check"]
  synonyms: ["backpressure check", "validation gate"]
  description: "Correctness or backpressure gate that runs adjacent to the benchmark and constrains what outcomes may be kept."
  relations: []
  examples:
    - "A post-benchmark test and typecheck gate that must pass before keep is allowed."
  anti_examples:
    - "A benchmark timing measurement used as if it were a correctness gate."
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---

# Correctness check (pi.extensions.CorrectnessCheck)

## Definition
Correctness or backpressure gate that runs adjacent to the benchmark and constrains what outcomes may be kept.

## Examples
- A post-benchmark test and typecheck gate that must pass before keep is allowed.

## Anti-examples
- A benchmark timing measurement used as if it were a correctness gate.

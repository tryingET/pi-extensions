---
ont:
  id: "pi.extensions.OptimizationHypothesis"
  type: concept
  labels: ["Optimization hypothesis"]
  synonyms: ["performance hypothesis", "benchmark hypothesis"]
  description: "Explicit claim about why a particular change should improve a benchmark outcome."
  relations: []
  examples:
    - "Reducing worker oversubscription will lower total test runtime."
  anti_examples:
    - "Try something random and see what happens."
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---

# Optimization hypothesis (pi.extensions.OptimizationHypothesis)

## Definition
Explicit claim about why a particular change should improve a benchmark outcome.

## Examples
- Reducing worker oversubscription will lower total test runtime.

## Anti-examples
- Try something random and see what happens.

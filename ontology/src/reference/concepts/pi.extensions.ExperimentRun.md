---
ont:
  id: "pi.extensions.ExperimentRun"
  type: concept
  labels: ["Experiment run"]
  synonyms: ["benchmark iteration", "trial run"]
  description: "One measured iteration inside an experiment session that records the attempted change, metric result, and disposition."
  relations: []
  examples:
    - "One measured run after changing Vitest pool settings."
  anti_examples:
    - "A brainstorm note with no executed benchmark."
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---

# Experiment run (pi.extensions.ExperimentRun)

## Definition
One measured iteration inside an experiment session that records the attempted change, metric result, and disposition.

## Examples
- One measured run after changing Vitest pool settings.

## Anti-examples
- A brainstorm note with no executed benchmark.

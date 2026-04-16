---
ont:
  id: "pi.extensions.ExperimentReceipt"
  type: concept
  labels: ["Experiment receipt"]
  synonyms: ["run receipt", "experiment record"]
  description: "Durable machine-readable record of one experiment run or session event, capturing measured outcome and relevant provenance."
  relations: []
  examples:
    - "A JSONL record capturing commit, metric, status, and structured diagnostics for one run."
  anti_examples:
    - "An unstructured memory of what probably happened in an experiment."
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---

# Experiment receipt (pi.extensions.ExperimentReceipt)

## Definition
Durable machine-readable record of one experiment run or session event, capturing measured outcome and relevant provenance.

## Examples
- A JSONL record capturing commit, metric, status, and structured diagnostics for one run.

## Anti-examples
- An unstructured memory of what probably happened in an experiment.

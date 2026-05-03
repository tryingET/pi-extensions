---
summary: "Ontology concept: Experiment campaign (pi.extensions.ExperimentCampaign)"
read_when:
  - "Inspecting pi-extensions ontology reference or bridge documentation."
ont:
  id: "pi.extensions.ExperimentCampaign"
  type: concept
  labels: ["Experiment campaign"]
  synonyms: ["optimization campaign", "benchmark campaign"]
  description: "Bounded optimization effort against a defined benchmark target, explicit scope, and explicit success criterion."
  relations: []
  examples:
    - "Improve test runtime for one package under explicit scope and correctness constraints."
  anti_examples:
    - "An unbounded coding session with no benchmark target or stop condition."
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---

# Experiment campaign (pi.extensions.ExperimentCampaign)

## Definition
Bounded optimization effort against a defined benchmark target, explicit scope, and explicit success criterion.

## Examples
- Improve test runtime for one package under explicit scope and correctness constraints.

## Anti-examples
- An unbounded coding session with no benchmark target or stop condition.

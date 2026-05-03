---
summary: "Ontology concept: Experiment session (pi.extensions.ExperimentSession)"
read_when:
  - "Inspecting pi-extensions ontology reference or bridge documentation."
ont:
  id: "pi.extensions.ExperimentSession"
  type: concept
  labels: ["Experiment session"]
  synonyms: ["benchmark session", "campaign session"]
  description: "Local working session or branch-anchored execution stream inside an experiment campaign that accumulates receipts, notes, and benchmark configuration."
  relations: []
  examples:
    - "A branch-local session with autoresearch.jsonl, autoresearch.md, and a benchmark harness for test-runtime optimization."
  anti_examples:
    - "A general repo diary entry unrelated to a benchmark campaign."
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---

# Experiment session (pi.extensions.ExperimentSession)

## Definition
Local working session or branch-anchored execution stream inside an experiment campaign that accumulates receipts, notes, and benchmark configuration.

## Examples
- A branch-local session with autoresearch.jsonl, autoresearch.md, and a benchmark harness for test-runtime optimization.

## Anti-examples
- A general repo diary entry unrelated to a benchmark campaign.

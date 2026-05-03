---
summary: "Ontology concept: Benchmark harness (pi.extensions.BenchmarkHarness)"
read_when:
  - "Inspecting pi-extensions ontology reference or bridge documentation."
ont:
  id: "pi.extensions.BenchmarkHarness"
  type: concept
  labels: ["Benchmark harness"]
  synonyms: ["benchmark script", "benchmark wrapper"]
  description: "Reproducible executable benchmark surface used to evaluate runs in an experiment campaign."
  relations: []
  examples:
    - "A shell script that runs the workload and emits METRIC lines."
  anti_examples:
    - "A hand-executed ad hoc command sequence with no stable output contract."
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---

# Benchmark harness (pi.extensions.BenchmarkHarness)

## Definition
Reproducible executable benchmark surface used to evaluate runs in an experiment campaign.

## Examples
- A shell script that runs the workload and emits METRIC lines.

## Anti-examples
- A hand-executed ad hoc command sequence with no stable output contract.

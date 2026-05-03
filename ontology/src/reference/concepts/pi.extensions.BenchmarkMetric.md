---
summary: "Ontology concept: Benchmark metric (pi.extensions.BenchmarkMetric)"
read_when:
  - "Inspecting pi-extensions ontology reference or bridge documentation."
ont:
  id: "pi.extensions.BenchmarkMetric"
  type: concept
  labels: ["Benchmark metric"]
  synonyms: ["optimization metric", "tracked metric"]
  description: "Named optimization metric definition, including its unit and direction of improvement."
  relations: []
  examples:
    - "total_ms where lower is better."
  anti_examples:
    - "faster, with no named unit or direction."
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---

# Benchmark metric (pi.extensions.BenchmarkMetric)

## Definition
Named optimization metric definition, including its unit and direction of improvement.

## Examples
- total_ms where lower is better.

## Anti-examples
- faster, with no named unit or direction.

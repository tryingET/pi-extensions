---
summary: "Ontology relation: uses_harness"
read_when:
  - "Inspecting pi-extensions ontology reference or bridge documentation."
ont:
  id: "pi.extensions.rel.uses_harness"
  type: relation
  labels: ["uses_harness"]
  description: "Connects an experiment campaign or session to the benchmark harness it uses for measurement."
  group: "usage"
  characteristics:
    transitive: false
    symmetric: false
---

## Definition
`X uses_harness Y` means X relies on benchmark harness Y as the executable measurement surface.

## Notes
- Keep semantics crisp.
- Use this relation for the actual benchmark surface, not for ancillary tooling.

## Domain / Range
- Domain: experiment campaign or experiment session
- Range: benchmark harness

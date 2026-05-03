---
summary: "Ontology relation: guarded_by_check"
read_when:
  - "Inspecting pi-extensions ontology reference or bridge documentation."
ont:
  id: "pi.extensions.rel.guarded_by_check"
  type: relation
  labels: ["guarded_by_check"]
  description: "Connects an experiment campaign or session to a correctness check that constrains what outcomes may be kept."
  group: "constraint"
  characteristics:
    transitive: false
    symmetric: false
---

## Definition
`X guarded_by_check Y` means X is constrained by correctness check Y before benchmark outcomes can be kept.

## Notes
- Keep semantics crisp.
- Use this relation for correctness or backpressure gates, not for primary metrics.

## Domain / Range
- Domain: experiment campaign or experiment session
- Range: correctness check

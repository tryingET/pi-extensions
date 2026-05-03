---
summary: "Ontology relation: tracks_metric"
read_when:
  - "Inspecting pi-extensions ontology reference or bridge documentation."
ont:
  id: "pi.extensions.rel.tracks_metric"
  type: relation
  labels: ["tracks_metric"]
  description: "Connects an experiment campaign or session to a benchmark metric it intentionally tracks."
  group: "measurement"
  characteristics:
    transitive: false
    symmetric: false
---

## Definition
`X tracks_metric Y` means X intentionally measures progress using benchmark metric Y.

## Notes
- Keep semantics crisp.
- Use this relation for explicit tracked metrics, not ad hoc observed values.

## Domain / Range
- Domain: experiment campaign or experiment session
- Range: benchmark metric

---
summary: "Ontology relation: belongs_to_campaign"
read_when:
  - "Inspecting pi-extensions ontology reference or bridge documentation."
ont:
  id: "pi.extensions.rel.belongs_to_campaign"
  type: relation
  labels: ["belongs_to_campaign"]
  description: "Connects an experiment session or experiment run to the experiment campaign it is part of."
  group: "containment"
  characteristics:
    transitive: false
    symmetric: false
---

## Definition
`X belongs_to_campaign Y` means X is a session or run that is part of the bounded experiment campaign Y.

## Notes
- Keep semantics crisp.
- Use this relation for campaign membership, not simple ordering.

## Domain / Range
- Domain: experiment session or experiment run
- Range: experiment campaign

---
ont:
  id: "pi.extensions.rel.belongs_to_session"
  type: relation
  labels: ["belongs_to_session"]
  description: "Connects an experiment run to the experiment session it belongs to."
  group: "containment"
  characteristics:
    transitive: false
    symmetric: false
---

## Definition
`X belongs_to_session Y` means X is an experiment run that is part of the local experiment session Y.

## Notes
- Keep semantics crisp.
- Use this relation for run membership, not for campaign identity directly.

## Domain / Range
- Domain: experiment run
- Range: experiment session

---
ont:
  id: "pi.extensions.rel.groups_run"
  type: relation
  labels: ["groups_run"]
  description: "Connects a finalization group to an experiment run that belongs in that grouped review outcome."
  group: "containment"
  characteristics:
    transitive: false
    symmetric: false
---

## Definition
`X groups_run Y` means finalization group X includes experiment run Y in one bounded review or landing group.

## Notes
- Keep semantics crisp.
- Use this relation for finalization grouping, not for simple campaign membership.

## Domain / Range
- Domain: finalization group
- Range: experiment run

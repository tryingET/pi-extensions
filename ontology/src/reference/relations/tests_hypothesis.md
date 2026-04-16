---
ont:
  id: "pi.extensions.rel.tests_hypothesis"
  type: relation
  labels: ["tests_hypothesis"]
  description: "Connects an experiment run to the optimization hypothesis it is intended to evaluate."
  group: "measurement"
  characteristics:
    transitive: false
    symmetric: false
---

## Definition
`X tests_hypothesis Y` means experiment run X was executed specifically to evaluate optimization hypothesis Y.

## Notes
- Keep semantics crisp.
- Use this relation when the run is tied to a falsifiable claim, not just a vague idea.

## Domain / Range
- Domain: experiment run
- Range: optimization hypothesis

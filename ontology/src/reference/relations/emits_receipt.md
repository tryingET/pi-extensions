---
ont:
  id: "pi.extensions.rel.emits_receipt"
  type: relation
  labels: ["emits_receipt"]
  description: "Connects an experiment run to the durable experiment receipt it produces."
  group: "outcome"
  characteristics:
    transitive: false
    symmetric: false
---

## Definition
`X emits_receipt Y` means experiment run X produces durable receipt Y as its machine-readable record.

## Notes
- Keep semantics crisp.
- Use this relation for durable receipt emission, not for generic artifact production.

## Domain / Range
- Domain: experiment run
- Range: experiment receipt

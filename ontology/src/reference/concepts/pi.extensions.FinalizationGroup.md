---
ont:
  id: "pi.extensions.FinalizationGroup"
  type: concept
  labels: ["Finalization group"]
  synonyms: ["kept change group", "review group"]
  description: "Bounded grouping of retained experiment runs or retained changes that should be reviewed and landed together."
  relations: []
  examples:
    - "The kept runs that all optimize Vitest worker configuration and should become one review branch."
  anti_examples:
    - "A bag of retained runs that overlap files and cannot be reviewed together."
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---

# Finalization group (pi.extensions.FinalizationGroup)

## Definition
Bounded grouping of retained experiment runs or retained changes that should be reviewed and landed together.

## Examples
- The kept runs that all optimize Vitest worker configuration and should become one review branch.

## Anti-examples
- A bag of retained runs that overlap files and cannot be reviewed together.

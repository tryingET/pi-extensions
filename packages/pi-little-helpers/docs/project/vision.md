---
summary: "Product and technical vision for pi-little-helpers."
read_when:
  - "Defining or revisiting project direction."
system4d:
  container: "Project north-star statement."
  compass: "Build a reliable pi extension package with low maintenance overhead."
  engine: "Translate goals into concrete implementation slices."
  fog: "Real user workflows may reshape priorities."
---

# Vision — `pi-little-helpers`

## North star

`pi-little-helpers` should make visible helper work easy to launch, inspect, and clean up while preserving controller verification.

Short form:

```text
make helper work visible; keep authority with the controller
```

## Visible-loop role

This package owns the operator-visible slash surfaces for peer and loop helpers, including `/visible-loop` and `/nexus-loop`.
Those loops are execution harnesses, not evidence or promotion authority.
For recursive-improvement work, use the root [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md) and the package [visible peer capability contract](./2026-05-05-visible-peer-capability-contract.md) instead of duplicating the owner map here.

## Product boundaries

Project purpose for this repository is scoped to extension delivery and maintenance.
It aligns with, but is distinct from, organization purpose documented in [Organization operating model](../org/operating_model.md).
For the project-level concept map, see [Project foundation model](foundation.md).

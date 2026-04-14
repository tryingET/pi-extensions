---
summary: "Compact project model with explicit project-purpose framing."
read_when:
  - "Aligning project purpose, strategy, and delivery behavior."
system4d:
  container: "Project-level concepts and boundaries for this package."
  compass: "Keep the package focused on truthful live-context inspection instead of letting it sprawl into unrelated runtime ownership."
  engine: "Project purpose -> mission -> bounded ownership -> executable validation and release behavior."
  fog: "The main risk is blurring operator UX responsibilities with lower-level interaction/runtime seams."
---

# Project foundation model

```mermaid
flowchart TD
    ProjectPurpose("Project Purpose") -->|defines| ProjectMission("Project Mission")
    ProjectMission -->|leads to| ProjectVision("Project Vision")
    ProjectVision -->|is operationalized by| ProjectStrategicObjectives("Project Strategic Objectives")
    ProjectPurpose -->|inspires| ProjectValues("Project Values")
    ProjectValues -->|shape| ProjectEthics("Project Ethics")
    ProjectValues -->|shape| ProjectCulture("Project Culture")
    ProjectValues -->|are expressed in| ProjectCharter("Project Charter")
    ProjectCharter -->|influences| ProjectEthics
    ProjectEthics -->|guides behavior in| ProjectCulture
    ProjectCulture -->|supports| ProjectStrategicObjectives
```

## Project purpose

Give Pi operators a truthful, low-friction inspection surface for the active session context.

## Project mission

Maintain the former local context-overlay workflow as a reusable monorepo package that can:

- register `/c` as the context inspector entrypoint
- render a bounded overlay for live session context, usage, and grouping
- open file-backed context items when available
- ship the `context-report` prompt for textual inspection
- stay compatible with Pi host lifecycle changes through package-local validation and documentation

## Ownership boundary

This package owns:

- the overlay command and extension wiring in `extensions/context-overlay.ts`
- overlay rendering, grouping, token estimation, and snapshot handling in `src/`
- package-local prompts, smoke examples, and handoff/compatibility notes

This package does **not** own:

- durable session history or replay
- generic interaction/runtime primitives that belong in `packages/pi-interaction`
- vault/package-distribution policy beyond its own release metadata and validation path

## Scope boundary

- **Organization purpose** lives at org level and is documented in [Organization operating model](../org/operating_model.md).
- **Project purpose** here is narrower: make live Pi context inspection reliable, understandable, and easy to maintain as its own package seam.

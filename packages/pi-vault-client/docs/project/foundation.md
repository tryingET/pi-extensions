---
summary: "Compact project model with explicit project-purpose framing."
read_when:
  - "Aligning project purpose, strategy, and delivery behavior."
system4d:
  container: "Project-level concepts and boundaries for this repository."
  compass: "Translate project purpose into executable outcomes."
  engine: "Project purpose -> mission -> vision -> strategic objectives."
  fog: "Project scope and priorities can drift without explicit review."
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

## Scope boundary

- **Organization purpose** lives at org level and is documented in [Organization operating model](../org/operating_model.md).
- **Project purpose** is repository-specific and can be narrower while staying aligned with organization strategy.

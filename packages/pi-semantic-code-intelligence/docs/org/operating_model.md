---
summary: "Compact organization operating model and terminology."
read_when:
  - "Aligning organization-level purpose, mission, and strategy."
system4d:
  container: "Organization-level concepts shared across projects."
  compass: "Keep strategy and culture aligned with organization purpose."
  engine: "Purpose -> mission -> vision -> strategic objectives."
  fog: "Terminology drift can create cross-project confusion."
---

# Organization operating model

```mermaid
flowchart TD
    OrganizationPurpose("Organization Purpose") -->|defines| OrganizationMission("Organization Mission")
    OrganizationMission -->|leads to| OrganizationVision("Organization Vision")
    OrganizationVision -->|is operationalized by| StrategicObjectives("Strategic Objectives")
    OrganizationPurpose -->|inspires| CoreValues("Core Values")
    CoreValues -->|shape| EthicsPolicy("Ethics Policy")
    CoreValues -->|shape| OrganizationCulture("Organization Culture")
    CoreValues -->|are expressed in| OrganizationCharter("Organization Charter")
    OrganizationCharter -->|influences| EthicsPolicy
    EthicsPolicy -->|guides behavior in| OrganizationCulture
    OrganizationCulture -->|supports| StrategicObjectives
```

## Compact terminology

- **Organization Purpose**: why the organization exists.
- **Organization Mission**: what the organization does now.
- **Organization Vision**: target future state.
- **Strategic Objectives**: measurable outcomes that realize the vision.
- **Core Values / Ethics / Culture / Charter**: behavioral system that supports strategy.

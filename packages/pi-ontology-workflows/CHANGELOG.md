---
summary: "Package change history for @tryinget/pi-ontology-workflows."
read_when:
  - "Reviewing released or significant package changes."
system4d:
  container: "Package change log."
  compass: "Keep package evolution explicit and auditable."
  engine: "Record meaningful shipped changes, not every transient edit."
  fog: "If changelog entries drift from real behavior, operators lose trust in release notes."
---

# Changelog

## 0.1.0

- Scaffolded `@tryinget/pi-ontology-workflows` from `pi-extensions-template` as a `simple-package`.
- Implemented a stable ontology workflow core with explicit contracts for inspect/change flows.
- Added thin adapters for ROCS invocation, workspace routing, formatting, filesystem access, and frontmatter handling.
- Added the compact Pi surface:
  - `ontology_inspect`
  - `ontology_change`
  - `/ontology-status`
- Added startup ontology status/widget behavior and ontology-aware prompt hints.
- Added integrated picker/editor UX using the published `pi-interaction` support packages:
  - `/ontology:<query>[::scope]`
  - `/ontology-pack:<query>[::scope]`
  - `/ontology-change:<query>[::scope]`
- Added concept, relation, bridge, and system4d change planning/apply support with post-apply validate/build.
- Added unit and integration tests, including real ROCS-backed end-to-end coverage on temporary repos.

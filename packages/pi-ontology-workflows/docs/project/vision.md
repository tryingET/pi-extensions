---
summary: "Vision for ontology workflows in Pi."
read_when:
  - "Revisiting the package's north-star behavior."
system4d:
  container: "Project north-star statement."
  compass: "Make ontology work feel native in Pi without duplicating business logic across surfaces."
  engine: "One stable workflow core -> many thin surfaces."
  fog: "Surface sprawl can quietly become the architecture if the core is weak."
---

# Vision

Pi should be able to:

- understand when ontology context matters
- inspect ontology state through one stable workflow API
- route writes to repo/company/core targets intentionally
- apply ontology changes safely
- validate and build immediately after changes

while keeping the public surface compact:

- one inspect tool
- one change tool
- minimal command/startup glue

The package should stay reusable by other Pi packages as a workflow boundary rather than becoming another ad-hoc ontology implementation.

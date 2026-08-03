---
summary: "Explicit no-publish posture for the private pi-session-insights first slice."
read_when:
  - "Reviewing release or publication posture."
---

# Publication posture

This package is private and `releaseConfigMode=none`.

No npm publication, release-please component, tag, release, provenance publish, or trusted-publisher binding is authorized by AK-4625. The durable delivery surface is the committed monorepo package source. Local Pi installation/reload also remains a separate, unperformed activation gate.

A future publication decision must first change package ownership/posture, root release metadata, validation, and operator authorization in one explicit owner-scoped task.

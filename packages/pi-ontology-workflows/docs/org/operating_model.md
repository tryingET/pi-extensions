---
summary: "Organization-level framing for ontology workflow stewardship."
read_when:
  - "Clarifying why this package exists at the organization level."
system4d:
  container: "Org-level operating context for the package."
  compass: "Use explicit semantics and clear ownership boundaries across AI Society systems."
  engine: "Core owners stay distinct; workflow packages compose them."
  fog: "Ownership blur between workflow packages and system-of-record packages creates drift."
---

# Organization operating model

## Organization-level purpose relevant here

AI Society needs shared meaning, explicit invariants, and safe change paths across repo, company, and core ontology layers.

## Organizational rule expressed by this package

- ontology repos remain the source of truth
- `rocs-cli` remains the ontology boundary for validate/build/pack behavior
- Pi packages should consume ontology behavior through stable workflow contracts
- higher-level orchestration packages should compose these contracts instead of reimplementing them

## Why this package exists in that model

This package is the Pi-side workflow boundary that keeps ontology operations explicit, small-surfaced, and reusable.

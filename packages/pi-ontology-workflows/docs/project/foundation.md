---
summary: "Project foundation for the ontology workflow package."
read_when:
  - "Aligning package purpose, boundaries, and use-case ownership."
system4d:
  container: "Project-level ontology workflow charter."
  compass: "Keep ontology workflows explicit, small-surfaced, and adapter-thin."
  engine: "Stable core use cases -> thin Pi/ROCS adapters -> deterministic validation/build."
  fog: "Ontology updates become fragile when shell conventions replace explicit contracts."
---

# Project foundation model

## Project purpose

Provide Pi with a compact, ontology-native workflow package so ontology inspection and mutation happen through explicit use cases instead of raw file surgery and scattered `rocs` command knowledge.

## Scope boundary

This package owns:

- Pi-side ontology workflow use cases
- explicit ontology workflow contracts
- routing between repo/company/core ontology targets
- thin ROCS integration for validate/build/pack flows

This package does **not** own:

- the ontology source of truth itself (`rocs-cli` + ontology repos do)
- broader multi-agent coordination (`pi-society-orchestrator` does)
- subagent runtime ownership (`pi-autonomous-session-control` does)
- editor/picker runtime ownership (`pi-interaction` does)

## Operating model

1. inspect ontology context
2. resolve target scope
3. plan or apply a typed ontology change
4. validate and build through ROCS
5. return structured results back to Pi

## Architectural rule

The stable thing in this package is the **workflow core**, not the command line shape.
Pi tools and startup hooks are adapters over that core.

---
summary: "Handoff prompt for @tryinget/pi-ontology-workflows after the initial full package implementation."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package handoff artifact."
  compass: "Preserve the stable workflow core while extending only through thin adapters."
  engine: "Read docs -> validate package -> add one bounded capability without duplicating the core."
  fog: "The easiest next mistake is adding a new surface that bypasses the workflow core."
---

# Next session prompt for @tryinget/pi-ontology-workflows

## Current state

The package is now fully scaffolded from `pi-extensions-template` and implements:

- `ontology_inspect`
- `ontology_change`
- `/ontology-status`
- integrated picker/editor UX via the `pi-interaction` support packages
- stable workflow core + thin adapters
- typed ontology operation language
- tests and real ROCS integration

## First things to read

- `README.md`
- `docs/decisions/2026-03-14-stable-core-thin-adapters.md`
- `src/core/contracts.ts`
- `src/core/inspect.ts`
- `src/core/change.ts`

## Session checklist

1. run `npm run docs:list`
2. run `npm run check`
3. if extending a surface, keep the workflow core authoritative
4. update docs + changelog + this handoff note

## Good next slices

- improve relation-body preservation for update flows
- decide whether to add a manual `/ontology-picker` command on top of the live trigger layer
- add a publish-safe reusable runtime export surface if another package needs direct imports

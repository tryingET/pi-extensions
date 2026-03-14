---
summary: "Adopt a stable-core/thin-adapter architecture with an explicit ontology workflow language."
read_when:
  - "Explaining why the package surface is two tools over a richer internal core."
  - "Adding new surfaces or runtime integrations."
system4d:
  container: "Architecture decision record for package shape."
  compass: "Keep use-case semantics in the core and adapters thin."
  engine: "Explicit contracts -> stable workflow core -> thin Pi/ROCS adapters."
  fog: "Adapter convenience can slowly become the real architecture if not checked."
---

# ADR — stable core + thin adapters for ontology workflows

## Status

Accepted.

## Context

This package was created after two learnings captured in `tpl-template-repo` on 2026-03-13:

- stable core + thin adapters is the durable multi-surface pattern
- recurring operation languages should become explicit inside the core

Ontology work in Pi is especially vulnerable to hidden mini-languages spread across:

- raw `rocs` flags
- implicit repo/company/core routing rules
- ad-hoc file editing conventions
- one-off JSON payloads and glue logic

## Decision

This package will keep:

1. a stable workflow core in `src/core/`
2. explicit ontology workflow contracts in `src/core/contracts.ts`
3. thin adapters for:
   - Pi extension registration
   - ROCS invocation
   - workspace resolution
   - result formatting
4. a compact public surface:
   - `ontology_inspect`
   - `ontology_change`
   - `/ontology-status`

## Consequences

### Positive

- ontology behavior is reusable by other Pi packages
- routing and mutation semantics are explicit and testable
- ROCS remains an adapter dependency rather than becoming the architecture
- public surface stays small even while internal capability is richer

### Tradeoffs

- the package has more internal structure than a one-file extension
- some flexibility is intentionally constrained by typed workflow contracts
- future surfaces should be added carefully so they do not duplicate the core

## Guardrail

When adding a new ontology-facing surface:

- first ask whether it belongs in the existing workflow core
- then implement only the translation layer in the new adapter
- do not duplicate routing, validation, or write semantics in the adapter

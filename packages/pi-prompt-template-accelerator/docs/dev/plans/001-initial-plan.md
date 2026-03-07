---
summary: "Initial implementation plan for first extension iteration."
read_when:
  - "Executing the first feature slice from scaffold state."
system4d:
  container: "Plan artifact for incremental delivery."
  compass: "Move from scaffold to validated feature quickly."
  engine: "Plan -> implement -> verify -> document."
  fog: "Scope creep risk if tasks are not constrained."
---

# Plan 001: first feature slice

## Objective

Ship one useful command behavior end-to-end.

## Steps

1. Define expected command input/output.
2. Implement logic in `extensions/`.
3. Add tests in `tests/`.
4. Run `npm run check`.
5. Update `docs/dev/status.md` and `CHANGELOG.md`.

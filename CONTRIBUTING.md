---
summary: "Top-level contribution entrypoint linking to the detailed contributor guide and root validation contract."
read_when:
  - "Preparing to submit code or docs changes."
  - "Looking for contribution quality gates."
system4d:
  container: "Contribution intake and quality policy."
  compass: "Small, reviewable, verified changes."
  engine: "Read guide -> implement -> validate -> open PR."
  fog: "Package-level and root-level validation differ unless the docs are followed carefully."
---

# Contributing

Primary contributor guides live in:

- Monorepo/root: [AGENTS.md](AGENTS.md)
- Package-specific docs under `packages/*/docs/`

## Minimum checklist

1. Read applicable docs.
2. Keep changes scoped.
3. Run the right validation level:
   - monorepo root: `npm run quality:pre-push` (via `scripts/quality-gate.sh`)
   - package-level: `npm run check` (delegates to the root-owned package gate)
4. Update docs/handoffs when behavior changes.
5. Open a PR with validation output.

## Conduct + support

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SUPPORT.md](SUPPORT.md)
- [SECURITY.md](SECURITY.md)

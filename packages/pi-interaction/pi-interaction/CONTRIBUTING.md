---
summary: "Top-level contribution entrypoint linking to the detailed contributor guide."
read_when:
  - "Preparing to submit code or docs changes."
  - "Looking for contribution quality gates."
system4d:
  container: "Contribution intake and quality policy."
  compass: "Small, reviewable, verified changes."
  engine: "Read guide -> implement -> validate -> open PR."
  fog: "Project-specific constraints may evolve with release policy changes."
---

# Contributing

Primary contributor guide: [docs/dev/CONTRIBUTING.md](docs/dev/CONTRIBUTING.md)

## Minimum checklist

1. Read applicable docs (`npm run docs:list`).
2. Keep changes scoped.
3. Run `npm run fix`.
4. Run `npm run check`.
5. Update docs/changelog when behavior changes.
6. Open a PR with validation output.

## Biome suppressions

Canonical policy: [docs/dev/CONTRIBUTING.md#biome-suppression-policy](docs/dev/CONTRIBUTING.md#biome-suppression-policy)

- Every `biome-ignore` must include a short rationale.
- Long-lived suppressions must include a tracking reference (`TODO(#123)` or `Issue: #123`).

## Conduct + support

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SUPPORT.md](SUPPORT.md)

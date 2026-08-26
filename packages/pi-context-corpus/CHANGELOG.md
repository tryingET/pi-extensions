---
summary: "Changelog for scaffold evolution."
read_when:
  - "Preparing a release or reviewing history."
system4d:
  container: "Release log for this extension package."
  compass: "Track meaningful deltas per version."
  engine: "Document changes at release boundaries."
  fog: "Versioning policy may evolve with team preference."
---

# Changelog

All notable changes to this project should be documented here.

## [0.1.0] - 2026-08-26

### Added

- Initial multi-session corpus slice (P2.5): `corpus/index.json` + static HTML
  switcher over strata.json artifacts, named jq projections (`occupancy`,
  `faults`, `spend`, `ghosts`, `runway`, `sessions`, `topfiles`), optional batch
  orchestration via the overlay replay script, and fixture-pinned content-free
  outputs. Deliberately non-live private package (no `pi` manifest).

## [0.1.0-scaffold] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

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

## [Unreleased]

### Changed

- Routed `cognitive_dispatch` evidence recording through a shared `ak`-first helper instead of a bespoke direct SQL insert.
- Centralized evidence-write behavior behind `recordEvidence(...)`, keeping SQL fallback explicit while aligning `runAk(...)` with the configured `SOCIETY_DB` / `AK_DB` target.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

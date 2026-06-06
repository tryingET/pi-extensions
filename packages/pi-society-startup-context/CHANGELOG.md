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

- Made startup context two-tiered so `session_start` returns after a fast/minimal packet while the full AK/git refresh runs in the background.
- Replaced unfiltered `ak task list --machine` with filtered claimed/running/blocked task reads for bounded task posture.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

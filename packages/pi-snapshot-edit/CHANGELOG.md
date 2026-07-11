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

## [Unreleased] — first public release candidate

No version of `@tryinget/pi-snapshot-edit` has been published to npm. Version `0.1.0` is the release-please component floor and an unpublished internal development baseline; the first generated public release must describe the Protocol B implementation below rather than presenting Protocol A as a shipped npm release.

### Added

- `snapshot_read` and `snapshot_edit` with session-scoped, path-bound revision aliases.
- Guarded opt-in ownership of standard `read` and `edit` names for local dogfood.
- Protocol B raw reads, occurrence-qualified exact replacements, anchored insertions, immutable batch resolution, EOL-normalized selectors, and precise retired line-coordinate diagnostics.
- Stale-byte, file-identity, hard-link, overlap, cancellation, BOM, EOL, mode, byte-budget, pagination, and no-op safeguards.
- Provider-free packed-tarball smoke coverage for namespaced and standard tools, duplicate occurrences, exact bytes, legacy rejection, and revision expiry across restart.
- Jq-only aggregate analysis of historical Pi edit failures, protocol benchmarks, and blinded model-screen evidence.

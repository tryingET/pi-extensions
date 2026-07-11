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

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-snapshot-edit-v0.1.0...pi-snapshot-edit-v0.2.0) (2026-07-11)


### Features

* **snapshot-edit:** add blinded model protocol screen ([452a091](https://github.com/tryingET/pi-extensions/commit/452a091857e813d5349e3776752cf8043e76fcaf))
* **snapshot-edit:** add protocol scale crossover ([4b3d3a3](https://github.com/tryingET/pi-extensions/commit/4b3d3a3dc53566d7bb7683e3369721db8494d757))
* **snapshot-edit:** add snapshot-bound editing tools ([67222e7](https://github.com/tryingET/pi-extensions/commit/67222e742a9b7f3a66b43e4bcb423f2f6991c33f))
* **snapshot-edit:** adopt occurrence selector protocol ([c5f7e0f](https://github.com/tryingET/pi-extensions/commit/c5f7e0f2b1174bb02ed69e3ff7d185bd30f3cf52))


### Bug Fixes

* **snapshot-edit:** close npm release workflow gaps ([01eba1a](https://github.com/tryingET/pi-extensions/commit/01eba1adae71ffe049ec3986f721b66b92259db8))
* **snapshot-edit:** retain exact npm release tarball ([88d65b6](https://github.com/tryingET/pi-extensions/commit/88d65b6640778c3baf2ea841cb52ab35e1eb51ba))

## [Unreleased] — first public release candidate

No version of `@tryinget/pi-snapshot-edit` has been published to npm. Version `0.1.0` is the release-please component floor and an unpublished internal development baseline; the first generated public release must describe the Protocol B implementation below rather than presenting Protocol A as a shipped npm release.

### Added

- `snapshot_read` and `snapshot_edit` with session-scoped, path-bound revision aliases.
- Guarded opt-in ownership of standard `read` and `edit` names for local dogfood.
- Protocol B raw reads, occurrence-qualified exact replacements, anchored insertions, immutable batch resolution, EOL-normalized selectors, and precise retired line-coordinate diagnostics.
- Stale-byte, file-identity, hard-link, overlap, cancellation, BOM, EOL, mode, byte-budget, pagination, and no-op safeguards.
- Provider-free packed-tarball smoke coverage for namespaced and standard tools, duplicate occurrences, exact bytes, legacy rejection, and revision expiry across restart.
- Jq-only aggregate analysis of historical Pi edit failures, protocol benchmarks, and blinded model-screen evidence.

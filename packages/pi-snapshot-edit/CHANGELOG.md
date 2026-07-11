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

## [0.2.2](https://github.com/tryingET/pi-extensions/compare/pi-snapshot-edit-v0.2.1...pi-snapshot-edit-v0.2.2) (2026-07-11)


### Bug Fixes

* **snapshot-edit:** support jq 1.6 analyzer syntax ([eb28b96](https://github.com/tryingET/pi-extensions/commit/eb28b963f89715f7bf70c819f43e6305b38a125a))
* **snapshot-edit:** support runner jq syntax ([da3b1db](https://github.com/tryingET/pi-extensions/commit/da3b1dbbe7d72c0dc1c6112372e71590a249a990))

## [0.2.1](https://github.com/tryingET/pi-extensions/compare/pi-snapshot-edit-v0.2.0...pi-snapshot-edit-v0.2.1) (2026-07-11)


### Bug Fixes

* **snapshot-edit:** keep model timeout referenced ([a2d00b4](https://github.com/tryingET/pi-extensions/commit/a2d00b4b07ca892a8c7d92ccf243e39409aa95a3))
* **snapshot-edit:** keep model timeout referenced on Node 22 ([ff835b5](https://github.com/tryingET/pi-extensions/commit/ff835b5d2e17c5e7d3f7243e0261622c63239991))

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

### Fixed

- Parenthesize the jq category conditional before binding it with `as`, preserving analyzer compatibility with jq 1.6 on GitHub-hosted runners.
- Keep the model-screen timeout referenced until `runPi` settles so handle-free fake-child runs complete reliably on Node 22.

### Added

- `snapshot_read` and `snapshot_edit` with session-scoped, path-bound revision aliases.
- Guarded opt-in ownership of standard `read` and `edit` names for local dogfood.
- Protocol B raw reads, occurrence-qualified exact replacements, anchored insertions, immutable batch resolution, EOL-normalized selectors, and precise retired line-coordinate diagnostics.
- Stale-byte, file-identity, hard-link, overlap, cancellation, BOM, EOL, mode, byte-budget, pagination, and no-op safeguards.
- Provider-free packed-tarball smoke coverage for namespaced and standard tools, duplicate occurrences, exact bytes, legacy rejection, and revision expiry across restart.
- Jq-only aggregate analysis of historical Pi edit failures, protocol benchmarks, and blinded model-screen evidence.

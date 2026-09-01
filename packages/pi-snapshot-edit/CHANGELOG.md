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

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-snapshot-edit-v0.3.1...pi-snapshot-edit-v0.4.0) (2026-08-29)


### Features

* **file-budget:** exception remaining repo debt and ratchet every gate ([89b9faa](https://github.com/tryingET/pi-extensions/commit/89b9faa30bf47ef9f7d17730aa2c771d12bfca4f))


### Bug Fixes

* **monorepo:** raise fast-xml-parser security floor ([5bc4017](https://github.com/tryingET/pi-extensions/commit/5bc40171be113473b75429e8519dfc5f30e81e7f))
* **orchestrator:** promote governed runtime pins to the 0.84.3 host line ([9b2fda4](https://github.com/tryingET/pi-extensions/commit/9b2fda4721d37cbfbfc161cd79a971addabe58ea))

## [0.3.1](https://github.com/tryingET/pi-extensions/compare/pi-snapshot-edit-v0.3.0...pi-snapshot-edit-v0.3.1) (2026-08-15)


### Bug Fixes

* harden installed runtime composition ([8852cbf](https://github.com/tryingET/pi-extensions/commit/8852cbf79004c50035408225fd6cd18b021cba2d))
* **snapshot-edit:** normalize revision-header base slips and infer missing edit op ([5306ee3](https://github.com/tryingET/pi-extensions/commit/5306ee386aa1a07a60bb0cec37ab5c0965ee1bf0))

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-snapshot-edit-v0.2.2...pi-snapshot-edit-v0.3.0) (2026-07-11)


### Features

* **snapshot-edit:** own standard tools by default ([8662b2a](https://github.com/tryingET/pi-extensions/commit/8662b2a8bbe41a06f51313ebf8b9223954ed6eeb))

## [Unreleased]

### Added

- Clipboard image lift: host `pi-clipboard-*` tmpdir placeholders become user-message image parts via an `input` transform so default snapshot `read` replacement does not blind pasted screenshots.
- Read-tool guidelines treat a lifted clipboard image as a committed observation (do not OCR or re-read the PNG).

### Changed

- Edit `base` now accepts the rendered `revision:` header prefix and surrounding whitespace; the bare alias word remains canonical.
- A missing edit `op` is inferred from a uniquely present `oldText` or `anchorText` before schema validation; ambiguous shapes still fail closed.
- Unknown-revision errors now distinguish expired/unknown aliases from header-prefix slips, list still-held revision aliases, and point at the bare-alias form.
- Loading the extension now replaces positively identified built-in `read` and `edit` owners at `session_start` by default without changing the host's active-tool selection.
- `PI_SNAPSHOT_EDIT_OVERRIDE=0`, `false`, `off`, or `no` now retains namespaced-only tools.
- Legacy explicit enable surfaces remain available and may activate standard `read` and `edit`.
- Standard replacement continues to fail closed for missing built-ins or non-built-in owners.

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

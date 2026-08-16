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

## [0.2.2](https://github.com/tryingET/pi-extensions/compare/pi-society-startup-context-v0.2.1...pi-society-startup-context-v0.2.2) (2026-08-16)


### Bug Fixes

* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.2.1](https://github.com/tryingET/pi-extensions/compare/pi-society-startup-context-v0.2.0...pi-society-startup-context-v0.2.1) (2026-08-15)


### Bug Fixes

* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-society-startup-context-v0.1.0...pi-society-startup-context-v0.2.0) (2026-07-13)


### Features

* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))
* **pi-society-startup-context:** add fast startup packet tier ([6431724](https://github.com/tryingET/pi-extensions/commit/6431724203bb7207813c5124f99a504b060ef69e))
* **startup-context:** surface package posture hints ([ab70cca](https://github.com/tryingET/pi-extensions/commit/ab70ccab0100519909c8635953694905c7ba3fbd))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))

## [Unreleased]

### Changed

- Made startup context two-tiered so `session_start` returns after a fast/minimal packet while the full AK/git refresh runs in the background.
- Replaced unfiltered `ak task list --machine` with filtered claimed/running/blocked task reads for bounded task posture.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

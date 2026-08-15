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

## [0.3.1](https://github.com/tryingET/pi-extensions/compare/pi-toolbox-discovery-v0.3.0...pi-toolbox-discovery-v0.3.1) (2026-08-15)


### Bug Fixes

* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))
* **toolbox:** harden D2E read profile ([d117d27](https://github.com/tryingET/pi-extensions/commit/d117d275e0e0eb6075b3e72c646536bfa944be7e))

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-toolbox-discovery-v0.2.0...pi-toolbox-discovery-v0.3.0) (2026-08-01)


### Features

* **orchestrator:** expose direction controller readback ([53481db](https://github.com/tryingET/pi-extensions/commit/53481dbcd9c9ce56075a1f5f55f2821e0a8da3f0))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-toolbox-discovery-v0.1.1...pi-toolbox-discovery-v0.2.0) (2026-07-11)


### Features

* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))
* **toolbox:** keep loop executor always active ([7ab7ea1](https://github.com/tryingET/pi-extensions/commit/7ab7ea1b670c3f327ba9b0981b5abe4ef0011288))
* **toolbox:** recommend capability bundles ([bf03973](https://github.com/tryingET/pi-extensions/commit/bf039731a6b1dd3d6ada2b32ba32b517e3a2b8d3))
* **toolbox:** verify and roll back active-set changes ([6e00f11](https://github.com/tryingET/pi-extensions/commit/6e00f11c343aae1ae1c1ea87b2ee16721308480d))


### Bug Fixes

* **toolbox:** guide agent vent diagnostic previews ([7a010f8](https://github.com/tryingET/pi-extensions/commit/7a010f8bc051b16786c88d639c11665ab4c04ee7))

## [0.1.1] - 2026-05-22

### Changed

- Removed the `agent-vent` toolbox bundle alias; the diagnostic bundle id is only `agent_vent`.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

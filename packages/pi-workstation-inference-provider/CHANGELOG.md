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

## [0.3.2](https://github.com/tryingET/pi-extensions/compare/pi-workstation-inference-provider-v0.3.1...pi-workstation-inference-provider-v0.3.2) (2026-08-22)


### Bug Fixes

* **provider:** propagate partial lane degradation from adapter health bodies ([0d93c77](https://github.com/tryingET/pi-extensions/commit/0d93c77eca0fc50283a0544bb2b19528a6c3e05d))

## [0.3.1](https://github.com/tryingET/pi-extensions/compare/pi-workstation-inference-provider-v0.3.0...pi-workstation-inference-provider-v0.3.1) (2026-08-22)


### Performance Improvements

* **pi-workstation-inference-provider:** optimize local inference hot path ([#135](https://github.com/tryingET/pi-extensions/issues/135)) ([d82ba66](https://github.com/tryingET/pi-extensions/commit/d82ba661025a3a47b59cfcf8a0d54aed30b0bc3f))

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-workstation-inference-provider-v0.2.0...pi-workstation-inference-provider-v0.3.0) (2026-08-15)


### Features

* **provider:** add scheduler-governed Inkling audio ([8020862](https://github.com/tryingET/pi-extensions/commit/802086278ee35cf28e5ccebd66e6b105d8e5ec89))


### Bug Fixes

* **provider:** deny unclaimed Inkling requests ([5698877](https://github.com/tryingET/pi-extensions/commit/56988777273b02e88a0346fd3828f989ff7c5d3d))
* **provider:** preserve scheduler revision lexemes ([85386c8](https://github.com/tryingET/pi-extensions/commit/85386c895027fa1411f2047a6876178448c66fd0))
* **provider:** recover Workbench socket PONR on current main (AK-4525) ([b3326a7](https://github.com/tryingET/pi-extensions/commit/b3326a78c20c2d3f94a67dee0e7aa93a39b363bb))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-workstation-inference-provider-v0.1.0...pi-workstation-inference-provider-v0.2.0) (2026-07-13)


### Features

* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

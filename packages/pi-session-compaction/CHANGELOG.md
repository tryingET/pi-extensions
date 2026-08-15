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

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-session-compaction-v0.2.1...pi-session-compaction-v0.3.0) (2026-08-15)


### Features

* **pi-session-compaction:** preserve last assistant message verbatim across compaction ([8d2cbb0](https://github.com/tryingET/pi-extensions/commit/8d2cbb04b022abb214a64db6c530a865c6ae7249))
* **pi-session-compaction:** translate thinking levels to host ModelRegistry API options ([ebc8c49](https://github.com/tryingET/pi-extensions/commit/ebc8c495e03db0283315ac83eccee130eb13f4d5))
* **pi:** add clean handoff tab continuation ([11b3fde](https://github.com/tryingET/pi-extensions/commit/11b3fde6026e11a3a6e189e3cdd95a9ebcc5e3d2))
* **telemetry:** resolve telemetry limits — source-emitted failures, backfill, provenance ([8fb1f31](https://github.com/tryingET/pi-extensions/commit/8fb1f31869271c88f39a23ab7263c1e1b059ad41))


### Bug Fixes

* exhaust deep-review blockers from the session commit wave ([0689d42](https://github.com/tryingET/pi-extensions/commit/0689d4279f92caa24c0b5b739c38de5f24c57fb6))

## [0.2.1](https://github.com/tryingET/pi-extensions/compare/pi-session-compaction-v0.2.0...pi-session-compaction-v0.2.1) (2026-08-01)


### Bug Fixes

* **compaction:** delegate model calls to Pi host ([12a4976](https://github.com/tryingET/pi-extensions/commit/12a4976d287633bd9e86a84b02c0574f87e72dc1))
* **compaction:** keep model credentials host-owned ([0053376](https://github.com/tryingET/pi-extensions/commit/0053376be1bb6fda561e53e8ea744de685baf2f3))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-session-compaction-v0.1.0...pi-session-compaction-v0.2.0) (2026-07-13)


### Features

* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **compaction:** preserve discovery promotion status ([9573be8](https://github.com/tryingET/pi-extensions/commit/9573be82eccaf54deec57aa2370486981ce76398))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* **compaction:** own fresh session handoff prompts ([4300ea9](https://github.com/tryingET/pi-extensions/commit/4300ea95025703465c586d5050f3181230d030f2))

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

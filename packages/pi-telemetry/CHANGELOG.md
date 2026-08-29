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

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-telemetry-v0.3.1...pi-telemetry-v0.4.0) (2026-08-29)


### Features

* **file-budget:** exception remaining repo debt and ratchet every gate ([89b9faa](https://github.com/tryingET/pi-extensions/commit/89b9faa30bf47ef9f7d17730aa2c771d12bfca4f))
* **pi-telemetry:** causal compaction-failure telemetry via session_compact_failed ([56d5782](https://github.com/tryingET/pi-extensions/commit/56d5782cb4cf159a59fda2e332c14804f85ac0e4))


### Bug Fixes

* **monorepo:** isolate provider-free release checks ([2a7c28c](https://github.com/tryingET/pi-extensions/commit/2a7c28cce24a8791f02db404eecdc56e4f8e558c))
* **monorepo:** raise fast-xml-parser security floor ([5bc4017](https://github.com/tryingET/pi-extensions/commit/5bc40171be113473b75429e8519dfc5f30e81e7f))
* **orchestrator:** promote governed runtime pins to the 0.84.3 host line ([9b2fda4](https://github.com/tryingET/pi-extensions/commit/9b2fda4721d37cbfbfc161cd79a971addabe58ea))
* **pi-telemetry:** remove legacy Pi peer aliases ([5109465](https://github.com/tryingET/pi-extensions/commit/5109465e1b79b148aabea149dd3e88af6a288d9b))

## [0.3.1](https://github.com/tryingET/pi-extensions/compare/pi-telemetry-v0.3.0...pi-telemetry-v0.3.1) (2026-08-22)


### Bug Fixes

* **telemetry:** satisfy the package's own enforced TypeScript and lint contracts ([ad988c2](https://github.com/tryingET/pi-extensions/commit/ad988c2988bc3e8172b40e8c1b19746c0a8f0bc6))

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-telemetry-v0.2.0...pi-telemetry-v0.3.0) (2026-08-20)


### Features

* add stable context providers and P1 compaction continuity ([47cfcd1](https://github.com/tryingET/pi-extensions/commit/47cfcd1b15170e47c217b970bb615a9e572bf1bd))
* **pi-telemetry:** complete review snapshot package contract ([#129](https://github.com/tryingET/pi-extensions/issues/129)) ([c1bcac2](https://github.com/tryingET/pi-extensions/commit/c1bcac2c3eb13e789007b7bd072075f2b696143d))


### Bug Fixes

* **packages:** drop wildcard exports the release-contract validator rejects ([ae3504f](https://github.com/tryingET/pi-extensions/commit/ae3504f2d44fb175e88ab8d4f21e803c4bdf793b))
* **pi-telemetry:** enforce TypeScript compiler checks ([#127](https://github.com/tryingET/pi-extensions/issues/127)) ([ff14b93](https://github.com/tryingET/pi-extensions/commit/ff14b9371354907c1ab5ce9a4688dcc301207665))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-telemetry-v0.1.0...pi-telemetry-v0.2.0) (2026-08-15)


### Features

* **pi-telemetry:** runtime telemetry package ([0b21c2d](https://github.com/tryingET/pi-extensions/commit/0b21c2d83973d938bd3fceede871c78e54ed97a2))
* **telemetry:** resolve telemetry limits — source-emitted failures, backfill, provenance ([8fb1f31](https://github.com/tryingET/pi-extensions/commit/8fb1f31869271c88f39a23ab7263c1e1b059ad41))

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

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

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-agent-registry-v0.1.0...pi-agent-registry-v0.2.0) (2026-08-29)


### Features

* add standing agent registry (AK 5098) ([2546d91](https://github.com/tryingET/pi-extensions/commit/2546d9136d7a3645ee95d57d72e682a136729e54))
* **file-budget:** exception remaining repo debt and ratchet every gate ([89b9faa](https://github.com/tryingET/pi-extensions/commit/89b9faa30bf47ef9f7d17730aa2c771d12bfca4f))


### Bug Fixes

* **deps:** restore exact typebox pins unintentionally loosened by host sweep ([2ff3cfb](https://github.com/tryingET/pi-extensions/commit/2ff3cfb4b8b2fcd93312a8bf806185de110c4073))
* **monorepo:** raise fast-xml-parser security floor ([5bc4017](https://github.com/tryingET/pi-extensions/commit/5bc40171be113473b75429e8519dfc5f30e81e7f))
* **orchestrator:** promote governed runtime pins to the 0.84.3 host line ([9b2fda4](https://github.com/tryingET/pi-extensions/commit/9b2fda4721d37cbfbfc161cd79a971addabe58ea))
* **pi-agent-registry:** harden release artifact verification ([4d1ae42](https://github.com/tryingET/pi-extensions/commit/4d1ae42bc33a7ae69cdf14f38cec08d4ab7b9741))
* **release:** bound git capture buffers and resolve ASC from registry ([3919531](https://github.com/tryingET/pi-extensions/commit/3919531cae0f517505947e62a47d69f3c8b73322))
* **release:** bound test subprocess buffers and unbundle ASC from pi-agent-registry ([cbdc6ac](https://github.com/tryingET/pi-extensions/commit/cbdc6ac3eac6384f074bcb98ec8addce690aadb7))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @tryinget/pi-autonomous-session-control bumped from 0.5.2 to 0.6.0

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

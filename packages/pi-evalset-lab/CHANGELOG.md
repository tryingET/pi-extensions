---
summary: "Changelog for @tryinget/pi-evalset-lab."
read_when:
  - "Preparing a release or reviewing history."
system4d:
  container: "Release log for this extension package."
  compass: "Track meaningful deltas per version."
  engine: "Document changes at release boundaries."
  fog: "Legacy standalone history predates monorepo canonicalization."
---

# Changelog

All notable changes to this project should be documented here.

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-evalset-lab-v0.3.1...pi-evalset-lab-v0.4.0) (2026-08-29)


### Features

* **file-budget:** exception remaining repo debt and ratchet every gate ([89b9faa](https://github.com/tryingET/pi-extensions/commit/89b9faa30bf47ef9f7d17730aa2c771d12bfca4f))


### Bug Fixes

* **monorepo:** isolate install-only release checks ([e83c9bd](https://github.com/tryingET/pi-extensions/commit/e83c9bdefbcf5406e8eb4be6beef7245ed0eb655))
* **monorepo:** raise fast-xml-parser security floor ([5bc4017](https://github.com/tryingET/pi-extensions/commit/5bc40171be113473b75429e8519dfc5f30e81e7f))
* **orchestrator:** promote governed runtime pins to the 0.84.3 host line ([9b2fda4](https://github.com/tryingET/pi-extensions/commit/9b2fda4721d37cbfbfc161cd79a971addabe58ea))

## [0.3.1](https://github.com/tryingET/pi-extensions/compare/pi-evalset-lab-v0.3.0...pi-evalset-lab-v0.3.1) (2026-08-15)


### Bug Fixes

* **pi-evalset-lab:** adopt provider headers contract and Pi 0.84.1 dev host ([f1d2745](https://github.com/tryingET/pi-extensions/commit/f1d27457a34187002734f1245c2f282ac398d242))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-evalset-lab-v0.2.0...pi-evalset-lab-v0.3.0) (2026-07-13)


### Features

* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))

## [Unreleased]

### Changed

- Canonicalized the legacy standalone `pi-evalset-lab` package into the `pi-extensions` monorepo at `packages/pi-evalset-lab`.
- Switched npm identity to scoped monorepo package name `@tryinget/pi-evalset-lab` while preserving legacy runtime version `0.2.0`.
- Moved release automation to root-managed component metadata (`pi-evalset-lab`).
- Removed the former standalone `~/programming/pi-extensions/` workspace after canonicalization; no legacy Pi session-history directory existed for `pi-evalset-lab` to relocate.

## [0.2.0](https://github.com/tryingET/pi-evalset-lab/compare/v0.1.0...v0.2.0) (2026-02-17)

### Features

- **evalset:** add JSON to HTML report export helper ([802e7d2](https://github.com/tryingET/pi-evalset-lab/commit/802e7d2a13a44205e519e0f0c778788fd093340f))

### Added

- Added `/evalset` MVP command with subcommands:
  - `init` to generate a starter fixed-task-set dataset
  - `run` to evaluate one variant against a dataset
  - `compare` to evaluate baseline vs candidate system prompts
- Added example files in `examples/`:
  - `fixed-task-set.json`
  - `fixed-task-set-v2.json`
  - `fixed-task-set-v3.json`
  - `evalset-compare-sample-embedded.html`
  - `evalset-compare-sample.png`
  - `system-baseline.txt`
  - `system-candidate.txt`
- Added report output support to `.evalset/reports/*.json` with per-case and aggregate metrics.
- Added run identity metadata to reports (`runId`, `datasetHash`, `casesHash`, `variantHash`).
- Reduced session message payload size by storing only lightweight report metadata instead of full report bodies.
- Added `scripts/export-evalset-report-html.mjs` and `npm run evalset:export-html` for repeatable JSON -> static HTML report exports.

### Changed

- Clarified `/evalset` invocation docs: use `pi -p` (or `pi -e ... -p`) for non-interactive runs; `/evalset` is not a standalone shell binary.
- Added the same non-interactive invocation note to `/evalset help` output.
- Declared publish-time runtime artifacts with `package.json` `files` whitelist and documented peer/runtime dependency behavior in README.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

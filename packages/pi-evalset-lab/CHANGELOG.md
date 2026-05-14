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

## [Unreleased]

### Changed

- Canonicalized the legacy standalone `pi-evalset-lab` package into the `pi-extensions` monorepo at `packages/pi-evalset-lab`.
- Switched npm identity to scoped monorepo package name `@tryinget/pi-evalset-lab` while preserving legacy runtime version `0.2.0`.
- Moved release automation to root-managed component metadata (`pi-evalset-lab`).
- Archived the former standalone working copy to `~/programming/pi-extensions/pi-evalset-lab-final-archive.tar.gz` and removed it after validation; no legacy Pi session-history directory existed to relocate.

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

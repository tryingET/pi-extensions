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

## [Unreleased]

### Changed

- Routed runtime `sqlite3`, `dolt`, and `rocs-cli` read paths through async, timeout-bound supervised helpers instead of synchronous runtime `execFileSync` calls.
- Tightened cognitive-tool lookup by name so non-cognitive prompt templates cannot be injected into dispatch or loop execution.
- Made explicit `societyDb` targeting outrank ambient `AK_DB` for `ak`-backed runtime calls.
- Expanded `society_query` read-only gating to allow valid read-only `WITH ... SELECT ...` diagnostics while still rejecting mutating or stacked SQL.
- Isolated `npm run release:check` installs behind a temporary `NPM_CONFIG_PREFIX` so routine release validation does not mutate the default global npm package space.
- Routed `cognitive_dispatch` evidence recording through a shared `ak`-first helper instead of a bespoke direct SQL insert.
- Centralized evidence-write behavior behind `recordEvidence(...)`, keeping SQL fallback explicit while aligning `runAk(...)` with the configured `SOCIETY_DB` / `AK_DB` target.
- Migrated `ontology_context` and `/ontology` from raw ontology SQL reads to a shared `rocs-cli` adapter that resolves ROCS build/index artifacts against the configured ontology repo.
- Replaced package-local `docs/dev/` usage with `docs/project/` + `docs/adr/` nomenclature and updated package handoff/README links accordingly.
- Clarified monorepo AK task/work-item guidance in AGENTS/README: use the repo-root `./scripts/ak.sh` wrapper (or `../../scripts/ak.sh` from this package) instead of treating a package folder as an independent repo root.
- Updated the package template in parallel so new monorepo package scaffolds inherit the same docs placement and AK-wrapper guidance.
- Moved `/evidence` off raw sqlite reads onto `ak evidence search` and isolated `society_query` behind a dedicated bounded diagnostic-exception helper.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

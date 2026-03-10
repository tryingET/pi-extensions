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

### Added

- `docs/dev/status.md` to track current package truth after the Prompt Vault schema-v9 cutover.
- `vault_schema_diagnostics()` tool surface for headless/runtime schema diagnostics.
- installed/headless validation guidance for schema diagnostics and governed query verification.

### Changed

- Prompt Vault compatibility is now documented as schema `v9` only.
- startup behavior is now documented as diagnostic-mode-on-mismatch rather than total extension disappearance.
- `NEXT_SESSION_PROMPT.md` now reflects the current post-cutover state and routes PTX/Prompt Vault-doc work to the correct repo.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

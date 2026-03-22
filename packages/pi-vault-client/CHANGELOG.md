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

- `docs/dev/vault-execution-receipts.md` as the durable architecture note for execution-bound receipt and replay design.
- repo-local diary capture and executable session handoff patterns via `diary/` and `NEXT_SESSION_PROMPT.md`.
- `vault_schema_diagnostics()` tool surface for headless/runtime schema diagnostics.
- installed/headless validation guidance for schema diagnostics and governed query verification.

### Changed

- live `/vault:` trigger registration now uses a non-zero debounce (`150ms`) so the shared interaction runtime does not rapid-fire picker work on every keystroke.
- the live-trigger compatibility lane now includes a broker-driven executable `/vault:` contract test instead of relying only on source-text regression assertions.
- the package docs now point operators at the focused live-trigger validation lane and the root-owned `vault-live-trigger-contract` compatibility canary scenario.
- Prompt Vault compatibility is now documented as schema `v9` only.
- startup behavior is now documented as diagnostic-mode-on-mismatch rather than total extension disappearance.
- `NEXT_SESSION_PROMPT.md` now reflects the current post-cutover state and routes PTX/Prompt Vault-doc work to the correct repo.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

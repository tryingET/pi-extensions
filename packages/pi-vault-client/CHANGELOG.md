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

## [0.2.0] - 2026-07-13

### Added

- fail-closed aggregate dispatch authorization with single-use identity claims and package-owned runtime provenance.
- durable pre-handoff receipts and explicit gated-executor activation/rollback controls.

- `docs/dev/vault-execution-receipts.md` as the durable architecture note for execution-bound receipt and replay design.
- repo-local diary capture and executable session handoff patterns via `diary/` and `next_session_prompt.md`.
- `vault_schema_diagnostics()` tool surface for headless/runtime schema diagnostics.
- installed/headless validation guidance for schema diagnostics and governed query verification.

### Changed

- all Vault execution ingresses now deny missing, malformed, unknown, unbound, mixed, or identity-drifted templates.
- projection diagnostics now consume Prompt Vault quarantine receipt v2 and reject unsafe raw projection paths.

- live `/vault:` trigger registration now uses a non-zero debounce (`150ms`) so the shared interaction runtime does not rapid-fire picker work on every keystroke.
- the live-trigger compatibility lane now includes a broker-driven executable `/vault:` contract test instead of relying only on source-text regression assertions.
- the package docs now point operators at the focused live-trigger validation lane and the root-owned `vault-live-trigger-contract` compatibility canary scenario.
- Prompt Vault compatibility is now documented as schema `v9` only.
- startup behavior is now documented as diagnostic-mode-on-mismatch rather than total extension disappearance.
- `next_session_prompt.md` now reflects the current post-cutover state and routes PTX/Prompt Vault-doc work to the correct repo.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

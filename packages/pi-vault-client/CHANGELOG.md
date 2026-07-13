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

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-vault-client-v0.2.0...pi-vault-client-v0.3.0) (2026-07-13)


### Features

* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))
* **vault:** enforce fail-closed dispatch authorization ([a81e3de](https://github.com/tryingET/pi-extensions/commit/a81e3dec00671523ba2b898187350d3802f9476a))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))

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

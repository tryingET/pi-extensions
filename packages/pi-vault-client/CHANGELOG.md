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

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-vault-client-v0.1.0...pi-vault-client-v0.2.0) (2026-04-14)


### Features

* add pi-vault-client package ([2806a6d](https://github.com/tryingET/pi-extensions/commit/2806a6d5b81e4054c49546f989c316f24d6f163d))
* expose pi-vault-client prompt-plane seam ([9deaa4f](https://github.com/tryingET/pi-extensions/commit/9deaa4f6e0a1166e707b105cfce7b41adb8a65d9))
* **extensions:** add prompt snippets for pi 0.59+ tool discoverability ([e516af2](https://github.com/tryingET/pi-extensions/commit/e516af2e3505e2901d6cb5b0c31581cda38eacad))
* harden Pi 0.65 compatibility and AK launcher ([b0a922c](https://github.com/tryingET/pi-extensions/commit/b0a922c25aa7a9f36c05a1e336306ed3b4ad96ef))
* **monorepo:** add packaged helpers and host-compat hardening ([0ec674c](https://github.com/tryingET/pi-extensions/commit/0ec674c9985875b315bae0929b102b04c1f4c666))
* **pi-vault-client:** add receipt replay core ([9a3578d](https://github.com/tryingET/pi-extensions/commit/9a3578d9a209204d44b513bd853dcf9eff387c88))
* **pi-vault-client:** add vault replay surface ([26a53bf](https://github.com/tryingET/pi-extensions/commit/26a53bfb7f0418f9d7a1321f81095c79464759c6))
* **pi-vault-client:** bridge receipts and telemetry into runtime registry ([2445fc9](https://github.com/tryingET/pi-extensions/commit/2445fc9e79645d2bb395eb2b241136d3af9aeee3))
* **pi-vault-client:** de-vendor interaction bridge ([e37e39c](https://github.com/tryingET/pi-extensions/commit/e37e39c360940127c2fd9b86ecf8e40860916010))
* **pi-vault-client:** harden company context and trusted receipts ([d7ca7a3](https://github.com/tryingET/pi-extensions/commit/d7ca7a3de749eae246b63606d5388c72332447e0))
* **pi-vault-client:** harden vault execution contracts ([b264914](https://github.com/tryingET/pi-extensions/commit/b264914cd3cb63bafd187d069b09610b71f653ad))
* **pi-vault-client:** harden vault execution receipt binding ([b611286](https://github.com/tryingET/pi-extensions/commit/b611286f350e20c3a8af7c71171e8a53766097f6))
* **pi-vault-client:** move prompt_eval variants to local company-scoped JSONL storage with real LLM judging ([08d7a4c](https://github.com/tryingET/pi-extensions/commit/08d7a4c2ac33f41b9c891ad1361a8bfd8ebb48c4))
* **pi-vault-client:** refine vault query discovery and ranking ([23ba772](https://github.com/tryingET/pi-extensions/commit/23ba772d83fbfeaa41d7f90d6d6478d715df21ac))
* **release:** add portable doc surface validation and harden release gate ([f498e7d](https://github.com/tryingET/pi-extensions/commit/f498e7da72867733e824cd088e791712dbd6d7b4))
* **release:** prove prompt-plane seam packaging ([adc9793](https://github.com/tryingET/pi-extensions/commit/adc97931849e8ac5fd231a4aa48576ed7d26ac51))
* **vault-client:** add 150ms debounce to live vault trigger, add contract test ([1fcb325](https://github.com/tryingET/pi-extensions/commit/1fcb3252e87f75b6e73133f7a713c3bdb2c6f979))
* **vault:** add Dolt temp-dir contract with fallback chain and diagnostics ([d0b1218](https://github.com/tryingET/pi-extensions/commit/d0b1218497a52aa6134328eebca90de63c389283))
* **vault:** harden governance boundaries and receipt persistence ([821fd0b](https://github.com/tryingET/pi-extensions/commit/821fd0baa27216174b2812bbeadd7065e5404870))


### Bug Fixes

* **pi-vault-client:** align local interaction package deps ([e60c308](https://github.com/tryingET/pi-extensions/commit/e60c3087741dd7f3728f9146cf1781dcf4bf0d50))
* **pi-vault-client:** align vault runtime and docs with schema v9 ([fb06000](https://github.com/tryingET/pi-extensions/commit/fb060006d5dd2af9a402a5f07168ca74185f502f))
* **pi-vault-client:** append caller context in framework grounding, centralize receipt dedup ([fad0621](https://github.com/tryingET/pi-extensions/commit/fad06218afbdba30316ff1d9bf041eae0a85c774))
* **pi-vault-client:** converge receipt authority and override limits ([829c6fa](https://github.com/tryingET/pi-extensions/commit/829c6fabe6f76d9b2f81e2399668d4ad4022110b))
* **pi-vault-client:** fail closed on explicit cwd prompt-plane context ([5e7a566](https://github.com/tryingET/pi-extensions/commit/5e7a5662cd24825ef324d05243aa2ea6291e3ebf))
* **pi-vault-client:** fail closed on prompt variant persistence ([163b324](https://github.com/tryingET/pi-extensions/commit/163b3249ce7f51265a8a4aab9f9a0ad35afbcee6))
* **pi-vault-client:** harden governance boundaries for headless commands and receipt trust ([540547d](https://github.com/tryingET/pi-extensions/commit/540547d9537ed0f1ddb379248db0809ff7482da4))
* **pi-vault-client:** harden prepared prompt finalization ([baf5291](https://github.com/tryingET/pi-extensions/commit/baf529120c250ea2067272dc1bc07b18402f46e2))
* **pi-vault-client:** isolate telemetry and mark partial executions ([f7ac9e7](https://github.com/tryingET/pi-extensions/commit/f7ac9e7f540ac98457d9986b321a192318d76689))
* restore inline custom picker bridge ([61bfb39](https://github.com/tryingET/pi-extensions/commit/61bfb39722ae5bd1591249efb4d7004868facf5d))
* **vault:** infer company context from holdingco lanes ([bde31df](https://github.com/tryingET/pi-extensions/commit/bde31df97df0e0efd499c8072f8f46cb3399ddb0))
* **vault:** use active company-visible runtime reads ([c764097](https://github.com/tryingET/pi-extensions/commit/c7640975cf98447684a72df33726a1939c6e8f23))

## [Unreleased]

### Added

- `docs/dev/vault-execution-receipts.md` as the durable architecture note for execution-bound receipt and replay design.
- repo-local diary capture and executable session handoff patterns via `diary/` and `next_session_prompt.md`.
- `vault_schema_diagnostics()` tool surface for headless/runtime schema diagnostics.
- installed/headless validation guidance for schema diagnostics and governed query verification.

### Changed

- live `/vault:` trigger registration now uses a non-zero debounce (`150ms`) so the shared interaction runtime does not rapid-fire picker work on every keystroke.
- the live-trigger compatibility lane now includes a broker-driven executable `/vault:` contract test instead of relying only on source-text regression assertions.
- the package docs now point operators at the focused live-trigger validation lane and the root-owned `vault-live-trigger-contract` compatibility canary scenario.
- Prompt Vault compatibility is now documented as schema `v9` only.
- startup behavior is now documented as diagnostic-mode-on-mismatch rather than total extension disappearance.
- `next_session_prompt.md` now reflects the current post-cutover state and routes PTX/Prompt Vault-doc work to the correct repo.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

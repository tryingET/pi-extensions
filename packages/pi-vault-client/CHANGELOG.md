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

## [0.7.0](https://github.com/tryingET/pi-extensions/compare/pi-vault-client-v0.6.0...pi-vault-client-v0.7.0) (2026-08-27)


### Features

* **vault-client:** write retrieval analytics to SQLite sidecar ([d6624fe](https://github.com/tryingET/pi-extensions/commit/d6624fe800303fa46cdf487582661229964c0368))


### Bug Fixes

* honor fast-xml-parser 5.3.6 override in five host-closure locks ([a4ff737](https://github.com/tryingET/pi-extensions/commit/a4ff737ac4a4620c302b65da2bd20a2ed0585d8c))
* **monorepo:** raise fast-xml-parser security floor ([5bc4017](https://github.com/tryingET/pi-extensions/commit/5bc40171be113473b75429e8519dfc5f30e81e7f))
* **pi-vault-client:** advance trigger adapter dependency ([472858d](https://github.com/tryingET/pi-extensions/commit/472858d3a542ba891d84834e6a5d605bcb2237a1))
* **vault-client:** align schema compatibility contract with Prompt Vault v12 ([07018df](https://github.com/tryingET/pi-extensions/commit/07018df72aa49d70d64e45c0467c8739540a03b4))
* **vault-client:** gate on compatibility range + epoch, not schema equality ([501163b](https://github.com/tryingET/pi-extensions/commit/501163b609c7d798d75127176cbf4de4427b08f5))

## [0.6.0](https://github.com/tryingET/pi-extensions/compare/pi-vault-client-v0.5.0...pi-vault-client-v0.6.0) (2026-08-15)


### Features

* **orchestrator:** consume negative-only execution memory ([3fb5f20](https://github.com/tryingET/pi-extensions/commit/3fb5f200597f53a74786ad5288b98bd230682e45))
* **orchestrator:** gate D2E transfer completion ([a04b007](https://github.com/tryingET/pi-extensions/commit/a04b0074f55ecea1fc5063d8e6b7ae2962b63d41))
* **orchestrator:** integrate D2E transfer gate ([b00f3ec](https://github.com/tryingET/pi-extensions/commit/b00f3ec463c6ed120002f397143bba203338be23))
* **pi-vault-client:** record retrieval analytics (schema v10 companion) ([d28b9ab](https://github.com/tryingET/pi-extensions/commit/d28b9ab3e75312d1a0a0339542feb5ac53aba262))
* preflight governed deep review runtime ([1a65188](https://github.com/tryingET/pi-extensions/commit/1a651888ef4038a1520cf42986c9541e02b12d6d))


### Bug Fixes

* close governed deep-review provenance gaps ([c70967a](https://github.com/tryingET/pi-extensions/commit/c70967acd34dd321f889ca48f97ce0f5e0c31e7e))
* exhaust deep-review blockers from the session commit wave ([0689d42](https://github.com/tryingET/pi-extensions/commit/0689d4279f92caa24c0b5b739c38de5f24c57fb6))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))
* **vault:** align dispatch authorization with schema v9 ([b71ebbd](https://github.com/tryingET/pi-extensions/commit/b71ebbd1bc1fd9734bb7db930c42766cf8038658))
* **vault:** seal public declaration boundary ([60c71d2](https://github.com/tryingET/pi-extensions/commit/60c71d2cea831850066a871ddbfe0fa9012611e2))
* **visible-loop:** govern deep-review workflow dispatch ([f5384ff](https://github.com/tryingET/pi-extensions/commit/f5384ff524a92e78ea9af07c4d5c634bb31356d1))


### Performance Improvements

* **pi-vault-client:** defer startup initialization ([472eab8](https://github.com/tryingET/pi-extensions/commit/472eab811e8f22e3506f50cfa4984bba52af5e3a))

## [0.5.0](https://github.com/tryingET/pi-extensions/compare/pi-vault-client-v0.4.0...pi-vault-client-v0.5.0) (2026-08-15)


### Features

* **orchestrator:** consume negative-only execution memory ([3fb5f20](https://github.com/tryingET/pi-extensions/commit/3fb5f200597f53a74786ad5288b98bd230682e45))
* **pi-vault-client:** record retrieval analytics (schema v10 companion) ([d28b9ab](https://github.com/tryingET/pi-extensions/commit/d28b9ab3e75312d1a0a0339542feb5ac53aba262))


### Bug Fixes

* exhaust deep-review blockers from the session commit wave ([0689d42](https://github.com/tryingET/pi-extensions/commit/0689d4279f92caa24c0b5b739c38de5f24c57fb6))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-vault-client-v0.3.0...pi-vault-client-v0.4.0) (2026-08-01)


### Features

* **orchestrator:** gate D2E transfer completion ([a04b007](https://github.com/tryingET/pi-extensions/commit/a04b0074f55ecea1fc5063d8e6b7ae2962b63d41))
* **orchestrator:** integrate D2E transfer gate ([b00f3ec](https://github.com/tryingET/pi-extensions/commit/b00f3ec463c6ed120002f397143bba203338be23))
* preflight governed deep review runtime ([1a65188](https://github.com/tryingET/pi-extensions/commit/1a651888ef4038a1520cf42986c9541e02b12d6d))


### Bug Fixes

* close governed deep-review provenance gaps ([c70967a](https://github.com/tryingET/pi-extensions/commit/c70967acd34dd321f889ca48f97ce0f5e0c31e7e))
* **vault:** align dispatch authorization with schema v9 ([b71ebbd](https://github.com/tryingET/pi-extensions/commit/b71ebbd1bc1fd9734bb7db930c42766cf8038658))
* **vault:** seal public declaration boundary ([60c71d2](https://github.com/tryingET/pi-extensions/commit/60c71d2cea831850066a871ddbfe0fa9012611e2))
* **visible-loop:** govern deep-review workflow dispatch ([f5384ff](https://github.com/tryingET/pi-extensions/commit/f5384ff524a92e78ea9af07c4d5c634bb31356d1))


### Performance Improvements

* **pi-vault-client:** defer startup initialization ([472eab8](https://github.com/tryingET/pi-extensions/commit/472eab811e8f22e3506f50cfa4984bba52af5e3a))

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

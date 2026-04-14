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

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-society-orchestrator-v0.1.0...pi-society-orchestrator-v0.2.0) (2026-04-14)


### Features

* add bounded ops-plane history surfaces ([ea0a1e1](https://github.com/tryingET/pi-extensions/commit/ea0a1e1b89e0365c6b7e2a0ef19afc8b69ddc2f9))
* **extensions:** add prompt snippets for pi 0.59+ tool discoverability ([e516af2](https://github.com/tryingET/pi-extensions/commit/e516af2e3505e2901d6cb5b0c31581cda38eacad))
* harden Pi 0.65 compatibility and AK launcher ([b0a922c](https://github.com/tryingET/pi-extensions/commit/b0a922c25aa7a9f36c05a1e336306ed3b4ad96ef))
* **monorepo:** add packaged helpers and host-compat hardening ([0ec674c](https://github.com/tryingET/pi-extensions/commit/0ec674c9985875b315bae0929b102b04c1f4c666))
* normalize ASC execution failure taxonomy ([2a43c58](https://github.com/tryingET/pi-extensions/commit/2a43c58e0012bcdc6f4ea6bfcb75ca770b04c60c))
* **orchestrator:** adopt ASC execution truth, abort propagation, and seam charter ([a39903f](https://github.com/tryingET/pi-extensions/commit/a39903f4036b65717481b648988d1edd4a4f0f09))
* **orchestrator:** consume vault prompt-plane seam ([f820cb4](https://github.com/tryingET/pi-extensions/commit/f820cb4e77b0c8d91f5dbda5f6dd84c2ffd74d12))
* **pi-society-orchestrator:** add runtime status inspector ([c906cbc](https://github.com/tryingET/pi-extensions/commit/c906cbcb7d33ac7bd5dd62ca0b594044d6ce6389))
* **pi-society-orchestrator:** adopt ASC public execution runtime ([fc70724](https://github.com/tryingET/pi-extensions/commit/fc707243ab0d53ac14bb08e027daf60e762ac145))
* **pi-society-orchestrator:** bound society reads and harden release smoke ([3ee6f3c](https://github.com/tryingET/pi-extensions/commit/3ee6f3cbfff4e856ce720ad161bc80bacf16c238))
* **pi-society-orchestrator:** consume ak repo bootstrap ([ee42685](https://github.com/tryingET/pi-extensions/commit/ee4268528effd3151cffda0643e3c039481fda23))
* **pi-society-orchestrator:** harden KES failure contracts ([b6b1c30](https://github.com/tryingET/pi-extensions/commit/b6b1c30e553e41aefef22cd0e17e3059fe204189))
* **pi-society-orchestrator:** harden lower-plane runtime boundaries ([85d8109](https://github.com/tryingET/pi-extensions/commit/85d810922603b9d0745449e6ec9da0565f9ca63d))
* **pi-society-orchestrator:** land slot-based runtime footer ([b216428](https://github.com/tryingET/pi-extensions/commit/b2164286749f00e9c0162177f72c189bb54ed021))
* **pi-society-orchestrator:** present full routing as all agents ([b4ad476](https://github.com/tryingET/pi-extensions/commit/b4ad476bc34dc01448e175dce51c729018f629e4))
* **pi-society-orchestrator:** prove package-owned KES outputs ([5ca2470](https://github.com/tryingET/pi-extensions/commit/5ca2470d58aaa83ff94e2af6f2880747d37c10a9))
* **pi-society-orchestrator:** scaffold bounded kes contract ([6598d26](https://github.com/tryingET/pi-extensions/commit/6598d26b40f310225e6c0130038e02da28cea54b))
* **pi-society-orchestrator:** scaffold control-plane package ([3d317b8](https://github.com/tryingET/pi-extensions/commit/3d317b88afd135e99e292675cce9801979294fec))
* **pi-society-orchestrator:** share runtime truth across status surfaces ([fa74562](https://github.com/tryingET/pi-extensions/commit/fa7456290a784160fdc92fcdd1cb8b10b4537038))
* **release:** prove prompt-plane seam packaging ([adc9793](https://github.com/tryingET/pi-extensions/commit/adc97931849e8ac5fd231a4aa48576ed7d26ac51))
* **runtime:** add structured ExecutionState with transport/protocol separation ([65199e0](https://github.com/tryingET/pi-extensions/commit/65199e0551d7fb192d88a65338094e0c31187503))
* **runtime:** propagate assistant stop reasons from pi JSON protocol ([8f543b4](https://github.com/tryingET/pi-extensions/commit/8f543b4d39cb4a438bc397357f20c35e57e25f99))
* verify guarded bootstrap live and in release smoke ([493588d](https://github.com/tryingET/pi-extensions/commit/493588dd30efb4a1c41cabde67e768a3d80eda53))


### Bug Fixes

* **pi-society-orchestrator:** harden runtime footer truth ([58244c0](https://github.com/tryingET/pi-extensions/commit/58244c07e9d7f78414b26c164ff3e22838a2bff0))
* **pi-society-orchestrator:** throttle footer health refresh ([104435f](https://github.com/tryingET/pi-extensions/commit/104435f3ff3288a9d2155553990604532a9a4a94))

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
- Clarified monorepo AK task/work-item guidance in AGENTS/README: use the repo-root `ak` wrapper (or `../.ak` from this package) instead of treating a package folder as an independent repo root.
- Updated the package template in parallel so new monorepo package scaffolds inherit the same docs placement and AK-wrapper guidance.
- Moved `/evidence` off raw sqlite reads onto `ak evidence search` and isolated `society_query` behind a dedicated bounded diagnostic-exception helper.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

---
summary: "Package change history for @tryinget/pi-ontology-workflows."
read_when:
  - "Reviewing released or significant package changes."
system4d:
  container: "Package change log."
  compass: "Keep package evolution explicit and auditable."
  engine: "Record meaningful shipped changes, not every transient edit."
  fog: "If changelog entries drift from real behavior, operators lose trust in release notes."
---

# Changelog

## Unreleased

- Added the decision-52 development-only semantic-preflight lifecycle:
  - explicit idle-TUI 30-second confirmation and generation/cwd/host-scoped 10-minute grants;
  - clean package-pinned ROCS source verification and atomic content-addressed extension-cache preparation;
  - immutable Pi host capability checks and synchronous reload/new/resume/fork/shutdown invalidation;
  - exact-prompt ROCS discovery under the shared 750 ms boundary with canonical structural-only chained-system-prompt rendering;
  - prompt-local exact-ID bound-pack integration for `ontology_inspect`;
  - visible fail-open outcomes, same-key in-flight coalescing, and no automatic RPC/JSON/print behavior.
- Reduced `session_start` to bounded readiness/orientation; startup no longer validates or builds ontology state.
- Kept development preflight disabled by default; no adopted runtime or production default is introduced.

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-ontology-workflows-v0.1.0...pi-ontology-workflows-v0.2.0) (2026-07-13)

### Features

- adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
- **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
- migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))

### Bug Fixes

- align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))

## 0.1.0

- Scaffolded `@tryinget/pi-ontology-workflows` from `pi-extensions-template` as a `simple-package`.
- Implemented a stable ontology workflow core with explicit contracts for inspect/change flows.
- Added thin adapters for ROCS invocation, workspace routing, formatting, filesystem access, and frontmatter handling.
- Added the compact Pi surface:
  - `ontology_inspect`
  - `ontology_change`
  - `/ontology-status`
- Added startup ontology status/widget behavior and ontology-aware prompt hints.
- Added integrated picker/editor UX using the published `pi-interaction` support packages:
  - `/ontology:<query>[::scope]`
  - `/ontology-pack:<query>[::scope]`
  - `/ontology-change:<query>[::scope]`
- Added concept, relation, bridge, and system4d change planning/apply support with post-apply validate/build.
- Added unit and integration tests, including real ROCS-backed end-to-end coverage on temporary repos.

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

## [0.5.0](https://github.com/tryingET/pi-extensions/compare/pi-ontology-workflows-v0.4.0...pi-ontology-workflows-v0.5.0) (2026-08-29)


### Features

* **file-budget:** exception remaining repo debt and ratchet every gate ([89b9faa](https://github.com/tryingET/pi-extensions/commit/89b9faa30bf47ef9f7d17730aa2c771d12bfca4f))


### Bug Fixes

* **monorepo:** isolate install-only release checks ([e83c9bd](https://github.com/tryingET/pi-extensions/commit/e83c9bdefbcf5406e8eb4be6beef7245ed0eb655))
* **monorepo:** raise fast-xml-parser security floor ([5bc4017](https://github.com/tryingET/pi-extensions/commit/5bc40171be113473b75429e8519dfc5f30e81e7f))
* **orchestrator:** promote governed runtime pins to the 0.84.3 host line ([9b2fda4](https://github.com/tryingET/pi-extensions/commit/9b2fda4721d37cbfbfc161cd79a971addabe58ea))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @tryinget/pi-editor-registry bumped from file:../pi-interaction/pi-editor-registry to 0.2.2
    * @tryinget/pi-trigger-adapter bumped from file:../pi-interaction/pi-trigger-adapter to 0.2.3

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-ontology-workflows-v0.3.1...pi-ontology-workflows-v0.4.0) (2026-08-15)


### Features

* **pi-ontology-workflows:** observe preflight handler return ([d6b68f2](https://github.com/tryingET/pi-extensions/commit/d6b68f2518a9038fa6d21742ab75bee4c44979f1))


### Bug Fixes

* **pi-ontology-workflows:** recover prompt observation correlation ([2e2d2b7](https://github.com/tryingET/pi-extensions/commit/2e2d2b7b88018e8d95964b93c9892723ca9cb7b9))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.3.1](https://github.com/tryingET/pi-extensions/compare/pi-ontology-workflows-v0.3.0...pi-ontology-workflows-v0.3.1) (2026-08-01)


### Bug Fixes

* **ontology-workflows:** make release checks hermetic ([f3c7c34](https://github.com/tryingET/pi-extensions/commit/f3c7c3461f4fcbb7b7f8424ff852cf4b7c0511f5))
* **ontology-workflows:** make release checks hermetic ([90b2d86](https://github.com/tryingET/pi-extensions/commit/90b2d86e016178d4215fec584dccd00a6da0eed3))

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-ontology-workflows-v0.2.0...pi-ontology-workflows-v0.3.0) (2026-08-01)


### Features

* **ontology:** add default-off semantic release delivery attestations ([4fef0e0](https://github.com/tryingET/pi-extensions/commit/4fef0e0ec9dcfc342a5bf9b0ef4b3f83ef4f20e3))
* **ontology:** integrate verified ROCS semantic runner ([11c5177](https://github.com/tryingET/pi-extensions/commit/11c51771b5123206dbf61da5ecfa2ceb6d020aed))
* **ontology:** recover TUI semantic preflight lifecycle ([a938a9b](https://github.com/tryingET/pi-extensions/commit/a938a9b0b4428fd702f967f87ddaebaff346fcb3))


### Bug Fixes

* **ontology:** close live preflight deadline gaps ([afb1562](https://github.com/tryingET/pi-extensions/commit/afb1562b630df1dc643dc14b4bf63d4eef7d1289))
* **ontology:** enforce generation ordering invariants ([595906c](https://github.com/tryingET/pi-extensions/commit/595906ccfc7d3c7771570eae9c36189cb25092e3))
* **ontology:** harden Stage 2 runtime binding ([64d8aae](https://github.com/tryingET/pi-extensions/commit/64d8aae9abeffbc6ffe14a66e4e04c1c1ebcabaf))
* **ontology:** pin development preflight to ROCS 0.2.1 ([ca8b2ff](https://github.com/tryingET/pi-extensions/commit/ca8b2ff66c503a965a997576edcd4ce2dba003da))

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

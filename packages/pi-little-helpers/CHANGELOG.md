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

## Unreleased

### Added

- Add optional `reportBack` and `parentPeerTarget` support to `fork_peer_spawn`, allowing forked-context peers to use bounded intercom `PEER_ACK` / `PEER_FINAL` reporting when explicitly requested.

### Changed

- Replace the truncated Ghostty title suffix with the full hyphenless 32-hex session UUID, while retaining the legacy 8-character sidecar field for compatibility.

- Make controller-targeted Ghostty D-Bus tab activation fire-and-return. Direct new windows now detach from the controller timeout and require a private terminal-shell command-admission handshake; killed or unconfirmed launches remain effect-indeterminate and never trigger an automatic duplicate-peer fallback.

- Delegate `/nexus-loop` commit prompts to `fork_peer_spawn` after resolving the configured `/commit` prompt template, then require intercom `PEER_ACK` / `PEER_FINAL` supervision before loop completion can advance.

## [0.6.1](https://github.com/tryingET/pi-extensions/compare/pi-little-helpers-v0.6.0...pi-little-helpers-v0.6.1) (2026-08-27)


### Bug Fixes

* **little-helpers:** close extracted sidequest types ([ddbaec5](https://github.com/tryingET/pi-extensions/commit/ddbaec56cddd24b7d4cb847a6cb476c3e0072f98))
* **little-helpers:** handshake detached Ghostty windows ([a9170a9](https://github.com/tryingET/pi-extensions/commit/a9170a9eeddf4c1f64ea727235f74500d9217da5))
* **pi-little-helpers:** clarify candidate admission retry disposition ([96632fe](https://github.com/tryingET/pi-extensions/commit/96632fe021748a4633a65833de080cefb15486ff))
* **pi-little-helpers:** isolate packed release smoke ([f47e0ac](https://github.com/tryingET/pi-extensions/commit/f47e0ac79c249033c49b5bf2f79f9970827ef021))
* **pi-little-helpers:** preserve candidate worktree ancestry ([4069406](https://github.com/tryingET/pi-extensions/commit/4069406757fc2a7ea5b6f639d397aefd7ebd87ac))

## [0.6.0](https://github.com/tryingET/pi-extensions/compare/pi-little-helpers-v0.5.1...pi-little-helpers-v0.6.0) (2026-08-15)


### Features

* **activity-strip:** add calm interactive session navigation ([812579c](https://github.com/tryingET/pi-extensions/commit/812579ca9d309df38a08baa5f4759eaad2bd04ee))
* **little-helpers:** streamline governed loop prompt queues ([fda5b36](https://github.com/tryingET/pi-extensions/commit/fda5b36bafd3dda16587f49a97625984513332e6))
* **pi-little-helpers:** add governed candidate closeout ([2d44b64](https://github.com/tryingET/pi-extensions/commit/2d44b64dfa940a95a0f6c5b1c3d0f019498f9a0c))
* **pi-little-helpers:** add reality-anchored assertion harness for launch targeting ([bd3f73f](https://github.com/tryingET/pi-extensions/commit/bd3f73ffa23a9cc34fa69f2a0eddfdcbe4715e9e))
* **pi-little-helpers:** compact terminal candidate retention ([5be92d3](https://github.com/tryingET/pi-extensions/commit/5be92d398e96055aae14b65b25415628be9f66eb))
* **pi-little-helpers:** observe ASC execution in Ghostty ([52a1f67](https://github.com/tryingET/pi-extensions/commit/52a1f67090c0418a7125b20e1d2361b7b75197ed))
* **pi:** add clean handoff tab continuation ([11b3fde](https://github.com/tryingET/pi-extensions/commit/11b3fde6026e11a3a6e189e3cdd95a9ebcc5e3d2))


### Bug Fixes

* harden delegated commit dispatch admission ([84b7ad9](https://github.com/tryingET/pi-extensions/commit/84b7ad988eca709f9b705792815152e47809225d))
* **lifecycle:** verify oversized terminal events ([2931ea1](https://github.com/tryingET/pi-extensions/commit/2931ea11be2848db475ee5f914cbd47ab52a954a))
* **little-helpers:** order child start before prompt status ([958bec7](https://github.com/tryingET/pi-extensions/commit/958bec78af01f9b56de8b0fe4207fa09b19b09d9))
* **pi-little-helpers:** bind exact branch deletion ([d2b6285](https://github.com/tryingET/pi-extensions/commit/d2b62854754ad10a617c8766ef9a3a90bf64d90e))
* **pi-little-helpers:** compare portable archive state ([4b99e32](https://github.com/tryingET/pi-extensions/commit/4b99e320f83a8621e959a1e476fdfd5ff7d6ef62))
* **pi-little-helpers:** drop null codex auth headers and bump dev host to Pi 0.84.1 ([8231f6c](https://github.com/tryingET/pi-extensions/commit/8231f6c0009bf8532311ae46d515f16a9c26fa3d))
* **pi-little-helpers:** guard governed deep-review prompts ([3bb44c7](https://github.com/tryingET/pi-extensions/commit/3bb44c746df5340e59ae7473c1515772bde911da))
* **pi-little-helpers:** harden candidate lifecycle cleanup ([767925a](https://github.com/tryingET/pi-extensions/commit/767925a73ccbe2247db89203bc58f85d6d9bcc91))
* **pi-little-helpers:** harden sidequest Ghostty origin detection and ASC observer launch ([de5ff9b](https://github.com/tryingET/pi-extensions/commit/de5ff9b4202303cbf5b1e180557b64e2d58984f6))
* **pi-little-helpers:** recover fail-closed launch proofs ([d2c6c51](https://github.com/tryingET/pi-extensions/commit/d2c6c5184d8c2007c2b29fffdc0ebbf1c92194b6))
* **pi-little-helpers:** refresh ordinary audit dependencies ([be2bd16](https://github.com/tryingET/pi-extensions/commit/be2bd165d86c7541546bfed89217eea5c4d4f592))
* **pi-little-helpers:** reject malformed terminal refs ([4160e55](https://github.com/tryingET/pi-extensions/commit/4160e55a59e9a2f88460c8518f77e49a674a7019))
* **pi-little-helpers:** rewrite packed local dependencies ([7deefb4](https://github.com/tryingET/pi-extensions/commit/7deefb4a1d9f31d49e1af5e27d8fd4ef4ee7f5b7))
* **pi-little-helpers:** target ASC observer controller tabs ([be0bdcf](https://github.com/tryingET/pi-extensions/commit/be0bdcf64ca4efc724d93fbfb1e9b5031b99ce01))
* **pi-little-helpers:** target Ghostty single-instance server for observer tabs ([ff1b13f](https://github.com/tryingET/pi-extensions/commit/ff1b13f283828e330f3a5d8395d35e2171b6c7d0))
* **pi-little-helpers:** validate streamed lifecycle evidence ([361e0a3](https://github.com/tryingET/pi-extensions/commit/361e0a3159a9d3408c7c37e82a624a2fc9e1cb79))
* **pi-little-helpers:** validate terminal ref storage ([98c1503](https://github.com/tryingET/pi-extensions/commit/98c15030591e1171daccb937627bd287cfff8cd5))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.5.1](https://github.com/tryingET/pi-extensions/compare/pi-little-helpers-v0.5.0...pi-little-helpers-v0.5.1) (2026-08-01)


### Bug Fixes

* **little-helpers:** retain intercom timeout handle ([bac852e](https://github.com/tryingET/pi-extensions/commit/bac852ecc93f0dc3392fe4a5bfa7f03d94010d17))
* **little-helpers:** retain intercom timeout handle ([47b171d](https://github.com/tryingET/pi-extensions/commit/47b171d147abe909fdec3e7d7c6e70cf4d30d50d))

## [0.5.0](https://github.com/tryingET/pi-extensions/compare/pi-little-helpers-v0.4.0...pi-little-helpers-v0.5.0) (2026-08-01)


### Features

* **little-helpers:** adopt existing candidate worktrees ([4e51ba6](https://github.com/tryingET/pi-extensions/commit/4e51ba62e384396b889abc0febd31052aa78ecdf))
* **pi-little-helpers:** enforce candidate admission v2 ([5af2bb1](https://github.com/tryingET/pi-extensions/commit/5af2bb1ba385de63ccfa38a7efe8228e4f921843))
* preflight governed deep review runtime ([1a65188](https://github.com/tryingET/pi-extensions/commit/1a651888ef4038a1520cf42986c9541e02b12d6d))


### Bug Fixes

* close governed deep-review provenance gaps ([c70967a](https://github.com/tryingET/pi-extensions/commit/c70967acd34dd321f889ca48f97ce0f5e0c31e7e))
* harden governed preflight owner attestation ([a0a72e4](https://github.com/tryingET/pi-extensions/commit/a0a72e4c7ee8ae77420048e77ed61777f9aa0235))
* **lifecycle:** bound cleanup event scanning ([ada3813](https://github.com/tryingET/pi-extensions/commit/ada38134451a3c7bca11ee3a1e5e2ef225d56de4))
* **lifecycle:** reconcile exact legacy admission terminal ([7a82d67](https://github.com/tryingET/pi-extensions/commit/7a82d6709652ba61d6b3526600d7abd1296c52cf))
* **lifecycle:** reissue expired cleanup authorization ([5f64377](https://github.com/tryingET/pi-extensions/commit/5f64377c7ae2dfb75ac800619a0a677a656198fc))
* **little-helpers:** bind visible loops to execution authority ([987da93](https://github.com/tryingET/pi-extensions/commit/987da9360cd9939fce9746ea1338da6f6b5aa888))
* **little-helpers:** keep visible peers alive ([6751938](https://github.com/tryingET/pi-extensions/commit/6751938adbe5c8d3d0b83dac1ea5c4898bbcc3f9))
* **little-helpers:** restore visible gated loop plans ([29199dd](https://github.com/tryingET/pi-extensions/commit/29199dd121b9ee6326f9a4a55cd2cb0f5c59449b))
* **little-helpers:** target controller Ghostty tabs ([500dd6a](https://github.com/tryingET/pi-extensions/commit/500dd6a6354c56bb7750755aa1fb6eb178478c08))
* **pi-little-helpers:** expire stale admission permits ([6793232](https://github.com/tryingET/pi-extensions/commit/6793232bafaa49e186acd0233f18d964fddbd2b6))
* **pi-little-helpers:** make admission activation recoverable ([91d203a](https://github.com/tryingET/pi-extensions/commit/91d203ab1913d17b4359d6254255562a44a3941c))
* **visible-loop:** govern deep-review workflow dispatch ([f5384ff](https://github.com/tryingET/pi-extensions/commit/f5384ff524a92e78ea9af07c4d5c634bb31356d1))

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-little-helpers-v0.3.1...pi-little-helpers-v0.4.0) (2026-07-11)


### Features

* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **cleanup:** close exact candidate peer processes ([9f6a5b1](https://github.com/tryingET/pi-extensions/commit/9f6a5b11546e918ef80a076b5337212c2cdb5bcf))
* **little-helpers:** add exact candidate cleanup tool ([ab86a48](https://github.com/tryingET/pi-extensions/commit/ab86a4800b03a46f6d053071589120638e05e272))
* **little-helpers:** bridge extension visible-loop commands ([e87435d](https://github.com/tryingET/pi-extensions/commit/e87435df7658f964596ddc8900e35161de2fa119))
* **little-helpers:** gate visible-loop completion ([b4837a1](https://github.com/tryingET/pi-extensions/commit/b4837a1830994a0f652bb78e77ecd93bd551cd35))
* **little-helpers:** launch each visible-loop iteration in a fresh Pi session ([dc7b4dd](https://github.com/tryingET/pi-extensions/commit/dc7b4dda33a8f90fcc5cc3e5f8be1cd2a83b82f1))
* **little-helpers:** replace visible-loop completion sentinel with command-based iteration advance ([fbffe97](https://github.com/tryingET/pi-extensions/commit/fbffe97e8f10ddd5721b63b854eb139f24f56636))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))
* **orchestrator:** add post-fan-in campaign finalizer ([bb5f634](https://github.com/tryingET/pi-extensions/commit/bb5f6348a05a70b5979075d5ae2caab0388e0b55))
* **pi-little-helpers:** add nexus visible loop ([e81badf](https://github.com/tryingET/pi-extensions/commit/e81badf3ebe5080e7378c898befdb2704ecba3b1))
* **pi-little-helpers:** add safe Codex reset credits ([ce59a99](https://github.com/tryingET/pi-extensions/commit/ce59a99167011bc48daefa2323f447ae74a86b5a))
* **pi-little-helpers:** support fork peer report-back ([1122241](https://github.com/tryingET/pi-extensions/commit/1122241d7baaeec49278770cfc3ca744d7cd62ae))
* **self-evolution:** close typed candidate loop ([61873a7](https://github.com/tryingET/pi-extensions/commit/61873a7874087f64f23495b1143c0ef554fbbf93))
* **sidequest:** add post-launch Ghostty placement verification, split tests for parallelism, expose node:test concurrency ([7d4b10b](https://github.com/tryingET/pi-extensions/commit/7d4b10b4dd039ee08013651f331c2de8eddced36))
* streamline self scoutpeer continuation ([6209c52](https://github.com/tryingET/pi-extensions/commit/6209c521e90e1624926c5ba47d8f60eb93809fd0))
* **visible-loop:** record posture target hints ([6f2af50](https://github.com/tryingET/pi-extensions/commit/6f2af50d53ea0533ea6d08f3d6a3219b5893fa1b))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* avoid premature visible-loop final ([6586642](https://github.com/tryingET/pi-extensions/commit/65866428c71baff806c7547d22a771d55113c7a4))
* emit canonical visible-loop final ([9266573](https://github.com/tryingET/pi-extensions/commit/92665731da6117c78f7368cfb521d8bf55a5eef3))
* **little-helpers:** auto-report scoutpeer via intercom ([5dd0013](https://github.com/tryingET/pi-extensions/commit/5dd001375f212dde280c59626200e6dd7fe47441))
* **little-helpers:** gate visible loop completion ([367b4c1](https://github.com/tryingET/pi-extensions/commit/367b4c14e7000132c70f1568fcb2d42497053f28))
* **little-helpers:** harden candidate peer safe naming ([a1a7b4e](https://github.com/tryingET/pi-extensions/commit/a1a7b4edacf8bf8320c1589f1da5b9d50ef27e44))
* **little-helpers:** use sidequest wrapper for tab launch when stock Ghostty lacks +new-tab ([5c5646c](https://github.com/tryingET/pi-extensions/commit/5c5646c1324e40c7bdac38736ae2af8700494a82))
* **pi-little-helpers:** gate nexus commit delegation ([701868d](https://github.com/tryingET/pi-extensions/commit/701868d0f0ab44b4ea75d1c726d1fedfa7f3335b))
* remove visible-loop completion slash command ([cb63975](https://github.com/tryingET/pi-extensions/commit/cb639757c45d520f1f46469b68d8be4d27caf05c))
* restore visible-loop continuation on completion ([07fce7e](https://github.com/tryingET/pi-extensions/commit/07fce7eb6a9c1403e3358c1bd86964de8b499224))
* use tool for visible-loop completion ([b8af20f](https://github.com/tryingET/pi-extensions/commit/b8af20f1365144db7945cfcfcf09638a0a26efeb))
* **visible-loop:** require owning product posture refresh ([b9ebde9](https://github.com/tryingET/pi-extensions/commit/b9ebde953ad67645fb048d66f158ffdd40af81a0))

## [0.3.1](https://github.com/tryingET/pi-extensions/compare/pi-little-helpers-v0.3.0...pi-little-helpers-v0.3.1) (2026-05-16)

### Fixed

- Use the sidequest Ghostty wrapper for tab launches when the current stock Ghostty binary lacks `+new-tab`, keeping visible peer and visible-loop launches in tabs where the wrapper supports it.

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-little-helpers-v0.2.0...pi-little-helpers-v0.3.0) (2026-05-16)

### Added

- Add `html-output-browser` artifact helpers, including auto-open HTML output, clickable file links, `/artifacts`, `/show-artifacts`, and recent-artifact picking.
- Add `session-presence` support for exact Pi session identity, terminal titles, and hot-restore sidecars.
- Add `/sidequest` visible peer launching with Ghostty same-window tab attach and fallback window behavior.
- Add clean visible peer surfaces: `/scoutpeer`, `/parallelquest`, `fork_peer_spawn`, `scout_peer_spawn`, and `candidate_peer_spawn`.
- Add visible peer capability manifest and toolbox bundle projection for peer-spawn tool registration checks.
- Add `/visible-loop` for checkpointed visible iteration loops, with fresh Pi sessions per iteration and canonical intercom progress/final messages.
- Add candidate peer registry sidecars and exact cleanup command packets for worktree review/cleanup.

### Changed

- Prefer exact controller session targets and bounded `PEER_ACK` / `PEER_FINAL` report-back protocol for visible peers.
- Keep peer launch tools as standard Pi tools while retaining toolbox catalog/test alignment.
- Harden package behavior against Pi 0.65 host/typebox API changes.

### Fixed

- Harden Ghostty tab/window launching, title refresh, sidequest launch stability, and stash picker behavior.
- Reject ambiguous intercom parent targets and make disabled peer intercom behavior explicit.
- Gate visible-loop completion so iterations advance only after the intended final prompt finishes.
- Avoid stale peer slash-command guidance and static schema drift in peer-spawn tool surfaces.

## [0.2.0](https://github.com/tryingET/pi-little-helpers/compare/v0.1.3...v0.2.0) (2026-02-27)

### Changed

- **BREAKING**: Renamed package to `@tryinget/pi-little-helpers` (scoped)
- Update your install command: `pi install npm:@tryinget/pi-little-helpers`

## [0.1.3](https://github.com/tryingET/pi-little-helpers/compare/v0.1.2...v0.1.3) (2026-02-27)


### Bug Fixes

* move package-utils out of extensions folder ([c0a1154](https://github.com/tryingET/pi-little-helpers/commit/c0a1154cfb531272b6ce225708c466d45d06e8b8))

## [0.1.2](https://github.com/tryingET/pi-little-helpers/compare/v0.1.1...v0.1.2) (2026-02-27)

### Changed

- Simplified README: removed scaffold template language, added install instructions.
- Fixed EXTENSION_SOP.md: removed reference to deleted plans directory.
- Updated next_session_prompt.md with current state.

## [0.1.1](https://github.com/tryingET/pi-little-helpers/compare/v0.1.0...v0.1.1) (2026-02-27)

### Bug Fixes

- move package-utils out of extensions folder ([c0a1154](https://github.com/tryingET/pi-little-helpers/commit/c0a1154cfb531272b6ce225708c466d45d06e8b8))

## [0.1.0](https://github.com/tryingET/pi-little-helpers/compare/v0.0.0...v0.1.0) (2026-02-27)

### Added

- Initial release with `code-block-picker`, `package-update-notify`, and `stash` extensions.
- Published to npm.

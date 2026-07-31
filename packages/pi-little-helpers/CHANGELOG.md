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

- Make controller-targeted Ghostty D-Bus tab activation fire-and-return, and treat timed-out/killed launch processes as failures so visible peers are not terminated by the launcher's 15-second timeout.

- Delegate `/nexus-loop` commit prompts to `fork_peer_spawn` after resolving the configured `/commit` prompt template, then require intercom `PEER_ACK` / `PEER_FINAL` supervision before loop completion can advance.

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

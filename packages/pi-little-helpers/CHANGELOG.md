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

- Add `sidequest` extension command to fork the current Pi session into a new Ghostty tab when supported, with fallback to a new Ghostty window.

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-little-helpers-v0.2.0...pi-little-helpers-v0.3.0) (2026-04-14)


### Features

* harden Pi 0.65 compatibility and AK launcher ([b0a922c](https://github.com/tryingET/pi-extensions/commit/b0a922c25aa7a9f36c05a1e336306ed3b4ad96ef))
* **monorepo:** add packaged helpers and host-compat hardening ([0ec674c](https://github.com/tryingET/pi-extensions/commit/0ec674c9985875b315bae0929b102b04c1f4c666))
* **pi-little-helpers:** add html-output-browser extension ([3ca32ad](https://github.com/tryingET/pi-extensions/commit/3ca32ad601c2aa5853b667043b2cbd9ce20fb06d))
* **pi-little-helpers:** add session presence and sidequest helpers ([529db54](https://github.com/tryingET/pi-extensions/commit/529db542ecc4409419024f7df1daa4b91e1d5da2))

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

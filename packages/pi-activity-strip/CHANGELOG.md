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

### Features

- Add calm 15-second active-first ordering with live keyed card updates and manual keyboard movement.
- Add rich hover/focus detail, accessible card navigation, exact fail-closed Ghostty focus, and a compositor-bindable `focus-strip` command.
- Follow the focused Niri workspace and keep compact/expanded strip states top-aligned.

### Changes

- Collapse expanded detail when pointer/focus leaves the strip or another desktop window becomes active, and disable compositor/CSS shadows on the transparent overlay.
- Keep the Wayland surface resize-capable, explicitly floating, and reconcile its native dimensions on every collapse request, so the transparent input mask returns to compact height with the card content.
- Recover exact Pi identities for already-running tabs only through validated process-bound `pi-session-presence` sidecars; otherwise retain the `/reload` fail-closed path.
- Prefer full hyphenless 32-hex Ghostty session identities while retaining 8-hex titles only when no legacy duplicate or migrated full title shares that prefix; mixed-version collisions fail closed until reload.

- Make interaction the default and retain `PI_ACTIVITY_STRIP_CLICK_THROUGH=1` as the explicit mouse-transparent escape hatch.

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-activity-strip-v0.2.0...pi-activity-strip-v0.3.0) (2026-08-15)


### Features

* **activity-strip:** add calm interactive session navigation ([812579c](https://github.com/tryingET/pi-extensions/commit/812579ca9d309df38a08baa5f4759eaad2bd04ee))
* **pi-activity-strip:** mark focused terminal and lead with monitoring cards ([0447756](https://github.com/tryingET/pi-extensions/commit/0447756af3c396b32b1f4fc73f4098d09e2d6025))
* **pi-activity-strip:** project focused-workspace Niri view with concealed self-recovery ([8fc1946](https://github.com/tryingET/pi-extensions/commit/8fc19464eed91b323a9cb8f93c46e9f4bab4f68a))


### Bug Fixes

* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-activity-strip-v0.1.0...pi-activity-strip-v0.2.0) (2026-07-11)


### Features

* **activity-strip:** show session freshness ([38489df](https://github.com/tryingET/pi-extensions/commit/38489dfb083b94bb1c146875799186e03fb79a9e))
* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* ignore activity strip client resets ([0384780](https://github.com/tryingET/pi-extensions/commit/0384780a3787080ca53d6c4c94d2b099e03fe619))

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

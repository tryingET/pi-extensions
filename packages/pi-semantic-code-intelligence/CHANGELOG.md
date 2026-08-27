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

## [Unreleased]

### Changed

- Merged the two Pi patch tools (`patch_checks_in_snapshot`, `structural_patch_checks`)
  into one native preview door, `preview_patch_checks` (AK #5012): either a prepared
  unified diff (`patch`) or a structural rewrite (`language` + `pattern` + `rewrite`),
  exactly one mode — zero or both fail closed before any bridge call. The door routes to
  the exact SCI workflow names internally, so producer results, evidence mapping, and
  schema-compat checks keep the SCI contract; each mode's parameter subset is still
  verified against its own workflow's advertised schema. Preview-only unchanged: no apply
  input, `piBridge.previewOnly` sanitization, no working-tree mutation (live-verified).
- Live-caught fixes during dogfooding: the door's emitted JSON schema no longer
  requires both modes' mandatory keys (previously unsatisfiable for single-mode calls;
  pinned by a schema test), and a declared `mode` matching the input shape is accepted
  (was rejected as "unknown mode").

## [0.1.1-rc.2] - 2026-08-24

### Changed

- Pi registers five composites. Prepared diffs use only `patch_checks_in_snapshot`.
  `safe_write` remains on SCI MCP/CLI, not as a second Pi door.
- Teaching text: skip `locate_confirm_definition` when explore already confirmed;
  apply only via `rename_safely`/snapshot apply, never `apply_rename`.

## [0.1.1-rc.1] - 2026-08-24

### Changed

- Assigned a unique private companion release-candidate identity for producer SCI `2.1.0-rc.1` without mirroring the producer's unrelated major/minor lineage.
- Documented the producer contract reviewed at semantic-code-intelligence commit `aa5c23fa16d8589cb546997639fa1d576fdf8eff` and its `docs/project/releases/2.1.0-rc.1.md` release notes.
- Added typed regression and release validation that package, lock, and runtime MCP client metadata carry one companion identity.

### Compatibility

- Records all six composite workflows; structural risk evidence and limitations; compact, standard, and debug progressive disclosure; the Pi model/operator split; and standard details schema version `2`.
- Preserves exact sanitized `outside_workspace` recovery and preview-only schemas with no apply authority.
- Keeps experimental producer commands outside the supported CLI/MCP-stdio commitment, source-checkout receipt tooling outside installed runtime, and unsupported hosted/network/multi-user/publication claims out of the companion contract.
- Changes the runtime MCP client identity to `0.1.1-rc.1` while preserving composite workflow, projection, renderer, preview-authority, and error-recovery semantics.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

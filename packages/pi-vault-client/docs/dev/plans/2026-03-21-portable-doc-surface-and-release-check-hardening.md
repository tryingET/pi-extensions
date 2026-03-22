---
summary: "Plan for hardening pi-vault-client's portable operator surface: catch non-portable markdown links, make README links package-safe, and align release-check with packed-manifest truth instead of raw local file: specs."
read_when:
  - "Implementing the post-review nexus fix for portable docs and release-surface drift."
  - "Hardening release-check so package portability issues fail deterministically before publish."
system4d:
  container: "Focused package hardening plan for docs portability and release truth."
  compass: "Make the package's operator-facing docs and release contract portable across local dev, pack, and publish boundaries."
  engine: "Add portable-surface validator -> wire it into structure/release validation -> fix current docs/link drift -> verify with package + release checks."
  fog: "Main risk is validating the wrong surface: raw local manifests and local filesystem links can look correct in one workspace while still failing for package consumers or other operators."
---

# Plan: portable doc surface and release-check hardening

## Scope
- add a reusable validator for package markdown portability constraints
- reject absolute filesystem links in shared markdown surfaces
- ensure package README local links resolve on the published package surface or use stable web URLs instead
- align `release:check` with the packed-manifest truth rather than failing early on raw working-tree `file:` dependencies that are intentionally rewritten during `prepack`
- keep `npm run check` and `npm run release:check` truthful for these boundaries

## Acceptance criteria
- a validator exists and is exercised by automated tests
- `npm run check` fails if shared markdown contains absolute filesystem links
- `npm run release:check` validates the portable doc surface before publish proceeds
- README links that are intended for package consumers are portable in the published artifact
- `release:check` no longer fails merely because the working manifest contains local `file:` specs that are successfully rewritten in the packed manifest
- `npm run typecheck`, `npm run check`, and `npm run release:check` pass

## Non-goals
- no Prompt Vault runtime behavior changes
- no receipt/replay schema or storage changes
- no cross-repo governance cutover
- no mass rewrite of all monorepo package release contracts beyond this package

## Planned files
- `scripts/validate-portable-doc-surface.mjs`
- `scripts/validate-structure.mjs`
- `scripts/release-check.sh`
- `README.md`
- `docs/dev/v4-runtime-receipts-runtime-target-binding.md`
- `tests/portable-doc-surface.test.mjs`
- `diary/2026-03-21-portable-doc-surface-and-release-check-hardening.md`

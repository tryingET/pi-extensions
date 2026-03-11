---
summary: "Plan for retiring the generated pi-interaction vendoring bridge in pi-vault-client in favor of real package dependencies while preserving release/install safety."
read_when:
  - "Implementing the pi-vault-client de-vendor slice after support-package publish-readiness work in packages/pi-interaction."
system4d:
  container: "Focused package plan for pi-vault-client interaction-boundary cleanup."
  compass: "Use real package dependencies, keep generated runtime artifacts safe, and do not regress tarball install or Pi smoke behavior."
  engine: "Replace vendored source seams -> harden pack/release flow for local package dependencies -> validate clean-room + Pi install paths -> update docs/handoff."
  fog: "Main risks are breaking tests that imported vendored files directly, shipping file:-based runtime deps in packed artifacts, or losing installed-package smoke coverage before the support packages are actually published."
---

# Plan: de-vendor interaction bridge in pi-vault-client

## Scope
Retire the generated `src/interaction-kit/*`, `src/trigger-adapter/*`, and `src/triggerAdapter.js` vendoring bridge in `pi-vault-client` and replace it with real package consumption from the canonical `pi-interaction` support packages.

## Acceptance criteria
- `pi-vault-client` runtime code consumes `@tryinget/pi-interaction-kit` and `@tryinget/pi-trigger-adapter` through package imports rather than vendored source copies.
- The vendoring sync script and generated vendored source directories are removed from the active packaging/validation path.
- Packed artifacts do not ship `file:` runtime dependency specifiers.
- `npm run check` and `npm run release:check:quick` remain green.
- Clean-room install and installed-package smoke still prove the package can load its interaction dependencies in release artifacts.
- Docs and next-session handoff describe the new package-boundary state truthfully.

## Risks
- Tests that currently copy vendored source files into temp modules can break once imports become bare package specifiers.
- Tarball install can fail if local sibling package dependencies are not rewritten/bundled safely for packed artifacts.
- Pi smoke checks can regress if packed artifacts assume registry-published support packages before they are available.

## Planned files
- `package.json`
- `package-lock.json`
- `scripts/quality-gate.sh`
- `scripts/release-check.sh`
- `scripts/prepare-publish-manifest.mjs`
- `src/fuzzySelector.js`
- `src/triggerAdapter.js`
- `tests/vault-commands.test.mjs`
- `README.md`
- `docs/dev/status.md`
- `docs/dev/CONTRIBUTING.md`
- `NEXT_SESSION_PROMPT.md`

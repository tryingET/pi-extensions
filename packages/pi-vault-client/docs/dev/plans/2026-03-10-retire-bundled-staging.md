---
summary: "Retire the temporary release-time bundled dependency staging in pi-vault-client now that the shared interaction support packages are published and can be consumed as normal semver dependencies."
read_when:
  - "Switching pi-vault-client from local file-based interaction dependencies to normal published package consumption."
system4d:
  container: "Focused package plan for retiring the last packaging bridge in pi-vault-client."
  compass: "Use published semver dependencies directly, simplify pack/release flow, and keep install/release smoke green."
  engine: "Replace file deps -> remove staging script -> simplify release check -> validate clean-room + Pi install paths -> update docs/handoff."
  fog: "The main risks are silently keeping bundle/staging assumptions alive, letting tests resolve unpublished local sources instead of installed packages, or regressing release-safe tarball install." 
---

# Plan: retire bundled dependency staging

## Scope
Remove the temporary `bundleDependencies` + `prepare-publish-manifest.mjs` bridge from `pi-vault-client` and consume published `@tryinget/pi-interaction-kit` / `@tryinget/pi-trigger-adapter` versions directly.

## Acceptance criteria
- `package.json` uses normal published semver dependencies for the shared interaction packages.
- `bundleDependencies` is gone.
- `scripts/prepare-publish-manifest.mjs` is removed from the active packaging path.
- `release:check` no longer assumes file dependency rewrite or bundled dependency staging.
- Package tests resolve the shared interaction packages through installed package resolution rather than sibling-source assumptions.
- `npm run check`, `npm run release:check:quick`, and `npm run release:check` stay green.
- Docs and handoff describe the new state truthfully.

## Planned files
- `package.json`
- `package-lock.json`
- `scripts/release-check.sh`
- `scripts/prepare-publish-manifest.mjs`
- `tests/vault-commands.test.mjs`
- `tests/vault-query-regression.test.mjs`
- `README.md`
- `next_session_prompt.md`

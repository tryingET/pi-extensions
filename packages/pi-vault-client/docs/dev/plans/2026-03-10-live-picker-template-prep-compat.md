---
summary: "Plan for hardening pi-vault-client against live runtime template-preparation export skew so /vault: picker flows degrade safely instead of failing on missing prepareTemplateForExecution."
read_when:
  - "Implementing the /vault:atomic- live picker fix after observing prepareTemplateForExecution export-shape drift in a live Pi session."
system4d:
  container: "Focused package plan for live picker template-preparation compatibility."
  compass: "Preserve the current structured render contract while tolerating older renderer module shapes during live runtime skew."
  engine: "Reproduce runtime mismatch -> add compatibility wrapper -> route live picker + grounding through it -> validate package + live install path."
  fog: "The main risk is patching only the exact /vault: picker path while other renderer call sites still assume the newer helper export exists."
---

# Plan: live picker template-preparation compatibility

## Scope
Harden `pi-vault-client` so live `/vault:` picker execution does not fail when the runtime resolves a `templateRenderer` module shape that lacks `prepareTemplateForExecution` but still exposes the older `renderTemplateContent` contract.

## Acceptance criteria
- `/vault:` live picker no longer depends exclusively on `prepareTemplateForExecution` being present as a callable export.
- Compatibility fallback preserves current `prepareTemplateForExecution` behavior as closely as possible, including `## CONTEXT` appending rules.
- Shared grounding/render paths that currently import `prepareTemplateForExecution` directly are hardened as well.
- Package tests cover compatibility fallback semantics.
- `npm run check`, `npm run release:check:quick`, and relevant render/live tests pass.

## Risks
- Compatibility fallback could diverge subtly from the canonical `prepareTemplateForExecution` semantics.
- Hardening only the picker could leave `vaultGrounding.ts` vulnerable to the same export-shape drift.
- Dirty multi-package workspace state can still confuse live observations unless the runtime is reinstalled/restarted after validation.

## Planned files
- `src/templatePreparationCompat.js`
- `src/vaultPicker.ts`
- `src/vaultGrounding.ts`
- `tests/template-renderer.test.mjs`
- `tests/vault-query-regression.test.mjs`
- `README.md`
- `next_session_prompt.md`
- `CHANGELOG.md`

---
summary: "Canonical handoff for continuing pi-interaction work inside the pi-extensions monorepo."
read_when:
  - "Starting the next focused pi-interaction session."
system4d:
  container: "Session handoff artifact."
  compass: "Keep runtime behavior stable while preparing release-safe workflows."
  engine: "Validate root -> validate package -> run live checks."
  fog: "Main risk is live-validation evidence and root automation drift, not package topology anymore."
---

# Next session prompt — pi-interaction

## Continue here

- Package group: `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction`
- Monorepo root context: `~/ai-society/softwareco/owned/pi-extensions/NEXT_SESSION_PROMPT.md`

## Current truth

- `pi-interaction` is the canonical successor to the old standalone `pi-input-triggers` repo.
- The canonical publish target is `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction`.
- The package-group root is coordination-only and must not be treated as the publish target.
- Root responsibilities are documented at:
  - `~/ai-society/softwareco/owned/pi-extensions/docs/project/root-capabilities.md`
- Package release workflow is documented at:
  - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/docs/dev/release-workflow.md`
- Support-library package boundaries are now publish-safe at the tarball level:
  - `pi-interaction-kit`, `pi-trigger-adapter`, and `pi-editor-registry` expose explicit top-level package surfaces via `exports`
  - their `prepack` flow rewrites local sibling `file:` dependencies to versioned package dependencies inside packed artifacts
  - their `npm run release:check:quick` now verifies packed-manifest rewrite plus clean-room tarball install/import smoke with locally packed sibling tarballs

## Continue with

1. Use the now-publish-safe support-package boundary to remove the generated vendoring bridge in `packages/pi-vault-client` and verify that direct package consumption stays release-safe.
2. Capture durable live validation evidence for `pi-interaction` + `pi-prompt-template-accelerator` + `pi-vault-client` loaded together.
3. Make the picker-surface boundary explicit in that validation:
   - `$$ /...` (PTX) shows installed/exported prompt commands only, not the full Prompt Vault DB
   - `/vault` shows the full visible vault template set from Prompt Vault
   - today the PTX count may be much smaller than vault count because it reflects the `export_to_pi` subset
4. Keep Nunjucks changes in mind during the cross-package pass:
   - `/vault` execution-time rendering in `pi-vault-client` is the place where vault Nunjucks behavior is verified
   - do **not** assume PTX automatically mirrors vault-client retrieval/rendering semantics for non-exported vault templates
   - if an exported Prompt Vault template is surfaced through PTX, verify that PTX behavior is explicit and documented rather than assumed
5. Validate the new root-owned component release automation against real package releases and keep the component map/docs synchronized if package inventory changes.

## Must-pass checks

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-push

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
npm run check
npm run release:check:quick

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
npm run check
```

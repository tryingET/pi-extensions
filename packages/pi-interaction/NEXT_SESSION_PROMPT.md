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

## Continue with

1. Capture durable live validation evidence for `pi-interaction` + `pi-prompt-template-accelerator` + `pi-vault-client` loaded together.
2. Make the picker-surface boundary explicit in that validation:
   - `$$ /...` (PTX) shows installed/exported prompt commands only, not the full Prompt Vault DB
   - `/vault` shows the full visible vault template set from Prompt Vault
   - today the PTX count may be much smaller than vault count because it reflects the `export_to_pi` subset
3. Keep Nunjucks changes in mind during the cross-package pass:
   - `/vault` execution-time rendering in `pi-vault-client` is the place where vault Nunjucks behavior is verified
   - do **not** assume PTX automatically mirrors vault-client retrieval/rendering semantics for non-exported vault templates
   - if an exported Prompt Vault template is surfaced through PTX, verify that PTX behavior is explicit and documented rather than assumed
4. Decide whether to wire the first root-owned component release automation for `pi-interaction` now or keep the documented operator-driven workflow.
5. Keep package/root release docs synchronized if automation lands.

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

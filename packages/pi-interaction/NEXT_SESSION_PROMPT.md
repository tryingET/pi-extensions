---
summary: "Canonical handoff for continuing pi-interaction work inside the pi-extensions monorepo."
read_when:
  - "Starting the next focused pi-interaction session."
system4d:
  container: "Session handoff artifact."
  compass: "Keep runtime behavior stable while preparing release-safe workflows."
  engine: "Validate root -> validate package -> run live checks."
  fog: "Main risk is release/docs drift, not package topology anymore."
---

# Next session prompt — pi-interaction

## Continue here

- Package group: `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction`
- Monorepo root context: `~/ai-society/softwareco/owned/pi-extensions/NEXT_SESSION_PROMPT.md`

## Current truth

- `pi-interaction` is the canonical successor to the old standalone `pi-input-triggers` repo.
- Root responsibilities are documented at:
  - `~/ai-society/softwareco/owned/pi-extensions/docs/project/root-capabilities.md`

## Continue with

1. Prepare the first release-safe workflow for `@tryinget/pi-interaction`.
2. Normalize docs so nothing still implies the old standalone repo is canonical.
3. Run live interaction validation with `pi-interaction` + `prompt-template-accelerator` loaded together.

## Must-pass checks

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-push

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions/packages/prompt-template-accelerator
npm run check
```

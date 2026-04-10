---
summary: "Closed task 1051 by proving the prompt-plane seam through package checks, local-dependency-aware release smoke, and root validation without waiting on registry publication of same-wave sibling packages."
read_when:
  - "You need the durable execution note for task 1051."
  - "You are checking how the prompt-plane seam gained installed-package proof after tasks 1050 and 1049."
system4d:
  container: "Root diary capture for the TG1 prompt-plane proof slice."
  compass: "Keep package-owner boundaries truthful while making release smoke match monorepo publication reality."
  engine: "Pack local sibling deps -> install isolated dependency set -> prove installed-package behavior -> rerun root validation."
  fog: "The main risks were depending on unpublished sibling packages, assuming installed deps would always be nested under the target package dir, or letting release smoke drift from the prompt-plane owner's current schema-v9 contract."
---

# Diary — 2026-04-10 — prompt-plane release proof

## Scope

Close root task `#1051` — `[WAVE-TG1] Prove the new prompt-plane seam with package checks, release smoke, and root validation`.

The task scope allowed edits only in:
- `packages/pi-vault-client/**`
- `packages/pi-society-orchestrator/**`
- `diary/**`

So the durable landing here is package-local release-proof hardening plus this root diary capture.

## What changed

### 1. `pi-vault-client` release proof now handles same-wave local sibling packages truthfully

Added `packages/pi-vault-client/scripts/release-local-dependencies.mjs` and rewired `packages/pi-vault-client/scripts/release-check.sh` so the release gate now:
- recursively discovers local runtime `file:` dependencies
- packs those sibling packages into tarballs during the release lane
- installs the full dependency set in one clean-room npm install for packed-manifest proof
- performs headless installed-package smoke from an isolated npm prefix plus isolated Pi settings registration data instead of depending on ambient Pi auth or `pi install`

This keeps the proof aligned with the monorepo reality where the packed manifest is publish-safe but some sibling package versions may still be same-wave local artifacts during validation.

### 2. `pi-society-orchestrator` release smoke now proves the installed `pi-vault-client` dependency path

Added `packages/pi-society-orchestrator/scripts/release-local-dependencies.mjs` and rewired `packages/pi-society-orchestrator/scripts/release-check.sh` so the installed-package smoke path:
- packs the local dependency closure (`pi-vault-client`, interaction support libs, ASC bundle owner) into tarballs
- installs that dependency set into an isolated `NPM_CONFIG_PREFIX` in one step
- records the exact target `PACKAGE_SPEC` in isolated Pi settings
- keeps the installed-package smoke harness headless and deterministic

Then hardened `packages/pi-society-orchestrator/scripts/release-smoke.mjs` so the import-smoke sandbox:
- links installed runtime dependencies from the isolated install root instead of assuming they are nested under the target package directory
- sets explicit company context for the prompt-plane seam
- seeds a schema-v9-compatible minimal Prompt Vault fixture for the installed smoke cognitive tool

That closes the exact proof gap left by task `#1049`: packaged/imported orchestrator runtime now proves the supported `pi-vault-client/prompt-plane` seam instead of only the workspace-local cutover.

### 3. Package docs/handoff truth was refreshed

Updated:
- `packages/pi-vault-client/README.md`
- `packages/pi-society-orchestrator/README.md`
- `packages/pi-society-orchestrator/next_session_prompt.md`
- `packages/pi-society-orchestrator/docs/project/2026-03-11-hermetic-installed-release-smoke.md`
- `packages/pi-society-orchestrator/docs/project/2026-04-10-prompt-plane-consumer-cutover.md`

Key doc shifts:
- installed-package proof no longer depends on ambient auth/provider state
- release smoke explicitly acknowledges locally packed sibling tarballs when required
- the prompt-plane dependency-path proof for `pi-vault-client` is now landed, not pending

## Validation run

### Package-local

From `packages/pi-vault-client`:
- `npm run docs:list`
- `npm run typecheck`
- `npm run check`
- `npm run release:check`

From `packages/pi-society-orchestrator`:
- `npm run docs:list`
- `npm run check`
- `npm run release:check`

### Root

From repo root:
- `node ./scripts/release-components.mjs validate`
- `node --test ./scripts/release-components.test.mjs`
- `./scripts/ci/full.sh`

## Result

Task `#1051` is now supported by:
- package checks for the owning and consuming packages
- installed-package release smoke that matches monorepo dependency reality
- root validation after the proof lane landed

The TG1 seam-first wave now has package-owner seam exposure (`#1050`), consumer cutover (`#1049`), and installed-package/root proof (`#1051`).

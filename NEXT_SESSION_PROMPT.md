---
summary: "Canonical monorepo-root handoff for pi-extensions after stack-contract centralization and package-level local-override separation."
read_when:
  - "Starting the next session at the pi-extensions monorepo root."
system4d:
  container: "Session handoff artifact."
  compass: "Keep root policy ownership explicit, route package/template work to the correct repo, and avoid copying policy into every package by habit."
  engine: "Validate root -> review stack-contract policy surfaces -> route package/template/session-prompt work -> keep docs and handoffs coherent."
  fog: "Main risks are confusing root policy with package-local overrides, over-templating tech-stack policy, or forgetting live verification work that still belongs to a package."
---

# Next session prompt — pi-extensions monorepo root

## Continue here

- Monorepo root: `~/ai-society/softwareco/owned/pi-extensions`

## Current truth

- This repo is the canonical monorepo control plane for pi extensions.
- Root validation is coherent and verified through the canonical wrapper:
  - `npm run quality:pre-commit`
  - `npm run quality:pre-push`
  - `npm run quality:ci`
  - `npm run check`
- Canonical root quality-gate wrapper lives in:
  - `./scripts/quality-gate.sh`
- Full root validation lives in:
  - `./scripts/ci/full.sh`
- Canonical package validation implementation lives in:
  - `./scripts/package-quality-gate.sh`
- Package checks are orchestrated by:
  - `./scripts/ci/packages.sh`
- Root-owned stack-contract review/policy surface now lives here:
  - `docs/tech-stack.local.md`
  - `scripts/validate-tech-stack-contract.mjs`
- package-local divergence surface stays local to each repo/package:
  - `docs/tech-stack.local.md`
  - package-specific docs/manifests/scripts
- `policy/stack-lane.json` is currently still present in some package repos and templates, but the next review should decide what truly belongs at root policy level vs local override level.
- `pi-vault-client` phase-1 Nunjucks support is implemented; what remains there is **live end-to-end verification**, not a fresh implementation pass.
- session/handoff prompt work is separate from root policy work and should route to:
  - `packages/pi-prompt-template-accelerator/NEXT_SESSION_PROMPT.md`
  - `packages/pi-prompt-template-accelerator/prompts/one-line-handoff.md`
  - `packages/pi-prompt-template-accelerator/prompts/one-sentence-handoff.md`

## Completed in the last session

- Strengthened `tech-stack-core` review surfaces across the monorepo and related template work.
- Added the root helper `scripts/validate-tech-stack-contract.mjs` to centralize stack-contract validation policy in this repo.
- Reused that helper from stack-pinned packages instead of leaving each package to drift independently.
- Updated root docs/handoff context so package-local files are treated as local override surfaces rather than the universal policy home.
- Verified root/package checks after those changes.

## Continue with

1. Review whether `tech-stack-core` policy should stay centralized here while package/template outputs shrink to the **reduced form**:
   - root repo owns policy and validation stance
   - package repos/templates keep only the local override file where repo-specific divergence is needed
2. Audit the current review surfaces in this repo before changing templates:
   - `docs/tech-stack.local.md`
   - `scripts/validate-tech-stack-contract.mjs`
   - package-local `docs/tech-stack.local.md`
   - package-local `policy/stack-lane.json` where still present
3. Route template changes to:
   - `~/ai-society/softwareco/owned/pi-extensions-template/NEXT_SESSION_PROMPT.md`
4. Route Nunjucks live verification to:
   - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client/NEXT_SESSION_PROMPT.md`
5. Route session/handoff prompt wording and prompt-template work to:
   - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator/NEXT_SESSION_PROMPT.md`

## Must-pass checks

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-commit
npm run quality:pre-push
npm run quality:ci
npm run check
```

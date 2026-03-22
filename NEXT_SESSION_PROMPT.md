---
summary: "Canonical monorepo-root bootstrap for pi-extensions: use AK as the task authority, run quality gates, and keep this file stable."
read_when:
  - "Starting the next session at the pi-extensions monorepo root."
  - "You need session bootstrap, authority order, and closeout rules."
system4d:
  container: "Session handoff artifact."
  compass: "Keep root policy ownership explicit, route package/template work to the correct repo, and avoid copying policy into every package by habit."
  engine: "Validate root -> review stack-contract policy surfaces -> route package/template/session-prompt work -> keep docs and handoffs coherent."
  fog: "Main risks are confusing root policy with package-local overrides, over-templating tech-stack policy, or forgetting live verification work that still belongs to a package."
---

# Next session prompt — pi-extensions monorepo root

## SESSION TRIGGER
Reading this file means start immediately.
Do not ask for permission to begin.

## AUTHORITATIVE ORDER
Use these in this order:

1. **AK DB** — authoritative task queue / active-deferred work state
2. **Latest diary entry** — exact session-local context (see `diary/` in root and packages)
3. **Canonical docs** — policy/runtime detail for the area you are touching
4. **This file** — stable bootstrap + durable guardrails only

Do **not** treat this file as a live status database.

## STABLE CONTEXT
- Repo: `/home/tryinget/ai-society/softwareco/owned/pi-extensions`
- Branch: `main`
- Active DB: `~/ai-society/society.v2.db`
- Preferred operator path: run `npm run *` scripts from repo root

## CURRENT TRUTH
- This repo is the canonical monorepo control plane for pi extensions.
- Root validation is coherent and verified through the canonical wrapper:
  - `npm run quality:pre-commit`
  - `npm run quality:pre-push`
  - `npm run quality:ci`
  - `npm run check`
- Canonical root quality-gate wrapper: `./scripts/quality-gate.sh`
- Full root validation: `./scripts/ci/full.sh`
- Canonical package validation: `./scripts/package-quality-gate.sh`
- Package checks orchestrated by: `./scripts/ci/packages.sh`
- Root-owned stack-contract review/policy surface:
  - `docs/tech-stack.local.md`
  - `scripts/validate-tech-stack-contract.mjs`
- Package-local divergence surface stays local to each package:
  - `docs/tech-stack.local.md`
  - package-specific docs/manifests/scripts

## DURABLE GUARDRAILS
- Do **not** treat this file as a live status database; use AK for task state.
- Do **not** confuse root policy with package-local overrides.
- Do **not** copy tech-stack policy into every package by habit; root owns the stance.
- Do **not** forget live verification work that still belongs to a specific package.
- Do **not** bypass quality gates before committing.

## CONTINUE WITH
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

## NEXT-SESSION START COMMANDS
```bash
cd ~/ai-society/softwareco/owned/pi-extensions
git status --short
git diff --name-only
ak task ready -F json | jq '.[] | select(.repo | contains("pi-extensions"))'
npm run quality:pre-commit
npm run quality:pre-push
```

## MUST-PASS CHECKS
```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-commit
npm run quality:pre-push
npm run quality:ci
npm run check
```

## SESSION-END RULE
When ending a session:

1. Write a diary entry (root `diary/` or package-local as appropriate)
2. Run quality gates to verify clean state
3. Commit the resulting handoff/doc changes
4. Verify working tree is clean: `git status --short`
5. Keep AK as the authority for task status / priority / readiness

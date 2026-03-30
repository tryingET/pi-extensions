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
- The root direction chain is explicit and TG1's initial doc/contract wave is complete:
  - `docs/project/vision.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
- The next active root-owned wave under SG1 is to classify the remaining `legacy-full` package-local tech-stack surfaces into truthful end states and the smallest routed follow-up set.
- Current classification signal:
  - the root audit still shows `8` `legacy-full` package surfaces
  - seven of those package-local `docs/tech-stack.local.md` files are identical boilerplate copies
  - `packages/pi-interaction/pi-interaction/docs/tech-stack.local.md` is the only distinct child-package doc in that bucket
- Latest root diary pointer:
  - `diary/2026-03-30--root-tg2-classification-wave-materialized.md`
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
  - `docs/project/reduced-form-migration-contract.md`
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
1. Re-enter the active direction chain before touching root policy:
   - `docs/project/vision.md`
   - `docs/project/strategic_goals.md`
   - `docs/project/tactical_goals.md`
   - `docs/project/operating_plan.md`
2. Treat the reduced-form migration contract as locked root truth:
   - `docs/project/reduced-form-migration-contract.md`
3. Use the active audit/classification surfaces before routing more package/template follow-up:
   - `docs/tech-stack.local.md`
   - `docs/project/tech-stack-review-surfaces.md`
   - `docs/project/reduced-form-migration-contract.md`
   - `scripts/validate-tech-stack-contract.mjs`
4. Use AK as the live queue for TG2; if repo-local readiness empties while SG1 still implies unfinished classification/routing work, re-enter the direction chain and materialize only the next lower-layer slice instead of reopening TG1 or padding backlog.
5. Route template changes to:
   - `~/ai-society/softwareco/owned/pi-extensions-template/next_session_prompt.md`
6. Route Nunjucks live verification to:
   - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client/next_session_prompt.md`
7. Route session/handoff prompt wording and prompt-template work to:
   - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator/next_session_prompt.md`

## NEXT-SESSION START COMMANDS
```bash
cd ~/ai-society/softwareco/owned/pi-extensions
git status --short
git diff --name-only
./scripts/ak.sh task ready -F json | jq '.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")'
./scripts/ak.sh task list -F json | jq '[.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")] | sort_by(.id) | reverse | .[:5]'
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

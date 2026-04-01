---
summary: "Canonical monorepo-root bootstrap for pi-extensions: use AK as the task authority, run quality gates, and route the guarded repo bootstrap owner question to agent-kernel decision #8 instead of reviving deferred local workaround work."
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
- The root direction chain is explicit:
  - `docs/project/vision.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
- The first SG1 reduced-form pilot queue is complete (`#603`, `#634` -> `#636`).
- The guarded repo-bootstrap concern surfaced here first, but the durable owner question has now moved to the agent-kernel Tier 1 packet anchored by `FCOS-M41-01` and decision `#8`.
- Local `pi-extensions` tasks are therefore deferred, not active implementation:
  - `#654` deferred until decision `#8`
  - `#655` deferred until decision `#8`
  - `#656` deferred until decision `#8`
- Canonical decision packet now lives in agent-kernel:
  - `~/ai-society/softwareco/owned/agent-kernel/docs/project/fcos-guarded-repo-bootstrap-authority-after-live-repo-root-drift.md`
  - `~/ai-society/softwareco/owned/agent-kernel/docs/project/2026-04-01-problem-guarded-repo-bootstrap-authority.md`
  - `~/ai-society/softwareco/owned/agent-kernel/docs/project/2026-04-01-evidence-guarded-repo-bootstrap-authority.md`
  - `~/ai-society/softwareco/owned/agent-kernel/docs/project/2026-04-01-rfc-guarded-repo-bootstrap-authority.md`
  - `~/ai-society/softwareco/owned/agent-kernel/docs/project/2026-04-01-cross-repo-fanout-fcos-m41-guarded-repo-bootstrap-authority.md`
- Canonical FCOS + AK work for the concern now lives in:
  - FCOS issue `FCOS-M41-01`
  - decision `#8`
  - task `#657` (review / legal next move)
  - task `#665` (AK-native implementation)
  - task `#666` (pi-extensions consumer rewiring)
  - task `#667` (verification)
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
  - `docs/project/tech-stack-review-surfaces.md`
  - `docs/project/operating_plan.md`
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
1. Re-enter the active direction chain before opening any new root-local wave:
   - `docs/project/vision.md`
   - `docs/project/strategic_goals.md`
   - `docs/project/tactical_goals.md`
   - `docs/project/operating_plan.md`
2. Treat guarded repo bootstrap as externalized to the agent-kernel decision packet for now. Do not resume local tasks `#654`–`#656` unless decision `#8` explicitly sends implementation back here.
3. If you are continuing the guarded repo bootstrap concern, route immediately to:
   - `~/ai-society/softwareco/owned/agent-kernel/next_session_prompt.md`
   - `~/ai-society/softwareco/owned/agent-kernel/docs/project/fcos-guarded-repo-bootstrap-authority-after-live-repo-root-drift.md`
   - `~/ai-society/holdingco/governance-kernel/governance/programs/fcos/work-items.json` (`FCOS-M41-01`)
   - `ak decision get 8`
4. For actual root-owned work in this repo, refresh the reduction/audit surfaces and decide whether the next SG1 package-reduction batch should be materialized.
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

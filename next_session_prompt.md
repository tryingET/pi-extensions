---
summary: "Canonical monorepo-root bootstrap for pi-extensions after the seam-first prompt-plane proof, the first KES packet, and the first TG3 hardening slice landed; the next session should reassess AK instead of replaying finished lower-plane work."
read_when:
  - "Starting the next session at the pi-extensions monorepo root."
  - "You need session bootstrap, authority order, and closeout rules."
system4d:
  container: "Session handoff artifact."
  compass: "Keep root policy ownership explicit, route package/template work to the correct repo, and avoid replaying completed seam, KES, or first TG3 hardening packets from stale handoff memory."
  engine: "Validate root -> review current direction chain -> check AK readiness -> proceed only if a repo-local slice is actually ready."
  fog: "Main risks are confusing root policy with package-local overrides, reopening completed lower-plane proof, or inventing a new loop-hardening slice when AK is empty."
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
- The root direction chain is explicit and should be treated as the current narrative truth:
  - `docs/project/vision.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
- The recent `pi-society-orchestrator` runtime-truth wave is complete (`tasks:939-950`).
- The guarded repo-bootstrap concern remains historical root context only; the durable owner/path was decided and verified through agent-kernel decision `#8` plus tasks `#657`, `#665`, `#666`, and `#667`.
- The current routed root-local packet is still the cross-package concern captured in:
  - `docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`
- Current execution order for that packet is now:
  1. thin `pi-vault-client` prompt-plane seam ✅
  2. `pi-society-orchestrator` KES activation + proof ✅
  3. first bounded `pi-society-orchestrator` TG3 hardening slice ✅
  4. any further `pi-society-orchestrator` loop hardening only if AK materializes a new bounded slice
  5. only then any higher-order ASC self follow-on
- The seam-first prompt-plane leaf is complete through:
  - `task:1050`
  - `task:1049`
  - `task:1051`
- The first KES packet is complete through:
  - `task:1089`
  - `task:1090`
  - `task:1091`
- The first bounded TG3 hardening slice is complete through:
  - `task:1107`
  - `task:1108`
- Repo-local AK readiness is currently empty again. If AK still shows no new ready item for this repo, stop rather than synthesizing work from stale handoff prose.
- `./scripts/ak.sh direction import/check/export` still fail closed against the truthful "no ready TG3 task yet" state because the direction substrate expects an active `SG -> TG -> OP -> task` path; use AK + the latest diary note instead of inventing synthetic follow-on tasks just to satisfy that importer.
- A separate exploratory task still exists:
  - `task:962` (`[SO-EXPLORE] Evaluate PufferLib ...`)
  - it remains explicitly deferred and must not displace the routed packet without explicit reprioritization
- Root validation remains coherent through the canonical wrappers:
  - `npm run quality:pre-commit`
  - `npm run quality:pre-push`
  - `npm run quality:ci`
  - `npm run check`
- Canonical root quality-gate wrapper: `./scripts/quality-gate.sh`
- Full root validation: `./scripts/ci/full.sh`
- Canonical package validation: `./scripts/package-quality-gate.sh`
- Package checks orchestrated by: `./scripts/ci/packages.sh`

## DURABLE GUARDRAILS
- Do **not** treat this file as a live status database; use AK for task state.
- Do **not** confuse root policy with package-local overrides.
- Do **not** copy tech-stack policy into every package by habit; root owns the stance.
- Do **not** replay the seam-first prompt-plane packet, the first KES packet, or the first TG3 hardening slice as if they were still missing.
- Do **not** bypass quality gates before committing.

## CONTINUE WITH
1. Re-enter the current direction chain before opening or resuming any root-local wave:
   - `docs/project/vision.md`
   - `docs/project/strategic_goals.md`
   - `docs/project/tactical_goals.md`
   - `docs/project/operating_plan.md`
2. Read the latest root diary evidence for the first TG3 hardening slice:
   - `diary/2026-04-10--tg3-kes-root-fail-closed-and-installed-root-proof.md`
3. Check repo-local AK state before choosing work:
   - `./scripts/ak.sh task ready -F json | jq '.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")'`
   - `./scripts/ak.sh task list -F json | jq '[.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")] | sort_by(.id) | reverse | .[:6]'`
4. If no repo-local ready task exists, stop rather than inventing a synthetic next slice from this handoff alone.
5. Run the direction substrate refresh/check flow explicitly when those docs change **if** a task-backed active path exists again:
   - `./scripts/ak.sh direction import --repo . -F json`
   - `./scripts/ak.sh direction check --repo . -F json`
   - `./scripts/ak.sh direction export --repo . -F json`
   If those commands still fail only because the repo truth is "no ready TG3 task yet," prefer AK + the latest diary note over inventing synthetic follow-on tasks.
6. Treat guarded repo bootstrap as externalized and already verified through agent-kernel decision `#8`. Do not resume local tasks `#654`–`#656` unless a new concern explicitly reopens that area.
7. Route package-local KES/loop follow-through to:
   - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator/next_session_prompt.md`
8. Route template changes to:
   - `~/ai-society/softwareco/owned/pi-extensions-template/next_session_prompt.md`
9. Route Nunjucks live verification to:
   - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client/next_session_prompt.md`
10. Route session/handoff prompt wording and prompt-template work to:
   - `~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator/next_session_prompt.md`

## NEXT-SESSION START COMMANDS
```bash
cd ~/ai-society/softwareco/owned/pi-extensions
git status --short
git diff --name-only
./scripts/ak.sh task ready -F json | jq '.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")'
./scripts/ak.sh task list -F json | jq '[.[] | select(.repo == "/home/tryinget/ai-society/softwareco/owned/pi-extensions")] | sort_by(.id) | reverse | .[:6]'
./scripts/ak.sh direction export --repo . -F json
./scripts/ak.sh direction check --repo . -F json
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

---
summary: "Canonical monorepo-root bootstrap for pi-extensions: use AK as the task authority, run quality gates, keep the prompt-plane seam as landed history, and advance the active KES wave before later loop or higher-order self follow-on work."
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
- The root direction chain is explicit and should be treated as the current narrative truth:
  - `docs/project/vision.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
- The recent `pi-society-orchestrator` runtime-truth wave is complete (`tasks:939-950`).
- The guarded repo-bootstrap concern remains historical root context only; the durable owner/path was decided and verified through agent-kernel decision `#8` plus tasks `#657`, `#665`, `#666`, and `#667`.
- The current routed root-local wave is still the cross-package packet captured in:
  - `docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`
- Current execution order for that wave remains:
  1. thin `pi-vault-client` prompt-plane seam ✅
  2. `pi-society-orchestrator` KES activation ← active now
  3. `pi-society-orchestrator` loop hardening
  4. only then any higher-order ASC self follow-on
- The seam-first prompt-plane leaf is complete through:
  - `task:1050`
  - `task:1049`
  - `task:1051`
- The active root tactical/operating path is now the first KES packet, backed by:
  - `task:1089`
  - `task:1090`
  - `task:1091`
- A separate exploratory task still exists:
  - `task:962` (`[SO-EXPLORE] Evaluate PufferLib ...`)
  - it is now explicitly deferred so it does not displace the TG2 KES wave unless explicit reprioritization says otherwise
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
- Do **not** forget live verification work that still belongs to a specific package.
- Do **not** bypass quality gates before committing.

## CONTINUE WITH
1. Re-enter the active direction chain before opening or resuming any root-local wave:
   - `docs/project/vision.md`
   - `docs/project/strategic_goals.md`
   - `docs/project/tactical_goals.md`
   - `docs/project/operating_plan.md`
2. Run the direction substrate refresh/check flow explicitly when those docs change:
   - `./scripts/ak.sh direction import --repo . -F json`
   - `./scripts/ak.sh direction check --repo . -F json`
   - `./scripts/ak.sh direction export --repo . -F json`
3. Treat guarded repo bootstrap as externalized and already verified through agent-kernel decision `#8`. Do not resume local tasks `#654`–`#656` unless a new concern explicitly reopens that area.
4. Treat the current root-owned wave as the active KES leaf of `docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`:
   - execute `task:1089` first
   - then `task:1090`
   - then `task:1091`
   - keep loop hardening and higher-order ASC self follow-on deferred until that KES wave closes truthfully
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

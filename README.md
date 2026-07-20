---
summary: "Monorepo root overview and operator entrypoint for pi-extensions."
read_when:
  - "Starting work at the pi-extensions monorepo root."
  - "Looking for root-level validation, canary, and governance commands."
---

# pi-extensions

Monorepo of Pi extensions: some are standalone operator tools, others integrate with Prompt Vault, ontology, and society runtime surfaces.

Need the short version? See [README.terse.md](README.terse.md).

Many packages are usable with plain Pi + local install; Prompt Vault and society-specific surfaces are package-specific, not repo-wide prerequisites.

## Structure

```
packages/        # Reusable libraries
apps/            # Deployable services/applications
docs/            # Documentation
ontology/        # ROCS ontology
governance/      # Work items, policies
scripts/         # CI/utility scripts
```

## Where to start

- Standalone-friendly starting points:
  - `packages/pi-context-overlay`
  - `packages/pi-context-packer` (read-only context-window provider planning over SCI/docs/AGENTS/git/session/AK/FCOS/Prompt Vault)
  - `packages/pi-activity-strip`
  - `packages/pi-little-helpers`
  - `packages/pi-agent-vent` (local-only agent frustration capture and recurrence summaries)
  - `packages/pi-provenance`
  - `packages/pi-peer-messaging` (stable same-machine peer-session messaging core and `intercom` adapter)
  - `packages/pi-better-openai` (`/fast`, `/openai-image`, and OpenAI image tool support)
  - `packages/pi-model-selection` (shared support library; no live extension entrypoint)
  - `packages/pi-modes` (session prompt profiles with explicit append, static-base replacement, and exact-final replacement)
  - `packages/pi-prompt-template-accelerator`
  - `packages/pi-prompt-template-execution` (live successor for prompt-template model/thinking/args semantics; minimal extension entrypoint, no prompt bundle)
  - `packages/pi-session-compaction` (live local compaction owner after guarded cutover; tested handler, registration guard, and non-live branch augmentation helpers)
  - `packages/pi-toolbox-discovery` (lazy capability discovery/activation broker for keeping heavy custom tools off by default)
  - `packages/pi-semantic-code-intelligence` (native composite-first SCI tools over a session-scoped MCP stdio bridge)
  - `packages/pi-designmd-foundry` (DesignMD Foundry skill and CLI-backed tools for DESIGN.md lint/export/prompt/import readiness workflows)
  - `packages/pi-evalset-lab` (`/evalset run|compare` fixed-task-set prompt/system evaluation with JSON + HTML reports)
  - `packages/pi-evidence-review` (read-only `/evidence-review` TUI for one bounded, normalized SCI evidence review v1 JSON file)
  - `packages/pi-interaction/*`
- Extra-stack / boundary-heavy starting points:
  - `packages/pi-autoresearch`
  - `packages/pi-vault-client`
  - `packages/pi-ontology-workflows`
  - `packages/pi-society-orchestrator`
  - `packages/pi-society-startup-context` (read-only AI Society session-start orientation packet)
  - `packages/pi-workstation-inference-provider` (read-only Pi provider over workstation-owned inference contracts)
- For the shortest package map and outsider framing, see [README.terse.md](README.terse.md).
- For behavior-first routing across prompt replacement, editor prefill, `sendUserMessage`, settlement, loops, and evaluation, see [docs/project/runtime-capability-map.md](docs/project/runtime-capability-map.md).
- For live release-component inventory, run `node ./scripts/release-components.mjs list --json`.
  The inventory is metadata-driven: publish-ready packages opt in with `x-pi-template.releaseConfigMode=component`; private group roots such as `packages/pi-interaction` stay out of the root-managed component list.

## Fresh-context routing

Start at the monorepo root only when you need package selection, root validation/release surfaces, or repo-owned operator prompts/skills.

When cues overlap, route by owner before diving deeper:

- `packages/pi-society-orchestrator` — coordination/control-plane questions that compose lower-plane owners, such as loops, routing selection, runtime-status wording, evidence intent, or exact supervision flows
- `packages/pi-context-packer` — read-only planning for future context packets across SCI, docs, AGENTS, git, session context, Prompt Vault, AK, and FCOS while preserving provider authority boundaries
- `packages/pi-autonomous-session-control` — subagent execution/runtime behavior, the `self` operational mirror (including mirror-only handoff/closeout summaries), prompt-envelope application, session artifacts, rewind aliasing, and runtime/operator visibility tied to execution ownership
- `packages/pi-agent-vent` — local-only `agent_vent` capture of recurring agent frustrations, bugs, tool failures, and workflow friction; advisory recurrence/candidate-incident summaries only, with no AK/GitHub/incident/evidence mutations
- `packages/pi-provenance` — source-owned Pi session/assistant-message provenance extraction for downstream evidence writers, including provider/model/API refs without raw prompt or provider-payload capture
- `packages/pi-peer-messaging` — stable same-machine peer-session messaging core and `intercom` adapter; communication-only, not authority
- `packages/pi-better-openai` — OpenAI/OpenAI Codex provider affordances such as `/fast`, `/openai-image`, image editing/generation, and related diagnostics
- `packages/pi-model-selection` — shared model-selection/auth-resolution library for prompt-template-compatible resolver semantics; intentionally no `pi.extensions` entrypoint
- `packages/pi-modes` — session prompt-profile discovery and switching; owns `append`, complete static `replace_base`, and exact `replace_final` semantics, but no autonomous continuation or execution authority
- `packages/pi-prompt-template-execution` — prompt-template execution semantics such as `model`, `thinking`, `restore`, `skill`, conditionals, args, Pi host adapter behavior, dry-run diagnostics, compatibility canaries, and `/commit` live execution ownership after replacing `npm:pi-prompt-template-model`
- `packages/pi-session-compaction` — custom `session_before_compact` summary ownership, summarizer model resolution, user-prompt/command preservation, and files-touched manifests (live local owner; do not enable alongside another compaction override)
- `packages/pi-toolbox-discovery` — lazy custom-tool discovery/activation broker; route here when reducing default active tool count or activating capability bundles on demand
- `packages/pi-semantic-code-intelligence` — Pi-side registration and MCP stdio bridging for SCI's composite impact, definition, rename, structural patch, and preview/check workflows; SCI remains the workflow owner
- `packages/pi-autoresearch` — bounded experiment-loop runtime ownership, manifest-campaign planning/control, and local campaign receipt/machine surfaces
- `packages/pi-vault-client` — Prompt Vault query/retrieve/mutate/rate flows, schema compatibility, and prompt-plane governance
- `packages/pi-ontology-workflows` — ontology inspection/change workflows and ROCS-facing operator surfaces
- `packages/pi-designmd-foundry` — DESIGN.md-centered design contract handoff, lint/export/prompt/import tools, and verified DesignMD Foundry workflow skill
- `packages/pi-evalset-lab` — fixed-task-set prompt/system evaluation, `/evalset run|compare`, sample datasets, and JSON-to-HTML eval report export
- `packages/pi-evidence-review` — inert validation and TUI display of one explicitly named, workspace-contained SCI `evidence_review.v1` JSON file; no normalization, execution, persistence, links, or decisions
- `packages/pi-society-startup-context` — read-only AI Society startup/session orientation packet and `/society-context refresh`; no AK/KES/evidence writes or repair authority
- `packages/pi-workstation-inference-provider` — read-only Pi provider adapter over workstation lane-op inference contracts; no model download/build/server/runtime control ownership
- monorepo root docs — only for package-family selection, release/governance control-plane surfaces, and repo-owned prompts/skills such as `.pi/prompts/commit.md` and `.pi/prompts/pi-extensions-deep-dive.md`

Generic prompts that stop depending on pi-extensions-specific routing or workflow should move to a shared owner instead of accumulating in the root `.pi/prompts/` directory.

## Package Manager

- **npm** — monorepo validation surface at root plus per-package manifests under `packages/` and `apps/`
- Languages — defined per-package (see `packages/` and `apps/`)
- Root `package.json` currently exists to expose consistent validation commands; it is not a full npm workspace manifest.
- Root validation routes through `scripts/quality-gate.sh`.
- Root pre-commit validation runs root infrastructure smoke plus staged package pre-commit fan-out.
- Root pre-push/CI validation aggregates root infrastructure checks, package release-contract validation, and package checks orchestrated via `scripts/package-quality-gate.sh` from `scripts/ci/packages.sh`.
- Editor/formatter configuration remains package-local; the monorepo root intentionally does not define a root `biome.jsonc` or root `.vscode/settings.json`.

## Quick Commands

```bash
# ROCS tooling
./scripts/rocs.sh --doctor
./scripts/rocs.sh version

# AK task / work-item CLI
ak --doctor
ak task ready

# Standardized repo-local Justfile surface
just help
just test
just check
just lint
just fmt
just ci
just doctor
# no just build/dev: the monorepo root has no single buildable or long-running app/watch surface

# CI lanes / canonical root validation
./scripts/quality-gate.sh pre-commit   # root smoke + staged package pre-commit fan-out
./scripts/quality-gate.sh pre-push
./scripts/quality-gate.sh ci
./scripts/ci/smoke.sh                  # root infrastructure smoke checks
./scripts/ci/full.sh                   # root infrastructure + canonical package checks
./scripts/ci/packages.sh ci --package pi-autoresearch --package pi-society-orchestrator  # scoped package fan-out
./scripts/package-quality-gate.sh ci packages/pi-vault-client
npm run quality:pre-commit
npm run quality:pre-push
npm run quality:ci
npm run check
node ./scripts/release-components.mjs list --json   # live release-component inventory
npm run engineering:review-surfaces                  # live package-local engineering audit
npm run release:contracts:validate  # validate publish/package release floors for non-private packages
npm run compat:canary:list          # list host-compatibility scenarios + exact host contract
npm run compat:canary               # local mirror of the dedicated compatibility-canary workflow (auto-aligns scenario packages to the pinned host contract)
PI_HOST_COMPAT_CANARY=1 ./scripts/ci/full.sh   # optional local full-lane mirror
# explicit upgrade candidate
PI_HOST_COMPAT_HOST_VERSION=0.61.0 PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/badlogic/pi-mono/compare/v0.60.0...v0.61.0' npm run compat:canary -- --profile upgrade

# dedicated CI signal
# GitHub Actions: .github/workflows/compatibility-canary.yml

# local feedback bootstrap
bash ./scripts/install-hooks.sh

# legacy standalone repo deprecation helpers
./scripts/legacy-package-deprecation.sh inspect --legacy ~/programming/pi-extensions/<legacy> --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>
./scripts/legacy-package-deprecation.sh render-handoff --legacy ~/programming/pi-extensions/<legacy> --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>
./scripts/legacy-package-deprecation.sh relocate-sessions --legacy ~/programming/pi-extensions/<legacy> --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>
```

## ROCS command flow

1. `./scripts/rocs.sh --doctor` — verify ROCS environment
2. `./scripts/rocs.sh validate --repo .` — validate ontology
3. `./scripts/rocs.sh lint --repo .` — lint governance files

## Adding Packages

Use `tpl-package` from your L1 templates to add packages:

```bash
# From L1 templates repo
./scripts/new-repo-from-copier.sh tpl-package /path/to/monorepo/packages/<name> \
  -d package_name=<name> \
  -d package_type=library \
  -d language=<python|node|typescript|rust|go> \
  --defaults --overwrite
```

## Adding Apps

```bash
# From L1 templates repo
./scripts/new-repo-from-copier.sh tpl-package /path/to/monorepo/apps/<name> \
  -d package_name=<name> \
  -d package_type=app \
  -d language=<python|node|typescript|rust|go> \
  --defaults --overwrite
```

## Governance

- AK task/work-item operations should use plain installed `ak` from the repo root or package directories; repo identity still belongs to the monorepo root.
- New package-local architecture/process docs should use `docs/project/` for dated RFCs/runbooks/notes and `docs/adr/` for adopted decisions; avoid creating new package-local `docs/dev/` trees.
- Work items: `governance/work-items.json`
- Policies: `policy/`
- Ontology: `ontology/`
- Root capability registry:
  - `docs/project/root-capabilities.md`
- Pi host compatibility canary:
  - `policy/pi-host-compatibility-canary.json`
  - `docs/project/pi-host-compatibility-canary.md`
  - `scripts/pi-host-compatibility-canary.mjs`
  - `.github/workflows/compatibility-canary.yml`
  - upstream trigger bridge lives in `~/ai-society/softwareco/contrib/scripts/pi-mono-compatibility-relay.sh`
- Legacy standalone repo shutdown workflow:
  - `docs/project/legacy-package-deprecation-workflow.md`
- Legacy transition backlog:
  - `docs/project/legacy-transition-backlog.md`
- Review/ownership feedback:
  - `.github/pull_request_template.md`
  - `.github/CODEOWNERS`
  - `.github/VOUCHED.td`
  - `.github/ISSUE_TEMPLATE/*`
  - `.github/workflows/ci.yml`
  - `.github/workflows/vouch-check-pr.yml`
  - `.github/workflows/vouch-manage.yml`
  - `.github/dependabot.yml`
- Repo-local stack note:
  - `docs/engineering.local.md`
- Package stack contract surface:
  - reduced-form target: package-local `docs/engineering.local.md` only when a package has a real local override
  - current audit + routing note: `docs/project/engineering-review-surfaces.md`
  - migration contract + exact boundaries: `docs/project/reduced-form-migration-contract.md`
  - live audit command: `npm run engineering:review-surfaces`
  - package-local `policy/engineering-lane.json` remains present in some existing packages and is tracked as legacy/full-surface state until routed follow-up removes it truthfully
  - `policy-only` is not an accepted target state
  - root helper `scripts/validate-engineering-contract.mjs`
  - package-local `AGENTS.md` / `docs/project/resources.md`
- Upstream lane CLI:
  - `uv tool run --from ~/ai-society/core/engineering-core engineering-core show pi-ts --prefer-repo`
- Repo-owned operator prompts (`.pi/prompts/`):
  - `.pi/prompts/commit.md` — repo-local commit workflow / validation gate prompt
  - `.pi/prompts/pi-extensions-deep-dive.md` — repo-local discoverability / routing prompt for package-selection and ownership questions inside this monorepo
  - keep prompts here only when they are specific to `pi-extensions`; they encode monorepo workflow and fresh-context routing, not reusable package/runtime semantics
- Package-owned prompts:
  - installable prompt bundles stay in each package's `prompts/` directory and are exposed via package-local `package.json#pi.prompts`
- Community/process docs:
  - `CONTRIBUTING.md`
  - `CODE_OF_CONDUCT.md`
  - `SECURITY.md`
  - `SUPPORT.md`

## Direction chain

Use these root direction surfaces in order when planning the next active root wave:

- `docs/project/vision.md`
- `docs/project/strategic_goals.md`
- `docs/project/tactical_goals.md`
- `docs/project/operating_plan.md`
- `next_session_prompt.md`

## Diary

Capture sessions in `diary/YYYY-MM-DD--type-scope-summary.md`.

## Recursion Policy

- **Allowed**: L1 → L2 (this monorepo), L2 → L3 (packages/apps)
- **Forbidden**: L2 → L1, L1 → L0

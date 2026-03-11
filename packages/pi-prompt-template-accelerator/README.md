---
summary: "Overview and quickstart for prompt-template-accelerator."
read_when:
  - "Starting work in this repository."
system4d:
  container: "Repository scaffold for a pi extension package."
  compass: "Ship small, safe, testable extension iterations."
  engine: "Plan -> implement -> verify with docs and hooks in sync."
  fog: "Unknown runtime integration edge cases until first live sync."
---

# pi-prompt-template-accelerator

pi extension that auto-fills prompt template arguments from deterministic context inference.

## Quickstart

```bash
pi -e ./extensions/ptx.ts
```

Then type `$$ /inv` (or `$$ /`) to open the fuzzy selector, choose a prompt template, and auto-fill args from context.

## How it works

1. Build prompt-template candidates from `pi.getCommands()` (`source === "prompt"`)
2. Rank candidates via `fzf --filter` when available (fallback deterministic ranker otherwise)
3. Let user choose from selector (`$$ /query` or `/ptx-select [query]`)
4. Read the selected template file from `cmd.path`
5. Parse placeholder usage (`$1`, `$2`, `$@`, `${@:N}`)
6. Parse line hints around placeholders for slot inference
7. Infer context deterministically from environment (repo, cwd, branch, objective)
8. Insert transformed command into editor for review

Press Enter to execute, or edit first.

## Context inference

- `$1` → objective/rough thought (last user message)
- `$2` → context summary (repo, cwd, branch)
- `$3` → system4d mode (defaults to `lite`)
- rest → extras

Hint-aware: reads template lines to infer slot types from keywords.

## Fuzzy selection (primary)

- `$$ /<partial>` opens the PTX fuzzy picker.
- `/ptx-select [partial]` opens the same picker explicitly.
- PTX picker candidates now include only prompt commands with a usable template path, so picker selection stays aligned with the PTX contract of producing a fully prefilled command.
- When multiple packages expose the same prompt name, PTX now carries the exact selected prompt metadata and adds origin detail to duplicate entries so the chosen template stays stable.
- Use `/ptx-debug-commands [query]` to inspect visible prompt commands, paths, and inferred arg contracts.
- Mode is reported in notifications:
  - `mode=fzf` when `fzf` ranking is available
  - `mode=fallback` when deterministic in-app ranking is used

## Compatibility hardening

The extension no longer installs a custom editor component, so it can coexist with other extensions without `setEditorComponent` conflicts.
In non-UI mode, malformed `$$` input is surfaced as deterministic transform text (usage/parse errors) instead of being silently swallowed.
Context inference now treats `sessionManager` / `getBranch()` as optional so trigger-style live-picker contexts can still build PTX suggestions without crashing.
Live picker selections now preserve the exact selected prompt command metadata instead of re-resolving only by slash-command name, which avoids duplicate-name drift across installed packages.
If you type a direct `$$ /name` invocation for a prompt command that PTX cannot read or fully resolve (for example missing `path`, metadata drift, or live fallback conditions), PTX now prefills the raw slash command instead of leaving the editor empty.

## Files

- `extensions/ptx.ts` — main extension (selection + mapping flow)
- `src/fuzzySelector.js` — shared selector contract + fzf/fallback ranking
- `src/ptxCandidateAdapter.js` — prompt command → `FuzzyCandidate` adapter

## Cognitive triggers

Works great with cognitive trigger templates like:

- `/inversion` — Find what's hiding in shadows
- `/nexus` — Single highest-leverage intervention
- `/audit` — Bugs, debt, smells, gaps tetrahedron
- `/first-principles` — Dissolve assumptions, rebuild from axioms
- `/crisis` — Overwhelmed recovery protocol
- `/morning` — Start-of-day alignment

See `~/ai-society/softwareco/infra/workstation/prompts/triggers/` for the full set.

## Current package truth

- Primary UX: `$$ /<partial>` routes through the PTX fuzzy selector (`fzf --filter` when available, deterministic fallback otherwise)
- Command UX: `/ptx-select [query]` opens the same selector explicitly
- Current prefill behavior is still **deterministic** and code-driven at suggestion time
  - the active model is **not** currently used to generate PTX arg suggestions
- Trigger/live-picker hardening in place:
  - missing `sessionManager` / `getBranch()` no longer crashes context inference
  - duplicate prompt names are disambiguated and preserve exact selected prompt identity
  - picker candidates include only prompt commands with a usable template path
- Diagnostics available:
  - `/ptx-debug-commands [query]`
  - `/ptx-fzf-spike`
- Current semantic ceiling:
  - PTX objective extraction is still heuristic and may fall back to `"<MUST_REPLACE_PRIMARY_OBJECTIVE>"` when no trustworthy objective is available

## Repository checks

Run:

```bash
npm run check
```

This executes [scripts/validate-structure.sh](scripts/validate-structure.sh).

Run core behavior tests with:

```bash
node --test tests/*.test.mjs
npm run test:smoke:non-ui
```

## Troubleshooting

- `PTX input error: expected '/template' after '$$'.`
  - provide a selector invocation such as `$$ /inv`
- `PTX parse error: Unclosed quote: ...`
  - close unmatched quotes in `$$ /...` input
- `PTX input error: expected slash command after '$$'.`
  - the token after `$$` must be a non-empty slash command (for example `$$ /inv`, not `$$ /`)
- `No prompt template selected (fzf-not-installed)`
  - install `fzf`, or keep using fallback ranking mode
- `No prompt template selected (prompt-command-source-unavailable)`
  - ensure prompt templates are loaded (avoid `--no-prompt-templates`)
- `No prompt template selected (no-prompt-templates)`
  - there are no prompt commands in the current session
- `No prompt template selected (no-prefillable-prompt-templates)`
  - prompt commands exist, but none expose a usable template path for PTX picker prefill
- `Cannot read template: ...`
  - the selected template path is unavailable/unreadable
- `PTX Debug Commands`
  - use `/ptx-debug-commands [query]` to inspect which visible prompt commands are prefillable and what arg contracts they expose

## Release + security baseline

This package now uses the **root-owned monorepo release control plane** in component mode.
It gets its own independent release-please PRs/tags/releases, but the workflows/config live at monorepo root.

Relevant root-owned files:

- [CI workflow](../../.github/workflows/ci.yml)
- [release-please workflow](../../.github/workflows/release-please.yml)
- [release-check workflow](../../.github/workflows/release-check.yml)
- [publish workflow](../../.github/workflows/publish.yml)
- [release-please config](../../.release-please-config.json)
- [release-please manifest](../../.release-please-manifest.json)
- [root component helper](../../scripts/release-components.mjs)
- [Security policy](SECURITY.md)

Current component tag shape:

- `pi-prompt-template-accelerator-vX.Y.Z`

Before first production release under root automation:

1. Confirm/adjust owners in [../../.github/CODEOWNERS](../../.github/CODEOWNERS).
2. Enable branch protection on `main`.
3. Configure npm Trusted Publishing for the monorepo repo + [root publish workflow](../../.github/workflows/publish.yml).
4. Let root release-please open the component release PR, then publish from the GitHub release.

## Issue + PR intake baseline

Included files:

- [Bug report form](../../.github/ISSUE_TEMPLATE/bug-report.yml)
- [Feature request form](../../.github/ISSUE_TEMPLATE/feature-request.yml)
- [Docs request form](../../.github/ISSUE_TEMPLATE/docs.yml)
- [Issue template config](../../.github/ISSUE_TEMPLATE/config.yml)
- [PR template](../../.github/pull_request_template.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Support guide](SUPPORT.md)
- [Top-level contributing guide](CONTRIBUTING.md)

## Vouch trust gate baseline

Included files:

- [Vouched contributors list](../../.github/VOUCHED.td)
- [PR trust gate workflow](../../.github/workflows/vouch-check-pr.yml)
- [Issue-comment trust management workflow](../../.github/workflows/vouch-manage.yml)

Default behavior:

- PR workflow runs on `pull_request_target` (`opened`, `reopened`).
- `require-vouch: true` and `auto-close: true` are enabled by default.
- Maintainers can comment `vouch`, `denounce`, or `unvouch` on issues to update trust state.
- Vouch actions are SHA pinned (`5713ce1baedf75e2f830afa3dac813a9c48bff12`) for reproducibility and supply-chain review.

Bootstrap step:

- Confirm/adjust entries in [../../.github/VOUCHED.td](../../.github/VOUCHED.td) before enforcing production policy.

## Docs discovery

Run:

```bash
npm run docs:list
npm run docs:list:workspace
npm run docs:list:json
```

Wrapper script: [scripts/docs-list.sh](scripts/docs-list.sh)

Resolution order:
1. `DOCS_LIST_SCRIPT`
2. `./scripts/docs-list.mjs` (if vendored)
3. `~/ai-society/core/agent-scripts/scripts/docs-list.mjs`

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

## Hook behavior

- Git uses `.githooks/pre-commit` (configured by [scripts/install-hooks.sh](scripts/install-hooks.sh)).
- If `prek` is available, the hook runs `prek` using [prek.toml](prek.toml).
- If `prek` is not available, the hook falls back to `scripts/validate-structure.sh`.

Install options for `prek`:

```bash
npm add -D @j178/prek
# or
npm install -g @j178/prek
```

## Project docs maintenance

This package no longer ships a repo-local startup-intake layer.
Maintain organization and project docs directly in `docs/org/` and `docs/project/`.

## Live package activation

Install the package into Pi from its local package path:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
```

Then in Pi:

1. run `/reload`
2. verify with a real command or tool call from this package

## Task management and handoff authority

- Use `NEXT_SESSION_PROMPT.md` as the active handoff for this package.
- Do **not** keep a separate package-local status snapshot document.
- For canonical task/evidence/work-item authority, use Agent Kernel (`ak`) instead of ad-hoc markdown tracking:
  - [agent-kernel README](../agent-kernel/README.md)
  - [DB-first work-items runbook](../agent-kernel/docs/project/db-first-work-items-runbook.md)
  - [Issue-tracker placement and AK boundary ADR](../agent-kernel/docs/adr/0007-issue-tracker-placement-and-ak-boundary.md)
- Operational rule borrowed from agent-kernel:
  - use the handoff file as the active fresh-context artifact, not as a second status database
- This package currently does **not** maintain a `governance/work-items.json` projection.
  - if you need task tracking, use AK DB task/evidence commands directly

Example AK flow for this package:

```bash
cd ~/ai-society/softwareco/owned/agent-kernel
source ./.ak-env-v2

./scripts/ak-v2.sh task create \
  --repo /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator \
  "<task title>"

./scripts/ak-v2.sh task ready
./scripts/ak-v2.sh task claim <id> --agent <agent-id> --lease 3600
./scripts/ak-v2.sh evidence record --task <id> --check-type validation:workspace --result pass
./scripts/ak-v2.sh task complete <id> --result '{"summary":"done"}'
```

## Docs map

- [Organization operating model](docs/org/operating_model.md)
- [Project foundation model](docs/project/foundation.md)
- [Project vision](docs/project/vision.md)
- [Project incentives](docs/project/incentives.md)
- [Project resources](docs/project/resources.md)
- [Project skills](docs/project/skills.md)
- [Strategic goals](docs/project/strategic_goals.md)
- [Tactical goals](docs/project/tactical_goals.md)
- [Contributor guide](docs/dev/CONTRIBUTING.md)
- [Extension SOP](docs/dev/EXTENSION_SOP.md)
- [Next session prompt](NEXT_SESSION_PROMPT.md)
- [Agent Kernel task/work-item authority](../agent-kernel/README.md)

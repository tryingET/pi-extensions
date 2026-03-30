---
summary: "Changelog for scaffold evolution."
read_when:
  - "Preparing a release or reviewing history."
system4d:
  container: "Release log for this extension package."
  compass: "Track meaningful deltas per version."
  engine: "Document changes at release boundaries."
  fog: "Versioning policy may evolve with team preference."
---

# Changelog

All notable changes to this project should be documented here.

## [Unreleased]

### Added

- Input preprocessor for `$$ /template ...` flows via `pi.on("input")`.
- Prompt-template-aware argument mapping based on parsed placeholders (`$1`, `$2`, `$@`, `${@:N}`).
- Lightweight context inference (repo/cwd/branch/objective hint) for missing template arguments.
- `/ptx-preview` command to inspect parsed placeholder usage, template line hints, inferred context, mapped args, explicit `$1/$2/$3/${@:4}` contract projection, and final transformed command without executing it.
- `/ptx-policy` diagnostics command to display effective policy config source and optional per-template decision.
- `$$ /...` now inserts a suggested expanded command into the editor (no auto-transform execution).
- Custom editor + autocomplete provider wrapper so prompt-template command-name autocomplete works for `$$ /...` input prefix and nested `/ptx-preview /...` arguments.
- Configurable template policy via `.pi/ptx-config.json` with allowlist/blocklist support and per-template fallback (`passthrough|block`).
- Core parsing and command-build utilities in `src/`, including reusable transform planning, with automated tests in `tests/ptx-core.test.mjs`, `tests/ptx-plan.test.mjs`, `tests/ptx-autocomplete-provider.test.mjs`, and `tests/ptx-policy-config.test.mjs`.
- Fuzzy selector contract (`FuzzyCandidate`/`SelectionResult`) with FZF ranking + deterministic fallback (`src/fuzzySelector.js`).
- Prompt adapter normalization layer for selector candidates (`src/ptxCandidateAdapter.js`) with unit tests.
- `/ptx-select [query]` command for explicit template picking.
- `/ptx-debug-commands [query]` to inspect visible prompt commands, paths, and inferred arg contracts.
- `/ptx-fzf-spike` command to probe interactive vs filter-mode fzf viability.
- PTX runtime-registry bridge (`src/ptxRuntimeRegistry.js`) that registers prompt-template runtime ownership and observed model lifecycle in `@tryinget/pi-runtime-registry`.

### Changed

- PTX now participates in the root-owned monorepo component release flow instead of carrying package-local release-please config/manifest files; release automation is now driven by root component metadata and component-scoped tags.
- Package docs now treat `README.md` + `next_session_prompt.md` as the maintained package truth/handoff surface; `docs/dev/status.md` is removed, this package no longer keeps a separate markdown status snapshot, and Agent Kernel (`ak`) is referenced as canonical task/work-item authority for task tracking.
- PTX context inference now treats `sessionManager` / `getBranch()` as optional so trigger-style live-picker contexts can build suggestions without crashing.
- PTX live-picker selections now preserve exact selected prompt metadata instead of re-resolving only by slash-command name, avoiding duplicate-name drift across installed packages.
- PTX picker candidates now include only prompt commands with a usable template path, keeping picker selection aligned with the fully-prefilled-command contract.
- PTX now prefills the raw slash command only for direct `$$ /name` fallback when a prompt command cannot provide a readable template path or richer live transform cannot be built, avoiding empty-editor outcomes without weakening picker semantics.
- PTX no-candidate warnings now distinguish prompt-command discovery failure, missing prompt-template commands, and non-prefillable prompt-template metadata drift, with actionable guidance that points operators to `/ptx-debug-commands [query]` in UI sessions when appropriate.
- Package migrated into `pi-extensions` monorepo under `packages/pi-prompt-template-accelerator`.
- Live trigger bridge now targets pi-interaction split package surfaces:
  - primary: `@tryinget/pi-trigger-adapter`
  - fallback: `@tryinget/pi-interaction`
- `$$ /<partial>` now routes through the fuzzy selector path before template expansion.
- Deprecated custom-editor autocomplete path removed entirely to eliminate `setEditorComponent` conflicts.
- In non-UI mode, `$$` usage errors, malformed selector parse errors, and invalid selector invocations (including slash-only `$$ /`) now return deterministic `action: "transform"` error text instead of silent `handled` responses.
- CI now runs mixed-extension non-UI smoke checks across both load orders (`ptx -> vault`, `vault -> ptx`) and validates both probes (`$$ /...`, `/vault...`) with hang detection.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.

---
summary: "PTX now preserves exact selected prompt identity, limits picker candidates to path-backed prompt commands, and reserves raw-command fallback for direct `$$ /name` use; next session should first reconcile the current multi-agent working state, then perform live installed-runtime verification of full prefill and candidate visibility."
read_when:
  - "Starting the next pi-prompt-template-accelerator work session in monorepo."
system4d:
  container: "Session handoff artifact."
  compass: "Keep deterministic PTX transforms healthy across both full session contexts and lightweight trigger contexts."
  engine: "Validate baseline -> verify live UI flows -> tighten any remaining live-picker drift."
  fog: "Main risk is assuming broker-level regression coverage fully proves the installed runtime/editor integration."
---

# Next session prompt — pi-prompt-template-accelerator

## Completed ✅

- PTX context inference still treats `sessionManager` / `getBranch()` as optional enrichment instead of a required dependency.
- PTX live picker now preserves the **exact selected prompt metadata** (`name` / `path` / description) instead of re-resolving only by slash-command name after selection.
- PTX picker candidates now disambiguate duplicate prompt names with origin detail so repeated scaffold prompts like `/implementation-planning` are less ambiguous.
- PTX now keeps picker semantics stricter: `$$ /...` and `/ptx-select` surface only prompt commands with a usable template path, so picker selection remains aligned with the fully-prefilled-command contract.
- PTX now stages a raw slash-command fallback only for direct `$$ /name` invocations when richer transform building cannot be completed, avoiding empty-editor outcomes without weakening picker semantics.
- `/ptx-debug-commands [query]` can now inspect visible prompt commands, paths, and inferred arg contracts.
- Regression coverage now includes a broker-driven live-picker case with duplicate prompt names:
  - `tests/non-ui-mixed-extension-smoke.test.ts`
- Validation passed:
  - `npm run check`
  - `npm run test:smoke:non-ui`
  - `npm run release:check:quick`

## Current package truth

### What changed
- `src/ptxCandidateAdapter.js`
  - candidates now carry exact selected command metadata
  - duplicate names now include origin detail in picker rows
  - candidate IDs are unique even when command names repeat
  - picker candidates now require a usable template path
- `src/planPromptTemplateTransform.js`
  - accepts an explicit selected template-command override instead of always resolving by name only
- `extensions/ptx.ts`
  - live picker + UI fallback paths now use selected command metadata
  - richer fallback behavior now stages raw slash commands when transform planning cannot produce a fuller suggestion
- `tests/non-ui-mixed-extension-smoke.test.ts`
  - covers duplicate-name live-picker selection through the trigger broker

### What this means operationally
- `$$ /...` remains a prompt-command picker, not a full Prompt Vault browser.
- PTX now has a safer and more explicit contract for installed environments with many scaffolded prompt packages:
  - duplicate prompt names are disambiguated
  - selection identity survives through suggestion building
  - picker candidates are limited to path-backed prompt commands that PTX can actually inspect
  - raw command fallback is reserved for direct `$$ /name` invocation, not as the default picker contract

## Priority objective (next session)

First reconcile the current multi-agent working state in this package so you can inspect a stable tree, then run live interactive validation of installed PTX with trigger surfaces loaded and confirm end-to-end fully-prefilled `$$ /...` behavior in a real Pi session.

### Recommended checks
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
npm run test:smoke:non-ui
npm run check
npm run release:check:quick
```

Then install/reload in Pi and verify for real:
```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
# inside pi:
# /reload
# /ptx-debug-commands implementation-planning
# $$ /
# select implementation-planning
# $$ /implementation-planning "verify PTX full prefill"
# /ptx-select implementation-planning
# /ptx-debug-commands analysis-router
```

## Deferred with contract

| Finding | Rationale | Owner | Trigger | Deadline | Blast Radius |
|---------|-----------|-------|---------|----------|--------------|
| Installed live TUI proof that `$$ /` now excludes non-prefillable prompts and that a real selectable prompt writes a fully filled command into the editor | Requires an interactive Pi session with the installed runtime and real trigger surfaces; package-local tests are green, but this final proof is runtime-interactive | Next PTX session owner / current operator | Next stable single-agent interactive Pi session after `/reload` | Before calling the PTX picker line fully closed or releasable | If skipped, an editor-surface-specific integration bug could remain hidden despite green package tests |
| Confirm whether `/analysis-router` still appears in the live PTX picker after the new path-backed candidate filter | Depends on the active installed runtime state and currently loaded prompt inventory, not just repo-local code | Next PTX session owner / current operator | Run `/ptx-debug-commands analysis-router`, then `$$ /` in the next stable single-agent session | Same session as live validation above | If it still appears unexpectedly, there is still runtime/provenance drift to explain and PTX visibility semantics remain confusing |
| Reconcile the current multi-agent working state before further PTX edits | Two concurrent agents in the same package can obscure causality and make runtime observations untrustworthy | Current operator | Before any further PTX coding or live validation | Immediately next session | If skipped, follow-up analysis may blame the wrong codepath or validate against a mixed/unreliable tree |

## Next truthful question to answer

Did preserving exact selected prompt identity and filtering picker candidates to path-backed prompt commands fully eliminate the live empty-editor case while keeping `$$ /...` aligned with the fully-prefilled-command contract in the installed Pi runtime?

### Hypotheses to test
1. duplicate-name drift plus pathless/pointerless picker candidates was the real cause of the empty-editor behavior
2. the installed runtime now correctly stages a fully filled `/implementation-planning "..." ...` command for selectable items
3. there is still an editor-surface-specific integration gap beyond broker-level trigger tests
4. surprising visible commands such as `/analysis-router` now come only from runtime state drift, not from PTX candidate selection rules

## Keep this boundary explicit

- `$$ /...` = installed/exported prompt-command picker only
- `/vault` = full visible Prompt Vault browser/retrieval surface
- PTX should not be described as exposing the entire Prompt Vault

## Files most relevant now
- `extensions/ptx.ts`
- `src/ptxCandidateAdapter.js`
- `src/planPromptTemplateTransform.js`
- `tests/non-ui-mixed-extension-smoke.test.ts`
- `README.md`
- `docs/dev/status.md`

## Success condition for the next slice
A truthful next session is successful if it cleanly does all of the following:
1. reconciles the current multi-agent working state before drawing runtime conclusions
2. verifies installed live `$$ /implementation-planning` now writes a fully filled command into the editor
3. confirms `$$ /` no longer surfaces non-prefillable prompt commands in the picker, or explains any remaining exception with `/ptx-debug-commands`
4. checks whether any remaining editor/runtime-specific assumptions surface after the selected-command-identity + path-backed candidate fixes
5. updates docs/status only if new evidence changes the current package truth

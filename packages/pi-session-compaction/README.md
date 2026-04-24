# pi-session-compaction

Dedicated Pi package for custom session compaction summaries.

## Ownership

This package is the intended **single owner** of custom `session_before_compact` summaries in the `pi-extensions` monorepo.

- `pi-session-compaction` owns custom summary content and shape.
- `pi-autonomous-session-control` remains the runtime/subagent/rewind owner and should only observe `session_compact` for rewind aliasing.
- Do not install/enable multiple custom compaction overrides at once.

## Current slice

This package currently implements the compaction-facing foundations and a tested non-live handler module:

- current-session model fallback
- named preset resolution (`exact`, case-insensitive, prefix, normalized substring)
- prompt-template-model-aligned model fallback semantics imported from `@tryinget/pi-model-selection`: exact `modelId`, exact `provider/modelId`, comma-separated fallback lists, current-model preservation, and provider-priority ordering for ambiguous bare IDs
- compatibility with both Pi host auth APIs through `@tryinget/pi-model-selection`:
  - `modelRegistry.getApiKeyAndHeaders(model)`
  - `modelRegistry.getApiKey(model)`
- preservation of model-level `headers`
- normalized thinking levels
- files-touched collection ported from dot314 grounded-compaction, including read/write/edit/move/delete tracking, no-op edit filtering, move redirects, repo-relative display paths, and manifest rendering
- user prompt / command preservation ported from legacy `pi-user-prompt-compaction`, including expanded skill-block recovery, timestamp-matched slash command recovery, previous-summary prompt-section recovery, and `/compact <customInstructions>` preservation
- non-live `extensions/session-compaction/handler.js` assembly for `session_before_compact`, including compact-instruction parsing, config loading, stock-boundary span derivation, summary prompt assembly, final files-touched manifest append, essential-prompt append/deduplication, safe stock fallback, and abort cancellation
- non-live `extensions/session-compaction/registration.js` guard for future hook activation, including default-disabled registration, explicit handler-test confirmation, explicit no-double-compaction preflight, existing-handler zero-count proof, duplicate package-registration blocking, and optional input tracking for slash-command preservation without slash-command registration
- non-live `extensions/session-compaction/branch-summary.js` helpers for optional `session_before_tree` augmentation, including prompt-contract loading, files-touched instructions, focus text preservation, and safe undefined-on-failure behavior
- clear failure messages for missing models, ambiguous matches, unsupported reasoning, and incompatible registries

The active `session_before_compact` hook is intentionally not registered or enabled yet. Install this package as the live compaction owner only after a deliberate live registration plan confirms no other compaction override is enabled.

## Template baseline

This package was reconciled through `../pi-extensions-template` in `simple-package` mode, then intentionally adapted for the current non-live compaction foundation. It keeps template lineage and baseline files such as `.copier-answers.yml`, `biome.jsonc`, `policy/stack-lane.json`, and `docs/tech-stack.local.md`, but it deliberately omits `package.json#pi.extensions` and `package.json#pi.prompts` until the compaction hook has handler-level tests and no other compaction override is enabled.

## Target summary shape

````md
## Brief
- Current objective
- Current state
- Immediate next action

## Constraints & preferences
- User-stated constraints and preferences

## Key decisions & rejected paths
- Decisions
- Failed/rejected approaches worth not repeating

## Status
- Done
- In progress
- Unverified
- Blocked

## Open issues & uncertainties
- Facts vs inferences

## Immediate next steps
1. Concrete next action
2. Validation
3. Follow-up

## Mandatory reading
- exact/file/path.ts
- docs/exact-doc.md

## Essential user prompts / commands + arguments used
1. original user request
2. /skill:frontend-design ...
3. /template:review ...

---

## Files touched (cumulative)
R=read, W=write, E=edit, M=move/rename, D=delete

```text
RE src/foo.ts
W  src/bar.ts
```
````

## Design inputs

The full implementation should port and reconcile these sources:

- grounded compaction foundation from `softwareco/contrib/dot314/extensions/grounded-compaction/`
- files-touched core from `softwareco/contrib/dot314/extensions/_shared/files-touched-core.ts`
- user prompt/command preservation from legacy `~/programming/pi-extensions/pi-user-prompt-compaction`
- installed prompt frontmatter model semantics from `npm:pi-prompt-template-model` (`/home/tryinget/.npm-global/lib/node_modules/pi-prompt-template-model/model-selection.ts` and `prompt-loader.ts`)
- observed prompt-template model lifecycle ideas from `packages/pi-prompt-template-accelerator/src/ptxRuntimeRegistry.js`

The live `/commit` prompt gets its model behavior from the installed `pi-prompt-template-model` extension, not from Pi core prompt-template loading and not from `pi-prompt-template-accelerator`. The shared resolver semantics now live in `packages/pi-interaction/pi-model-selection` (`@tryinget/pi-model-selection`): exact specs, comma fallback, current-model preservation, auth-aware candidate selection, and provider priority `openai-codex -> anthropic -> github-copilot -> openrouter`. This package keeps only compaction-specific preset, thinking, and summarizer resolution logic.

## Validation

```bash
cd packages/pi-session-compaction
npm run test
npm run check
```

## Next implementation steps

1. Decide whether the next slice is a controlled live-extension entrypoint or a prompt-template execution successor slice.
2. If adding a live entrypoint, keep it fail-closed behind the existing registration guard and document the exact preflight for confirming zero existing compaction handlers.
3. Only then install/reload as the live compaction owner.

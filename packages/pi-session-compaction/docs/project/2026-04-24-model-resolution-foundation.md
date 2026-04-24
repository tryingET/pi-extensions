---
summary: "First implementation slice for pi-session-compaction model resolution."
read_when:
  - "Continuing the pi-session-compaction migration from grounded-compaction and legacy user-prompt compaction."
  - "Changing summarizer model/preset/auth behavior."
---

# pi-session-compaction model-resolution foundation

## Decision

Start `packages/pi-session-compaction` as the dedicated future owner of custom Pi compaction summaries, but land the model-resolution foundation before wiring a live `session_before_compact` handler.

The package is intentionally private and not live-enabled yet. This prevents accidental double-loading with existing custom compaction handlers while the handler-level tests are still missing.

## Findings

- The live `/commit` prompt uses `model: zai/glm-5.1` frontmatter from `~/.pi/agent/prompts/commit.md`.
- That model-frontmatter behavior is owned by the installed `npm:pi-prompt-template-model` extension, visible via `pi list`, not by Pi core prompt-template loading.
- `pi-prompt-template-model/model-selection.ts` provides the relevant semantics: exact `modelId` or `provider/modelId`, comma fallback, current-model preservation when it matches any listed candidate, auth-aware selection, and provider priority `openai-codex -> anthropic -> github-copilot -> openrouter` for ambiguous bare IDs.
- `packages/pi-prompt-template-accelerator` has a useful runtime-registry bridge for observed `model_select` lifecycle state, but it does **not** currently expose this reusable LLM model resolver.
- Dot314 `grounded-compaction` has the right compaction-oriented preset model, but assumes newer host auth via `modelRegistry.getApiKeyAndHeaders(model)`.
- Local Pi host compatibility still needs legacy `modelRegistry.getApiKey(model)` support and preservation of model-level `headers`.

## Implemented slices

Initial package-local slice:

- `resolveSummarizerModel(ctx, options)`
- named preset matching
- current-model fallback
- prompt-template-model-aligned model spec handling: exact IDs, explicit `provider/modelId`, comma fallback, current-model preservation, provider-priority ordering, and auth-aware candidate selection
- latest branch thinking-level detection
- reasoning support validation

Follow-up shared-resolver extraction:

- generic prompt-template-model-compatible resolver semantics moved to `packages/pi-interaction/pi-model-selection` (`@tryinget/pi-model-selection`)
- `pi-session-compaction` now imports shared `parseProviderModel`, `parseModelSpecList`, `selectModelCandidate`, `resolveModelReference`, and `resolveModelAuth`
- compaction package keeps only compaction-owned preset, thinking-level, and summarizer-specific error behavior

Follow-up files-touched foundation:

- dot314 grounded-compaction's files-touched core is ported into `extensions/session-compaction/files-touched.js`
- tests cover Pi read/write/edit tool calls, bash write/edit/move/delete tracking, no-op edit filtering, absolute-path normalization, move redirects, and manifest formatting

Follow-up user-prompt preservation foundation:

- legacy `pi-user-prompt-compaction` prompt/command recovery is ported into `extensions/session-compaction/user-prompts.js`
- tests cover expanded skill-block recovery, ordinary user messages, timestamp-matched slash-command recovery, previous-summary prompt-section parsing, prompt merge/deduplication, tracked command store pruning/cleanup, and `/compact <customInstructions>` preservation

## Explicit non-goals for this slice

- no active `session_before_compact` handler
- no ASC rewrite
- no live package install/reload
- no multiple compaction overrides
- no broad root release/publication setup

## Follow-up handler slice

`session_before_compact` is now wired as a non-live, package-local handler module behind tests using the current model resolver, files-touched manifests, and user-prompt preservation helpers. The package still does not register a live hook.

A non-live fail-closed registration guard now exists in `extensions/session-compaction/registration.js`. It keeps future activation disabled by default and requires handler-test confirmation, no-double-compaction preflight confirmation, explicit zero existing handler count, and duplicate package-registration protection before registering `session_before_compact`.

Non-live branch-tree summary augmentation helpers now exist in `extensions/session-compaction/branch-summary.js`. They prepare optional `session_before_tree` custom instructions with prompt-contract loading, files-touched grounding, focus text preservation, and undefined-on-failure behavior, but still do not register any live hook.

Keep the package non-live until a deliberate hook registration plan confirms no other compaction override is enabled. Do not start live replacement of `npm:pi-prompt-template-model` until a prompt-template successor has no-double-registration tests and a tested install path.

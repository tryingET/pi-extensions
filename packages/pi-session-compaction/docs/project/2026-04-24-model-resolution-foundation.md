---
summary: "First implementation slice for pi-session-compaction model resolution."
read_when:
  - "Continuing the pi-session-compaction migration from grounded-compaction and legacy user-prompt compaction."
  - "Changing summarizer model/preset/auth behavior."
---

# pi-session-compaction model-resolution foundation

## Decision

Start `packages/pi-session-compaction` as the dedicated owner of custom Pi compaction summaries. The model-resolution, handler, and registration foundations landed before the package was exposed as a live `session_before_compact` owner.

The package is now a root-managed component and is live-enabled through a guarded local extension entrypoint after handler-level tests passed and the cutover preflight found no installed compaction override packages. This prevents accidental double-loading by preserving the no-double-compaction invariant at install/reload time.

## Findings

- The live `/commit` prompt uses `model: zai/glm-5.1` frontmatter from `~/.pi/agent/prompts/commit.md`.
- At discovery time, that model-frontmatter behavior was owned by the installed `npm:pi-prompt-template-model` extension, visible via `pi list`, not by Pi core prompt-template loading. It is now owned by `packages/pi-prompt-template-execution` after the prompt-template cutover.
- `pi-prompt-template-model/model-selection.ts` provided the compatibility semantics that were preserved: exact `modelId` or `provider/modelId`, comma fallback, current-model preservation when it matches any listed candidate, auth-aware selection, and provider priority `openai-codex -> anthropic -> github-copilot -> openrouter` for ambiguous bare IDs.
- `packages/pi-prompt-template-accelerator` has a useful runtime-registry bridge for observed `model_select` lifecycle state, but it does **not** currently expose this reusable LLM model resolver.
- Dot314 `grounded-compaction` supplied the original compaction-oriented preset model, but its extension-owned authentication path is no longer retained.
- The Pi host owns summary request routing and authentication. `pi-session-compaction` uses only the public extension-facing `modelRegistry.complete()` surface (Pi >= 0.84.0) through one adapter; the adapter allowlists only the package-owned `maxTokens`, cancellation signal, and translated thinking controls, so caller transport/auth/header/environment overrides cannot cross the seam; the extension must not extract or retain host credentials. A host-aligned canary instantiates the selected Pi release's real `ModelRegistry` so internal/runtime-only methods cannot satisfy the contract by accident.

## Implemented slices

Initial package-local slice:

- `resolveSummarizerModel(ctx, options)`
- named preset matching
- current-model fallback
- prompt-template-model-aligned model spec handling: exact IDs, explicit `provider/modelId`, comma fallback, current-model preservation, provider-priority ordering, and auth-aware candidate selection
- latest branch thinking-level detection
- reasoning support validation

Follow-up shared-resolver extraction:

- generic prompt-template-model-compatible resolver semantics moved to `packages/pi-model-selection` (`@tryinget/pi-model-selection`)
- `pi-session-compaction` imports shared `parseProviderModel`, `parseModelSpecList`, `selectModelCandidate`, and `resolveModelReference`
- compaction keeps only preset, thinking-level, and summarizer-specific error behavior; model request authentication remains inside the Pi host completion boundary

Follow-up files-touched foundation:

- dot314 grounded-compaction's files-touched core is ported into `extensions/session-compaction/files-touched.js`
- tests cover Pi read/write/edit tool calls, bash write/edit/move/delete tracking, no-op edit filtering, absolute-path normalization, move redirects, and manifest formatting

Follow-up user-prompt preservation foundation:

- legacy `pi-user-prompt-compaction` prompt/command recovery is ported into `extensions/session-compaction/user-prompts.js`
- tests cover expanded skill-block recovery, ordinary user messages, timestamp-matched slash-command recovery, previous-summary prompt-section parsing, prompt merge/deduplication, tracked command store pruning/cleanup, and `/compact <customInstructions>` preservation

## Explicit non-goals for this slice

- no ASC rewrite
- no multiple compaction overrides
- no broad root release/publication setup
- no broad slash-command or prompt-bundle registration; `/compact-focus` is a narrow operator command over the same compaction path

## Follow-up handler and live-entrypoint slice

`session_before_compact` is now wired as a live package-local handler module behind tests using the current model resolver, files-touched manifests, and user-prompt preservation helpers.

A fail-closed registration guard exists in `extensions/session-compaction/registration.js`. It remains default-disabled for tests and future embedders, and the live entrypoint passes explicit handler-test confirmation, no-double-compaction preflight confirmation, zero existing-handler proof, and duplicate package-registration protection before registering `session_before_compact`.

The live entrypoint is `extensions/session-compaction.js` and is exposed through `package.json#pi.extensions`. It enables input tracking, the guarded compaction handler, and the narrow `/compact-focus` operator menu without adding prompts or a second prompt-template execution surface.

Branch-tree summary augmentation helpers remain non-live in `extensions/session-compaction/branch-summary.js`. They prepare optional `session_before_tree` custom instructions with prompt-contract loading, files-touched grounding, focus text preservation, and undefined-on-failure behavior, but still do not register any live hook.

Keep the package as the only custom compaction owner after install/reload. Do not reinstall or enable another compaction override without first removing or disabling this one.

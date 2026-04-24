# @tryinget/pi-model-selection

Shared Pi model-selection and auth-resolution primitives.

This package owns prompt-template-model-compatible model resolver semantics that are needed by more than one extension:

- exact `modelId`
- exact `provider/modelId`
- comma-separated fallback lists
- current-model preservation when the active model matches any candidate
- provider-priority ordering for ambiguous bare model IDs:
  1. `openai-codex`
  2. `anthropic`
  3. `github-copilot`
  4. `openrouter`
- auth-aware selection via `getAvailable()`, `isUsingOAuth()`, `getApiKey()`, and `getApiKeyAndHeaders()`
- preservation of model-level `headers`

It intentionally does not own prompt-template slash-command registration, compaction preset parsing, loops/workflows, or subagent execution.

## Template baseline

This package was reconciled through `../pi-extensions-template` in `simple-package` mode, then intentionally adapted as a private support library. It keeps template lineage and baseline files such as `.copier-answers.yml`, `biome.jsonc`, `policy/stack-lane.json`, and `docs/tech-stack.local.md`, but it deliberately omits `package.json#pi.extensions` and `package.json#pi.prompts` so it cannot register slash commands or package prompts by accident.

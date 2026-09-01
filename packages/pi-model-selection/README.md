---
summary: "@tryinget/pi-model-selection package overview."
read_when:
  - "Orienting to this package or directory before changing its behavior."
---

# @tryinget/pi-model-selection

Shared Pi model-selection and auth-resolution primitives.

This is a top-level support package at `packages/pi-model-selection`, not a `pi-interaction` subpackage. Consumers should depend on `@tryinget/pi-model-selection` directly rather than depending on `@tryinget/pi-interaction` for model-selection helpers.

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
- optional `{ authentication: "host" }` selection that uses `getAvailable()` when present but never returns or directly resolves credential material, for consumers that delegate the request to a host-owned completion boundary
- preservation of model-level `headers` in the default auth-resolution mode

It intentionally does not own prompt-template slash-command registration, compaction preset parsing, loops/workflows, or subagent execution.

## Template baseline

This package was reconciled through `../pi-extensions-template` in `simple-package` mode, then intentionally adapted as a root-managed support library. It keeps template lineage and baseline files such as `.copier-answers.yml`, `biome.jsonc`, `policy/engineering-lane.json`, and `docs/engineering.local.md`, but it deliberately omits `package.json#pi.extensions` and `package.json#pi.prompts` so it cannot register slash commands or package prompts by accident.

Release alignment: npm state must catch up to manifest pins after blocked wave e30aea5.

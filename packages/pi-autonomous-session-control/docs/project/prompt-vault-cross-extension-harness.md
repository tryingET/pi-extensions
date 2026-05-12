---
summary: "Specification for live cross-extension prompt-vault integration harness."
read_when:
  - "Before changing live cross-extension tests for vault-client integration."
  - "When debugging vault-client -> dispatch_subagent end-to-end failures."
system4d:
  container: "Cross-extension integration quality gate."
  compass: "Validate real vault-client tool output against dispatch_subagent envelope contract."
  engine: "Register real vault-client tools -> retrieve prompt -> dispatch with envelope -> assert provenance."
  fog: "Environment coupling (vault paths, dolt, external extension availability) can make tests flaky without explicit readiness gates."
---

# Prompt-vault Cross-Extension Harness Spec

## Goal

Add a **live cross-extension integration harness** that validates real tool chaining:

1. `vault_query` discovers an available template.
2. `vault_retrieve` returns that template content.
3. `dispatch_subagent` receives the prompt envelope.
4. Prompt provenance is preserved in `details`.

## Test contract

- Test should use real `vault-client` extension registration.
- Test should use real `dispatch_subagent` registration path with injected spawner for deterministic runtime.
- Harness must fail-safe with **skip** unless `ASC_RUN_LIVE_PROMPT_VAULT_TESTS=1` is set, and must also skip when environment prerequisites are unavailable after opt-in.
- Default package checks keep parser/unit prompt-vault contract coverage but do not probe host vault-client or Dolt paths.

## Readiness gates

Required for live run:

- Vault-client extension path exists. `PI_VAULT_CLIENT_DIR` / `VAULT_CLIENT_DIR` overrides are authoritative; otherwise the harness tries the legacy installed path (`~/.pi/agent/extensions/vault-client`) and then the monorepo sibling package (`packages/pi-vault-client`).
- Prompt-vault DB path exists (`VAULT_DIR` or default prompt-vault-db path).
- `dolt` is available in PATH.
- Runtime dependencies used by the JavaScript vault-client entrypoint are resolvable from the vault-client package context.

## Expected assertions

- `vault_query` and `vault_retrieve` tools are registered.
- `dispatch_subagent` advertises the prompt-envelope provenance contract on its exposed tool description.
- Retrieval output is parseable into prompt envelope fields.
- `dispatch_subagent` applies envelope (`prompt_applied=true`).
- Result details preserve prompt provenance (`prompt_name`, `prompt_source`, `prompt_tags`).
- Generated system prompt contains `[Prompt Envelope]` header.

## Cross-extension coherence anchor

This harness is the live discoverability/coherence check for the exposed-tool chain:

- vault-client proves the visible query/retrieve tools are actually registered
- ASC proves `dispatch_subagent` preserves prompt provenance at the execution boundary
- the combined run keeps the tool-surface inventory and public-execution contract honest without inventing a second local prompt story

## Reproducible recipe for live harness execution

The live cross-extension test (`tests/prompt-vault-cross-extension.live.mjs`) and live DB test (`tests/prompt-vault-db-integration.live.mjs`) are opt-in. Live prompt-vault files use the non-default `.live.mjs` suffix, so default `npm run check` does not discover them and reports zero live prompt-vault skips while still executing mock/unit prompt-vault contract tests. To run live validation outside of a Pi session:

### Prerequisites

1. **vault-client extension/package** at either `~/.pi/agent/extensions/vault-client/`, `../pi-vault-client` from the ASC package, or an explicit `PI_VAULT_CLIENT_DIR` / `VAULT_CLIENT_DIR` path
2. **prompt-vault DB** at `~/ai-society/core/prompt-vault/prompt-vault-db/`
3. **dolt** available in PATH
4. **Runtime dependencies** used by the JavaScript vault-client entrypoint resolvable from vault-client context:
   - `@mariozechner/pi-tui`
   - `typebox`

`@mariozechner/pi-coding-agent` is a host/type-level dependency for vault-client source, but the ASC live harness does not treat package-root `ERR_PACKAGE_PATH_NOT_EXPORTED` as live runtime unavailability when the JavaScript extension entrypoint can be imported.

### Why the test skips

The readiness gate checks the vault-client entry path, prompt-vault DB, Dolt, and JavaScript-entry runtime dependencies. It skips after opt-in only when those concrete live prerequisites are unavailable.

### Recipe 1: Run within Pi session (recommended)

From the monorepo checkout with package dependencies installed:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
npm run test:live:prompt-vault
```

The harness should discover `../pi-vault-client` automatically when the legacy installed extension path is absent.

### Recipe 2: Manual environment setup

Point the harness at a specific vault-client checkout or installed extension:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
PI_VAULT_CLIENT_DIR=../pi-vault-client npm run test:live:prompt-vault
```

### Diagnosing skip reasons

After opting in, run the readiness probe directly:

```bash
node -e "
const { getCrossExtensionHarnessReadiness } = require('./extensions/self/cross-extension-harness.ts');
const result = getCrossExtensionHarnessReadiness();
console.log('ready:', result.ready);
console.log('reasons:', result.reasons);
console.log('paths:', result.paths);
"
```

## vault_rate FK behavior contract

When using `vault_rate` after dispatch_subagent execution:

### Expected behavior

1. `vault_rate` attempts to link feedback to the most recent execution for the template
2. If no execution exists, it falls back to `execution_id = 0`
3. The FK constraint (`feedback.execution_id → executions.id`) will **reject** this fallback if no execution with id=0 exists

### Integration guidance

- Only call `vault_rate` after an actual `dispatch_subagent` execution that used the prompt
- If `prompt_applied=false`, do not call `vault_rate` (no execution to rate)
- The FK fallback failure is an **upstream vault-client behavior** — not fixable in this repo
- Track upstream vault-client changes for potential schema/behavior updates

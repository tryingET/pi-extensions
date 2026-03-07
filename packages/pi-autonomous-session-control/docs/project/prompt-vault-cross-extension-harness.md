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
- Harness must fail-safe with **skip** when environment prerequisites are unavailable.

## Readiness gates

Required for live run:

- Vault-client extension path exists (`~/.pi/agent/extensions/vault-client/index.ts` by default).
- Prompt-vault DB path exists (`VAULT_DIR` or default prompt-vault-db path).
- `dolt` is available in PATH.

## Expected assertions

- `vault_query` and `vault_retrieve` tools are registered.
- Retrieval output is parseable into prompt envelope fields.
- `dispatch_subagent` applies envelope (`prompt_applied=true`).
- Result details contain prompt provenance.
- Generated system prompt contains `[Prompt Envelope]` header.

## Reproducible recipe for live harness execution

The live cross-extension test (`tests/prompt-vault-cross-extension-live.test.mjs`) skips when environment prerequisites are unavailable. To run it outside of a Pi session:

### Prerequisites

1. **vault-client extension** installed at `~/.pi/agent/extensions/vault-client/`
2. **prompt-vault DB** at `~/ai-society/core/prompt-vault/prompt-vault-db/`
3. **dolt** available in PATH
4. **Runtime dependencies** resolvable from vault-client context:
   - `@mariozechner/pi-coding-agent`
   - `@mariozechner/pi-tui`
   - `@sinclair/typebox`

### Why the test skips

The readiness gate checks if vault-client's runtime dependencies are resolvable via `createRequire`. This fails for ESM packages outside of Pi's runtime context because:

1. `createRequire` cannot use ESM `exports` fields
2. The vault-client's `node_modules` isn't in the test's module resolution path

### Recipe 1: Run within Pi session (recommended)

The test runs automatically when executed inside a Pi session where the runtime provides correct module resolution:

```bash
# Start pi in any directory with the extension loaded
pi
# Then in another terminal, run the test
cd ~/programming/pi-extensions/pi-autonomous-session-control
node --test tests/prompt-vault-cross-extension-live.test.mjs
```

### Recipe 2: Manual environment setup

Set `NODE_PATH` to include vault-client's node_modules:

```bash
export NODE_PATH="$HOME/.pi/agent/extensions/vault-client/node_modules"
node --test tests/prompt-vault-cross-extension-live.test.mjs
```

Note: This may still fail for ESM packages with `exports` fields. Recipe 1 is the supported path.

### Diagnosing skip reasons

Run the readiness probe directly:

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

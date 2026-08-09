---
summary: "Python and JavaScript code-mode extension with persistent logical state for bounded multi-operation Pi calls."
read_when:
  - "Installing, operating, reviewing, or extending pi-eval-kernel."
  - "Comparing code-mode execution with native Pi tool calls or subagent workflows."
system4d:
  container: "One model-visible eval tool backed by disposable language workers, persistent logical state, and an explicit host capability registry."
  compass: "Reduce repetitive tool-call overhead without claiming arbitrary Pi-tool invocation or sandboxing."
  engine: "Confirm code -> execute in worker -> route explicit capability calls -> aggregate one result."
  fog: "Arbitrary code has invoking-user authority; registry admission governs the host bridge, not the whole language runtime."
---

# @tryinget/pi-eval-kernel

`pi-eval-kernel` adds an `eval` tool with disposable Python and JavaScript workers plus host-persisted JSON state by default. An explicit `engine: "persistent"` option keeps one Python worker in-process across calls; JavaScript remains disposable. One model-visible call can run a bounded program, issue concurrent calls through an explicit package-owned capability registry, and return one aggregated result.

It does **not** replace Bash by default and does **not** claim to invoke arbitrary active Pi tools.

## Current capability

- persistent JSON-compatible `state` for Python and JavaScript across eval calls in the current Pi session;
- Python final-expression results and JavaScript explicit `return` results;
- bounded wall-clock timeout and abort-driven worker termination;
- disposable protocol brokers with bounded frames, runtime message validation, and host-finalized result commit;
- opt-in persistent Python with one bounded broker transport, serialized evals, and no host state round-trip;
- captured stdout/stderr and 50 KiB model-visible output limit;
- explicit capability metadata with `read`, `process`, `write`, `network`, or `orchestration` effect classes;
- default host capabilities:
  - `read_text` — bounded UTF-8 reads inside `ctx.cwd`;
  - `list_directory` — direct-child listing inside `ctx.cwd`;
  - `run_process` — executable + argument-array invocation without a shell;
- concurrent capability calls inside either language;
- confirmation before each eval by default;
- non-interactive execution denied by default;
- `/code-mode` status and `/eval-reset` lifecycle commands.

## Examples

### Python

```python
files = tool.parallel([
    ("read_text", {"path": "src/a.ts"}),
    ("read_text", {"path": "src/b.ts"}),
], max_workers=4)

{"line_counts": [item["totalLines"] for item in files]}
```

Python capability calls are synchronous. `tool.<name>(input)` is shorthand for `tool.call(name, input)`.

### JavaScript

```javascript
const files = await tool.parallel([
  { name: "read_text", input: { path: "src/a.ts" } },
  { name: "read_text", input: { path: "src/b.ts" } },
], 4);

state.runs = (state.runs ?? 0) + 1;
return { runs: state.runs, lineCounts: files.map((file) => file.totalLines) };
```

JavaScript capability calls return promises and must be awaited.

## Capability adapters

Other owned packages can compose with code mode without exposing arbitrary registered Pi handlers:

```ts
import {
  createCodeModeExtension,
  type CodeModeCapability,
} from "@tryinget/pi-eval-kernel/runtime";

const dispatchCapability: CodeModeCapability = {
  name: "dispatch_review",
  description: "Dispatch one governed read-only review through the owning runtime.",
  effect: "orchestration",
  execute: async (input, context) => {
    // Delegate to the owner package's public execution runtime.
    // Preserve its validation, cancellation, receipts, and result contract.
  },
};

export default createCodeModeExtension({
  capabilities: [dispatchCapability],
  allowedCapabilityEffects: ["read", "process", "orchestration"],
});
```

An adapter must call the owner package's public runtime rather than copy its logic or invoke private registered-tool handlers.

## Security boundary

Code runs in child processes with the invoking user's permissions. This is **not a security sandbox**.

- Each model-issued eval requires UI confirmation by default.
- Non-interactive calls fail closed unless the embedding extension explicitly sets `allowNonInteractive: true`.
- Registry effect admission controls only `tool.*` host bridge calls.
- Python can import standard-library modules and access the operating system directly.
- The JavaScript VM context narrows ambient globals but is not treated as a hostile-code isolation boundary.
- Activating this package is equivalent to granting the model a general local-code execution surface.

See [Security model](docs/project/security-model.md).

## Persistent state and reset

- The default `engine: "disposable"` keeps Python and JavaScript state in a host-committed JSON-compatible `state` object and starts a fresh worker for each eval.
- Disposable serialized state has a hard 1,000,000-byte limit; an oversized or non-JSON state fails the eval and leaves the previous committed state intact.
- Ordinary Python globals and JavaScript lexical bindings do not survive the disposable worker boundary.
- Opt-in `engine: "persistent"` keeps the Python `state` dictionary inside one long-lived worker without a host serialization round-trip. JavaScript remains disposable in this mode.
- Native Windows (`win32`) rejects the persistent engine before spawning a broker. It does not downgrade to disposable execution; persistent worker-tree lifecycle support remains unavailable until native termination behavior is verified.
- `/eval-reset` invalidates the lifecycle generation, terminates the exact active or idle worker, waits for that broker to die and for the previously queued eval tail to settle, then returns. Prior queued evals reject.
- Session shutdown performs the same drain and exact retirement, permanently closes the runtime, and rejects new work.
- Persistent Python cancellation first uses `SIGINT` and retains the worker only when the worker proves that interrupt was handled. Fatal protocol, timeout-escalation, or unexpected-exit paths retire the exact old broker before a fresh worker can spawn; the first result from that replacement reports `kernelReused: false`.

## Install and activate

From the package directory:

```bash
npm install
npm run check
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-eval-kernel
```

Then run `/reload` in Pi and verify with a real `eval` call. Installation/reload is intentionally separate from package validation.

## Development

```bash
npm install
npm run test:unit
npm run check
npm run release:check
```

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-eval-kernel
node ./scripts/pi-host-compatibility-canary.mjs run \
  --profile current \
  --scenario code-mode-extension-factory-contract
```

Pi host packages remain optional peers rather than persistent package dev dependencies. The root canary temporarily materializes its exact host contract, compiles the extension factory against the real `ExtensionAPI`, and then restores the lockfile-declared host-package absence. This keeps ordinary `npm ci` and `npm audit` free of vulnerabilities inherited only from a published host shrinkwrap.

The full release check packs and installs the tarball into isolated `TMPDIR`-backed Pi/npm state, then executes one JavaScript and one Python `eval` through Pi. It needs Pi authentication and reuses the operator's configured default provider/model unless `PI_TEST_DEFAULT_PROVIDER`, `PI_TEST_DEFAULT_MODEL`, and optionally `PI_TEST_ENABLED_MODELS` select another authenticated model. Use `release:check:quick` only when an artifact-only check is intentionally sufficient.

## Known boundary

Pi 0.83.0 does not expose a governed `pi.invokeTool(name, args)` API to coding-agent extensions. Consequently, this package uses an explicit capability registry and owner-runtime adapters. It does not bypass Pi internals to call arbitrary third-party tools.

Architecture: [Code-mode architecture](docs/project/architecture.md).

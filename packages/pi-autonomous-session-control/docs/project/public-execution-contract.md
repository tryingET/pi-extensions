---
summary: "Implemented public execution contract for non-tool consumers of ASC subagent runtime behavior."
read_when:
  - "You need the supported package-level seam for reusing ASC subagent execution without private imports."
  - "You are integrating pi-autonomous-session-control with pi-society-orchestrator or another downstream runtime consumer."
system4d:
  container: "Package-local execution contract note for ASC public runtime consumers."
  compass: "Expose the smallest stable seam that preserves ASC as execution-plane owner."
  engine: "describe entrypoint -> show API shape -> state non-goals -> anchor validation."
  fog: "The main risk is treating private self/* modules as the supported integration boundary again."
---

# ASC public execution contract

## Supported entrypoint

Use the package-level entrypoint:

```ts
import {
  createAscExecutionRuntime,
  registerDispatchSubagentTool,
} from "pi-autonomous-session-control/execution";
```

Current intent:
- `createAscExecutionRuntime(...)` is the supported non-UI execution seam
- `registerDispatchSubagentTool(...)` is the optional ASC-owned helper that binds the same runtime into the `dispatch_subagent` tool surface
- consumers should stop treating `extensions/self/*` as their integration API

## What the runtime owns

The public runtime preserves the existing ASC execution-plane behavior:
- request normalization and invariant checks
- prompt-envelope application
- session-name reservation and artifact-backed session lifecycle
- subagent spawn execution
- result shaping used by `dispatch_subagent`

This keeps the tool path and the non-tool consumer path on the same core execution logic.

## Minimal usage

```ts
import { createAscExecutionRuntime } from "pi-autonomous-session-control/execution";

const runtime = createAscExecutionRuntime({
  sessionsDir: "/tmp/pi-subagent-sessions",
  modelProvider: () => "openai-codex/gpt-5.3-codex-spark",
});

const result = await runtime.execute(
  {
    profile: "reviewer",
    objective: "Review the staged changes for risk and missing tests.",
  },
  { cwd: process.cwd() },
);
```

Useful properties:
- `runtime.state` exposes the backing `SubagentState`
- `result.ok` tells the consumer whether execution completed successfully
- `result.text` preserves the human-readable execution summary
- `result.details` carries structured status / provenance data

## Non-goals

This contract does **not** make the following public by implication:
- arbitrary `extensions/self/*` module layout
- dashboard/UI composition internals
- extension bootstrapping details unrelated to execution runtime reuse
- a promise that ASC will never extract a smaller shared runtime later if real pressure proves necessary

## Current migration position

This lands the first execution-boundary slice in the AK sequence:

```text
#604 publish ASC public execution seam
#605 prove parity between tool path and public runtime
#606 cut orchestrator over to the ASC seam and retire the duplicate runtime
```

## Validation anchors

- `execution.ts`
- `extensions/self/subagent-runtime.ts`
- `extensions/self/subagent.ts`
- `tests/public-execution-contract.test.mjs`
- `tests/dispatch-subagent.test.mjs`

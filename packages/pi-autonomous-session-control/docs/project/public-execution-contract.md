---
summary: "Implemented ASC public execution contract plus parity proof that the public runtime matches dispatch_subagent behavior where equivalence is promised."
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

Use the package-level headless entrypoint:

```ts
import { createAscExecutionRuntime } from "pi-autonomous-session-control/execution";
```

Current intent:
- `createAscExecutionRuntime(...)` is the supported non-UI execution seam
- the `dispatch_subagent` tool continues to bind the same runtime internally, but helper-level tool registration is intentionally not part of the headless public entrypoint
- consumers should stop treating `extensions/self/*` as their integration API
- the companion seam charter explains why this seam exists at all and when it should be reconsidered: [Execution seam charter](../../../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md)
- the first time-boxed review outcome is recorded in [Execution seam review](../../../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-review.md) and still concludes that the seam should stay small because only one real external runtime consumer exists today; AK task `#629` now closes as a no-op checkpoint until new evidence introduces a second real external runtime consumer with distinct capability needs

## Why this seam exists

This seam exists because downstream runtime consumers such as `pi-society-orchestrator` need **programmatic access** to ASC-owned execution behavior.

Without a supported seam, there are only two bad alternatives:
- duplicate the runtime in the consumer
- import ASC private internals from `extensions/self/*`

The seam is therefore an anti-drift boundary, not a goal by itself.

## What the runtime owns

The public runtime preserves the existing ASC execution-plane behavior:
- request normalization and invariant checks
- runtime-owned concurrency reservation before spawn so `maxConcurrent` applies even to custom spawners
- prompt-envelope application
- session-name reservation and artifact-backed session lifecycle
- subagent spawn execution
- result shaping used by `dispatch_subagent`
- assistant protocol semantics (`message_end` stop reasons, parse failures, timeout/abort state)
- abort propagation through an optional `AbortSignal`

This keeps the tool path and the non-tool consumer path on the same core execution logic.

## Transport-safety invariants

The public execution seam now also carries explicit transport-safety expectations:

- optional `AbortSignal` propagation from consumer to subagent spawn path
- bounded assistant output capture with truncation signaling
- helper `transport_ready` handshake before ASC arms the execution timeout, so helper/raw-`pi` bootstrap does not silently consume the configured execution budget
- assistant-only filtered subagent protocol between ASC and the child helper, so aggregate Pi JSON events are dropped before the runtime parser and raw Pi JSON is no longer accepted on the parent seam as a compatibility fallback
- bounded raw Pi JSON buffering inside that helper for malformed/no-newline upstream stdout, with separate raw-buffer configuration from the parent filtered-protocol buffer
- bounded filtered-protocol buffering inside ASC for malformed/no-newline or oversized helper stdout
- helper-owned raw-child process-group shutdown on abort/timeout so the parent does not leave orphaned raw `pi` subprocesses behind when it escalates
- session-name reservation that treats status sidecars as occupied artifacts
- explicit hard failure when lock creation fails for permanent filesystem reasons

These invariants are currently anchored by:
- `tests/public-execution-contract.test.mjs`
- `tests/public-execution-parity.test.mjs`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `tests/subagent-protocol.test.mjs`
- `tests/subagent-transport-live.test.mjs`
- `tests/subagent-file-lock.test.mjs`

## Change checklist

Before modifying this seam, run the companion [execution contract change checklist](execution-contract-change-checklist.md).
It keeps future changes tied to real consumer gaps, the named negative-path guardrails, and the current proof packet across ASC and `pi-society-orchestrator`.

## Verification layers

The current seam proof is intentionally split across distinct truth layers:

- **ASC package-local contract truth** — `tests/public-execution-contract.test.mjs`, `tests/public-execution-parity.test.mjs`, `tests/dispatch-subagent-diagnostics.test.mjs`, `tests/subagent-protocol.test.mjs`, `tests/subagent-transport-live.test.mjs`, and `tests/subagent-file-lock.test.mjs` prove the seam semantics and transport-safety invariants owned by ASC.
- **Orchestrator package-local consumer truth** — `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs` proves the narrow consumer-side adapter preserves the expected timeout/truncation/abort and `result.details` semantics in repo-local source, and `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs` fail-closes private ASC imports plus orchestrator-local runtime revival drift.
- **Installed-package smoke / packaging truth** — `cd packages/pi-society-orchestrator && npm run release:check` proves the packaged orchestrator artifact can still import and use the seam after install, including the current bundled ASC bridge while the temporary lifecycle in [bundled ASC bridge lifecycle](../../../pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md) remains active.

Shared across those layers is the [execution seam casebook](../../../../governance/execution-seam-cases/README.md): named canonical scenarios such as `timeout-empty-output`, `assistant-protocol-semantic-error`, `assistant-protocol-parse-error`, and `bundled-bridge-import` that turn learned seam failures into reusable compatibility memory.

Do **not** let installed-package smoke stand in for the ASC contract tests, and do **not** treat repo-local tests as proof that the installed tarball/import graph still works.

## Minimal usage

```ts
import { createAscExecutionRuntime } from "pi-autonomous-session-control/execution";

const runtime = createAscExecutionRuntime({
  sessionsDir: "/tmp/pi-subagent-sessions",
  modelProvider: () => "openai-codex/gpt-5.4",
});

const controller = new AbortController();

const result = await runtime.execute(
  {
    profile: "reviewer",
    objective: "Review the staged changes for risk and missing tests.",
  },
  { cwd: process.cwd() },
  undefined,
  controller.signal,
);
```

`modelProvider` may also inspect the execution context (for example `ctx?.model`) when a consumer wants subagents to follow the currently active session model instead of a hard-coded selector.

Useful properties:
- `runtime.state` exposes the backing `SubagentState`
- `result.ok` tells the consumer whether execution completed successfully
- `result.text` preserves the human-readable execution summary
- `result.details.displayOutput` preserves the normalized body text consumers should render or forward, even when `fullOutput` is empty/whitespace on failing executions
- `result.details.status` uses the canonical execution taxonomy (`done`, `aborted`, `timed_out`, `error`)
- `result.details.failureKind` names the normalized failure branch (`timed_out`, `assistant_protocol_error`, `assistant_protocol_parse_error`, `transport_error`, or the pre-execution guardrail reasons)
- `result.details.executionState` preserves transport vs assistant-protocol truth when consumers need exact classification beyond the normalized status/failure taxonomy
- `getDispatchSubagentDisplayOutput(result)` is the exported compatibility helper for consumers that want the same normalized body shaping without reimplementing fallback logic

## Non-goals

This contract does **not** make the following public by implication:
- arbitrary `extensions/self/*` module layout
- dashboard/UI composition internals
- extension bootstrapping details unrelated to execution runtime reuse
- a promise that ASC will never extract a smaller shared runtime later if real pressure proves necessary

## Current migration position

This now covers the first two execution-boundary slices in the AK sequence:

```text
#604 publish ASC public execution seam ✅
#605 prove parity between tool path and public runtime ✅
#606 cut orchestrator over to the ASC seam and retire the duplicate runtime
```

Current proof shape:
- **ASC package-local contract truth**
  - `tests/public-execution-contract.test.mjs` proves the supported package entrypoint exists and can bind the tool surface
  - `tests/public-execution-parity.test.mjs` proves the public runtime and `dispatch_subagent` stay aligned for:
    - prompt-envelope application
    - rate-limit / invariant failures
    - runtime-owned concurrency reservation for custom spawners
    - session-name reservation behavior
    - result / provenance shaping
  - `tests/dispatch-subagent-diagnostics.test.mjs` anchors parent-side protocol parsing, authoritative helper-seam fail-closed behavior, and filtered-protocol buffer enforcement
  - `tests/subagent-protocol.test.mjs` anchors raw-Pi-to-helper translation and malformed raw Pi framing diagnostics
  - `tests/subagent-transport-live.test.mjs` anchors spawned-helper truth for raw-line size enforcement, raw-vs-filtered env separation, and raw-child teardown on timeout/abort
  - `tests/subagent-file-lock.test.mjs` anchors the session-name reservation and lock invariants
- **Orchestrator package-local consumer truth**
  - `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs` proves the narrow consumer-side adapter preserves the supported execution truth inside repo-local source
  - `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs` prevents drift back to private ASC imports or a revived orchestrator-local execution path
- **Installed-package smoke / packaging truth**
  - `cd packages/pi-society-orchestrator && npm run release:check` proves the packaged orchestrator artifact, installed import graph, and current bundled ASC bridge still work after install while the temporary lifecycle in [bundled ASC bridge lifecycle](../../../pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md) remains active
- **Shared executable casebook**
  - [`../../../../governance/execution-seam-cases/README.md`](../../../../governance/execution-seam-cases/README.md) names the canonical seam scenarios the layers should keep in sync instead of rediscovering them independently

## Validation anchors

- `execution.ts`
- `extensions/self/subagent-runtime.ts`
- `extensions/self/subagent.ts`
- `tests/public-execution-contract.test.mjs`
- `tests/public-execution-parity.test.mjs`
- `tests/dispatch-subagent.test.mjs`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `tests/subagent-protocol.test.mjs`
- `tests/subagent-transport-live.test.mjs`
- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
- `cd packages/pi-society-orchestrator && npm run release:check`

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
import { createAscExecutionRuntime } from "@tryinget/pi-autonomous-session-control/execution";
```

Current intent:
- `createAscExecutionRuntime(...)` is the supported non-UI execution seam
- `execution.ts` is both the package export target for `./execution` and an explicit package typecheck input, so the public headless seam cannot drift outside CI/typecheck coverage
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
- model selection failure shaping before spawn, including whitespace/empty model rejection, deterministic release of the reserved concurrency slot, and no exposure of internal concurrency counters on `model_selection_failed`
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
- request-scoped child environment overlays via `DispatchSubagentRequest.env`, applied only to that subagent execution without mutating ambient `process.env`; this overlay is fail-closed to `PI_PROVENANCE_*` keys only, and rejects control-plane keys such as `PATH`, `NODE_OPTIONS`, and `PI_CODING_AGENT_DIR` before spawn
- optional `DispatchSubagentRequest.skillProfile`, resolved fail-closed through an allowlisted skill registry and materialized as child `--no-skills` plus `--skill <dir>` without mutating the source skill library; raw `skills[]` paths are reserved and rejected
- bounded assistant output capture with truncation signaling
- helper `transport_ready` handshake before ASC arms the execution timeout, so helper/raw-`pi` bootstrap does not silently consume the configured execution budget
- assistant-only filtered subagent protocol between ASC and the child helper, so aggregate Pi JSON events are dropped before the runtime parser and raw Pi JSON is no longer accepted on the parent seam as a compatibility fallback
- bounded raw Pi JSON buffering inside that helper for malformed/no-newline upstream stdout, with separate raw-buffer configuration from the parent filtered-protocol buffer
- isolated raw-child agent-dir settings so extensionless child runs do not inherit unrelated global default-model warnings from the parent environment
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

- **ASC package-local contract truth** — `tsconfig.json` typechecks the public `execution.ts` export target directly; `tests/public-execution-contract.test.mjs`, `tests/public-execution-parity.test.mjs`, `tests/dispatch-subagent-diagnostics.test.mjs`, `tests/subagent-protocol.test.mjs`, `tests/subagent-transport-live.test.mjs`, and `tests/subagent-file-lock.test.mjs` prove the seam semantics and transport-safety invariants owned by ASC.
- **Orchestrator package-local consumer truth** — `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs` proves the narrow consumer-side adapter preserves the expected timeout/truncation/abort and `result.details` semantics in repo-local source, and `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs` fail-closes private ASC imports plus orchestrator-local runtime revival drift.
- **Cross-extension discoverability truth** — default checks keep parser/unit prompt-vault contract coverage in `tests/prompt-vault-cross-extension.test.mjs`, while `npm run test:live:prompt-vault` opts into `tests/prompt-vault-cross-extension.live.mjs` and proves the real `vault_query`/`vault_retrieve` registration path stays coherent with ASC-owned prompt provenance on `dispatch_subagent`; `.live.mjs` files are not discovered by default, so live prompt-vault validation cannot become a skip-based green signal.
- **Installed-package smoke / packaging truth** — `cd packages/pi-society-orchestrator && npm run release:check` proves the packaged orchestrator artifact can still import and use the seam after install, including the current bundled ASC bridge while the temporary lifecycle in [bundled ASC bridge lifecycle](../../../pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md) remains active.

Shared across those layers is the [execution seam casebook](../../../../governance/execution-seam-cases/README.md): named canonical scenarios such as `timeout-empty-output`, `assistant-protocol-semantic-error`, `assistant-protocol-parse-error`, and `bundled-bridge-import` that turn learned seam failures into reusable compatibility memory.

Do **not** let installed-package smoke stand in for the ASC contract tests, and do **not** treat repo-local tests as proof that the installed tarball/import graph still works.

## Minimal usage

```ts
import { createAscExecutionRuntime } from "@tryinget/pi-autonomous-session-control/execution";

const runtime = createAscExecutionRuntime({
  sessionsDir: "/tmp/pi-subagent-sessions",
  modelProvider: () => "openai-codex/gpt-5.4",
});

const controller = new AbortController();

const result = await runtime.execute(
  {
    profile: "reviewer",
    objective: "Review the staged changes for risk and missing tests.",
    env: {
      PI_PROVENANCE_REVIEW_LANE_ID: "review-lane-1",
      PI_PROVENANCE_OUTPUT_FILE: "/tmp/review-lane-1.provenance.json",
    },
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
- `result.details.failureKind` names the normalized failure branch (`timed_out`, `assistant_protocol_error`, `assistant_protocol_parse_error`, `transport_error`, `extension_bootstrap_missing`, `env_policy_failed`, `skill_profile_failed`, `model_selection_failed`, or the pre-execution guardrail reasons)
- `result.details.executionState` preserves transport vs assistant-protocol truth when consumers need exact classification beyond the normalized status/failure taxonomy
- request `env` values are intentionally not echoed into `result.details`; only `PI_PROVENANCE_*` request env keys are accepted, there is no privileged passthrough escape hatch, and consumers that need provenance should read their own sidecar/output artifact
- skill-profile result details (`skillProfile`, `loadedSkills`, `librarySkills`, `skillWarnings`, `skillRegistry`) report child bootstrap provenance without promoting or editing the source skill library
- `getDispatchSubagentDisplayOutput(result)` is the exported compatibility helper for consumers that want the same normalized body shaping without reimplementing fallback logic

## Prompt-related surfaces outside this seam

Keep three concerns separate:

- package-owned prompt assets in `prompts/`, exposed via `package.json#pi.prompts`
- tool-layer prompt-envelope provenance surfaced by `dispatch_subagent` result details (`prompt_applied`, `prompt_name`, `prompt_source`, `prompt_tags`, `prompt_warning`)
- the headless execution runtime in `@tryinget/pi-autonomous-session-control/execution`, which executes requests but does not own package prompt distribution

The live cross-extension harness plus prompt-envelope integration tests should prove the tool-layer provenance contract without turning the headless execution seam into a second prompt-distribution owner.

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
  - `tests/public-execution-contract.test.mjs` proves the supported package entrypoint exists, can bind the tool surface, is package-root independent when invoked from the repo root, and returns structured model-selection failures without leaking reserved concurrency slots
  - `tests/public-execution-parity.test.mjs` proves the public runtime and `dispatch_subagent` stay aligned for:
    - prompt-envelope application
    - rate-limit / invariant failures
    - runtime-owned concurrency reservation for custom spawners
    - session-name reservation behavior
    - result / provenance shaping
  - `tests/dispatch-subagent-diagnostics.test.mjs` anchors parent-side protocol parsing, authoritative helper-seam fail-closed behavior, and filtered-protocol buffer enforcement
  - `tests/subagent-protocol.test.mjs` anchors raw-Pi-to-helper translation and malformed raw Pi framing diagnostics
  - `tests/subagent-transport-live.test.mjs` anchors spawned-helper truth for raw-line size enforcement, raw-vs-filtered env separation, isolated child-agent-dir settings, and raw-child teardown on timeout/abort
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

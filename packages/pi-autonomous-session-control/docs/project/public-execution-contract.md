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
- `execution.ts` remains the explicit source/typecheck entrypoint; package preparation compiles it to the published `./dist/execution.js` export with adjacent declarations, so installed Node runtimes never depend on ambient TypeScript loaders
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
- preservation of the complete normalized non-empty objective without truncation or an ASC-owned character-count ceiling; host/model context capacity remains external to this request invariant
- runtime-owned in-process and cross-process capacity leases before spawn so `maxConcurrent` applies even to custom spawners and concurrent Pi processes sharing the session root
- model selection failure shaping before spawn, including whitespace/empty model rejection, deterministic release of the reserved concurrency slot, and no exposure of internal concurrency counters on `model_selection_failed`
- prompt-envelope application plus an advisory typed task contract (`deliverable`, acceptance criteria, constraints, evidence, mutation posture, stop conditions, and path scope), composed once into the initial user task message after Pi's stable host/project system context rather than into the early system prefix
- profile/request thinking selection and effective-child-model extension bootstrap
- session-name reservation and artifact-backed session lifecycle with stable dispatch IDs and per-run attempt IDs
- model-visible canonical dispatch IDs before child output, followed by exact repository- and parent-session-checked resume through `resumeDispatchId`; current and legacy token formats remain inert unless persisted status metadata matches exactly, missing ownership metadata fails closed, and repeated names alone never resume a child
- targeted cancellation through `runtime.cancel(...)`, gated by repository ownership and live process identity
- distinct bounded startup timeout and execution emergency deadman, with a 30-second startup default, a four-hour execution default, and unlimited execution requiring both request and host opt-in
- bounded progress updates with sequence, phase, usage, and latest-tool metadata, plus first-turn and aggregate prompt-cache measurements on completed owned runs; provider usage does not establish reasoning cost, result quality/overlap, or cache inheritance across session IDs
- a pure bounded observation projector (`projectAscExecutionUpdate`, `projectAscExecutionResult`, `projectAscExecutionFailure`, and `projectAscExecutionGroupTerminal`) that strips objective/prompt/output/session/receipt-path content before extension adapters publish `asc.execution_observation.v1`; the public runtime remains headless and never launches Ghostty
- subagent spawn execution
- structured result shaping used by `dispatch_subagent`; the tool adapter throws on failure so Pi records `tool_execution_end.isError=true`, while the public runtime retains structured non-throwing results
- assistant protocol semantics (`message_end` stop reasons, agent settlement, parse failures, timeout/abort state), including fail-closed rejection unless a final terminal assistant outcome is followed by one authoritative `agent_settled` on declared Pi >=0.80 or by final `agent_end.willRetry=false` plus clean foreground exit in explicitly declared Pi 0.76 compatibility mode
- abort propagation through an optional `AbortSignal`

This keeps the tool path and the non-tool consumer path on the same core execution logic.

## Transport-safety invariants

The public execution seam now also carries explicit transport-safety expectations:

- optional `AbortSignal` propagation from consumer to subagent spawn path
- request-scoped child environment overlays via `DispatchSubagentRequest.env`, applied only to that subagent execution without mutating ambient `process.env`; this overlay is fail-closed to `PI_PROVENANCE_*` keys only, and rejects control-plane keys such as `PATH`, `NODE_OPTIONS`, and `PI_CODING_AGENT_DIR` before spawn
- ambient child skill discovery is disabled by default; optional `DispatchSubagentRequest.skillProfile` is resolved fail-closed through an allowlisted skill registry and materialized as child `--no-skills` plus `--skill <dir>` without mutating the source skill library; raw `skills[]` paths are reserved and rejected, while explicit `noSkills: false` remains a compatibility opt-out when no profile is selected
- bounded assistant output capture with truncation signaling
- a bounded startup timeout before helper readiness plus one mandatory `transport_ready` handshake emitted only after a recognized raw-Pi lifecycle event (not stdout noise or malformed output); before accepting any lifecycle event or arming execution timeout, the parent independently classifies the declared Pi version and requires it to match either `agent_settled` or audited `legacy_agent_end_exit` finality
- assistant-only filtered subagent protocol between ASC and the child helper, so aggregate Pi JSON events are dropped before the runtime parser and raw Pi JSON is no longer accepted on the parent seam as a compatibility fallback
- bounded raw Pi JSON buffering inside that helper for malformed/no-newline upstream stdout, with separate raw-buffer configuration from the parent filtered-protocol buffer
- isolated raw-child agent-dir settings so extensionless child runs do not inherit unrelated global default-model warnings from the parent environment
- bounded filtered-protocol buffering inside ASC for malformed/no-newline or oversized helper stdout
- one synchronous `raw_child_spawn_intent` marker before the current versioned helper can spawn raw Pi; the parent requires that marker before readiness or lifecycle events, treats malformed/oversized/missing-marker streams as effect-indeterminate, and attests `confirmed_no_effects` only when an owned helper exits before the marker on an otherwise unambiguous protocol stream
- additive producer/parser filenames bind newly loaded parents to the paired `subagent-pi-json-filter-v2` / `subagent-protocol-v2` graph; incompatible future ordering requires a new generation rather than mutation of `v2`
- transition compatibility is intentionally bounded: the unversioned helper remains intent-v2 compatible for parents loaded at `8852cbf7`, while already-running pre-`8852cbf7` parents require one `/reload` because their strict `transport_ready`-first parser cannot consume the same event order as the intent-required parser; neither parser is weakened to hide that incompatibility
- helper-owned raw-child process-group shutdown on abort/timeout plus helper-local copies of the startup/execution deadlines; protocol stdout honors backpressure by pausing raw Pi reads, and a bounded forced-exit path prevents a non-draining parent from keeping the helper alive indefinitely after its deadline or raw-child close
- on declared Pi >=0.80 hosts, exactly one authoritative raw-Pi `agent_settled` event after the final terminal assistant outcome is required for semantic success; per-run `agent_end` events may precede automatic retry, and a clean modern transport exit can never select the legacy fallback
- the development/runtime contract is validated against Pi 0.83.0; the retained Pi 0.76 compatibility fixture predates `agent_settled`, so only an explicit `legacy_agent_end_exit` handshake plus clean foreground JSON-mode process exit and final `agent_end.willRetry=false` after the final outcome synthesizes compatibility settlement; unclassified Pi versions fail closed
- cancellation only signals a sidecar owner whose live PID start identity and repository ownership verify; unsupported process identity fails closed, failed signals roll back cancellation intent, and custom-spawner sidecars cannot signal the parent Pi process
- session-name reservation that treats status sidecars as occupied artifacts, plus repository-session-root-scoped capacity leases across Pi processes; leases carry dispatch/attempt identity and an exact-token pre-spawn/spawn-committed marker, while owned running sidecars record helper and detached raw-child/process-group identity
- capacity recovery remains fail-closed around effects: a dead helper alone never authorizes reclaim while its raw process group is live; sidecar-backed reclaim requires exact identity, raw-child death, and kernel-observed process-group quiescence; missing post-spawn custody metadata remains blocked, while proven dead-owner pre-spawn leases remain reclaimable
- cross-process rate-limit results include a bounded, token-free holder projection (slot, session or legacy candidates, age, parent/helper/raw PIDs and process state) and identify the capacity scope as this repository session root
- lease and reclaim payloads are fully written to private inodes before atomic hard-link publication, and stale takeover/release uses identity-bearing compare/delete claims so a suspended creator, late exact release, or concurrent replacement cannot delete a new owner
- explicit hard failure when lock creation fails for permanent filesystem reasons

These invariants are currently anchored by:
- `tests/public-execution-contract.test.mjs`
- `tests/public-execution-parity.test.mjs`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `tests/subagent-protocol.test.mjs`
- `tests/subagent-transport-live.test.mjs`
- `tests/subagent-file-lock.test.mjs`
- `tests/dispatch-subagent-lifecycle-control.test.mjs`
- `tests/subagent-capacity-recovery.test.mjs`
- `tests/execution-observation.test.mjs`

## Change checklist

Before modifying this seam, run the companion [execution contract change checklist](execution-contract-change-checklist.md).
It keeps future changes tied to real consumer gaps, the named negative-path guardrails, and the current proof packet across ASC and `pi-society-orchestrator`.

## Verification layers

The current seam proof is intentionally split across distinct truth layers:

- **ASC package-local contract truth** — `tsconfig.json` typechecks the public `execution.ts` source entrypoint, while `tsconfig.runtime.json` emits the installed `dist/execution.js` plus declaration graph; `tests/public-execution-contract.test.mjs`, `tests/public-execution-parity.test.mjs`, `tests/dispatch-subagent-diagnostics.test.mjs`, `tests/subagent-protocol.test.mjs`, `tests/subagent-transport-live.test.mjs`, and `tests/subagent-file-lock.test.mjs` prove the seam semantics and transport-safety invariants owned by ASC.
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
- `result.details.status` uses the canonical terminal execution taxonomy (`done`, `aborted`, `timed_out`, `error`); progress updates additionally use `spawning` and `running`
- `result.details.dispatchId` is stable across an explicit resume, while `attemptId` changes per attempt; progress updates carry both plus monotonic `progressSequence`
- omitted execution timeout now reports and enforces the positive `PI_SUBAGENT_DEFAULT_TIMEOUT_MS` value or the four-hour emergency default; callers should not add routine 5–10 minute cutoffs merely to detect progress
- `result.details.failureKind` names the normalized failure branch (`timed_out`, `startup_timed_out`, `assistant_protocol_error`, `assistant_protocol_parse_error`, `assistant_protocol_incomplete`, `transport_error`, `extension_bootstrap_missing`, `env_policy_failed`, `skill_profile_failed`, `model_selection_failed`, or the pre-execution guardrail reasons)
- `result.details.executionState` preserves transport vs assistant-protocol truth when consumers need exact classification beyond the normalized status/failure taxonomy
- request `env` values are intentionally not echoed into `result.details`; only `PI_PROVENANCE_*` request env keys are accepted, there is no privileged passthrough escape hatch, and consumers that need provenance should read their own sidecar/output artifact
- skill-profile result details (`skillProfile`, `loadedSkills`, `librarySkills`, `skillWarnings`, `skillRegistry`) report child bootstrap provenance without promoting or editing the source skill library
- `runtime.cancel(dispatchId, ctx, reason?)` requests targeted cancellation only for an exact live identity-verified owned dispatch
- `getDispatchSubagentDisplayOutput(result)` is the exported compatibility helper for consumers that want the same normalized body shaping without reimplementing fallback logic

## Prompt-related surfaces outside this seam

Keep three concerns separate:

- package-owned prompt assets in `prompts/`, exposed via `package.json#pi.prompts`
- tool-layer prompt-envelope provenance surfaced by `dispatch_subagent` result details (`prompt_applied`, `prompt_name`, `prompt_source`, `prompt_tags`, `prompt_warning`)
- the headless execution runtime in `@tryinget/pi-autonomous-session-control/execution`, which executes requests but does not own package prompt distribution

The live cross-extension harness plus prompt-envelope integration tests should prove the tool-layer provenance contract without turning the headless execution seam into a second prompt-distribution owner.

## Non-goals

This contract does **not** make the following public by implication:
- Ghostty/tab launch, observer state, and rendering remain outside this headless seam in `pi-little-helpers`; observation events and launch facts are diagnostic only and never effect receipts
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
- `tests/dispatch-subagent-lifecycle-control.test.mjs`
- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
- `cd packages/pi-society-orchestrator && npm run release:check`

---
summary: "Phase-1 implementation + validation plan for the eval-capability-substrate ADR (AK decision 114): evolve pi-code-mode from a disposable-per-eval engine to a persistent py+js kernel substrate (Node reimplementation of the oh-my-pi BaseKernel IPC loop), with a rat-shaped 4-tool surface and structured look, landed feature-flagged behind the existing disposable engine."
read_when:
  - "Implementing or reviewing Phase 1 (L1 persistent kernel substrate) of the eval-capability-substrate ADR."
  - "Deciding the JS-substrate unification, the TS-transpiler choice, or the feature-flag integration for the pi-code-mode absorb."
type: "spec"
status: "proposed"
system4d:
  container: "Phase-1 (L1 kernel substrate) implementation + validation + rollout + rollback plan for the eval-capability-substrate ADR (AK decision 114)."
  compass: "Land a persistent, interrupt-safe, py+js kernel in pi-code-mode behind a feature flag, without unmeasured controller patches and without losing the disposable-engine rollback fallback."
  engine: "read current pi-code-mode engine + broker -> port oh-my-pi BaseKernel persistent-substrate + SIGINT-preserving interrupt to Node -> evolve broker from spawn-per-eval to long-lived worker -> add structured look + rat 4-tool shape -> validate against executable acceptance criteria -> feature-flag rollout."
  fog: "Plan only, not implementation authorization. Two Phase-1 decisions stay open until execution begins (JS-substrate unification: port oh-my-pi worker-core vs evolve the node:vm worker; and the Bun.Transpiler replacement: esbuild/swc/tsx). Execution runs through the measured/autoresearch campaign substrate; no unmeasured controller patches."
---

# Phase-1 plan — L1 persistent kernel substrate (eval-capability-substrate, ADR / AK decision 114)

This is the **post-ADR implementation + validation plan** for Phase 1 of the
[eval-capability-substrate ADR](../adr/2026-08-08-eval-capability-substrate.md) (AK decision 114,
bound to direction `AK.V5.SF07`). Per the decision lifecycle, an accepted ADR still needs a safe
path to reality: implementation plan + validation plan + rollout/migration + rollback. This note is
that path for Phase 1.

It is a **plan**, not implementation. Execution runs through the measured/autoresearch campaign
substrate (`pi-autoresearch` / `pi-society-orchestrator`) — per the repo ADR mandate, **no
unmeasured controller patches**. It cites the anchor
[RFC](2026-08-07-eval-capability-substrate-rfc.md), the
[Phase-0 port/merge spec](2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md), and the
first-hand current-architecture trace of `packages/pi-code-mode` below.

## Scope (Phase 1 only)

In scope:
- Evolve `pi-code-mode`'s engine from **disposable-per-eval workers + host-persisted JSON state**
  to a **persistent py + js kernel** whose state lives in-process and survives across evals and a
  SIGINT interrupt.
- Reimplement oh-my-pi's `BaseKernel` IPC/eval loop on Node (Bun → Node; **not** a source copy).
- Adopt rat's 4-tool surface (`run`/`look`/`ctl`/`tail`) with a **structured** `look`
  (`{name,type,shape,value}`, not text).
- Land the persistent substrate **feature-flagged behind the existing disposable engine**, which
  remains the rollback fallback.

Out of scope (later phases / separate efforts):
- L3 capability-contract compile gate (Phase 2; new package `pi-capability-contract`).
- L4 saved-function library + marimo graph overlay (Phase 3; new package `pi-function-library`).
- L5 reactive artifacts + TS evaluator (Phase 4; new package `pi-reactive-artifacts`).
- Rust-only oh-my-pi capabilities (LSP/DAP, native grep, file isolation, minimizer/snapcompact
  implementations) — out of scope for the whole substrate; tracked separately.
- New-package scaffolding — **each phase scaffolds its own package when it starts**; Phase 1 works
  in-place on `pi-code-mode`, so no new package is scaffolded in Phase 1.

## Evidence base

- RFC: [2026-08-07-eval-capability-substrate-rfc.md](2026-08-07-eval-capability-substrate-rfc.md) — L1 section, phased delivery, acceptance criteria.
- ADR: [../adr/2026-08-08-eval-capability-substrate.md](../adr/2026-08-08-eval-capability-substrate.md) (AK decision 114) — committed L1 contract (Node reimplementation; py+js scope; rat 4-tool + structured look; feature-flag + disposable fallback).
- Phase-0 spec: [2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md](2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md) — the seam confirmations and the "two Node-port tasks are the real cost" finding.
- Current-architecture trace (first-hand, this session): `packages/pi-code-mode/src/kernel-client.ts`, `runtime/protocol-broker.mjs`, `runtime/javascript-kernel.mjs`, `src/kernel-protocol.ts`, `src/types.ts`, `src/extension.ts`.

## Current architecture (FACT — traced this session)

`pi-code-mode` (v0.1.0) is **not** a persistent process. Confirmed in source:

- `KernelClient.#runNow` (`src/kernel-client.ts`) **spawns a fresh child per eval** via
  `spawn(process.execPath, [brokerScript, workerExecutable, JSON.stringify(workerArgs)])`. The
  broker (`runtime/protocol-broker.mjs`) in turn spawns the worker (`python-kernel.py` or
  `javascript-kernel.mjs`).
- **State is round-tripped host-side**: `this.#state` (a host-side JSON blob) is sent to the worker
  in the `eval` frame's `state` field; on success `this.#state = validateCommittedState(candidate.state)`.
  `kernelReused = this.#hasRun` records whether state was carried over. So the namespace lives in the
  **host**, re-injected into a fresh worker each eval.
- The JS worker (`runtime/javascript-kernel.mjs`) is a hardened `node:vm` sandbox
  (`codeGeneration:{strings:false,wasm:false}`, limited globals) that runs **one eval then
  `process.exit(0)`** and serializes its namespace to JSON (`serializeState`, ≤1 MB, cycle-checked).
- `runtime/protocol-broker.mjs` is a **pure NDJSON framing/limiting layer over a 4th stdio pipe**
  (`worker.stdio[3]`): `MAX_FRAME_BYTES=2_000_000`, `MAX_FRAMES=10_000`, `MAX_STDERR_BYTES=16_384`;
  it enforces "the worker writes only on its dedicated protocol channel" (any worker stdout ⇒
  `protocol_error`), propagates signals (`SIGTERM`/`SIGINT` → `terminateWorker`:
  `killTree` `SIGTERM` → `SIGKILL` after 500 ms), and forwards host↔worker frames with backpressure.
- The capability surface is a curated `CapabilityRegistry` (`read_text`, `list_directory`,
  `run_process`; cwd-confined, path-escape-protected) exposed to the program via a `tool` Proxy
  (`tool.<name>`, `tool.call`, `tool.parallel`). `CapabilityRegistry.invoke` is the runtime effect
  gate (`src/capability-registry.ts`, effect taxonomy
  `read | write | process | network | orchestration`).
- Protocol frame vocabulary (`src/kernel-protocol.ts`, `WorkerMessage`): `ready`, `eval`,
  `eval_result`, `finalize`, `eval_complete`, `capability_call`, `capability_result`,
  `protocol_error`.
- Interrupt today = **lossy**: an `AbortController` + timeout call `failAndTerminate` →
  `terminateChild` (`SIGTERM` → `SIGKILL` after 750 ms), which **kills the worker and discards
  in-process state**. The host-side `#state` is only updated on a *successful* finalize, so an
  interrupted eval loses everything done in that worker.

This is exactly the "disposable workers + host-persisted state + a capability registry" the RFC
identifies as the hand-rolled workaround for the gap oh-my-pi fills.

## Phase-1 design (PROPOSAL — wiring not yet built)
### Step 0 — rename `pi-code-mode` → `pi-eval-kernel` (bundled with the major bump)

Before any substrate work, rename the package so the persistent-kernel identity is earned at the release that introduces it. `pi-code-mode` collides with `pi-modes` (a prompt-composition package) though it is a code-execution tool; the new name matches the `eval` tool surface and the persistent-kernel role (the `eval` tool name itself is unchanged). **Decision recorded in the ADR (AK decision 114, “Package rename”); execution is Phase-1 step 0**, not a standalone rename, because it is load-bearing on release-please lineage, the host-compat canary (+ `tools/pi-code-mode-host-contract-fixture`), `release-components.test.mjs`, and the root READMEs. See the ADR’s Phase-1 step-0 execution checklist for every touchpoint. Gate: `just test` + `just lint` + `just ci` green; npm publish + `@tryinget/pi-code-mode` deprecate is the release action.


### Keep (the absorption's value; do not rebuild)

- `CapabilityRegistry` + the `read|write|process|network|orchestration` effect taxonomy — the L3
  runtime gate and L3 governance taxonomy (carries into Phase 2).
- The `eval` tool surface, operator confirmation gate, and `code-mode` / `eval-reset` commands
  (`src/extension.ts`).
- The worker protocol (`capability_call`/`capability_result` round-trip, frame/state limits) and the
  `protocol-broker.mjs` framing layer. The broker already handles 4th-stdio NDJSON framing, size/count
  caps, backpressure, and signal propagation — it is reusable almost as-is.

### Replace / evolve

1. **The engine: spawn-per-eval + host-side JSON state → persistent substrate.** A `KernelClient`
   manages **one long-lived worker** whose state lives **in-process** and persists across `eval`
   calls. The broker evolves from "spawn-per-eval" to "manage one long-lived worker (respawn only on
   `reset`/`close`/crash)". The host-side `#state` JSON round-trip is retired for the persistent
   path (kept only as the disposable-engine fallback).
2. **Persistent py kernel.** A long-lived Python interpreter subprocess (`python-kernel.py` evolved),
   one `eval` = one cell, state in the interpreter process. SIGINT → a **real `KeyboardInterrupt`**
   that aborts the current eval but **preserves the interpreter + namespace** (port oh-my-pi
   `BaseKernel`'s SIGINT-escalation state machine: `interrupt()` → SIGINT → SIGTERM → SIGKILL, where
   only the later stages destroy the process).
3. **Persistent js kernel.** Evolve `javascript-kernel.mjs` from "fresh `node:vm` context + exit
   after one eval" to a **reused context across evals**, so the namespace persists in-process.
   (JS-substrate unification is the open decision below.)
4. **Rich MIME display frames.** Extend the protocol vocabulary with a `display` frame
   (MIME-typed content) so the model can see images, plots, tables — porting oh-my-pi `BaseKernel`'s
   `display` frame model. Today pi-code-mode has only text `stdout`/`stderr`.
5. **Structured `look` + rat 4-tool surface.** Add the `run`/`look`/`ctl`/`tail` tool surface;
   `look` returns structured `{name,type,shape,value}` for namespace symbols (not text columns).
   This is the enabler for L3/L4 in later phases.
6. **Interrupt that preserves state.** On interrupt, send `SIGINT` to the worker (not `SIGKILL`);
   let the worker abort just the current eval and keep the process + namespace; escalate to
   `SIGTERM`/`SIGKILL` only on `reset`/`close` or a hang. The host must NOT treat an interrupted eval
   as a successful finalize (state is only the worker's persistent namespace).

### Feature-flag integration

- A `pi-code-mode` option (e.g. `engine: "persistent" | "disposable"`, default `"disposable"`)
   selects the substrate. Phase 1 ships the persistent engine **off by default**, behind the flag;
   the existing disposable engine remains the default and the rollback fallback. The operator/measure
   campaigns flip the flag on for canary runs.

## Open Phase-1 decisions (resolve at execution start, not in this plan)

1. **JS-substrate unification.** (a) Port oh-my-pi's worker-core JS path to Node, or (b) evolve the
   existing `node:vm` worker from "fresh context + exit" to "reused persistent context"? Lean (b)
   (smaller blast radius, reuses the hardened sandbox, pi-code-mode only needs py+js), but the
   worker-core path may carry interrupt/IPC behavior worth borrowing. Decide with a measured
   spike under the campaign substrate.
2. **`Bun.Transpiler` replacement.** oh-my-pi's `wrapCode` strips TypeScript via
   `@babel/parser` + `Bun.Transpiler`. The Node port needs a TS-strip step: **esbuild** (fast,
   widely used), **swc** (fast, rust-core but JS-bindable), or **tsx** (runtime, no separate step).
   Affects the compile gate (Phase 2) too. esbuild is the default lean.
3. **Capability-ergonomics staging.** Phase 1 keeps the existing `tool.*` Proxy ergonomics; the
   typed `tool.*` vs typed `capabilities` param choice is a Phase-2 (compile-gate) decision. Phase 1
   must not paint itself into a corner — keep the surface shape the compile gate can later type.

## Validation plan (executable)

Each item is a runnable test gating Phase-1 acceptance (matches the RFC/ADR acceptance criteria).
Implemented as `pi-code-mode` tests + a campaign canary.

1. **Persistent py state across evals:** `x=1` in eval 1; `eval` 2 reads `x` → `1` in the **same**
   worker (no host-side re-injection). Assert the worker pid is stable across evals.
2. **Persistent js state across evals:** same, for the js kernel.
3. **SIGINT preserves state (py):** start a long eval; send SIGINT mid-eval; assert the worker is
   still alive, its namespace from *before* the interrupted eval is intact, and the next eval
   succeeds against the preserved namespace. (Contrast with disposable engine, which loses it.)
4. **SIGINT preserves state (js):** same, for the js kernel.
5. **Rich MIME display:** an eval that emits an image (e.g. a base64 PNG via a `display` frame)
   round-trips to the host as a display result the model can see (not just text stdout).
6. **Structured `look`:** after defining symbols of varied types, `look` returns
   `{name,type,shape,value}` entries (not text columns); types/shapes are correct.
7. **Disposable-engine fallback:** with `engine: "disposable"`, the current behavior is unchanged —
   the disposable path still passes its existing tests, and `engine: "persistent"` is purely
   additive behind the flag.
8. **No regression on the capability registry / effect gate:** capability calls still resolve
   through `CapabilityRegistry.invoke` with effect admission; the curated, cwd-confined registry is
   unchanged.

## Migration and rollout

- `@tryinget/pi-code-mode` is a **published** package; the engine swap is a **major-version change**.
  Phase 1 lands the persistent engine **off by default** (semver-minor for the flag + additive
  engine), with the **major bump** deferred to when the persistent engine becomes the default (after
  measurement). This separates "add the substrate" (minor, reversible) from "make it default"
  (major, needs measurement).
- Migration owner: `pi-code-mode`. The eval tool/command surface is unchanged from the caller's
  view; only the engine selection is new.
- Rollout through the measured/autoresearch campaign substrate: candidate waves flip the flag on for
  canary eval scenarios (persistent-state, interrupt-recovery, image-display), measure against the
  acceptance criteria, and only promote to default-after-major-bump when measured.

## Rollback

- **Per-eval / per-session:** `engine: "disposable"` restores the current behavior exactly (the
  disposable engine is untouched and remains the default). This is the primary rollback.
- **Feature-flag off:** the persistent engine is never on by default in Phase 1, so rollback is
  "don't enable the flag" — no removal, no re-enable of a removed behavior.
- **Crash isolation:** a persistent worker that crashes is respawned fresh (namespace lost for that
  session only) — equivalent to a `reset`, not a system-wide failure.

## Risks

- **JS-substrate choice wrong** → rework. Mitigated by a measured spike (open decision 1) before
  committing.
- **State-persistence correctness** (especially across interrupt) → subtle bugs. Mitigated by the
  SIGINT-preserves-state tests (3, 4) as hard gates.
- **Protocol vocabulary growth** → frame-limit/compat drift. Mitigated by reusing the
  `protocol-broker.mjs` framing limits verbatim and versioning new frames additively.
- **Major-bump timing** → premature default. Mitigated by deferring the major bump until measurement
  (above).

## Non-goals for Phase 1

- No capability-contract compile gate (Phase 2).
- No saved functions / dependency graph (Phase 3).
- No reactive artifacts / TS evaluator (Phase 4).
- No new packages scaffolded (each phase scaffolds its own).
- No change to `pi-agent-interaction-canary`, `pi-autoresearch`, or `pi-society-orchestrator`
  beyond consuming the new engine option.
- No Rust ports; no LSP/DAP.

## References

- ADR: [../adr/2026-08-08-eval-capability-substrate.md](../adr/2026-08-08-eval-capability-substrate.md) (AK decision 114)
- RFC: [2026-08-07-eval-capability-substrate-rfc.md](2026-08-07-eval-capability-substrate-rfc.md)
- Phase-0 spec: [2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md](2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md)
- Decision lifecycle: `~/ai-society/holdingco/governance-kernel/docs/dev/decision-lifecycle.md`
- Absorption target: `packages/pi-code-mode` (`src/kernel-client.ts`, `runtime/protocol-broker.mjs`, `runtime/javascript-kernel.mjs`, `src/kernel-protocol.ts`)
- Study-only source: `softwareco/contrib/oh-my-pi/packages/coding-agent/src/eval/kernel-base.ts` (the `BaseKernel` persistent-substrate + SIGINT-escalation model being reimplemented on Node)

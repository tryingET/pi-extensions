---
summary: "Adopt a layered L0-L5 agent eval + capability substrate in pi-extensions: port oh-my-pi's TS kernel into pi-code-mode (Node reimplementation), add pic capability-contract two-gate type gating, a marimo-graph + pic-resolver saved-function library, and pic reactive artifacts; consolidate by absorbing pi-code-mode, folding pi-evidence-review into pi-semantic-code-intelligence, and keeping pi-agent-interaction-canary."
read_when:
  - "Implementing or extending the persistent kernel, capability-contract gating, saved-function library, or reactive artifacts in pi-extensions."
  - "Deciding the execution substrate for model-authored code and the absorption/fold of pi-code-mode and pi-evidence-review."
type: "adr"
status: "accepted"
system4d:
  container: "Agent eval + capability substrate architecture in pi-extensions (L0-L5), absorbing pi-code-mode as the kernel home and adding contract gating, a function library, and reactive artifacts."
  compass: "One typed, persistent, multi-language execution substrate whose capability surface is contract-gated before execution (compile gate + runtime gate), with durable agent-built functions and interactive artifacts — taking the best of pic, oh-my-pi, marimo, and rat for the right reasons, not just because."
  engine: "Phase 0 port/merge spec (DONE) -> Phase 1 Node persistent kernel (py+js) + structured look -> Phase 2 two-gate L3 -> Phase 3 L4 function graph overlay -> Phase 4 L5 artifacts; governed RFC -> review -> re-review -> ADR -> AK decision (operator-authorized) -> measured/autoresearch phased implementation."
  fog: "ADR accepts architecture/implementation planning only — not implementation authorization, not cleanup/promotion authority, not the AK direction/task mutation. Contracts are mechanism-level and Phase-0-verified; the wiring (Node substrate, registry-generated contract, TS graph overlay, headless capability facade) is proposed and executes through the measured campaign substrate. Contrib runtimes stay study-only; Rust-only capabilities stay out of scope; the BaseKernel 'port' is a Node reimplementation, not a source copy."
---

# ADR: Agent eval + capability substrate (L0–L5)

## Status

**Accepted for architecture and implementation planning under AK decision (pending — operator-authorized creation).**

This ADR records the accepted durable architectural decision and its committed contracts. It is **explicitly not**:

- **implementation authorization** — no phase may begin without its own implementation plan, validation plan, and measured/autoresearch campaign execution (per existing repo ADRs: "no unmeasured controller patches");
- **cleanup or promotion authority** — it does not by itself delete, archive, merge, publish, or release any package or branch;
- **AK authority** — it does not create the AK decision, bind the AK direction node, or write AK evidence; those are staged as operator-authorized next steps at the end.

Evidence and reviews (all tracked in repo history):

- RFC: [2026-08-07-eval-capability-substrate-rfc.md](../project/2026-08-07-eval-capability-substrate-rfc.md) (revised; status `proposed`)
- First review (outcome `revise before ADR`): [2026-08-08-review-eval-capability-substrate-rfc.md](../project/2026-08-08-review-eval-capability-substrate-rfc.md)
- Re-review (outcome `ready_for_adr`): [2026-08-08-rereview-eval-capability-substrate-rfc.md](../project/2026-08-08-rereview-eval-capability-substrate-rfc.md)
- Phase-0 port/merge spec (de-risking evidence, file:line): [2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md](../project/2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md)

## Context

A controlled exploration of five `softwareco/contrib` runtimes — `pic`, `oh-my-pi`, `marimo`, `rat`, `activegraph` — alongside the existing `pi-extensions` replay stack (`pi-autoresearch`, `pi-society-orchestrator`) found a **substrate gap and a duplication risk**: the capability we want is scattered across four repos, each solving one piece well and none solving the whole.

- **oh-my-pi** has a proven persistent, multi-language kernel with interrupt-safe state, rich MIME display, and a bidirectional host bridge — but the bridge is an **untyped dynamic Proxy** and the runtime is **Bun-coupled**.
- **pic** has the **capability-contract type gating** (a compile-time `validateSubmission` that type-checks submissions before execution) and a **saved-function dependency library** with tombstone/refuse-removal integrity — but on a dead-end Chrome/DOM substrate.
- **marimo** has the most mature **dependency-graph data model** (`DirectedGraph`) and a dry-run-validate-then-apply discipline — but is Python-only, reactive-cell-oriented, and has no host bridge.
- **rat** has an elegant 4-tool kernel surface (`run`/`look`/`ctl`/`tail`) — but shallow `pi` integration, a text-only `look`, and no kernel→host callback.

Meanwhile `pi-code-mode` (`@tryinget/pi-code-mode`, v0.1.0) is itself a hand-rolled workaround for exactly this gap — **disposable-per-eval workers + host-persisted JSON state + a curated capability registry** — and admits in its own README it exists because Pi has no governed `invokeTool`. Building capability-gating and a function library over disposable workers would lock out persistence, rich display, and host callbacks; keeping `pi-code-mode` and porting oh-my-pi would carry two runtimes.

**Phase-0 de-risking (DONE, file:line evidence, re-traced this session) confirmed both integration seams the RFC had marked *proposed*, with refinements:**

- **Seam (a) — capability-contract onto the host bridge: CONFIRMED.** The gate is **two complementary enforcement homes**, not one: a **compile gate** (pic `src/typescript/compiler.ts` `validateSubmission`, line 241; `CAPABILITY_CONTRACT` line 15 — an in-memory virtual TS program that runs `ts.getPreEmitDiagnostics` before execution) and a **runtime gate** (`pi-code-mode/src/capability-registry.ts` `invoke`, line 45, effect check at lines 60–62; effect taxonomy `src/types.ts:5`). pic's typed runtime capability object is browser-resident (`__picCapabilities`) and must be **rebuilt headless** from the governed registry.
- **Seam (b) — marimo `DirectedGraph` over the kernel: CONFIRMED.** Port the graph **data model** (facade over `MutableGraphTopology` / `DefinitionRegistry` / `CycleTracker`, `marimo/_runtime/dataflow/graph.py:32`), **populated by pic's existing TS dependency resolver** (`compiler.ts` `directDependencies` line 374, `resolveDependencyOrder` line 450). marimo's Python AST cell compiler and reactive cell-DAG execution are **not** adopted. The graph is an **L4 overlay on the persistent namespace**, not inside the kernel eval loop, so **no `BaseKernel` rearchitecture is required**.
- **Seam (c) — `pi-code-mode` absorption: RESOLVED.** Replace the spawn-per-eval disposable engine with a persistent substrate; keep the registry, the effect taxonomy, the eval tool/command surface, and the `protocol-broker` framing layer.

This is an architecture-significant, pi-extensions-local change: it reshapes shared execution contracts, absorbs a published package, and introduces three new packages. FCOS is **not** required on this read (control-board-significance is reasoned to be absent; the FCOS-slice pattern remains the mechanism if the operator later judges a persistent-kernel + capability-governance category control-board-significant).

## Decision

Adopt a single **layered agent eval + capability substrate** in pi-extensions, and the three consolidation decisions. The Phase-0 refinements below are **committed contracts**, not restatements of the RFC options. Each is labeled by evidence status (**verified** = Phase-0-traced and re-traced this session; **proposed** = wiring not yet built, grounded in verified mechanisms).

### The L0–L5 substrate

```
 L5  REACTIVE ARTIFACTS ……………………… pic            (interactive output modality)
 L4  SAVED-FUNCTION LIBRARY …… pic + marimo       (durable agent-built capability)
 L3  CAPABILITY-CONTRACT GATE … pic + marimo + PCM (type-safety + governance)
 L2  HOST BRIDGE + TOOL SURFACE … oh-my-pi + rat  (bidirectional agent <-> kernel)
 L1  PERSISTENT KERNEL SUBSTRATE … oh-my-pi       (execution engine)
 L0  EVENT-LOG TRUTH + CONTENT-HASH SPINE … all   (foundation)
```

**Committed contracts (the load-bearing refinements):**

1. **L3 is two gates, not one (verified + proposed).**
   - **Compile gate** (verified mechanism): pic `validateSubmission`-style in-memory TS program type-checks each submission against typed capability interfaces before execution; rejects unknown capabilities / malformed params as TS diagnostics.
   - **Runtime gate** (verified): `pi-code-mode` `CapabilityRegistry.invoke` effect admission per eval call (`read | write | process | network | orchestration`).
   - **Contract-generation direction (proposed, design intent):** the typed contract interfaces are **generated from the capability registry catalog**, so adding a capability updates the contract and the two cannot drift. pic's stock contract is a static interface set; generation-from-registry is the proposal the implementation must build and measure.
   - The untyped `tool.*` Proxy (oh-my-pi `prelude.txt`; `pi-code-mode` `javascript-kernel.mjs`) becomes typed at **both** points. The compile gate inserts at the eval chokepoint (oh-my-pi `runtime.ts` `wrapCode`→`indirectEval`; absorbed form: the host→worker eval boundary); the runtime gate stays at registry dispatch.

2. **L4 graph = marimo data model + pic resolver; no cell compiler / reactive DAG; no kernel rearchitecture (verified + proposed).**
   - Port marimo's `DirectedGraph` **data model** to TS (name→definers registry, parents/children adjacency, cycles set, multiply-defined index) — verified facade.
   - Populate it with pic's **existing TS-symbol dependency resolver** (`directDependencies`/`resolveDependencyOrder`) — verified.
   - Do **not** port marimo's Python AST cell compiler; do **not** adopt marimo's reactive cell-DAG execution. The graph is a dependency overlay owned by the function-library layer; the kernel eval loop is untouched (proposed wiring).
   - Take pic's tombstone/refuse-removal-if-required integrity (verified: `pic/src/typescript/functions.ts` refuses removal when a surviving function's `directDependencies` includes the target; tombstone = append-only `{deleted:true,name}`; `reconstruct` replays ignoring tombstones).

3. **L1 = Node reimplementation of the Bun IPC loop; py + js scope only (verified cost + proposed port).**
   - oh-my-pi `BaseKernel` is **Bun-specific** (`import type { Subprocess } from "bun"`; `Bun.FileSink`; `proc.exited`; `wrapCode` uses `@babel/parser` + `Bun.Transpiler`). pi-code-mode is Node (`node:child_process`). The "port" is a **reimplementation of the IPC/eval loop on Node**, not a source copy: `Bun.Transpiler` → esbuild/swc/tsx; `Subprocess`/`FileSink` → `node:child_process` + web streams; the NDJSON frame loop and SIGINT-escalation state machine port by logic. **No claim is made that the source copies; the cost is named as real engineering.**
   - oh-my-pi has **two** JS substrates (`BaseKernel` NDJSON for py/jl/rb; a separate worker-core for JS). `pi-code-mode` ships only **python + javascript** (verified: `CodeModeLanguage = "javascript" | "python"`; runtime ships only `javascript-kernel.mjs` + `python-kernel.py`). Port scope is **py + js**, not all four languages.
   - Adopt rat's 4-tool surface (`run`/`look`/`ctl`/`tail`) with a **structured** `look` returning `{name,type,shape,value}` (rat's text-only `look` is the mistake this fixes; structured `look` is what lets L3 and L4 reason).

4. **L5 evaluator = TS reimplementation; grammar/validation portable (verified boundary + proposed port).**
   - pic's bounded-expression **grammar and validation** (`PicExplorerExpression`, `compiler.ts:27`) are portable TS.
   - The **expression evaluator** that recomputes trade-off/timeline explorers on slider change runs in the Chrome page via CDP; it must be **reimplemented in TS** as a small recursive evaluator. The "local recompute, no model call" benefit holds only after that reimplementation.

5. **L0 spine (discipline, not code).** Event-log-is-truth, content-hash-is-identity, derived views are projections, projections are not authority. Applied across all layers.

### The host bridge (L2)

Take oh-my-pi's native kernel→agent callbacks (`tool.*`, `agent()`, `parallel()`, `pipeline()`) — the only true bidirectional bridge — over the Node worker, with marimo's read-only inspection/observe split. `parallel()`/`pipeline()` are **local JS concurrency pools** (barrier semantics over JS thunks), **not** sub-agent fan-out; only `agent()` spawns sub-agents. pic's browser-bound capability RPC façade collapses to **in-process registry dispatch** headless; `dom`/`cdp` capabilities are simply not present headless.

### Consolidation decisions (operator-confirmed, FINAL)

- **Keep** `pi-agent-interaction-canary` — active WIP, not dead scratch. Out of scope for this ADR's execution.
- **Absorb** `pi-code-mode` → L1 + L2 home. Retain its effect taxonomy (L3 runtime gate + governance) and the eval tool/command surface. `@tryinget/pi-code-mode` is a **published** package: the engine swap is a **major-version change**, landed **feature-flagged behind the existing disposable engine** until measured, with the disposable engine as the **rollback fallback**. Migration owner: `pi-code-mode`.
- **Fold** `pi-evidence-review` → `pi-semantic-code-intelligence` as a `/evidence-review` sub-command. Verified: `pi-evidence-review`'s data model already carries schema id `semantic-code-intelligence.evidence_review.v1` (`src/validation.ts:18`) — SCI-namespaced by convention; the two packages share **no code dependency** today, so the fold also introduces the shared type. Migration owner: `pi-semantic-code-intelligence`; existing `/evidence-review` callers keep their surface.

### Packaging

- **L1 + L2 → evolve `pi-code-mode` in place** (absorb). Not a new package.
- **L3 → new package** `pi-capability-contract` — a **support library** (no live extension; consumed by `pi-code-mode` and other tool surfaces). Records the AGENTS support-library exception.
- **L4 → new package** `pi-function-library` — a **support library** (kernel-resident, consumed via `pi-code-mode`). Records the AGENTS support-library exception. (Boundary is a judgment call — see Open questions.)
- **L5 → new package** `pi-reactive-artifacts` — a **live extension** (exposes artifact tools/prompts to the agent).

All new packages scaffold from `../pi-extensions-template` (`scaffold_mode=simple-package`) with `.copier-answers.yml` tracked, per the repo `AGENTS.md` rule.

### Portability boundary (committed, not negotiated)

- **Portable (TypeScript, as designs):** the kernel orchestration (`BaseKernel` IPC/eval loop, language kernels, runner scripts — **reimplemented**, not copied), the host bridge, pic's contract + dependency-graph logic, marimo's graph data model, the artifact grammar/validation, the minimizer **concept**, snapcompact's **concept**.
- **Not portable (Rust) — out of scope:** oh-my-pi's native core (AST-edit/ast-grep, native grep, file isolation `pi-iso`, the minimizer/snapcompact **implementations**, LSP/DAP servers). The Rust ideas may be reimplemented in TS separately (the shell-output minimizer is the highest-ROI TS reimplementation) or deferred (LSP/DAP is the biggest separate capability gap and warrants its own effort).

### What stays study-only

`pic`, `oh-my-pi`, `marimo`, `rat`, `activegraph` remain **study-only references**. Nothing in this ADR makes them a runtime dependency of pi-extensions. We port TypeScript designs only; we trace them to verify claims; we do not port their forks.

## Consequences

**Positive:**

- One typed, persistent, multi-language execution substrate replaces a hand-rolled disposable-worker workaround, removing the duplication risk between `pi-code-mode` and an oh-my-pi port.
- Capability calls become **type-checked before execution** (compile gate) **and** effect-admitted per call (runtime gate), closing the untyped-Proxy footgun that all four source runtimes leave open.
- Durable agent-built functions gain a queryable dependency graph (marimo model) with TS-symbol-correct edges (pic resolver) and tombstone integrity, resident in the persistent kernel where disposable workers cannot host them.
- Interactive artifacts become a new output modality that can render L4 function data and replay-layer data for free (after the L5 evaluator reimplementation).
- The consolidation removes one redundant runtime and makes one schema convention first-class.

**Costs (named, honest):**

- **Node port of the Bun IPC loop.** Reimplementing `BaseKernel`'s subprocess + NDJSON frame loop and SIGINT-escalation state machine on `node:child_process` + streams, plus a `Bun.Transpiler` replacement, is real engineering — straightforward but non-trivial, and **not** a source copy.
- **Two JS substrates to unify.** oh-my-pi's worker-core JS path and pi-code-mode's `node:vm` sandbox must converge on one persistent substrate (Phase-1 decision: port the worker-core path, or evolve the `vm` worker to a reused persistent context).
- **Published-package major bump.** `@tryinget/pi-code-mode` absorbs a persistent engine; the engine swap is a semver major event. Mitigated by the feature-flag + disposable-engine fallback, but the major bump and its compat communication are owed.
- **L4 graph overlay build.** The marimo data-model port + pic-resolver integration + dry-run/staleness apply path is new surface, even though it needs no kernel rearchitecture.
- **L5 evaluator reimplementation.** A small but real recursive evaluator over the bounded expression AST, because pic's evaluator is browser-bound.
- **New-package overhead.** Three new packages (two support libraries + one live extension) each carry scaffolding, the AGENTS exception where applicable, and their own validation.

**Not asserted:**

- That the Node port matches oh-my-pi's observed behavior without measurement (the campaign substrate owns that).
- The exact L4 package boundary (judgment call).
- FCOS requirements (reasoned from pi-extensions usage pattern; FCOS authority is external).

## Rollout and rollback

Phased delivery, each phase executed through the measured/autoresearch campaign substrate (`pi-autoresearch` / `pi-society-orchestrator`) — **no unmeasured controller patches**. Each phase has an executable acceptance criterion (from the RFC Phased-delivery section).

| Phase | Scope | Executable acceptance criterion | Rollback |
|---|---|---|---|
| **0 — port/merge spec** | de-risking (DONE) | both seams confirmed with file:line evidence | n/a (read-only) |
| **1 — L1 kernel substrate** | Node persistent py + js kernel (Bun loop reimplementation); rat 4-tool surface with structured `look`; absorbed into `pi-code-mode` | a persistent py and js kernel each survive a SIGINT interrupt with state intact; `look` round-trips structured `{name,type,shape,value}`; the existing disposable engine remains available behind a flag | feature-flag off → disposable engine (the rollback fallback) |
| **2 — L3 capability-contract gate** | pic compile gate (contract generated from the registry) + existing runtime effect gate; marimo dry-run/staleness patterns | an unknown capability or malformed param is rejected before execution; an effect not in `allowedEffects` is rejected at dispatch | disable the compile gate → runtime gate still admits (the contract is additive) |
| **3 — L4 saved-function library** | marimo graph data model + pic resolver + pic tombstones over the persistent kernel | removing a required function is refused; a new cycle / multiply-defined is rejected at save (dry-run-validate-then-apply) | disable function persistence → functions do not survive eval (no false saves) |
| **4 — L5 reactive artifacts** | new output modality (evaluator reimplemented in TS) | a tradeoff explorer recomputes ranking locally on a control change with no model call | disable the artifact modality → artifacts do not render (orthogonal layer) |

**Parallel/optional (not on the critical path):** shared-namespace-across-clients (rat thesis), shell-output minimizer (TS reimplementation), snapcompact vision-compaction, LSP/DAP (separate effort), response-replay (only if agent trace forking becomes a target workload).

**Rollback principle:** the persistent substrate is disposable-engine-backed by a feature flag from Phase 1; each later layer is additive (a gate, a persistence layer, an output modality), so rollback never re-enables a removed or unsafe behavior — it disables the new layer and falls back to the substrate below.

## Open questions (resolved at the phase that owns them, not re-litigated here)

1. **L4 package boundary** — separate `pi-function-library` (this ADR's default) vs folded into `pi-code-mode`. Phase-3 decision.
2. **JS substrate + transpiler** — port oh-my-pi's worker-core JS path, or evolve `pi-code-mode`'s `node:vm` worker to a reused persistent context; and which TS transpiler (esbuild / swc / tsx) replaces `Bun.Transpiler`. Phase-1 decision.
3. **Capability ergonomics** — typed `capabilities` parameter (pic style) vs typed ambient `tool.*` globals (oh-my-pi style). Both are achievable with the compile-gate mechanism; ADR-time/Phase-2 decision.
4. **Agent trace forking / shared-namespace** — operator confirms whether either is a target workload; shapes L1's session model and whether response-replay is added. Operator input.
5. **LSP/DAP scope and timing** — separate RFC/effort; its presence affects how much of oh-my-pi's surface is ultimately mirrored.

## Non-authorizations

This ADR does **not** authorize, by itself:

- any **merge**, branch operation, promotion, or release of any package (including the `pi-code-mode` major bump and the `pi-evidence-review` fold);
- the **AK decision creation**, **AK direction-node binding** (the intended `AK.V5.SF07` child wave / sub-frame), or any **AK evidence** write — these are operator-authorized steps staged below;
- any **implementation** — every phase requires its own implementation + validation plan under the measured campaign substrate;
- any **publication**, release, or operator-facing UX change;
- any **cleanup** of the contrib runtimes (they remain study-only) or of `pi-agent-interaction-canary` (kept as active WIP);
- the **Phase-0 spec line-number refresh** — the re-review noted citation drift in the Phase-0 evidence index (mechanisms verified, line numbers stale); refreshing that index is separate low-priority housekeeping, not authorized by this ADR.

## Operator-authorized next steps (explicitly NOT performed by this ADR)

These are the steps required to move from "ADR accepted for planning" to "runtime-authoritative decision bound to durable intent." Each requires explicit operator authorization per workspace AGENTS (do not broaden into direction refresh / task creation unless asked):

1. **Create the AK decision** this ADR cites (`ak decision create` from the repo root, linked to this ADR), then update this ADR's Status line and frontmatter from "pending" to the assigned AK decision id.
2. **Bind the AK direction node** under `AK.V5.SF07` (child implementation wave or new sub-frame) using the operator-authorized AK direction path. (Note: `ak direction check` currently reports an unrelated drift — `IW8` / execution task `#4164`, owned by the Prompt Vault→Pi path — which is not this ADR's to repair.)
3. **Open Phase-1 implementation + validation plans** for the L1 Node persistent kernel through the measured/autoresearch campaign substrate, with the disposable-engine feature flag as the rollback fallback.

## References

- Anchor RFC (revised): [2026-08-07-eval-capability-substrate-rfc.md](../project/2026-08-07-eval-capability-substrate-rfc.md)
- First review (`revise before ADR`): [2026-08-08-review-eval-capability-substrate-rfc.md](../project/2026-08-08-review-eval-capability-substrate-rfc.md)
- Re-review (`ready_for_adr`): [2026-08-08-rereview-eval-capability-substrate-rfc.md](../project/2026-08-08-rereview-eval-capability-substrate-rfc.md)
- Phase-0 port/merge spec (evidence): [2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md](../project/2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md)
- Decision lifecycle: `~/ai-society/holdingco/governance-kernel/docs/dev/decision-lifecycle.md`
- Source runtimes (study only): `softwareco/contrib/{pic,oh-my-pi,marimo,rat,activegraph}`
- Absorption target: `packages/pi-code-mode`; fold target: `packages/pi-semantic-code-intelligence` (absorbs `packages/pi-evidence-review`)
- New-package template: `../pi-extensions-template` (`scaffold_mode=simple-package`)

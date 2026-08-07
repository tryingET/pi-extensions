---
summary: "Phase 0 port/merge spec for the eval-capability-substrate RFC: de-risks the two unverified integration seams (pic capability-contract onto the oh-my-pi host bridge; marimo DirectedGraph over the persistent kernel) and gives the concrete pi-code-mode absorption plan, with first-hand file:line evidence."
read_when:
  - "Implementing or reviewing the Phase 1 kernel port or the capability-contract gate for the eval substrate."
  - "Deciding how pi-code-mode is absorbed as the L1+L2 execution home."
type: "spec"
status: "proposed"
system4d:
  container: "Phase 0 read-only de-risking of the eval-capability-substrate RFC: contract-injection point, graph-port scope, and pi-code-mode absorption plan."
  compass: "Confirm the two integration seams with cited evidence before any port; identify the exact contract-injection point; make the absorption concrete so Phase 1 can proceed under the decision membrane."
  engine: "first-hand trace of pic compiler/functions + oh-my-pi prelude/tool-bridge/kernel-base/runtime + marimo graph/context + pi-code-mode registry/client/worker -> seam verdicts -> layered port plan -> Phase 1 readiness."
  fog: "Seams are confirmed with refinements, not refuted. The pic runtime capability object is browser-bound and must be rebuilt headless; the marimo graph ports as a data model populated by pic's own TS dependency resolver, not marimo's Python cell compiler. oh-my-pi's BaseKernel is Bun-specific and the JS path is a distinct substrate — both are Node-port tasks, not copies."
---

# Phase 0 port/merge spec — agent eval + capability substrate

This is the **Phase 0 deliverable** for the anchor RFC
[2026-08-07-eval-capability-substrate-rfc.md](2026-08-07-eval-capability-substrate-rfc.md).
It is read-only investigation whose sole purpose is to de-risk the two integration seams
the RFC marked *proposed (not yet built)*, and to close the `pi-code-mode` absorption detail,
so Phase 1 can proceed. It does **not** scaffold packages, write production code, or mutate
the contrib runtimes.

All five contrib runtimes (`pic`, `oh-my-pi`, `marimo`, `rat`, `activegraph`) remain
**study-only references**. Nothing here makes them a runtime dependency of pi-extensions.
The portability boundary from the RFC holds: TypeScript orchestration is portable; Rust is not.

## Evidence discipline

Every load-bearing claim below is labeled and cited to `file:line`.

- **FACT** — observed directly in source (traced first-hand or by a read-only subagent with file:line evidence).
- **INFERENCE** — derived from facts but not itself asserted by the code.
- **PROPOSAL** — a Phase-1 design choice this spec recommends; not yet decided.

Sources traced first-hand: `pic/src/typescript/compiler.ts`; `oh-my-pi` `eval/js/shared/prelude.txt`,
`eval/js/tool-bridge.ts`, `eval/kernel-base.ts`, `eval/js/index.ts`, `eval/index.ts`; `marimo` `_runtime/dataflow/graph.py`;
`pi-code-mode` `src/capability-registry.ts`, `src/default-capabilities.ts`, `src/extension.ts`,
`src/kernel-protocol.ts`, `src/types.ts`, `src/kernel-client.ts`, `runtime/javascript-kernel.mjs`,
`runtime/protocol-broker.mjs`. Deeper contrib context was filled by three parallel read-only subagents
(pic TS surface; oh-my-pi eval runtime; marimo graph + code-mode context), each returning file:line evidence.

## Headline verdicts

| Seam | RFC posture | Phase-0 verdict | Refinement |
|---|---|---|---|
| (a) pic capability-contract grafts onto oh-my-pi's untyped `tool.*` | proposed | **CONFIRMED** | The contract has *two* enforcement homes (compile gate + runtime gate), not one; the pic runtime capability object is browser-bound and is rebuilt headless. |
| (b) marimo DirectedGraph ports over the kernel without rearchitecting | proposed | **CONFIRMED** | Port the graph *data model*, populated by pic's *existing* TS dependency resolver; do not adopt marimo's reactive cell-DAG execution. The graph is an L4 overlay, not inside the kernel loop. |
| (c) pi-code-mode absorption | open | **RESOLVED** | Replace the disposable-worker engine with a persistent-substrate model; keep the registry, effect taxonomy, tool surface, and broker. Two Node-port tasks are the real cost. |

---

## Seam (a) — capability-contract onto the host bridge: CONFIRMED

### The two enforcement homes (FACT)

The RFC frames L3 as one gate grafted onto the bridge. The source shows the gate is actually
**two complementary points** that already exist independently in the two runtimes:

1. **Compile gate (pic).** `pic/src/typescript/compiler.ts` — `validateSubmission(source, registry, input)`
   builds an **in-memory virtual TypeScript program** from three synthetic files
   (`CONTRACT_FILE` = `CAPABILITY_CONTRACT` interfaces + per-capability `declare const` declarations;
   `SIGNATURES_FILE`; `PROGRAM_FILE`) and runs `ts.getPreEmitDiagnostics` to type-check the submission
   against typed `PicCapabilities` interfaces **before** it is compiled to runnable JS. Unknown
   capabilities or malformed parameters are rejected as TS diagnostics before any execution.
   *(FACT, `compiler.ts` `validateSubmission`, `CAPABILITY_CONTRACT` constant, `PicCapabilities`.)*
2. **Runtime gate (pi-code-mode).** `pi-code-mode/src/capability-registry.ts` — `CapabilityRegistry.invoke`
   resolves a capability by name, then **throws if its `effect` is not in `context.allowedEffects`**
   (`if (!context.allowedEffects.has(capability.effect)) throw`). The effect taxonomy is
   `read | write | process | network | orchestration` *(FACT, `src/types.ts` `CapabilityEffect`)*.
   The default admitted set is `["read","process"]` *(FACT, `src/extension.ts` `DEFAULT_ALLOWED_EFFECTS`)*.

**The "host bridge" is therefore not a single object but the dispatch path that both gates wrap.**

### The untyped Proxy, precisely (FACT)

oh-my-pi's `tool` is the untyped dynamic Proxy the RFC describes, set as a worker global in
`eval/js/shared/prelude.txt`:

```js
const tool = new Proxy({}, { get(_target, prop) {
    if (typeof prop !== "string") return undefined;
    return async args => globalThis.__omp_call_tool__(prop, args ?? {});
}});
globalThis.tool = tool;
```

The single host-side dispatch chokepoint is `__omp_call_tool__(name, args)`, whose host counterpart is
`callSessionTool(name, args, options)` in `eval/js/tool-bridge.ts`: special names
(`__completion__`, `__agent__`, `__budget__`, `__concurrency__`) route to dedicated bridges; any other
name resolves via `getTool(session, name)` → `tool.execute(...)` *(FACT, `tool-bridge.ts` `callSessionTool`)*.

pi-code-mode's worker has the **same footgun**: `runtime/javascript-kernel.mjs` `createTool(evalId)` returns a
Proxy whose `get` forwards `tool.<name>(input)` → `hostCall(evalId, name, input)` → a `capability_call` frame
*(FACT)*. The only thing currently gating it is the host-side registry effect check.

### The exact contract-injection point (FACT + PROPOSAL)

oh-my-pi has a **single convergence point** through which every JS submission passes, immediately before
execution: `eval/js/shared/runtime.ts` line **236 → 237** — `wrapCode(code)` returns `{source, ...}` (after a
`@babel/parser` parse, a TS strip, import rewrite, and global demotion), and `indirectEval(wrapped.source, filename)`
is the one `globalThis.eval` call that runs it *(FACT, subagent-traced)*. A compile gate fits cleanly between
236 and 237 (the parsed AST is already in hand), or inside `wrapCode`.

In the **absorbed** substrate (pi-code-mode home), the equivalent injection point is the **host→worker eval
message boundary**: today `KernelClient.#runNow` sends an `{type:"eval", code, ...}` frame to a fresh worker
*(FACT, `kernel-client.ts`)*. The compile gate runs **host-side, before that frame is sent**, invoking
pic-style `validateSubmission(source, capabilityRegistry, input)` against a contract generated **from the
capability registry**.

> **PROPOSAL (L3 wiring):** L3 = (1) a host-side compile gate using pic's in-memory-Program mechanism, where
> the typed contract interfaces are *generated from the capability registry catalog* (so adding a capability
> updates the contract); plus (2) the existing runtime effect-class gate at `CapabilityRegistry.invoke`.
> Compile gate answers *"is this capability call well-typed and admitted by name?"*; runtime gate answers
> *"is this capability's effect class allowed for this eval call?"* The two are complementary, not redundant.

### What must be rebuilt headless, not copied (FACT + INFERENCE)

pic's typed `PicCapabilities` *runtime object* is **not** a portable set of implementations — it is a
**thin RPC façade living in the Chrome session page**, injected as `globalThis.__picCapabilities` at
`pic/src/page/app.js:4062`, with each method forwarding to a Node host via a CDP `Runtime.binding`
*(FACT, subagent-traced)*. Execution itself is a CDP `Runtime.evaluate` into the page
*(FACT, `pic/src/typescript/functions.ts` → `chrome.evaluateProgram`)*.

Consequences for the headless port:

- **Portable (copy the design):** the compile-time contract mechanism (`validateSubmission`,
  `directDependencies`, `resolveDependencyOrder`, `functionSignature`); the tombstone integrity policy
  (see Seam (b)§L4); the artifact *data models* and the bounded-expression mini-language *grammar*
  (L5). All are TypeScript already.
- **Browser-bound (drop, do not port):** `PicDomCapability` (live DOM nodes), `PicCdpCapability`
  (Chrome DevTools Protocol target/subscribe/send), and the in-page **expression evaluator** that
  recomputes trade-off/timeline explorers on slider change *(FACT)*. For L5 the evaluator must be
  **reimplemented in TS** as a small recursive evaluator over the bounded expression AST; the grammar
  and validation (`compiler.ts` `PicExplorerExpression`) port as-is. This is L5 work, a separate package,
  and the lowest-priority phase.

> **INFERENCE:** the typed contract accurately describes pic's callable surface (it is not a fiction),
> but for a headless kernel the runtime capability object is **rebuilt from the governed registry**, and
> the RPC bridge collapses to **direct in-process dispatch** (`CapabilityRegistry.invoke`). The bridge
> `dom`/`cdp` capabilities are simply not present headless.

---

## Seam (b) — marimo DirectedGraph over the kernel: CONFIRMED (with refinement)

### The graph is a facade over four pure data structures (FACT)

`marimo/_runtime/dataflow/graph.py` `DirectedGraph` is a frozen dataclass coordinating:

- `MutableGraphTopology` (`topology.py`) — `_cells`, `_children`, `_parents` adjacency; `add_node`/`remove_node`/`add_edge`/`get_path` (BFS).
- `DefinitionRegistry` (`definitions.py`) — `definitions: dict[Name, set[CellId_t]]`; `register`/`unregister`/`get_defining_cells`/`get_multiply_defined`.
- `CycleTracker` (`cycles.py`) — `cycles: set[tuple[Edge,...]]`; `detect_cycle_for_edge` (uses `topology.get_path`); **zero AST coupling**.

The edge algorithm `edges.compute_edges_for_cell` is a pure rule: *"for each name I define, referrers become my children; for each name I reference, definers become my parents."* It needs only `{defs, refs}` per unit *(FACT, subagent-traced)*.

### Where the Python-AST coupling actually lives (FACT)

The coupling is **entirely on the input side**, not in the graph structures: the per-unit `defs`/`refs`/`deleted_refs`
come from `CellImpl.variable_data` / `CellImpl.refs`, which marimo's AST visitor (`_ast/visitor.py`) extracts from
Python source *(FACT)*. The graph itself never parses Python.

Droppable marimo-specific concerns for a *function* library: SQL hierarchical name matching
(`edges.py`, `definitions.py`), the `deleted_refs` edge logic (cell semantics), `code_key` (a Python-AST
content hash used only by `is_cell_cached`), and `is_mangled_local` (Python private-name cell-leakage).

### pic already has the TS dependency resolver (FACT)

`pic/src/typescript/compiler.ts` already implements dependency resolution in TypeScript:
`directDependencies(source, registry)` parses each saved function with the **TS compiler**, declares every
registry name, and uses `program.getTypeChecker()` symbol resolution to collect referenced names;
`resolveDependencyOrder` is a DFS over those edges with **cycle detection** *(FACT)*. pic's integrity policy
uses it directly: removal is refused when any *other* surviving function's `directDependencies` includes the
target *(FACT, `pic/src/typescript/functions.ts:129-138`)*.

### The refinement (PROPOSAL)

> **PROPOSAL (L4 graph):** Port marimo's graph **data model** — name→definers registry, parents/children
> adjacency, cycles set, multiply-defined index — to TypeScript. **Populate it using pic's existing TS-symbol
> dependency resolver** (`directDependencies`/`resolveDependencyOrder`), operating on saved **functions**
> (not notebook cells). Do **not** port marimo's Python AST cell compiler, and do **not** adopt marimo's
> reactive cell-DAG execution model (the "heavyweight reactive-cell paradigm mismatch" the RFC explicitly
> rejected).

This is a cleaner fit than the RFC's literal "port DirectedGraph," because pic already proved TS-symbol
dependency resolution works on exactly the unit type L4 needs. The **delta marimo's model adds over pic's
resolver** is: (1) a *persistent, queryable* graph (pic recomputes per call; marimo maintains incremental
state), (2) **multiply-defined detection as first-class**, (3) `descendants`/`ancestors`/`transitive_closure`
queries, and (4) parents/children as an adjacency you can walk. For tombstone *integrity* alone, pic's
resolver suffices; the DirectedGraph port buys queryability and incremental maintenance worth having in a
durable library. This is a Phase-3 scope decision, not a Phase-1 blocker.

### No kernel rearchitecture required (FACT)

oh-my-pi's `BaseKernel` is a **long-lived subprocess** whose `execute(code, options)` sends one payload over
stdin and reads NDJSON frames (started/stdout/stderr/display/result/error/done) from stdout; **state lives in
the runner process** and persists across `execute` calls; SIGINT escalation (`interrupt()` → SIGINT → SIGTERM →
SIGKILL) preserves in-process state *(FACT, `kernel-base.ts`)*. The kernel has **no dependency graph and no
per-cell concept** — it is a flat persistent namespace. Therefore the L4 graph is an **overlay owned by the
function-library layer**, maintained alongside saved functions; the kernel eval loop is untouched. **The
"without rearchitecting" claim holds.**

### The L3 discipline pattern is portable (FACT)

marimo's `edit_cell`/batch context implements **dry-run-validate-then-apply** + **`StaleCellError`**
read-before-write *(FACT, `_code_mode/_context.py:793-808`, `:1185-1212`; `agent.py` `AgentReadTracker`)*:

- Dry run: snapshot pre-state (`cells`, `multiply_defined`, `cycles`); compile + `register_cell` against the
  *real* graph; reject only *newly introduced* multiply-defined/cycles; **always restore** in a `finally`,
  leaving the graph byte-identical whether validation passes or fails.
- Staleness: an `AgentReadTracker` records the max-read version per unit; editing a unit whose version
  advanced past the last read raises `StaleCellError`.

Both are **patterns**, not Python-specific logic. They translate to a TS function-library apply path: validate
the graph delta (new cycles / new multiply-defined) before committing a function save, and refuse to overwrite
a function whose source changed since the agent last read it.

---

## pi-code-mode absorption plan (RESOLVED)

### Current architecture (FACT)

pi-code-mode (v0.1.0) is **not** a persistent process. It is **disposable workers + host-persisted JSON state**:

- `src/kernel-client.ts` `KernelClient.#runNow` **spawns a fresh child per eval** (`spawn(brokerScript, ...)`),
  sends one `{type:"eval"}` frame, awaits `eval_result` + `finalize`/`eval_complete`, then the worker exits.
- **State is round-tripped host-side**: the worker serializes its namespace to JSON (`serializeState`,
  ≤1 MB, JSON-validated, cycle-checked) and the host rehydrates it into the next fresh worker via the `state`
  field *(FACT, `runtime/javascript-kernel.mjs`, `src/kernel-protocol.ts` `validateCommittedState`)*.
- The JS worker is a hardened `node:vm` sandbox (`codeGeneration:{strings:false,wasm:false}`, limited globals)
  that runs one eval then `process.exit(0)` *(FACT)*.
- `runtime/protocol-broker.mjs` is a pure **NDJSON framing/limiting** layer over a 4th stdio pipe — it spawns
  the worker executable and forwards frames with size/count caps and signal propagation *(FACT)*.
- The capability surface is a **curated registry** (`read_text`, `list_directory`, `run_process`) with
  cwd-confinement and path-escape protection *(FACT, `src/default-capabilities.ts`)*, exposed to the program
  via the `tool` Proxy (`tool.<name>`, `tool.call`, `tool.parallel`) *(FACT)*.

This is exactly the "disposable workers + host-persisted state + a capability registry" the RFC identifies as
the hand-rolled workaround for the gap oh-my-pi fills.

### Two real costs the absorption must pay honestly (FACT)

1. **Bun → Node port.** oh-my-pi's `BaseKernel` and JS runtime are **Bun-specific**: `import type { Subprocess } from "bun"`,
   `Bun.FileSink`, `proc.exited`, `proc.kill()` semantics, and `wrapCode` uses `@babel/parser` + **`Bun.Transpiler`**
   for TS-strip *(FACT, subagent-traced)*. pi-code-mode is **Node** (`node:child_process`, `process.execPath`).
   Porting is a **reimplementation** of the IPC/eval loop on Node, not a copy: `Bun.Transpiler` → `esbuild`/`swc`/`tsx`;
   `Subprocess`/`FileSink` → `node:child_process` + web streams; the NDJSON frame loop and SIGINT-escalation state
   machine port by logic. This is straightforward but real engineering.
2. **Two JS substrates in oh-my-pi.** `eval/index.ts` exports four `ExecutorBackend`s sharing one interface, but
   the implementations differ: py/jl/rb use `BaseKernel` (subprocess + NDJSON), while JS uses a **separate**
   worker-core path (`worker_threads` or subprocess + a richer protocol) *(FACT, subagent-traced)*. pi-code-mode
   currently ships only **python + javascript**. *(PROPOSAL: unify on one persistent substrate in pi-code-mode —
   persistent python subprocess with NDJSON for py; persistent node worker (evolve the current `vm` worker from
   "fresh context + exit" to "reused context across evals") for js. Deciding the JS substrate is a Phase-1 task,
   not a Phase-0 blocker.)*

### Keep vs replace (PROPOSAL)

**Keep (pi-code-mode owns these; they are the absorption's value):**

- `CapabilityRegistry` + the `read|process|write|network|orchestration` effect taxonomy *(FACT, `types.ts`, `capability-registry.ts`)* — the L3 runtime gate and L3 governance taxonomy.
- The `eval` tool surface, operator confirmation gate, and `code-mode` / `eval-reset` commands *(FACT, `extension.ts`)*.
- The worker protocol (`capability_call`/`capability_result` round-trip, frame/state limits) and the `protocol-broker.mjs` framing layer.

**Replace:**

- The **engine**: swap `KernelClient`'s spawn-per-eval + host-side JSON state for a **persistent substrate**
  (long-lived worker, state in-process, SIGINT-safe interrupt, rich MIME display frames from oh-my-pi's
  `BaseKernel` frame model). The broker evolves from "spawn-per-eval" to "manage one long-lived worker."
- Add the **compile gate** (pic `validateSubmission`, contract generated from the registry catalog) at the
  host→worker eval boundary.
- Add a **typed capability surface** so the program sees typed capabilities (not the bare Proxy). *(PROPOSAL:
  keep the `tool.*` ergonomics the model already uses, but type them via a generated ambient contract compiled
  against the submission — pic's mechanism already proves this works without changing the runtime Proxy.)*

### Resolving the "any tool via bridge" vs "curated registry" question (PROPOSAL)

oh-my-pi's bridge exposes **all** Pi session tools by name (`getTool(session, name)`); pi-code-mode exposes a
**curated, cwd-confined registry** with effect classes. The synthesis the RFC points at:

> **PROPOSAL:** the admitted surface is the **registry** (curated, effect-tagged, cwd-confined — pi-code-mode's
> safer model); the **contract** types that registry (pic); oh-my-pi's "any tool by name" Proxy becomes the
> underlying **transport** but is never the admitted surface. This keeps L3 governable (you can type and
> effect-gate what you admit) while retaining the bridge's reach when an operator explicitly registers a
> passthrough capability.

A correctness note from the trace: oh-my-pi's `parallel()`/`pipeline()` are **local JS concurrency pools**
(barrier semantics over JS thunks), **not** sub-agent fan-out — only `agent()` spawns sub-agents *(FACT,
`prelude.txt`, subagent-traced)*. If the absorbed surface advertises `parallel()`/`pipeline()`, they mean
concurrent *capability calls*, not concurrent agents.

---

## Layered port plan (consolidated)

| Layer | Source | Port approach | Portability boundary | Phase |
|---|---|---|---|---|
| **L0 spine** | all (pi-autoresearch) | log-is-truth, hash-identity, projections-not-authority discipline | n/a (discipline, not code) | cross-cutting |
| **L1 kernel** | oh-my-pi `BaseKernel` + JS worker-core | **reimplement** the persistent-substrate + NDJSON loop on Node; SIGINT escalation; rich MIME display frames | Bun APIs must be replaced (see §two costs); Rust core out of scope | **Phase 1** |
| **L1 surface** | rat 4-tool shape + pic structured `look` | adopt `run`/`look`/`ctl`/`tail`; `look` returns `{name,type,shape,value}` not text | n/a (TS design) | Phase 1 |
| **L2 bridge** | oh-my-pi prelude + tool-bridge + agent-bridge | port the bridge globals (`tool`/`agent`/`parallel`/`pipeline`/`display`/...) over the Node worker; collapse pic's RPC façade to in-process registry dispatch | `dom`/`cdp` browser capabilities dropped | Phase 1–2 |
| **L3 gate** | pic `compiler.ts` + pi-code-mode registry + marimo discipline | compile gate (`validateSubmission`, contract from registry) at eval boundary; keep runtime effect gate; add dry-run-validate + staleness patterns | pic runtime façade rebuilt headless | **Phase 2** |
| **L4 functions** | pic `functions.ts` + marimo `DirectedGraph` | marimo graph **data model** in TS, populated by pic's TS dep-resolver; pic tombstone + refuse-removal integrity; persistent in kernel | marimo Python AST **not** ported; reactive cell-DAG execution **not** adopted | **Phase 3** |
| **L5 artifacts** | pic `artifacts.ts` | tradeoff/timeline explorers; **reimplement** the expression evaluator in TS (grammar ports) | in-page evaluator is browser-bound | **Phase 4** |

Deferred / out-of-scope (unchanged from RFC): oh-my-pi Rust core (AST-edit, native grep, `pi-iso` file
isolation, minimizer/snapcompact *implementations*, LSP/DAP servers); response-replay (unless operator
confirms trace forking); shared-namespace-across-clients (rat thesis) unless confirmed. The **minimizer
concept** remains the highest-ROI TS reimplementation; **LSP/DAP** remains the biggest separate capability gap.

---

## Phase 1 readiness and the decision membrane

This spec unblocks Phase 1 (L1 kernel substrate + rat-shaped surface with structured `look`) by:

1. Naming the **exact compile-gate injection point** (oh-my-pi `runtime.ts:236→237`; absorbed form = the
   host→worker eval boundary in pi-code-mode).
2. **Confirming both seams** with cited evidence and the precise refinements (graph = data model + pic
   resolver; contract = compile gate + runtime gate; runtime capability façade rebuilt headless).
3. Giving the **concrete absorption plan** (keep registry/effects/surface/broker; replace engine; two
   Node-port tasks are the real cost).
4. Resolving the **open absorption detail** (registry-gated + contract-typed surface, not "any tool by name").

**Decision membrane path (unchanged from RFC):** this spec → review memo
(`docs/project/<date>-review-eval-capability-substrate-rfc.md`) → ADR (`docs/adr/`, citing an AK decision) →
**AK decision as runtime authority**. Implementation phases then execute through the measured/autoresearch
campaign substrate (repo ADR mandate: no unmeasured controller patches). **FCOS is not required** (RFC-decided);
if the operator later judges a persistent-kernel + capability-governance category control-board-significant,
the FCOS-slice pattern is the mechanism, owned by `holdingco/fcos-control-board`.

### Open Phase-1 decisions this spec surfaces (not resolves)

- **JS substrate unification:** port oh-my-pi's worker-core JS path, or evolve pi-code-mode's existing `vm`
  worker to a reused persistent context? (pi-code-mode only needs py+js.)
- **TS transpiler choice** to replace `Bun.Transpiler` (esbuild / swc / tsx) — affects L1 + the compile gate.
- **L4 package boundary:** separate `pi-function-library` (RFC proposal) vs fold into `pi-code-mode`
  (kernel-resident). This spec leans **separate** (single-responsibility; reuse of the contract package) but
  flags it for the review memo.
- **Capability-surface ergonomics:** typed `capabilities` parameter (pic style) vs typed ambient globals
  (omp style, keep `tool.*`). Both are achievable with pic's mechanism; pick in the review.

## Honest boundaries

- **Verified (FACT):** every source capability in the RFC borrow map was traced first-hand or by read-only
  subagent with file:line evidence; the two seams are confirmed with the refinements above.
- **Proposed (not yet built):** the *wiring* — generating a contract from the registry catalog, the Node
  persistent substrate, the TS graph overlay, the headless capability façade. All are grounded in verified
  mechanisms but are Phase-1+ implementation.
- **Not asserted:** that the Node port matches oh-my-pi's observed behavior without measurement (the campaign
  substrate owns that); exact L4 package boundary; FCOS requirements (external authority).

## References (evidence index)

Contrib (study-only):

- `softwareco/contrib/pic/src/typescript/compiler.ts` — `validateSubmission`, `CAPABILITY_CONTRACT`, `PicCapabilities`, `directDependencies`, `resolveDependencyOrder`.
- `softwareco/contrib/pic/src/typescript/functions.ts:129-138,201` — refuse-removal check (`:129`), tombstone append `{deleted:true,name}` (`:138`), `reconstruct` (`:201`).
- `softwareco/contrib/pic/src/page/app.js:4062` — browser-resident capability façade (`__picCapabilities`); `pic/src/typescript/functions.ts` → `chrome.evaluateProgram` (CDP).
- `softwareco/contrib/oh-my-pi/packages/coding-agent/src/eval/js/shared/prelude.txt` — `tool` Proxy, `__omp_call_tool__` hub, bridge globals.
- `softwareco/contrib/oh-my-pi/packages/coding-agent/src/eval/js/tool-bridge.ts` — `callSessionTool` host dispatch.
- `softwareco/contrib/oh-my-pi/packages/coding-agent/src/eval/js/shared/runtime.ts:236-237,415` — eval chokepoint, prelude injection; `wrapCode` Babel + `Bun.Transpiler`.
- `softwareco/contrib/oh-my-pi/packages/coding-agent/src/eval/kernel-base.ts` — `BaseKernel` persistent subprocess, NDJSON frames, SIGINT escalation (Bun-specific).
- `softwareco/contrib/oh-my-pi/packages/coding-agent/src/eval/index.ts` — four backends; py/jl/rb (`BaseKernel`) vs JS (worker-core) substrates.
- `softwareco/contrib/marimo/marimo/_runtime/dataflow/graph.py` — `DirectedGraph` facade; `topology.py`, `definitions.py`, `cycles.py`, `edges.py` — pure data structures + edge algorithm.
- `softwareco/contrib/marimo/marimo/_ast/cell.py:160-170` — AST-derived `variable_data`/`refs`/`defs` (the input-side coupling).
- `softwareco/contrib/marimo/marimo/_code_mode/_context.py:793-808,1185-1212` — dry-run-validate-then-apply, `StaleCellError`; `agent.py` `AgentReadTracker`.

Absorption target (owned):

- `packages/pi-code-mode/src/capability-registry.ts` — runtime effect gate (`invoke`).
- `packages/pi-code-mode/src/types.ts` — `CapabilityEffect` taxonomy.
- `packages/pi-code-mode/src/extension.ts` — `eval` tool, confirmation gate, commands.
- `packages/pi-code-mode/src/kernel-client.ts` — spawn-per-eval engine + host-side JSON state (the part replaced).
- `packages/pi-code-mode/runtime/javascript-kernel.mjs` — `node:vm` sandbox, one-eval-then-exit, `tool` Proxy.
- `packages/pi-code-mode/runtime/protocol-broker.mjs` — NDJSON framing/limiting layer (kept).

Anchor RFC: [2026-08-07-eval-capability-substrate-rfc.md](2026-08-07-eval-capability-substrate-rfc.md).

---
summary: "RFC for a layered agent eval + capability substrate in pi-extensions: a persistent multi-language kernel (ported from oh-my-pi) absorbed into pi-code-mode, pic capability-contract type gating, a marimo-graph-backed saved-function library, and pic reactive artifacts — plus consolidation decisions."
read_when:
  - "Designing or extending agent code-execution, capability-gating, saved-function, or reactive-artifact behavior in pi-extensions."
  - "Deciding the execution substrate for model-authored code and the evolution of pi-code-mode."
type: "rfc"
status: "proposed"
system4d:
  container: "Agent eval + capability substrate in pi-extensions; absorbs pi-code-mode as the kernel home and adds capability-contract gating, a saved-function dependency library, and reactive artifacts."
  compass: "One typed, persistent, multi-language execution substrate whose capability surface is contract-gated before execution, with durable agent-built functions and interactive artifacts — taking the best of pic, oh-my-pi, marimo, and rat for the right reasons, not just because."
  engine: "Phase 0 port/merge spec -> port oh-my-pi TS kernel into pi-code-mode -> pic capability-contract on the host bridge -> marimo DirectedGraph for function dependencies -> pic reactive artifacts; governed RFC -> review -> ADR -> AK decision -> measured/autoresearch phased implementation."
  fog: "Phase 0 CONFIRMED both integration seams with refinements: L3 is a compile gate (pic validateSubmission, in-memory TS program) plus a runtime gate (pi-code-mode effect registry); the L4 graph is marimo's data model populated by pic's own TS dependency resolver (marimo's Python cell compiler and reactive cell-DAG are NOT adopted). Residual risks: oh-my-pi BaseKernel is Bun-coupled (Node reimplementation, not a copy); pic's runtime capability facade and the L5 artifact evaluator are browser-bound (rebuild/reimplement headless); @tryinget/pi-code-mode is a published package (compat/rollback on absorb); AK direction binding pending. Rust-only oh-my-pi capabilities (LSP/DAP, native grep, file isolation, minimizer implementation) remain out of scope."
---

# RFC: Agent eval + capability substrate (pic ⊕ oh-my-pi ⊕ marimo ⊕ rat)
> **Provenance note (2026-08-08, post-ADR):** This RFC was accepted via the [ADR](2026-08-08-eval-capability-substrate.md) (AK decision 114). Phase-1 step 0 has executed: `@tryinget/pi-code-mode` was renamed to `@tryinget/pi-eval-kernel` (commit `0d9a80f0`); `pi-code-mode` references below denote the package now named `pi-eval-kernel`, and current-state path references have been updated. The `eval` tool name is unchanged.

## Problem

A controlled exploration of five `softwareco/contrib` runtimes — `pic`, `oh-my-pi`, `marimo`, `rat`, `activegraph` — alongside the existing `pi-extensions` replay stack (`pi-autoresearch`, `pi-society-orchestrator`) found that the capability we want is **scattered across four repos, each solving one piece well and none solving the whole**:

- **oh-my-pi** built a persistent, multi-language kernel eval runtime with a bidirectional host bridge and rich display, but its host bridge is an **untyped dynamic Proxy** (no type safety) and the whole thing is hand-rolled, dependency-free, and tightly coupled to its own binary.
- **pic** built the **capability-contract type gating** (a generated `.d.ts` that pre-validates tool calls) and a **saved-function dependency library**, but on a dead-end Chrome/DOM substrate.
- **marimo** has the most mature **dependency-graph model** (`DirectedGraph`: defs/refs/cycles/multiply-defined) and a dry-run-validate-then-apply discipline, but is Python-only, heavyweight, reactive-cell-oriented, and has no host bridge.
- **rat** has an elegant **4-tool MCP kernel API** (`run`/`look`/`ctl`/`tail`) and a genuinely novel **shared-namespace-across-clients** thesis, but its `pi` integration is shallow/generic, its `look` is text-only, and RAPL is inbound-perception-only (not a kernel→host callback).

Meanwhile `pi-code-mode` (v0.1.0, zero internal dependents) is already a hand-rolled workaround for exactly the gap oh-my-pi fills — "disposable workers + host-persisted state + a capability registry" — and admits in its own README it exists because Pi has no governed `invokeTool`.

**This is a substrate-gap and a duplication risk:** if we build capability-gating and a function library over disposable workers, we lock ourselves out of the persistence, rich display, and host callbacks that make those features powerful; if we keep `pi-code-mode` and port oh-my-pi, we carry two runtimes.

## Decision requested

Adopt a single **layered agent eval + capability substrate** in pi-extensions that:

1. **Ports oh-my-pi's TypeScript kernel orchestration into `pi-code-mode` as the execution home** (absorb, do not keep two runtimes), borrowing rat's 4-tool surface shape with a structured `look`.
2. **Adds pic's capability-contract type gating** on the host bridge, using marimo's dry-run discipline and `pi-code-mode`'s effect-class taxonomy.
3. **Adds a saved-function library** using marimo's `DirectedGraph` model for dependencies and pic's tombstone/refuse-removal integrity policy, resident in the persistent kernel.
4. **Adds pic's reactive artifacts** as a new output modality.
5. **Consolidates:** keep `pi-agent-interaction-canary` (active WIP), absorb `pi-code-mode`, fold `pi-evidence-review` into `pi-semantic-code-intelligence`.

Govern the work through the repo's standard RFC → review → ADR → AK decision membrane, and implement the phases through the measured/autoresearch campaign substrate (per repo ADR mandate).

## Non-goals

- Not adopting marimo, rat, or oh-my-pi as runtime dependencies. We study/adopt designs; we port TypeScript only.
- Not porting Rust-only capabilities (LSP/DAP, native grep, file isolation, the minimizer implementation) as part of this RFC — those are tracked separately (LSP/DAP is the single biggest capability gap and warrants its own effort).
- Not building the response-replay layer unless the operator confirms agent trace forking/branching is a target workload (the decision/measurement and execution-resume replay layers already exist in pi-autoresearch / pi-society-orchestrator).
- Not changing the `pi-agent-interaction-canary` WIP.

## The integrated design

```
 L5  REACTIVE ARTIFACTS ………………………………………… pic      (interactive output modality)
 L4  SAVED-FUNCTION LIBRARY ………………… pic + marimo     (durable agent-built capability)
 L3  CAPABILITY-CONTRACT GATE …………………… pic + marimo    (type-safety + governance)
 L2  HOST BRIDGE + TOOL SURFACE ……………… OMP + rat      (bidirectional agent <-> kernel)
 L1  PERSISTENT KERNEL SUBSTRATE …………………… OMP        (execution engine)
 L0  EVENT-LOG TRUTH + CONTENT-HASH SPINE …… all        (foundation)
```

### L0 — spine *(take unconditionally)*
Every system studied agrees: **event-log-is-truth, derived views are projections, content-hash is identity, projections are not authority.** pi-autoresearch states this most rigorously ("receipts are projections, not canonical campaign truth"). Adopt that discipline across all layers; it is what keeps the caches and derived state honest.

### L1 — persistent kernel substrate *(oh-my-pi, ported to TS; pi-code-mode is its home)*
Port oh-my-pi's `BaseKernel` + language kernels (`py/jl/rb` + JS worker VM), one `eval` call = one cell, **state persists across calls and SIGINT interrupts** (real `KeyboardInterrupt`, state preserved), **rich MIME display so the model sees images**. Adopt rat's **4-tool API shape** (`run`/`look`/`ctl`/`tail`) as the eval tool surface. **Fix rat's mistake:** make `look` return **structured** `{name, type, shape, value}`, not text columns — this is the single enabler for L3/L4.

*Phase 0 portability note (verified):* oh-my-pi has **two** execution substrates — `BaseKernel` (subprocess + NDJSON frames) for `py/jl/rb`, and a separate worker-core path for JS — and `BaseKernel` is **Bun-specific** (`Subprocess`, `Bun.FileSink`, `proc.exited`) with `wrapCode` relying on `@babel/parser` + `Bun.Transpiler`. Porting to pi-code-mode's Node runtime is a **reimplementation of the IPC/eval loop**, not a source copy (`Bun.Transpiler` → esbuild/swc/tsx; Bun subprocess APIs → `node:child_process` + streams). pi-code-mode ships only **python + javascript**, so the port scope is py (persistent interpreter subprocess, `BaseKernel` pattern) + js (persistent node worker), not all four languages.

### L2 — host bridge + tool surface *(oh-my-pi native bridge + rat shape + marimo observe-split)*
Take oh-my-pi's **native kernel→agent callbacks** (`tool.*`, `agent()`, `parallel()`, `pipeline()`) — the only true bidirectional bridge (rat RAPL is inbound-perception-only; marimo has none). Take marimo `_ai`'s **read-only inspection / observe-without-mutating split**. This is the seam: oh-my-pi built the bridge but left it untyped; that gap is where L3 plugs in.

### L3 — capability-contract type gate *(pic mechanism + marimo discipline + pi-code-mode governance)*
The layer oh-my-pi, rat, and marimo all lack. Phase 0 established that the gate is **two complementary enforcement homes on the host bridge**, not one: a **compile gate** (pic's `validateSubmission` — an in-memory virtual TypeScript program that type-checks the submission against typed capability interfaces via `ts.getPreEmitDiagnostics`, rejecting unknown capabilities / bad params before a cell runs) and a **runtime gate** (pi-code-mode's existing `CapabilityRegistry.invoke`, which throws if a capability's effect is not in the call's `allowedEffects`). The **typed contract is generated from the capability registry catalog** so adding a capability updates the contract and the two cannot drift (design intent — pic's stock contract is a static interface set). Use marimo's **dry-run-validate-then-apply** + `StaleCellError` read-before-write discipline (portable patterns, not marimo's Python impl). The **compile gate** is inserted at the eval chokepoint (oh-my-pi `runtime.ts` `wrapCode`→`indirectEval`; absorbed form: the host→worker eval boundary); the **runtime gate** stays at registry dispatch. Layer `pi-code-mode`'s **effect-class taxonomy** (`read | process | write | network | orchestration`) as capability governance, and pair marimo `capabilities()` **discovery** with pic **enforcement**.

### L4 — saved-function dependency library *(pic functions/tombstones + marimo graph model)*
Phase 0 refined the graph port: take marimo's `DirectedGraph` **data model** (`defs`/`refs`/`parents`/`children`/`variable_owners`/`multiply_defined`/`cycles`) — a facade over four pure data structures (topology adjacency, name→definers registry, cycles set, multiply-defined index) — but **populate it with pic's own existing TS dependency resolver** (`directDependencies`/`resolveDependencyOrder`, which already resolve saved-function edges and detect cycles via the TS type checker). Do **not** port marimo's Python AST cell compiler, and do **not** adopt marimo's reactive cell-DAG execution (a non-goal below); the graph is a **dependency overlay** on the persistent kernel namespace, not inside the kernel eval loop, so **no `BaseKernel` rearchitecture is required**. Take pic's **named saved functions**, **tombstones** (append-only `{deleted}` log), and **refuse-to-remove-if-required** integrity policy (verified in `pic/src/typescript/functions.ts`). Functions persist in the persistent kernel (disposable workers cannot host them) and call back into the agent via the now-typed bridge.

### L5 — reactive artifacts *(pic)*
Take pic's **trade-off explorers** (weighted-sum multi-criteria ranking) and **timeline explorers** (swimlanes), driven by pic's bounded expression mini-language, recomputed locally with no model call. Orthogonal to the stack below; can render L4 function data and replay-layer data for free. *Phase 0 caveat (verified):* pic's artifacts **grammar and validation** (`PicExplorerExpression` in `compiler.ts`) are portable TypeScript, but the **expression evaluator that recomputes on slider change runs in the Chrome page via CDP** (`app.js`); it must be **reimplemented in TS** as a small recursive evaluator. The "local recompute, no model call" property holds only after that reimplementation.

## Borrow map

| Layer | Source | What we take | Right reason |
|---|---|---|---|
| L1 kernel | oh-my-pi `packages/coding-agent/src/eval/` | persistent multi-language kernel, interrupt-safe state, image display | only proven embedded multi-language substrate with these properties |
| L1 surface shape | rat `internal/mcpserver` + `KERNEL-PROTOCOL.md` | 4-tool API (`run`/`look`/`ctl`/`tail`) | elegant minimal agent-drives-kernel shape |
| L1 fix | rat's `look` mistake | structured `{name,type,shape,value}` | type-gate and function library need structured data, not prose |
| L2 bridge | oh-my-pi `eval/js/shared/prelude.txt`, `eval/js/tool-bridge.ts` | `tool.*`/`agent()`/`parallel()`/`pipeline()` callbacks (parallel/pipeline are local JS pools, not sub-agent fan-out) | only native kernel→agent bridge |
| L2 observe split | marimo `_ai/_tools` | read-only inspection surface | clean perceive-without-mutating |
| L3 gate (compile) | pic `src/typescript/compiler.ts` `validateSubmission` | in-memory TS program, pre-execution type-check | type-safety layer all sources lack |
| L3 discipline | marimo `_code_mode/_context.py` | dry-run-validate-then-apply, `StaleCellError` | proven mutation-safety pattern |
| L3 gate (runtime) + governance | pi-code-mode `capability-registry.ts` `invoke` | effect-class admission per eval call (`read/process/write/network/orchestration`) | runtime half of the gate + governance taxonomy |
| L3 discovery | marimo `capabilities()` | entry-point capability discovery | pair discovery with enforcement |
| L4 graph | marimo `_runtime/dataflow/graph.py` (data model) + pic `compiler.ts` `directDependencies` (resolver) | `DirectedGraph` data structures populated by pic's TS dep-resolver | most mature model; port the data structure, not marimo's Python AST or reactive execution |
| L4 integrity | pic `src/typescript/functions.ts` | tombstones, refuse-removal-if-required | function-library integrity policy |
| L5 artifacts | pic `src/typescript/compiler.ts` (grammar/validation: `PicExplorerExpression`) + `src/artifacts.ts` (explorer data models) | trade-off/timeline explorers, bounded expr lang | interactive output modality; evaluator is browser-bound → TS reimplementation |
| L0 spine | all (pi-autoresearch most rigorous) | log=truth, projections-derived, hash-identity | the contract that keeps caches honest |

## Cohesion points (why this is one system, not a parts bin)

1. **The contract has two homes on the host bridge.** A compile gate (pic `validateSubmission`) type-checks submissions before execution; a runtime gate (pi-code-mode effect registry) admits capabilities per call. The untyped `tool.*` Proxy becomes typed at both points. (pic ⊕ oh-my-pi)
2. **Functions persist in the kernel; the graph uses marimo's model; integrity uses pic's policy; callbacks go through the typed bridge.** (pic ⊕ marimo ⊕ oh-my-pi)
3. **Structured `look` is what lets L3 and L4 reason.** rat's 4-tool shape gives the surface; fixing rat's text-only `look` gives the type-gate and dependency library the structured data they need. (rat ⊕ the fix)

## Owner and authority matrix

| Concern | Canonical owner | Role in this substrate |
|---|---|---|
| Kernel execution, host bridge, persistent state, rich display | `pi-code-mode` (absorbed) | Owns L1 + L2; the execution home |
| Capability-contract generation and pre-execution validation | new package (e.g. `pi-capability-contract`) | Owns L3; reusable across tool surfaces |
| Saved-function library, dependency graph, integrity | new package (e.g. `pi-function-library`) | Owns L4; depends on `pi-code-mode` + the contract package |
| Interactive artifacts | new package (e.g. `pi-reactive-artifacts`) | Owns L5; independent |
| Replay (decision/measurement/resume) | `pi-autoresearch`, `pi-society-orchestrator` | Already present; response-replay added only if forking becomes a target |
| Task, decision, evidence, lineage | AK | Runtime authority for the decision membrane |
| Designs we study but do not depend on | `pic`, `oh-my-pi`, `marimo`, `rat`, `activegraph` (contrib) | Reference implementations; ported designs only, never runtime deps |

## Consolidation

- **Keep** `pi-agent-interaction-canary` — active WIP, not dead scratch.
- **Absorb** `pi-code-mode` → it becomes L1+L2's home (retain its effect-class taxonomy for L3). No second runtime. `@tryinget/pi-code-mode` is a **published** package (npm, public): the engine swap from disposable-workers to a persistent substrate is a **major-version change**; the disposable engine is the **rollback fallback**, and Phase 1 should land the persistent substrate **feature-flagged behind the existing engine** until measured. Migration owner: `pi-code-mode`.
- **Fold** `pi-evidence-review` → `pi-semantic-code-intelligence` as a `/evidence-review` sub-command. *Verified (Phase 0 review):* `pi-evidence-review`'s data model already carries the schema id `semantic-code-intelligence.evidence_review.v1` (`src/validation.ts`), so the format is already SCI-namespaced by convention; the fold makes it first-class. The two packages share no code dependency today (the sharing is by schema convention), so the fold also introduces the shared type. Migration owner: `pi-semantic-code-intelligence`; existing `/evidence-review` callers keep their surface.

## Packaging

- **L1 + L2 → evolve `pi-code-mode` in place** (absorb). Not a new package.
- **L3 → new package** `pi-capability-contract` — reusable validation layer that can gate any tool surface, not just the kernel.
- **L4 → new package** `pi-function-library` — *judgment call:* kernel-resident, so it could alternatively fold into `pi-code-mode`; this RFC proposes separate for single-responsibility and reuse.
- **L5 → new package** `pi-reactive-artifacts` — independent output modality.

All new packages scaffold from `../pi-extensions-template` (`scaffold_mode=simple-package`), with `.copier-answers.yml` tracked, per the repo's own `AGENTS.md` rule. Per that rule, packages that do **not** expose a live extension surface (`package.json#pi.extensions` / `pi.prompts`) must record the exception in their package-local `AGENTS.md`/README: `pi-capability-contract` is a **support library** (no live extension; consumed by `pi-code-mode` and other tool surfaces); `pi-function-library` is a **support library** (kernel-resident, consumed via `pi-code-mode`); `pi-reactive-artifacts` is a **live extension** (exposes artifact tools/prompts to the agent).

## Portability boundary

- **Portable (TypeScript, as designs):** the kernel orchestration (`BaseKernel`, language kernels, runner scripts), the host bridge, pic's contract + dependency-graph logic, the minimizer *concept*, snapcompact's *concept*. **Caveat (verified Phase 0):** `BaseKernel` and the JS `wrapCode` path are **Bun-coupled** (`Subprocess`, `Bun.FileSink`, `Bun.Transpiler`); "port" here means **reimplement the orchestration on Node** (`node:child_process` + streams; esbuild/swc/tsx for the TS strip), not copy the source.
- **Not portable (Rust):** oh-my-pi's native core (AST-edit/ast-grep, native grep, file isolation `pi-iso`), the minimizer/snapcompact *implementations*, LSP/DAP servers. Reimplement the ideas in TS or defer. **Highest-ROI Rust idea to reimplement in TS:** the shell-output minimizer (token-saving, self-contained). **Biggest separate capability gap:** LSP (14 ops) + DAP (28 ops) — scope as its own effort.

## Cross-cutting / optional capabilities

| Capability | Source | When to take it |
|---|---|---|
| Shared namespace across clients/sessions/sub-agents | rat (its most novel idea) | if multiple tools or sub-agents should share one persistent kernel namespace |
| Shell-output minimizer | oh-my-pi | high-ROI, portable to TS; cuts context bloat |
| Snapcompact vision-compaction | oh-my-pi | novel compaction strategy; evaluate separately |
| Response replay | activegraph (`turn_hash`/`args_hash`) | only if agent trace forking/branching is a target workload |
| LSP + DAP | oh-my-pi | biggest capability gap; separate effort |

## Alternatives considered

- **Port oh-my-pi eval only, no type gating.** Rejected: leaves the untyped-Proxy footgun and forgoes the headline power-up (capability-contract gating).
- **Adopt marimo as the substrate.** Rejected: Python-only (regression), heavyweight server+session model, reactive-cell-DAG paradigm mismatch, no native host bridge. marimo's graph model is taken as a library concept, not the substrate.
- **Adopt rat as an external MCP substrate.** Rejected as substrate: shallow/generic `pi` integration (`internal/pi` is dead code; `pi→rat` has no native bridge), text-only `look`, no kernel→host callback, external-binary dependency model. rat's 4-tool shape and shared-namespace thesis are taken as design ideas.
- **Build the kernel from scratch in TS.** Rejected: reimplements what oh-my-pi already proved, at higher cost and lower maturity.
- **Keep `pi-code-mode` as a second runtime.** Rejected: duplication; absorb instead.

## Phased delivery

- **Phase 0 — port/merge spec (DONE).** Traced oh-my-pi `BaseKernel` + the `tool.*` prelude + `pi-code-mode`'s capability registry; produced the concrete L1+L2 port plan, the exact L3 contract-injection point (two gates), and resolved the `pi-code-mode` absorption call. Artifact: [Phase 0 spec](2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md); review: [review memo](2026-08-08-review-eval-capability-substrate-rfc.md). Both seams CONFIRMED with refinements.
- **Phase 1 — L1 kernel substrate.** Port oh-my-pi TS kernel into `pi-code-mode` (Node reimplementation; py + js only); adopt rat 4-tool shape with structured `look`. *Acceptance (executable):* a persistent py and js kernel each survive a SIGINT interrupt with state intact; `look` round-trips structured `{name,type,shape,value}`; the existing disposable engine remains available behind a flag.
- **Phase 2 — L3 capability-contract gate.** pic compile gate (contract generated from the registry) + the existing runtime effect gate; marimo dry-run/staleness patterns. The headline power-up. *Acceptance:* an unknown capability or malformed param is rejected before execution; an effect not in `allowedEffects` is rejected at dispatch.
- **Phase 3 — L4 saved-function library.** marimo graph data model + pic resolver + pic tombstones over the persistent kernel. *Acceptance:* removing a required function is refused; a new cycle / multiply-defined is rejected at save (dry-run-validate-then-apply).
- **Phase 4 — L5 reactive artifacts.** New output modality (evaluator reimplemented in TS). *Acceptance:* a tradeoff explorer recomputes ranking locally on a control change with no model call.
- **Parallel/optional:** shared-namespace mode, minimizer, snapcompact, LSP/DAP.

## Governance and decision path

- **Decision membrane:** this RFC → review memo ([2026-08-08 review](2026-08-08-review-eval-capability-substrate-rfc.md), **done**) → ADR (`docs/adr/`, citing an AK decision) → **AK decision as runtime authority**.
- **Direction binding (D2E):** this RFC is **intended to bind under `AK.V5.SF07`** ("Converge the AI Society prompt operating system from governed direction to measured execution"), either as a child implementation wave or a new sub-frame; the exact AK direction link is established at ADR time (AK direction/task mutation is an operator-authorized step, not done in this revision). Note: `ak direction check` currently reports an unrelated drift (`IW8`/task `#4164`) owned by the Prompt Vault→Pi path — not this RFC's to repair.
- **FCOS:** not required on this RFC's read. This work is architecture-significant but pi-extensions-local; FCOS is reserved for cross-cutting control-board carriers/slices (precedent: `context-window-packer-fcos-slice`). If the operator considers introducing a persistent-kernel + capability-governance category to be control-board-significant, the FCOS-slice pattern is the mechanism. FCOS authority lives in `holdingco/fcos-control-board`.
- **Implementation mandate:** per existing repo ADRs, *"Implementation of this ADR must itself be run through the current measured/autoresearch campaign substrate, not as a single unmeasured controller patch."* The phases execute through `pi-autoresearch` / `pi-society-orchestrator`.

## Honest boundaries

- **Verified:** every source capability in the borrow map is real and was traced in the contributing repos during exploration.
- **Phase 0 CONFIRMED (with refinements):** both integration seams. pic's compile-time contract mechanism grafts onto the eval chokepoint (it is two gates, not one); marimo's graph ports as a data model populated by pic's TS resolver (no kernel rearchitecture). See the [Phase 0 spec](2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md).
- **Proposed (not yet built):** the wiring — Node persistent substrate, contract generated from the registry, TS graph overlay, headless capability facade. Grounded in verified mechanisms; Phase 1+ implementation.
- **Not asserted:** that the Node port matches oh-my-pi's observed behavior without measurement (the campaign substrate owns that); exact L4 package boundary (judgment call); FCOS requirements (reasoned from pi-extensions usage pattern; FCOS authority is external).

## Open questions

1. Does the operator want the L4 function library as a separate package or folded into `pi-code-mode`? (RFC proposes separate.)
2. Is agent trace forking/branching a target workload? If yes, add response-replay (activegraph model); if no, skip it.
3. Is the shared-namespace-across-clients capability (rat's thesis) a target? If yes, it shapes L1's session model.
4. LSP/DAP scope and timing — separate RFC/effort, but its presence affects how much of oh-my-pi's surface we ultimately mirror.
5. **Capability ergonomics:** typed `capabilities` parameter (pic style) vs typed ambient `tool.*` globals (oh-my-pi style)? Both are achievable with pic's compile-gate mechanism; pick at ADR time.
6. **JS substrate + transpiler:** port oh-my-pi's worker-core JS path, or evolve pi-code-mode's existing `node:vm` worker to a reused persistent context? And which TS transpiler replaces `Bun.Transpiler` (esbuild / swc / tsx)?

## References

- Source runtimes (study only, not runtime deps): `softwareco/contrib/{pic,oh-my-pi,marimo,rat,activegraph}`
- Existing replay layers: `packages/pi-autoresearch`, `packages/pi-society-orchestrator`
- Absorption target: `packages/pi-eval-kernel` (renamed from `packages/pi-code-mode` in Phase-1 step 0, commit `0d9a80f0`)
- Fold target: `packages/pi-semantic-code-intelligence` (absorbs `pi-evidence-review`)
- New-package template: `../pi-extensions-template` (`scaffold_mode=simple-package`)
- Decision lifecycle: `~/ai-society/holdingco/governance-kernel/docs/dev/decision-lifecycle.md`
- Phase 0 port/merge spec: [2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md](2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md)
- Review memo: [2026-08-08-review-eval-capability-substrate-rfc.md](2026-08-08-review-eval-capability-substrate-rfc.md)

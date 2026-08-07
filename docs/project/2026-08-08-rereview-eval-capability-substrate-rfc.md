---
summary: "Independent re-review (new review attempt) of the REVISED eval-capability-substrate RFC against the 2026-08-08 review memo's must-fix list, with first-hand re-verification of the Phase-0 file:line evidence in the contrib + owned repos. Outcome: ready_for_adr."
read_when:
  - "Deciding whether the revised eval-capability-substrate RFC is cleared to become an ADR."
  - "Auditing the must-fix closure and the independent file:line re-verification behind the ADR legality."
type: "review"
status: "complete"
system4d:
  container: "Second review attempt in the eval-capability-substrate RFC -> review -> ADR -> AK membrane; evaluates the revised RFC, not the original."
  compass: "Do not rubber-stamp the prior review's must-fix closure; verify each fix against the revised RFC text and re-trace the load-bearing Phase-0 evidence first-hand before ADR legality."
  engine: "read revised RFC end-to-end -> map review-memo must-fix list + nice-to-haves + forced questions -> independent file:line re-verification of contrib/owned code -> re-apply required checklist -> emit explicit outcome token + legal next move."
  fog: "All eight must-fix verification points are folded into the revised RFC and confirmed against source. Two non-material observations remain: a few Phase-0 spec line-number citations have drifted against the current checkout (mechanisms still verified real), and one RFC borrow-map row is imprecise about which pic file holds the L5 grammar. Neither blocks ADR contracts, which are mechanism-level and verified."
---

# Re-review: eval-capability-substrate RFC (revised)

This is a **new, immutable review attempt** against the **revised** RFC
[2026-08-07-eval-capability-substrate-rfc.md](2026-08-07-eval-capability-substrate-rfc.md) (status `proposed`, revised after the first review round).
It evaluates whether the must-fix list from the first review —
[2026-08-08-review-eval-capability-substrate-rfc.md](2026-08-08-review-eval-capability-substrate-rfc.md),
verdict `revise before ADR` — is actually closed, and whether the revised RFC is ADR-clean.
Per the decision-lifecycle contract, the prior review attempt remains historical evidence and is not overwritten.

Evidence base: the revised RFC, the first review memo, and the
[Phase 0 port/merge spec](2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md),
**plus first-hand re-verification** of the load-bearing Phase-0 `file:line` citations against the
current checkout of `softwareco/contrib/{pic,oh-my-pi,marimo}` and the owned `packages/pi-code-mode`
and `packages/pi-evidence-review` (re-traced this session, not taken on the spec's word).

## Overall verdict

**ready_for_adr.**

- Every item on the first review's **must-fix** list is folded into the revised RFC and confirmed against the cited sections (verified below).
- The **nice-to-haves** the review flagged are also folded in (per-phase executable acceptance criteria; live-vs-support-library clarification; Phase-1 feature-flag).
- The **forced questions** are answered by the revised RFC text (verified below).
- Independent file:line re-verification **confirms every load-bearing mechanism** the Phase-0 spec relies on. Two **non-material** observations remain (below); neither touches an ADR-level contract, which is mechanism-level and verified.
- Legal next move: **write the ADR** (`docs/adr/<date>-eval-capability-substrate.md`, citing an AK decision created under a separate operator-authorized step).

This is not a rubber stamp: the re-review re-opened the contrib trees and the owned packages and re-derived the evidence. The direction is sound, the seams are confirmed, and the contracts the ADR will commit are grounded in verified mechanisms, not README claims.

## Must-fix verification (against the revised RFC text)

Map: the first review's six must-fixes expand to eight verification points (its must-fix #1 bundles three Phase-0 refinements). Each is checked against the revised RFC.

### 1. Two-gate L3 (compile `validateSubmission` + runtime `invoke`) — CLOSED

- **L3 section:** "the gate is **two complementary enforcement homes on the host bridge**, not one: a **compile gate** (pic's `validateSubmission` — an in-memory virtual TypeScript program … `ts.getPreEmitDiagnostics` …) and a **runtime gate** (pi-code-mode's existing `CapabilityRegistry.invoke`, which throws if a capability's effect is not in the call's `allowedEffects`)." Names the compile-gate injection point (oh-my-pi `runtime.ts` `wrapCode`→`indirectEval`; absorbed form: the host→worker eval boundary).
- **Borrow map:** two distinct rows — "L3 gate (compile) | pic `compiler.ts` `validateSubmission`" and "L3 gate (runtime) + governance | pi-code-mode `capability-registry.ts` `invoke`". No longer a singular "gate" row.
- **Cohesion point 1:** "The contract has two homes on the host bridge. A compile gate (pic `validateSubmission`) type-checks submissions before execution; a runtime gate (pi-code-mode effect registry) admits capabilities per call."
- **Source re-verification (FACT):** pic `src/typescript/compiler.ts` — `CAPABILITY_CONTRACT` (line 15), `validateSubmission` (line 241), `directDependencies` (line 374), `resolveDependencyOrder` (line 450). pi-code-mode `src/capability-registry.ts` — `invoke` (line 45), effect check `if (!context.allowedEffects.has(capability.effect)) throw` (lines 60–62). Effect taxonomy `src/types.ts:5` = `"read" | "write" | "process" | "network" | "orchestration"`. Both gates are real.

### 2. L4 graph = marimo data model + pic resolver; no cell compiler / reactive DAG; no kernel rearchitecture — CLOSED

- **L4 section:** "take marimo's `DirectedGraph` **data model** … but **populate it with pic's own existing TS dependency resolver** … Do **not** port marimo's Python AST cell compiler, and do **not** adopt marimo's reactive cell-DAG execution … the graph is a **dependency overlay** on the persistent kernel namespace, not inside the kernel eval loop, so **no `BaseKernel` rearchitecture is required**."
- **Borrow map L4 row:** "marimo `graph.py` (data model) + pic `compiler.ts` `directDependencies` (resolver) | `DirectedGraph` data structures populated by pic's TS dep-resolver | most mature model; port the data structure, not marimo's Python AST or reactive execution."
- **Source re-verification (FACT):** marimo `_runtime/dataflow/graph.py` `DirectedGraph` (line 32) is a facade over `MutableGraphTopology` (topology), `DefinitionRegistry` (definitions/multiply_defined), `CycleTracker` (cycles) — no AST in the graph itself. pic `functions.ts` uses `directDependencies(source, registry)` (line 129) for its refuse-removal check. Load-bearing "no reactive DAG" statement is present at the borrow-map line, not only in non-goals, as the forced question required.

### 3. BaseKernel Bun-coupling + Node-reimplementation cost + two JS substrates + py/js-only scope — CLOSED

- **L1 "Phase 0 portability note (verified)":** names the two substrates (BaseKernel for py/jl/rb vs a separate JS worker-core), `BaseKernel` is Bun-specific, the port is a **reimplementation of the IPC/eval loop, not a source copy**, and pi-code-mode ships only **python + javascript** so the port scope is py + js, not all four languages.
- **Portability boundary:** "`BaseKernel` and the JS `wrapCode` path are **Bun-coupled** (`Subprocess`, `Bun.FileSink`, `Bun.Transpiler`); 'port' here means **reimplement the orchestration on Node** (`node:child_process` + streams; esbuild/swc/tsx for the TS strip), not copy the source."
- **Source re-verification (FACT):** oh-my-pi `eval/kernel-base.ts:2` `import type { Subprocess } from "bun"`; `:140` `Bun.FileSink`; `:157` `proc.exited`. pi-code-mode `src/types.ts:3` `CodeModeLanguage = "javascript" | "python"`; `src/extension.ts:26` enum `["python", "javascript"]`; runtime ships only `javascript-kernel.mjs` + `python-kernel.py` (no jl/rb). The "py+js only" scope claim is verified, not assumed.

### 4. L5 browser-bound evaluator caveat (evaluator = TS reimplementation; grammar/validation portable) — CLOSED

- **L5 section:** "pic's artifacts **grammar and validation** (`PicExplorerExpression` in `compiler.ts`) are portable TypeScript, but the **expression evaluator that recomputes on slider change runs in the Chrome page via CDP** (`app.js`); it must be **reimplemented in TS** as a small recursive evaluator. The 'local recompute, no model call' property holds only after that reimplementation."
- **Source re-verification (FACT):** pic `compiler.ts:27` defines `PicExplorerExpression` (the bounded-expression AST/grammar). pic `app.js` defines the browser-resident capability facade `Object.defineProperty(globalThis, "__picCapabilities", …)` (browser-bound; see observation O1 on the exact line). The "evaluator is browser-bound → TS reimplementation" caveat is grounded.

### 5. `tool-bridge.ts` path corrected; `parallel()`/`pipeline()` noted as local JS pools — CLOSED

- **Borrow map L2 bridge row:** source path now `eval/js/shared/prelude.txt`, `eval/js/tool-bridge.ts` (the corrected path); right-reason cell adds "(parallel/pipeline are local JS pools, not sub-agent fan-out)".
- **Source re-verification (FACT):** `find` confirms `oh-my-pi/.../eval/js/tool-bridge.ts` exists at `eval/js/` (not `eval/js/shared/`); `callSessionTool` (line 110) and `getTool` (line 39) are present there. The first review's must-fix #3 was correct; the revised RFC cites the right path.

### 6. Published-package compat + rollback + feature-flag + migration owner for the absorb — CLOSED

- **Consolidation "Absorb pi-code-mode":** "`@tryinget/pi-code-mode` is a **published** package (npm, public): the engine swap from disposable-workers to a persistent substrate is a **major-version change**; the disposable engine is the **rollback fallback**, and Phase 1 should land the persistent substrate **feature-flagged behind the existing engine** until measured. Migration owner: `pi-code-mode`."
- **Phased delivery Phase 1 acceptance:** "the existing disposable engine remains available behind a flag."
- **Source re-verification (FACT):** `pi-code-mode/package.json` `name = "@tryinget/pi-code-mode"`, `version = "0.1.0"` (a published package). The "published → semver event" posture is grounded; rollback + feature-flag + owner are all named.

### 7. Fold rationale cited with verified evidence + the no-shared-code nuance — CLOSED

- **Consolidation "Fold pi-evidence-review":** "Verified (Phase 0 review): `pi-evidence-review`'s data model already carries the schema id `semantic-code-intelligence.evidence_review.v1` (`src/validation.ts`), so the format is already SCI-namespaced by convention; the fold makes it first-class. The two packages share no code dependency today (the sharing is by schema convention), so the fold also introduces the shared type. Migration owner: `pi-semantic-code-intelligence`; existing `/evidence-review` callers keep their surface."
- **Source re-verification (FACT):** `pi-evidence-review/src/validation.ts:18` `schema: "semantic-code-intelligence.evidence_review.v1"`. `pi-semantic-code-intelligence/src` does **not** import the evidence-review type (no shared code dependency today). The claim is verified with the exact nuance the first review required (substantially true at the schema level; sharing is by convention; the fold introduces the shared type).

### 8. AK direction binding stated as intent (operator-authorized to actually bind) — CLOSED

- **Governance "Direction binding (D2E)":** "this RFC is **intended to bind under `AK.V5.SF07`** … either as a child implementation wave or a new sub-frame; the exact AK direction link is established at ADR time (AK direction/task mutation is an operator-authorized step, not done in this revision). Note: `ak direction check` currently reports an unrelated drift (`IW8`/task `#4164`) owned by the Prompt Vault→Pi path — not this RFC's to repair."
- This is the correct posture: direction binding is **stated as intent** (so the ADR traces to durable intent) without performing the operator-authorized AK mutation. The unrelated `IW8`/`#4164` drift is correctly scoped out.

## Nice-to-haves (also folded into the revised RFC)

- **Per-phase executable acceptance criteria** — present for all four phases (Phase 1: SIGINT-survival + structured-`look` round-trip + disposable engine behind a flag; Phase 2: unknown capability/malformed param rejected before execution + disallowed effect rejected at dispatch; Phase 3: refuse removal of a required function + reject new cycle/multiply-defined at save; Phase 4: local recompute on control change with no model call).
- **Live-vs-support-library clarification** — Packaging section states `pi-capability-contract` = support library, `pi-function-library` = support library, `pi-reactive-artifacts` = live extension, and records the AGENTS-exception obligation for support libraries.
- **Phase-1 feature-flag** — folded into must-fix #6 above.

## Forced questions — answered by the revised RFC

- **L3 generation direction (does adding a capability update the contract)?** RFC: "The typed contract is generated from the capability registry catalog so adding a capability updates the contract and the two cannot drift (**design intent** — pic's stock contract is a static interface set)." The generation direction is stated and the honest nuance (pic's stock contract is static; generation-from-registry is the proposal) is disclosed. The Phase-0 spec PROPOSAL (L3 wiring) confirms the same direction.
- **L4 "no reactive cell-DAG" load-bearing?** Yes — stated inside the L4 borrow-map line and the L4 section, not only in non-goals.
- **Consolidation migration owners + `/evidence-review` surface continuity?** pi-code-mode owns the absorb engine swap; pi-semantic-code-intelligence owns the fold; "existing `/evidence-review` callers keep their surface."
- **Direction node?** SF07 child wave / new sub-frame, stated as intent.
- **Published compat posture?** Major-version change, feature-flagged, disposable engine fallback, owner named.

## Required checklist (re-applied)

| Check | Status |
|---|---|
| problem framing evidence-backed | yes |
| options fairly represented | yes |
| preferred direction explicit | yes |
| stable core vs adapter boundary clear | yes (after two-gate + graph + Bun-coupling refinements, now in the RFC) |
| contracts specific enough to test | yes at ADR-direction level; wire-level test contracts correctly deferred to Phase 1 |
| migration and rollback realistic | yes (major-version + feature-flag + disposable fallback + owners) |
| docs/template claims match rendered behavior | yes (live-vs-support clarification folded in) |
| validation relies on executable checks | yes (per-phase acceptance criteria folded in) |
| open questions are real | yes (six real open questions; the load-bearing ones surfaced as ADR-time decisions) |
| recommendation actionable | yes |

## Independent file:line re-verification of the Phase-0 evidence

Re-traced this session against the current checkout. **Every load-bearing mechanism is confirmed real.** Two **non-material** observations about citation precision (not mechanism accuracy):

- **O1 — Phase-0 spec line-number drift in the pic evidence index (non-material).** The spec cites `pic/src/page/app.js:2304-2307` for the browser-resident capability facade `__picCapabilities`; the actual definition in the current checkout is `app.js:4062` (lines ~2304 are unrelated DOM control-creation code). The spec cites `pic/src/typescript/functions.ts:80-89` (and `:80-112`) for the tombstone / refuse-removal-if-required policy; the actual refuse-removal check is `functions.ts:129` (`directDependencies(...).includes(name)`) → refusal message `:135` → tombstone append `{ deleted: true, name }` `:138` → `reconstruct` replay `:201`. The spec cites `pi-evidence-review src/validation.ts:17` for the schema id; the actual line is `:18`. The spec cites the oh-my-pi eval chokepoint as `runtime.ts:236→237`; the current checkout is `:237` (`wrapCode(code)`) → `:238` (`indirectEval(...)`). **In every case the mechanism is verified real and accurately characterized; only the line numbers have drifted** (the Phase-0 spec is read-only investigation and the checkout has moved under it). This is a documentation-precision observation on the *evidence index*, not on the revised RFC or on any ADR contract.
- **O2 — RFC borrow-map L5 row is imprecise about the source file (non-material).** The L5 row attributes "grammar/validation" to `pic src/artifacts.ts`; the `PicExplorerExpression` grammar/AST type actually lives in `compiler.ts:27` (the RFC's own L5 body text correctly says `compiler.ts`). `artifacts.ts` holds the explorer **data models** (`TradeoffExplorerDefinition`, `TimelineExplorerDefinition`, `ExplorerExpression`) — also genuinely relevant to L5 — but it does not define `PicExplorerExpression`. The body text is correct; only the table cell is imprecise. No ADR contract depends on the table cell.

Neither O1 nor O2 is a material must-fix for the RFC: the RFC commits **mechanism-level** contracts (two-gate L3; graph = data model + pic resolver; Node reimplementation of the Bun IPC loop; py+js scope; L5 evaluator = TS reimplementation), and every mechanism is verified first-hand. O1 is best resolved as a Phase-0 spec refresh (a separate, low-priority housekeeping step, not an ADR blocker); O2 is a one-line borrow-map edit that can ride along with any future RFC touch.

## Residual must-fixes

**None material.** The only residuals are the two non-material citation-precision observations above. They do not block ADR legality, do not under-specify any committed contract, and do not require a further RFC revision round before the ADR.

## Outcome token and legal next move

- **Outcome:** `ready_for_adr`
- **Legal next move:** write `docs/adr/<date>-eval-capability-substrate.md`, citing (a) this revised RFC, (b) the first review memo, (c) this re-review, and (d) the Phase-0 spec as evidence, and encoding the Phase-0 refinements as committed contracts. The ADR cites an **AK decision**; creating the AK decision and binding the `AK.V5.SF07` direction node are operator-authorized steps staged at the end of the ADR, not performed by this review or by the ADR text itself.

## References

- Reviewed artifact (revised): [2026-08-07-eval-capability-substrate-rfc.md](2026-08-07-eval-capability-substrate-rfc.md)
- First review attempt (historical): [2026-08-08-review-eval-capability-substrate-rfc.md](2026-08-08-review-eval-capability-substrate-rfc.md)
- Phase-0 evidence: [2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md](2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md)
- Decision lifecycle: `~/ai-society/holdingco/governance-kernel/docs/dev/decision-lifecycle.md`

---
summary: "Architecture review of the eval-capability-substrate RFC from three lenses (core architecture & semantics; portability & external-reuse boundary; runtime authority, governance & consolidation). Verdict: revise before ADR (light). Backed by first-hand Phase 0 file:line evidence."
read_when:
  - "Deciding whether the eval-capability-substrate RFC is ready to become an ADR."
  - "Reviewing the must-fix list and cross-cutting contradictions surfaced for the RFC revision."
type: "review"
status: "complete"
system4d:
  container: "Three-lens architecture review of the eval-capability-substrate RFC, the review-memo step of the RFC -> review -> ADR -> AK membrane."
  compass: "Decide whether the RFC is ADR-clean, evidence-based, and free of material contradictions before the ADR locks contracts."
  engine: "read RFC + Phase 0 spec -> pick 3 non-overlapping lenses -> apply the required checklist -> force a decision-grade verdict -> must-fix list."
  fog: "Direction is sound and Phase 0 confirmed both seams; the RFC is not ADR-clean because the borrow map and portability table under-state L3 (two gates), the BaseKernel Bun-coupling, and the browser-bound L5 evaluator, and two governance seams (fold rationale, direction binding) needed closing. Fold rationale was resolved during review (verified SCI-namespaced schema)."
---

# Review: eval-capability-substrate RFC
> **Provenance note (2026-08-08):** This review was conducted when the package was named `pi-code-mode`; it has since been renamed to `pi-eval-kernel` (Phase-1 step 0, commit `0d9a80f0`). References to `pi-code-mode` in the findings below are historically accurate for this review event and denote the package now named `pi-eval-kernel`. Per the decision-lifecycle immutability rule for review attempts, the findings are preserved unchanged.

Reviews [2026-08-07-eval-capability-substrate-rfc.md](2026-08-07-eval-capability-substrate-rfc.md),
with first-hand evidence from the [Phase 0 port/merge spec](2026-08-08-eval-capability-substrate-phase0-port-merge-spec.md).
Three non-overlapping lenses; the required checklist is applied throughout.
Target architecture, transitional compatibility, and migration mechanics are kept separate.

## Overall verdict
**revise before ADR** — direction is sound and both *proposed* seams are now Phase-0 confirmed, but the borrow map and portability table contain material inaccuracies that would under-specify the ADR's contracts; a light revision folds them in.

---

## Lens 1 — Core architecture & semantics

**strengths**
- L0–L5 layering is coherent; each layer has one defensible job; the three cohesion points argue this is one system, not a parts bin.
- Every borrow-map entry is grounded in a traced source capability; Phase 0 confirms the items it checked.
- The absorb removes a real duplication: Phase 0 **verified** pi-code-mode is disposable-per-eval (`KernelClient.#runNow` spawns a fresh child + round-trips host-side JSON state), exactly the gap oh-my-pi fills.

**risks**
- L3 is framed as a singular gate. Phase 0 shows **two complementary homes**: a *compile* gate (pic `validateSubmission`, in-memory TS program) and a *runtime* gate (pi-code-mode `CapabilityRegistry.invoke` effect check). The RFC lists effect classes separately as "governance," blurring that they are the runtime half of one enforcement surface.
- L4 borrow map says "marimo DirectedGraph — don't reimplement." Phase 0 refines this: port the graph **data model**, populate it with **pic's own TS dep-resolver**, and explicitly do not adopt marimo's reactive cell-DAG (consistent with the RFC non-goal, but not stated at the borrow-map line).

**must-fix**
- Restate L3 as two gates (borrow-map rows + cohesion point 1).
- Restate the L4 graph line as "marimo data model + pic resolver, overlay on the kernel, no rearchitecture."

**evidence quality** — strong; refinements are sharpenings, not refutations.

## Lens 2 — Portability & external-reuse boundary

**strengths**
- The study-only invariant is stated forcefully and repeatedly — the highest-leverage invariant, unambiguous.
- The TS-vs-Rust split is concrete; LSP/DAP correctly deferred as the biggest separate gap.
- Phase 0 strengthens the boundary: pic's compile-time contract mechanism is portable TS; the graph data model ports without Python AST.

**risks**
- The **portability table overstates portability** in two Phase-0-refuted places: (a) `BaseKernel` is **Bun-specific** (`Subprocess`, `Bun.FileSink`, `proc.exited`; `wrapCode` uses `@babel/parser` + `Bun.Transpiler`) — a Node **reimplementation**, not a copy; (b) oh-my-pi has **two JS substrates** (BaseKernel NDJSON for py/jl/rb; separate worker-core for JS), and pi-code-mode needs only py+js.
- **L5 has an unstated browser-bound trap:** the artifacts *evaluator* (local recompute on slider change) runs in the Chrome page via CDP; "local recompute" holds only after a **TS reimplementation**. Grammar/validation are portable.
- Minor path error: RFC cited `eval/js/shared/tool-bridge.ts`; the file is at `eval/js/tool-bridge.ts`.

**must-fix**
- Add Bun-coupling + two-substrate caveats to the portability table; name the Node-reimplementation cost.
- Add the browser-bound caveat to L5.

**evidence quality** — invariant strong; per-item portability claims partially refuted by Phase 0.

## Lens 3 — Runtime authority, governance & consolidation

**strengths**
- Owner/authority matrix is explicit and correct; FCOS-not-required reasoning is sound and cites precedent.
- Measured-campaign implementation mandate is correct per repo ADR.

**risks**
- **D2E / direction binding gap:** governance ends at "AK decision" but the RFC binds to **no** AK direction node (`ak direction export` confirms; `SF07` is thematically adjacent but unlinked). Separately, `ak direction check` currently fails on an unrelated node (`IW8`/task `#4164`) — not this RFC's to repair.
- **Transitional compat for the absorb is unstated:** `@tryinget/pi-code-mode` is a *published* package (npm, public); the engine swap is a major/semver event with no stated compat posture, rollback, or migration owner.
- **Consolidation migration ownership** is not assigned per decision.

**must-fix**
- State the RFC's intended AK direction binding (so the ADR traces to durable intent).
- State compat/rollback + migration owner for the published-package absorb.

**evidence quality** — authority matrix + mandate strong; direction binding + transitional compat weak.

> **Fold rationale — RESOLVED during review (verified).** The RFC claimed pi-evidence-review and pi-semantic-code-intelligence "already share the SCI evidence format." Verified: `pi-evidence-review`'s `EvidenceReview` type carries schema id `semantic-code-intelligence.evidence_review.v1` (`src/validation.ts:17`) — the format is **already SCI-namespaced by convention**. However the two packages **share no code dependency** today (SCI does not import the type); the sharing is by schema convention. So the claim is *substantially true at the schema level* and the fold makes a convention first-class (and introduces the shared type). Downgraded from "insufficient evidence" to "verified with a stated nuance."

## Cross-cutting contradictions
- **Portability claim vs actual coupling:** table marks kernel orchestration portable TS; `BaseKernel` is Bun-coupled. Invariant holds; the table entry is inaccurate.
- **"One gate" framing vs two-gate reality:** L3 reads as a single pre-validation gate; Phase 0 shows compile-gate + runtime-gate.
- **L5 "local recompute" vs browser-bound evaluator:** the benefit is real but the mechanism is a TS reimplementation, not a port.
- **Governance completeness:** "AK decision as authority" is stated, but the *direction* layer above it and the *published-package compat* layer below it are both unaddressed.

## Must-fix before ADR
1. Fold Phase-0 refinements into borrow map + portability table: **two-gate L3**; **graph = marimo data model + pic resolver (no cell compiler/reactive execution)**; **BaseKernel is Bun-coupled → Node reimplementation (named cost)**; **two JS substrates; pi-code-mode needs py+js only**.
2. **Browser-bound caveat to L5** (evaluator = TS reimplementation; grammar/validation portable).
3. **Fix the `tool-bridge.ts` path** (`eval/js/`, not `eval/js/shared/`).
4. **Published-package compat + rollback** for the `pi-code-mode` absorb (semver posture, disposable-engine fallback, feature-flag, migration owner).
5. **Fold rationale:** cite the verified SCI-namespaced schema + the no-shared-code nuance. *(RESOLVED during review.)*
6. **AK direction binding:** state the intended node (SF07 child / new wave / pending assignment).

## Nice-to-have improvements
- Per-phase **executable acceptance criteria** (the measured-campaign mandate is process-level; name the test gating each phase).
- **New-package template claims:** which packages are live extensions (expose `pi.extensions`) vs support libraries (record the repo-AGENTS exception).
- **Capability ergonomics** decision (typed `capabilities` param vs ambient typed `tool.*`) flagged for the ADR.
- Rollback beyond the engine fallback: **feature-flag** the persistent substrate behind the existing engine in Phase 1.

## Questions reviewers should force the authors to answer
- **L3:** Is the capability-contract *generated from the registry catalog* (so adding a capability updates it)? Confirm the generation direction so the compile gate and registry cannot drift.
- **L4:** Confirm "do not adopt marimo's reactive cell-DAG execution" is *load-bearing* for the graph-port scope (it is, per Phase 0); state it inside the L4 borrow-map line, not only in non-goals.
- **Consolidation:** Who owns each migration (absorb engine swap; evidence-review fold), and what preserves `/evidence-review` surface continuity?
- **Direction:** Which AK direction node does this bind to?
- **Published compat:** What semver/compat posture for `@tryinget/pi-code-mode`?

## Required checklist
- problem framing evidence-backed — **yes**
- options fairly represented — **yes** (alternatives section is solid)
- preferred direction explicit — **yes**
- stable core vs adapter boundary clear — **yes after the two-gate + graph refinements**
- contracts specific enough to test — **partial** (design-seam level is sufficient for ADR direction; testable wire contracts correctly deferred to Phase 1)
- migration and rollback realistic — **partial → yes after must-fix 4**
- docs/template claims match rendered behavior — **partial → yes after the live-vs-support-library clarification**
- validation relies on executable checks — **yes at mandate level; per-phase acceptance criteria added as a nice-to-have**
- open questions are real — **yes**
- recommendation actionable — **yes**

## Final recommendation
**request another RFC revision round (light)** — approve the direction, fold in the must-fixes, then ADR.
- Target architecture is sound and its two *proposed* seams are now Phase-0 confirmed — direction endorsed, not at risk.
- The borrow map and portability table contain **material inaccuracies** (two-gate L3, Bun-coupling, browser-bound L5 evaluator) that would under-specify the ADR's committed contracts.
- Two governance seams (fold rationale, direction binding) and the transitional-compat seam needed closing; fold rationale is now verified.
- All must-fixes are sharpening edits grounded in existing Phase-0 evidence — no new investigation blocks the revision.
- Rejecting/keeping-current is wrong (the duplication and substrate-gap are real and confirmed); rubber-stamping is wrong (the contracts aren't ADR-clean yet).

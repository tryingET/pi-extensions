---
summary: "Time-boxed review of the ASC public execution seam after the first post-cutover stewardship wave, with a refreshed map of real consumers versus verification harnesses."
read_when:
  - "You need the current answer to whether the ASC public execution seam should stay, widen, or be reconsidered after the latest release-check evidence."
  - "You are deciding whether to open follow-up work beyond the current single real external consumer."
system4d:
  container: "Post-cutover execution-seam review note."
  compass: "Keep the seam evidence-driven, minimal, and tied to actual consumers rather than imagined future callers."
  engine: "Review current evidence -> refresh consumer map -> decide keep/widen/remove -> name the next legitimate trigger."
  fog: "The main risk is mistaking verification harnesses or multiple call sites inside one package for proof that the public seam needs to grow."
---

# Execution seam review — 2026-03-31

AK task: `#628`

## Review question

After the bridge-lifecycle decision, failure-taxonomy normalization, and anti-drift guardrails, does the ASC public execution seam still earn its keep as-is, or is there evidence that it should widen, shrink, or be scheduled for removal now?

## Time box

- Review budget: one bounded documentation/reality pass
- Evidence scope: current repo-local contract tests, consumer adapter tests, installed-package smoke expectations, and the cross-package seam packet
- Non-goal: do **not** reopen execution-plane ownership or start the bundled-bridge removal cutover in this slice

## Evidence re-read for this review

- `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
- `packages/pi-autonomous-session-control/docs/project/execution-contract-change-checklist.md`
- `packages/pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`
- `packages/pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md`
- `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- `packages/pi-society-orchestrator/src/runtime/subagent.ts`
- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
- `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs`
- `packages/pi-society-orchestrator/scripts/release-smoke.mjs`

## Refreshed consumer capability map

| Consumer slice | Current call path | Class | Capability actually needed | Review outcome |
|---|---|---|---|---|
| Orchestrator direct dispatch | `extensions/society-orchestrator.ts` -> `src/runtime/subagent.ts` | active real external consumer path | custom prompt composition, cwd, optional abort, execution truth, bounded output policy wrapping | current seam is sufficient; no widening justified |
| Orchestrator loop execution | `src/loops/engine.ts` -> `src/runtime/subagent.ts` | active real external consumer path inside the same package | repeated phase dispatch, injected tool content, optional abort, execution truth | same seam is sufficient; this is not a second external consumer |
| ASC tool surface | `extensions/self/subagent.ts` | internal owner composition | tool registration over the same runtime core | stays internal; not a reason to grow the public seam |
| Installed-package release smoke | `scripts/release-smoke.mjs` -> installed orchestrator tools | verification harness, not a runtime consumer | packaged import/install proof for the current bundled bridge | useful evidence only; must not justify API growth |

## Review result

Current answer:
- **keep** the seam
- **do not widen it**
- **do not schedule removal yet**

Why:
- there is still exactly **one real external runtime consumer package** today: `pi-society-orchestrator`
- direct dispatch and loop execution are two call paths inside that same consumer, not proof of a broader consumer ecosystem
- the installed-package smoke harness exercises packaging truth, but it is not a second downstream runtime owner
- the anti-drift value is still real because the alternative remains either private-import coupling or runtime duplication

## What changed in understanding

This review clarifies an ambiguity left after the earlier stewardship slices:
- the seam has multiple **call paths**
- it does **not** yet have multiple real external **consumers**

That means later inventory expansion work must stay conditional.
Do not open a broader consumer-capability expansion pass just because the current orchestrator package uses the seam from more than one internal feature path.

## Legitimate future triggers

Open the next seam-specific follow-up only if one of these becomes true:

1. a second real external runtime consumer appears with a distinct capability need (`#629`)
2. packaging/release work would otherwise force the seam to widen
3. installed-package smoke, package-local consumer tests, and ASC contract tests stop telling a coherent story
4. the bundled-bridge lifecycle review trigger fires and the seam/removal decision must be re-judged with new release evidence

## Practical consequence

Until a new trigger appears:
- keep the headless seam unchanged
- keep ASC as execution-plane owner
- keep orchestrator as the one narrow external consumer
- treat consumer-inventory expansion as conditional follow-up, not active backlog by default

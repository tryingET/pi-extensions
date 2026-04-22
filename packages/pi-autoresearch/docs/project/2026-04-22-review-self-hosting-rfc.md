---
summary: "Review memo for the revised pi-autoresearch self-hosting RFC: the controller/candidate/evaluator/promotion split is now specific enough for ADR progression under the current single-track AK review closure path."
read_when:
  - "Before treating the revised self-hosting RFC as reviewed for its AK decision chain."
  - "When deciding whether the revised self-hosting RFC is now strong enough for ADR progression versus another RFC revision round."
system4d:
  container: "Package-local review memo for the bounded self-hosting follow-on in pi-autoresearch."
  compass: "Judge whether the revised RFC is now strong enough on substance while staying honest about current single-track ADR legality."
  engine: "Review the revised RFC -> test the controller/candidate/evaluator/promotion split -> emit one workflow-grade outcome plus the next legal move."
  fog: "The main risks are confusing subject-under-test candidate execution with evaluator ownership, or letting promotion/rollback legality drift out of the AK decision chain."
---

## System4D summary
- boundary: repo-local Tier 1 decision for bounded self-hosting in `packages/pi-autoresearch`; keep executable runtime state in the package, durable campaign truth in AK, evaluator truth snapshot-owned, and controller rotation above the package
- primary driver: allow bounded self-hosting without collapsing controller, candidate, judge, and promoter into one mutable loop
- main risks: candidate-owned dispatch redefining the evaluator, controller/candidate runtime bleed-through, or treating local candidate success as implicit promotion authority

## Review chain status
- review kind: re-review after revise_rfc
- reviewed artifact: `packages/pi-autoresearch/docs/project/2026-04-22-pi-autoresearch-self-hosting-rfc.md`
- supporting docs read: `packages/pi-autoresearch/docs/project/2026-04-22-pi-autoresearch-self-hosting-problem-intent.md`; `packages/pi-autoresearch/docs/project/2026-04-22-problem-brief-self-hosting-contract.md`; `packages/pi-autoresearch/docs/project/2026-04-22-evidence-note-self-hosting-contract.md`; `packages/pi-autoresearch/docs/project/current-vs-target.md`; `docs/project/pi-autoresearch-architecture-correction.md`; `docs/project/decision-runtime-and-roadmap.md`; `~/ai-society/holdingco/governance-kernel/docs/dev/decision-lifecycle.md`; `~/ai-society/softwareco/owned/agent-kernel/docs/project/decision-runtime-and-roadmap.md`
- required lifecycle artifacts present: RFC under review; repo-tracked problem brief; repo-tracked evidence note; repo-tracked review memo; AK decision record `decision:18`
- missing or unclear lifecycle artifacts: none for ADR readiness under current single-track closure; ADR artifact itself is intentionally not yet present
- ADR legal now?: yes
- reason: the revised RFC is now specific enough on substance, and the required pre-ADR artifact chain is present for single-track AK review closure

## Overall verdict
- ready for ADR
- the revised RFC now closes the evaluator-entrypoint loophole, makes the legality path explicit, and preserves the package/AK/promotion owner split without hiding behind vague brownfield pragmatism

## Lens 1 — core architecture / semantics
- strengths
  - clearly states that self-hosting is a controller-evaluates-candidate model rather than self-sovereign recursion
  - answers the strongest reviewer questions directly inside the contract instead of leaving them as comments around the document
  - adds explicit applicability gates for `reject`, `variant_candidate`, and `default_promotion_candidate`
- risks
  - the chosen minimum transfer-suite coverage is still a first-slice policy choice that later evidence may justify widening
  - the evaluator snapshot location remains an open later decision, though not a blocker for the current contract
- must-fix issues
  - none in the RFC itself; the governing semantics are now explicit enough for ADR progression
- evidence quality
  - strong; the RFC is now grounded in current package state, architecture-correction truth, and concern-specific problem/evidence artifacts

## Lens 2 — runtime authority / platform boundary
- strengths
  - closes the earlier loophole by making evaluator entrypoints snapshot-owned even when the candidate is the subject under test
  - makes controller/candidate runtime separation concrete through `controller_subprocess_against_candidate`
  - keeps promotion and rollback above the package and explicitly rejects in-process self-redefinition
- risks
  - later implementation must preserve the distinction between subject-under-test cwd and evaluator-entrypoint ownership exactly as written
  - any convenience layer that reintroduces candidate-owned package-manager dispatch would violate the RFC quickly
- must-fix issues
  - none in the RFC itself; the authority membrane is now explicit and testable
- evidence quality
  - strong; the revised RFC names the exact boundary and the exact failure modes it is preventing

## Lens 3 — rollout / governance / migration mechanics
- strengths
  - explicitly routes the concern through `ak decision` and names the exact legality chain required before ADR
  - separates ordinary campaign compatibility from the new self-hosting campaign type cleanly
  - makes cleanup/retention policy, promotion record, and rollback target explicit rather than ambient operator judgment
- risks
  - controller rotation will still require careful operator discipline until any later orchestrator-assisted handoff is separately justified
  - implementation slices must keep the review/legal chain from being mistaken for execution authorization beyond the bounded first slice
- must-fix issues
  - none in the RFC itself; migration and rollback are now realistic enough for ADR-level direction
- evidence quality
  - strong on lifecycle legality and migration shape; medium on long-run operator ergonomics because that remains a later slice

## Cross-cutting contradictions
- the RFC deliberately chooses a bounded synthesis between hermetic evaluator truth and brownfield execution reuse; that tension remains visible, but it is now governed instead of hidden
- `variant_candidate` remains useful only if the declared target profile stays fixed up front; the RFC now says that explicitly and should keep it that way in implementation

## Must-fix before ADR
- none in the RFC artifact chain for current single-track ADR readiness

## Nice-to-have improvements
- add one small implementation-facing fixture/example for evaluator lock entries once the first slice starts coding
- add README/operator-facing examples when the first slice lands so the self-hosting outcome classes are visible outside the RFC
- record the eventual controller-rotation operator steps in a post-ADR validation/rollout note rather than relying on the RFC alone

## Questions reviewers should force the authors to answer
- when implementation begins, what exact runner abstraction will serialize snapshot-owned entrypoints into executable commands without reopening command-selection ambiguity?
- what should the default evaluator snapshot storage root be for the first slice?
- should the first slice's `operator_consumer` transfer requirement be satisfied inside `pi-autoresearch` alone, or require one adjacent orchestrator-facing flow from day one?

## Workflow result
- review_outcome: ready_for_adr
- next legal move: open_adr_pack
- controlling rationale:
  - the revised RFC now answers the core architectural questions that previously blocked ADR progression
  - the evaluator-entrypoint freeze rule is explicit enough to avoid candidate-owned dispatch drift
  - the legality path is now named in AK terms rather than implied from file presence
  - the concern remains bounded and does not smuggle in self-sovereign autonomy
- missing artifacts or gates:
  - ADR artifact once the operator chooses to record the durable decision
  - later implementation/validation artifacts after ADR acceptance
- notes on legality vs quality:
  - substantive RFC quality is now strong enough for ADR progression
  - under the current single-track AK review closure path, ADR legality is now supportable once this memo is attached as the controlling review artifact

## Final recommendation
- approve RFC as ADR basis
- the revised RFC closes the strongest reviewer objections instead of merely surrounding them with prose
- the package/AK/promotion split remains intact and more explicit than before
- evaluator immutability is now defined at the entrypoint level, not only at the lock-file level
- the legality chain is now explicit and repo-tracked rather than implied by chat review
- move to ADR next, then open implementation/validation artifacts after acceptance

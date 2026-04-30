---
summary: "Review memo for the public AK task-verification RFC in pi-autoresearch: the revised RFC is substantively ADR-ready, but the decision chain still needs supporting lifecycle artifacts before ADR legality can be claimed."
read_when:
  - "Before treating the public AK task-verification RFC as reviewed for task 1709."
  - "When deciding whether the revised public AK task-verification RFC is strong enough for ADR progression versus further RFC edits."
system4d:
  container: "Package-local review memo for the bounded public AK task-verification follow-on in pi-autoresearch."
  compass: "Judge whether the revised RFC is now strong enough on substance while staying honest about remaining lifecycle gates."
  engine: "Review the revised RFC -> test the owner split and public contract -> emit one workflow-grade outcome plus the next legal move."
  fog: "The main risks are confusing substantive RFC quality with ADR legality, or reintroducing a broader AK-dependent control plane through review drift."
---

## System4D summary
- boundary: repo-local decision for `packages/pi-autoresearch` public `autoresearch_llamacpp_campaign_control` task-context semantics; keep the package below AK mutation while deciding whether live AK read-verification is allowed or required
- primary driver: remove the current gap where a positive caller-supplied `taskId` is treated as exact public context without proving a live AK task exists
- main risks: mandatory verification over-couples a non-mutating public helper to AK availability; no verification preserves misleading public task/candidate semantics; any widening into task guessing or AK mutation breaks the landed owner split

## Review chain status
- review kind: bounded RFC review
- reviewed artifact: `packages/pi-autoresearch/docs/project/2026-04-18-public-ak-task-verification-rfc.md`
- supporting docs read: `packages/pi-autoresearch/docs/project/llamacpp-campaign-control-surface-contract.md`; `packages/pi-autoresearch/docs/project/llamacpp-campaign-control-surface-status.md`; `packages/pi-autoresearch/docs/project/product-posture.md`; `packages/pi-autoresearch/src/core/llamacppCampaign.ts`; `packages/pi-autoresearch/tests/llamacpp-campaign.test.ts`; `~/ai-society/holdingco/governance-kernel/docs/dev/decision-lifecycle.md`; `~/ai-society/softwareco/owned/agent-kernel/docs/project/decision-runtime-and-roadmap.md`
- required lifecycle artifacts present: RFC under review; bounded supporting contract/status notes; AK decision record `decision:17`
- missing or unclear lifecycle artifacts: dedicated problem brief; dedicated evidence note; ADR artifact; explicit implementation/validation artifact chain for the follow-on
- ADR legal now?: no
- reason: the RFC is now specific enough, but the broader lifecycle artifact chain for ADR legality is still incomplete

## Overall verdict
- ready for ADR
- the RFC now makes the key boundary, degradation, and public-result semantics explicit enough to guide a bounded implementation without over-coupling the package to AK

## Lens 1 — runtime authority / platform boundary
- strengths
  - clearly chooses optional best-effort read-only verification instead of mandatory AK dependence
  - keeps direct AK mutation, fuzzy lookup, and whole-campaign control out of scope
  - explicitly preserves the lower-level technical `build_ak_binding` helper as distinct from the public seam
- risks
  - the implementation will need to keep the verification seam narrow so it does not accidentally absorb broader AK task-shape or repo-scope checks from orchestrator surfaces
  - `taskBound` semantics will narrow versus the landed behavior, so any downstream assumptions must be updated carefully
- must-fix issues
  - none in the RFC itself; the boundary is now explicit and internally coherent
- evidence quality
  - strong; the RFC is grounded in the landed contract/status/code and names the exact boundary it is changing

## Lens 2 — operator ergonomics / adoption risk
- strengths
  - explicitly separates supplied task intent from verified task context
  - defines graceful degradation for `not_found` and `verification_unavailable` instead of breaking package-local control use cases
  - updates reason/next-action wording so operators are less likely to mistake caller intent for live AK truth
- risks
  - the public surface becomes slightly more complex because callers now need to interpret task-context state rather than a single boolean
  - documentation/examples will matter because users may still over-focus on `taskBound` if the richer task-context fields are not surfaced clearly
- must-fix issues
  - none in the RFC itself; the operator contract is now sufficiently explicit
- evidence quality
  - strong on the intended UX semantics; medium on final wording quality until the implementation and examples land

## Lens 3 — verification / testability
- strengths
  - freezes exact verification states: `not_requested`, `verified_live`, `not_found`, and `verification_unavailable`
  - defines when `akBinding`, `taskBound`, and `completionCandidate` may be non-null/true
  - requires tests for graceful degradation and for keeping the technical helper distinct
- risks
  - the implementation needs one deterministic verifier seam so tests do not depend on a real AK runtime being available
  - if the implementation leaks live AK-specific failure modes directly, the public API may become noisier than the RFC intends
- must-fix issues
  - none in the RFC itself; the proof contract is specific and executable
- evidence quality
  - strong; the RFC defines concrete observable behaviors that are easy to test

## Cross-cutting contradictions
- the landed public surface currently treats a supplied positive `taskId` as stronger context than the RFC will allow, so implementation and docs must change together
- the technical helper will still allow raw deterministic binding derivation without live verification, so the public and technical surfaces must stay explicitly differentiated

## Must-fix before ADR
- materialize a dedicated problem brief artifact for this follow-on
- materialize a dedicated evidence note artifact for this follow-on
- attach the review memo and any later ADR / implementation artifacts to the AK decision chain so legality is not implied from file presence alone

## Nice-to-have improvements
- add README/help examples for no task id, verified task id, task not found, and verification unavailable
- supplement the boolean `taskBound` with prominent task-context rendering in human-facing output so the richer contract is visible immediately
- keep the eventual verifier abstraction reusable across later bounded public AK-aware read surfaces if this exact pattern reappears

## Questions reviewers should force the authors to answer
- should `verification_unavailable` preserve any machine-readable error category beyond the human `reason` string?
- should the public extension text render `taskContext` as its own section so operators do not miss the supplied-versus-verified distinction?
- does the implementation need an explicit compatibility note for consumers that previously treated `taskBound=true` as equivalent to "task id supplied"?

## Workflow result
- review_outcome: ready_for_adr
- next legal move: gather_missing_artifacts
- controlling rationale:
  - the RFC now answers the core architectural questions that blocked the follow-on
  - the chosen direction is the smallest truthful fix for the current public-context gap
  - the package/AK boundary remains intact and testable
  - ADR legality still depends on completing the missing lifecycle artifact chain
- missing artifacts or gates:
  - dedicated problem brief artifact
  - dedicated evidence note artifact
  - ADR artifact if the repo chooses to push this through full decision closure
  - later implementation/validation artifacts once code changes begin
- notes on legality vs quality:
  - substantive RFC quality is now strong enough for ADR progression
  - workflow legality is still incomplete because supporting lifecycle artifacts are missing

## Final recommendation
- approve RFC as ADR basis
- the chosen optional best-effort verification posture is the smallest truthful correction to the current public contract
- the RFC now makes supplied-versus-verified task context explicit instead of leaving it implicit
- the package remains useful without AK and remains below AK mutation
- complete the missing lifecycle artifact chain before claiming ADR legality

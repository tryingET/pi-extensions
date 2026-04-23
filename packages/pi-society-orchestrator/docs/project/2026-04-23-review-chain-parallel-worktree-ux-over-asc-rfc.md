---
summary: "Review memo for the chain/parallel/worktree RFC: the narrow workflow-composition packet is now specific enough for ADR progression without reopening the accepted orchestrator/ASC boundary."
read_when:
  - "Before treating the chain/parallel/worktree RFC as reviewed for its AK decision chain."
  - "When deciding whether the narrow workflow-composition packet is ready for ADR progression versus another RFC revision pass."
type: "reference"
system4d:
  container: "Package-local review memo for workflow-composition UX over ASC in pi-society-orchestrator."
  compass: "Judge whether the RFC is now strong enough for ADR progression while keeping the owner split and adapter/core boundary truthful."
  engine: "Review the RFC against the accepted broad ADR -> test the workflow-core/adapters boundary -> emit one workflow-grade outcome plus the next legal move."
  fog: "The main risks are confusing workflow composition with execution ownership, or letting later convenience surfaces silently become authority."
---

## System4D summary
- boundary: repo-local Tier 1 decision for narrow workflow-composition UX in `packages/pi-society-orchestrator`; keep ASC as execution owner, AK as canonical authority, and orchestrator as workflow-composition owner above the public seam
- primary driver: recover chain / parallel / optional worktree orchestration UX without reviving a second runtime or a contrib-style monolith
- main risks: authority drift from workflow core to commands/persistence, hidden reintroduction of execution ownership, or packet collapse back into peer-session messaging

## Review chain status
- review kind: first formal packet review for AK closure
- reviewed artifact: `packages/pi-society-orchestrator/docs/project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md`
- supporting docs read: `packages/pi-society-orchestrator/docs/project/2026-04-23-problem-brief-chain-parallel-worktree-ux-over-asc.md`; `packages/pi-society-orchestrator/docs/adr/2026-04-22-chain-parallel-worktree-ux-over-asc.md`; `packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`; `docs/project/2026-04-22-dual-packet-decision-map.md`; `docs/project/2026-04-22-ak-decision-attachment-summaries-dual-packet.md`; `docs/project/2026-04-22-ak-decision-body-drafts-dual-packet.md`; `docs/project/decision-runtime-and-roadmap.md`; `/home/tryinget/ai-society/softwareco/owned/agent-kernel/docs/project/decision-runtime-and-roadmap.md`
- required lifecycle artifacts present: RFC under review; repo-tracked problem brief; repo-tracked evidence notes; repo-tracked review memo; AK decision record `decision:20`
- missing or unclear lifecycle artifacts: none for ADR readiness under the current single-track closure path; ADR artifact itself is intentionally not yet recorded at review time
- ADR legal now?: yes
- reason: the RFC now draws the workflow-core/adapters boundary clearly enough, keeps the accepted owner split intact, and names the first-slice worktree and authority guardrails concretely enough for ADR progression

## Overall verdict
- ready for ADR
- the RFC is now strong enough to close this narrow packet without reopening the broad owner split and without hiding the remaining implementation work inside vague ergonomics language

## Lens 1 — architecture / semantics
- strengths
  - clearly states that workflow composition belongs above ASC rather than inside a second runtime
  - makes the stable core a package-local workflow contract instead of commands or persistence
  - preserves the distinction between loops and arbitrary workflow composition
- risks
  - saved-workflow and builder pressure may return later if the thin surface succeeds
  - worktree scope remains intentionally narrow and later widening will need separate evidence
- must-fix issues
  - none in the RFC itself; the governing semantics are explicit enough for ADR progression
- evidence quality
  - strong; the RFC is grounded in the accepted broad boundary ADR, the execution seam, and the dual-packet map

## Lens 2 — runtime authority / boundary discipline
- strengths
  - explicitly keeps ASC as the only execution/runtime owner
  - keeps AK outside the local workflow runtime as canonical authority
  - treats commands, builders, and saved workflows as adapters over the core instead of authority
- risks
  - later implementation must preserve ASC status/`failureKind` truth without reinterpretation
  - any shortcut that treats `src/chains.yaml` as live authority would violate the packet quickly
- must-fix issues
  - none in the RFC artifact itself
- evidence quality
  - strong; the authority membrane is explicit and testable

## Lens 3 — rollout / migration / operator usability
- strengths
  - stages the first slice around thin workflow surfaces first
  - defers builder/manager UX until the thinner surface proves useful
  - makes rollback to direct dispatch + loops posture explicit
- risks
  - operator demand for a friendlier launch surface may arrive before the core is fully proven
  - worktree rollout will require disciplined fail-closed behavior for dirty repos and cwd conflicts
- must-fix issues
  - none in the RFC artifact itself; rollout posture is specific enough for ADR-level direction
- evidence quality
  - strong on boundary and migration posture; medium on eventual operator ergonomics because those remain intentionally deferred

## Cross-cutting contradictions
- the RFC deliberately chooses thin-core-first discipline over persistence-first convenience; that tension remains visible, but it is now governed instead of implicit
- the RFC intentionally keeps loops and workflow composition separate for now; later convergence pressure may emerge, but it is not a blocker for the current packet

## Must-fix before ADR
- none in the current packet for single-track ADR readiness

## Nice-to-have improvements
- add one small implementation-facing example of the first `workflow_execute`-style adapter once coding begins
- add concise operator-facing examples when the first slice lands
- record any later saved-workflow or builder justification in a separate follow-on RFC rather than stretching this packet silently

## Questions reviewers should force the authors to answer later
- what exact public adapter name and payload shape best expose the workflow core without turning the adapter into a second authority surface?
- after Slice A/B, is there enough real pressure to justify saved-workflow persistence at all?
- if worktree support lands, what is the smallest truthful patch/diff fan-in surface that still stays clearly orchestrator-owned?

## Workflow result
- review_outcome: ready_for_adr
- next legal move: open_adr_pack
- controlling rationale:
  - the RFC answers the narrow architecture question this packet actually owns
  - the accepted broad boundary ADR is preserved rather than reopened
  - the first-slice workflow-core/adapters split is explicit enough for durable review closure
  - the concern remains separate from the peer-session messaging packet
- missing artifacts or gates:
  - ADR artifact once the decision is recorded
  - later implementation/validation artifacts after acceptance
- notes on legality vs quality:
  - the packet is legally ready for ADR under the current single-track AK closure path
  - implementation proof still belongs in later plan/validation artifacts, not in the review memo itself

## Final recommendation
- approve RFC as ADR basis
- preserve the accepted owner split exactly as written
- record the package-local ADR for this narrow packet
- treat the workflow contract as the durable core and convenience surfaces as adapters only
- move to post-ADR implementation/validation planning without creating a second runtime

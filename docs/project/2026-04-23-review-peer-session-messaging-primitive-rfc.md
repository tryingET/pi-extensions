---
summary: "Review memo for the peer-session messaging primitive RFC: the packet is bounded and ADR-ready as a separate same-machine communication primitive in pi-extensions without collapsing into ASC or orchestrator ownership."
read_when:
  - "Before treating the peer-session messaging primitive RFC as reviewed for its AK decision chain."
  - "When deciding whether the local packet is strong enough for ADR progression versus another RFC revision round."
type: "proposal"
proposal_status: "reviewed"
decision_id: 19
system4d:
  container: "Current-track review closure for the peer-session messaging primitive decision in pi-extensions."
  compass: "Confirm the packet is narrow, authority-safe, and separate from the orchestrator workflow-composition concern."
  engine: "review the RFC and local packet -> test owner split and contract narrowness -> classify blockers vs post-ADR follow-through -> issue one review outcome."
  fog: "The main risks are collapsing peer messaging into ASC or orchestrator ownership, or letting messages/replies become canonical authority by convenience."
---

# Review memo — peer-session messaging primitive RFC

## Review chain status

- review kind: bounded RFC review
- reviewed artifact: `docs/project/2026-04-22-rfc-peer-session-messaging-primitive.md`
- supporting docs read:
  - `docs/project/decision-runtime-and-roadmap.md`
  - `docs/project/2026-04-22-dual-packet-decision-map.md`
  - `docs/project/2026-04-22-ak-decision-attachment-summaries-dual-packet.md`
  - `docs/project/2026-04-22-ak-decision-body-drafts-dual-packet.md`
  - `docs/decisions/peer-session-messaging-primitive.md`
  - `docs/project/2026-04-22-dual-salvage-packet-orchestrator-ux-and-peer-messaging.md`
  - `docs/project/2026-04-22-subagent-contrib-salvage-boundary-status.md`
  - `/home/tryinget/ai-society/softwareco/owned/agent-kernel/docs/project/decision-runtime-and-roadmap.md`
- required lifecycle artifacts present: RFC under review; repo-tracked problem brief reference; repo-tracked evidence notes; repo-tracked review memo; AK decision record `decision:19`
- missing or unclear lifecycle artifacts: none for ADR readiness under the current single-track AK review-closure path; ADR artifact itself is intentionally not yet recorded
- ADR legal now?: yes
- reason: the packet already contains the owner split, narrow contract, fail-closed rules, and explicit non-goals needed for ADR progression, and the AK decision chain now has the required pre-ADR artifact coverage

## Overall verdict

- ready for ADR
- the packet is specific enough to accept as a separate same-machine peer-session messaging primitive in `pi-extensions` without reopening the orchestrator workflow-composition concern or diluting the existing AK / ASC / orchestrator owner split

## Lens 1 — ownership and authority boundary

### Assessment
**Resolved enough for ADR**

The packet preserves the intended owner split cleanly:

- AK remains canonical authority/runtime truth
- ASC remains execution/runtime owner for subagent behavior
- `pi-society-orchestrator` remains coordination/control-plane owner
- the new peer-session messaging concern remains a separate narrow package concern

The RFC and ADR draft are aligned that messages and replies are communication only.
They do not become canonical operational state, evidence, or legal effect by themselves.
That point is explicit enough to prevent transport convenience from silently becoming authority.

## Lens 2 — contract narrowness and fail-closed behavior

### Assessment
**Resolved enough for ADR**

The proposed contract is narrow and testable rather than aspirational.
The packet is specific on the first accepted boundary:

- same-machine only
- direct-message bias
- explicit `send` / bounded correlated `ask`
- `intercom` compatibility only at the adapter layer
- duplicate visible names fail closed and require exact targeting
- unnamed-session fallback aliases remain non-persistent and addressability-only
- one in-flight `ask` per local session in the first stable contract

These are decision-grade constraints, not vague implementation wishes.
They bound the first slice tightly enough to support an ADR without pretending room/network semantics are already justified.

## Lens 3 — separation from the orchestrator packet

### Assessment
**Resolved enough for ADR**

The dual-packet materials are consistent that peer messaging and orchestrator workflow composition are sibling concerns, not one merged architecture.
This packet therefore does not authorize:

- moving transport ownership into orchestrator
- moving transport ownership into ASC
- using this primitive as a hidden workflow engine
- reviving a `pi-subagents`-style monolith through convenience recombination

That separation is not merely rhetorical.
It is repeated in the RFC, the concern-local ADR draft, the dual-packet umbrella, and the decision map.
So the packet is strong enough to close canonically in AK as its own concern.

## Lens 4 — compatibility and migration posture

### Assessment
**Resolved enough for ADR**

The packet chooses the smallest truthful compatibility posture:

- contrib `pi-intercom` is prior art and salvage input, not owned authority
- the owned stable core is the presence/message/runtime contract
- the first public adapter may remain `intercom`-compatible because that reduces migration friction
- that compatibility does not promote the adapter name into architecture authority

This is the right synthesis.
It preserves migration practicality without compromising ownership or contract boundaries.

## Cross-cutting contradictions

- the first public adapter may remain `intercom`-compatible, but the architecture authority remains the owned stable core rather than the adapter surface
- the primitive is intended to be reusable by orchestrator later, but that consumer relationship must not be mistaken for orchestrator ownership of transport semantics
- delivery and correlated reply behavior are useful coordination inputs, but they still must not count as canonical workflow completion or evidence by convenience

## Must-fix before ADR

- none in the current packet for single-track ADR readiness

## Nice-to-have improvements

- add one dedicated implementation-facing example for duplicate-name disambiguation and exact id targeting when the package slice starts coding
- add operator-facing examples for timeout, disconnect, cancellation, and duplicate-name ambiguity once the first adapter ships
- preserve the current explicit note that any future widening beyond one in-flight `ask` per session requires a later deliberate decision

## Workflow result

- review_outcome: ready_for_adr
- next legal move: open_adr_pack
- controlling rationale:
  - the packet keeps peer-session messaging separate from the orchestrator workflow-composition concern
  - the packet preserves AK authority and ASC/orchestrator owner boundaries explicitly
  - the contract is narrow, bounded, and fail-closed where ambiguity would otherwise create hidden authority drift
  - the repo-local packet already provides sufficient direction for ADR recording without another RFC revision pass
- missing artifacts or gates:
  - ADR artifact once the operator chooses to record the durable decision
  - later implementation-plan and validation/rollout/rollback artifacts if and when the repo opens post-ADR execution work
- notes on legality vs quality:
  - substantive packet quality is strong enough for ADR progression
  - under the current single-track AK review-closure path, ADR legality is now supportable once this memo is attached as the controlling review artifact

## Final recommendation

- approve RFC as ADR basis
- keep the decision separate from the orchestrator workflow-composition packet
- preserve communication-only semantics and fail-closed targeting rules exactly as written
- record the ADR next rather than reopening owner-split debate that the packet already settled

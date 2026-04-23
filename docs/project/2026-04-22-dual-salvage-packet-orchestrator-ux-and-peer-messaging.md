---
summary: "Umbrella note for proceeding with both post-contrib follow-on packets: orchestrator-native coordination UX over ASC and a separate narrow peer-session messaging primitive."
read_when:
  - "You agree that both orchestration UX and peer messaging should proceed, but need the clean boundary between them."
  - "Before opening follow-on work derived from the contrib subagent salvage note."
  - "When deciding whether these two slices should be merged into one package or packet."
type: "reference"
system4d:
  container: "Repo-root umbrella note for the two sibling follow-on packets above the current orchestrator→ASC split."
  compass: "Proceed with both slices without recreating a contrib-style monolith."
  engine: "Bind the already-landed salvage boundary -> split the remaining work into two sibling packets -> state sequencing and guardrails."
  fog: "The main risk is treating 'do both' as permission to merge coordination UX, execution runtime, and peer messaging back into one architecture again."
---

# 2026-04-22 — dual salvage packet: orchestrator UX + peer messaging

## Decision in one sentence

Proceed with **both** follow-on packets, but keep them as **two sibling architecture tracks** rather than one merged package or one merged RFC.

## Why this note exists

The immediate follow-up question after the contrib salvage review was:

> why not both?

That question is correct.
The right answer is **both** — but **not as one thing**.

This note exists to bind the two sibling follow-on packets that should now be treated separately:

1. an orchestrator-side coordination UX packet above ASC
2. a separate narrow peer-session messaging primitive derived from `pi-intercom`

## Current boundary that does not change

The current owned boundary remains:

- **AK** = canonical authority/runtime truth
- **ASC** = execution/runtime kernel for subagent behavior
- **`pi-society-orchestrator`** = coordination/control-plane behavior above lower-plane owners
- **`pi-vault-client`** = prompt-plane preparation/governance

Interpretation rule:

- "do both" does **not** reopen execution-plane ownership
- "do both" does **not** justify a new `pi-subagents` monolith
- "do both" does **not** fuse peer messaging into ASC or orchestrator ownership

## Decision drivers

- preserve the already-landed AK / ASC / orchestrator / prompt-plane owner split
- recover both missing concerns identified by the contrib salvage review instead of choosing one by artificial scarcity
- keep coordination UX and peer-session transport separate so each can evolve under the right owner
- avoid recreating a `pi-subagents`-style monolith through premature recombination
- keep sequencing flexible without blurring the architectural boundary between the two packets

## Architectural stance

This umbrella note takes a deliberately constrained stance derived from three pressures:

1. **both gaps are real**
   - the owned stack is still missing orchestration UX above ASC and still missing a narrow local peer-session messaging primitive
2. **they are not the same class of concern**
   - orchestrator UX is a control-plane concern, while peer messaging is a transport/presence primitive
3. **shared timing does not imply shared ownership**
   - even if both slices move at the same time, they should not collapse back into one architecture

The resulting stance is:

- proceed with both slices
- keep their RFCs, ownership, and implementation packets separate
- let orchestrator consume peer messaging later only as a consumer, not as the owner of the primitive itself

## Why this split beats the alternatives

### Why not choose only the orchestrator packet

That would leave the peer-session messaging concern unowned and encourage ad hoc local glue or continued reliance on contrib `pi-intercom`.

### Why not choose only the peer-messaging packet

That would leave the already-identified chain / parallel / worktree UX gap unresolved even though it now sits cleanly above ASC's public seam.

### Why not merge them into one combined RFC or package

That would recreate the failure pattern the salvage review already rejected:

- coordination UX
- peer messaging
- and eventually adjacent runtime or prompt glue

collapsing back into one package family.

### Why not defer both until one big future convergence pass

That would blur two concerns that are already clear enough to separate now and would slow down truthful progress on both.

## The two packets

## Packet A — orchestrator-native coordination UX over ASC

This packet owns the missing orchestration UX that still only exists meaningfully in contrib `pi-subagents`, such as:

- chain workflows
- parallel workflows
- worktree fan-out UX
- optional manager/builder UX

Target landing:

- `packages/pi-society-orchestrator`

Companion RFC:

- [`packages/pi-society-orchestrator/docs/project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md`](../../packages/pi-society-orchestrator/docs/project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md)

## Packet B — separate narrow peer-session messaging primitive

This packet owns the missing peer-to-peer local session fabric that still only exists meaningfully in contrib `pi-intercom`, such as:

- presence
- local broker/client IPC
- `send` / `ask`
- reply hints / threading
- minimal session-picker or compose UX

Target landing:

- a **new separate narrow package** in `pi-extensions`

Companion RFC:

- [`2026-04-22-rfc-peer-session-messaging-primitive.md`](2026-04-22-rfc-peer-session-messaging-primitive.md)

## Why they must stay separate

## 1. Different ownership classes

The orchestrator packet is **coordination UX**.
The peer-messaging packet is **transport/presence primitive**.

Those are different owner layers.

## 2. Different failure modes

If orchestrator UX is wrong, the main risk is:

- bad routing
- poor operator ergonomics
- accidental duplication of ASC behavior

If peer messaging is wrong, the main risk is:

- broken local delivery
- confused presence identity
- unreliable `ask`/reply behavior

They should therefore fail and evolve independently.

## 3. Different extraction pressure

The orchestrator packet is immediately useful even without messaging.
Peer messaging is useful independently and can later be consumed by orchestrator policy, but it is not a prerequisite for truthful chain/parallel UX.

## 4. Monolith risk is explicit

If they are merged too early, we recreate the exact architecture we just rejected:

- execution/runtime
- coordination UX
- peer messaging
- prompt glue
- registry persistence

collapsed into one package family.

## Sequencing rule

Preferred sequencing remains:

1. **start with the orchestrator packet** because it can land directly over ASC's public seam
2. **run the peer-messaging packet in parallel or immediately after**, but keep it a separate design/workstream

Interpretation:

- these can progress at the same time organizationally
- they should remain separate in architecture and implementation packets

## Guardrails for both packets together

### Shared guardrails

- keep AK as canonical authority
- keep ASC as execution/runtime owner
- do not reintroduce private ASC imports into orchestrator
- do not let prompt-plane work drift back out of `pi-vault-client`

### Packet A guardrails

- no orchestrator-local execution runtime revival
- no peer-messaging transport hidden in orchestrator
- no file-backed contrib agent registry treated as owned truth

### Packet B guardrails

- no AK authority claims
- no execution-kernel claims
- no orchestration policy embedded in the transport layer
- no "Pi querying itself" framing; this is local peer-session communication only

## Relationship to the prior salvage note

This umbrella is a direct follow-on to:

- [`2026-04-22-subagent-contrib-salvage-boundary-status.md`](2026-04-22-subagent-contrib-salvage-boundary-status.md)

That note answered:

- what is already extracted
- what remains only in contrib
- where each concern should land

This note answers:

- yes, proceed with **both** remaining slices
- do so as **two sibling packets**, not one merged architecture

## Current status truth

These packets should currently be read as:

- **proposal / RFC shaping surfaces**
- not yet the active root operating plan
- not evidence that implementation ownership has shifted already

Until AK or package-local execution authority explicitly opens these slices, they remain bounded planning artifacts rather than active runtime commitments.

## Bottom line

The correct response to "why not both?" is:

- **yes, both**
- **no, not merged**

The owned target shape remains:

- **ASC** for execution/runtime
- **orchestrator** for coordination UX above ASC
- **a separate narrow package** for peer-session messaging
- **explicit rejection** of a revived `pi-subagents` monolith

---
summary: "Accepted concern-local ADR for adopting a separate same-machine peer-session messaging primitive in pi-extensions while keeping AK authority, ASC runtime ownership, and orchestrator control-plane ownership intact."
status: accepted
read_when:
  - "Before implementing or reviewing the peer-session messaging primitive concern in pi-extensions."
  - "When deciding whether peer-session messaging belongs in a separate package, in orchestrator, or in ASC."
  - "When you need the durable accepted contract after decision 19 reached ADR recording."
system4d:
  container: "Concern-local accepted ADR for peer-session messaging boundaries in pi-extensions."
  compass: "Own a narrow same-machine messaging primitive without letting it become execution runtime, control-plane policy, or canonical authority."
  engine: "state problem -> compare options -> choose owner/layer -> define stable core and guardrails -> carry forward acceptance criteria."
  fog: "The biggest risk is collapsing messaging back into orchestrator or ASC, or treating message traffic as authority by convenience."
---

# ADR — Peer-session messaging primitive for `pi-extensions`

## Status

Accepted as the concern-local architectural contract for `decision:19`.

- date: 2026-04-23
- owner: `pi-extensions`
- reviewers:
  - `decision:19` current-track review memo
- related_docs:
  - `../project/2026-04-22-rfc-peer-session-messaging-primitive.md`
  - `../project/2026-04-22-dual-salvage-packet-orchestrator-ux-and-peer-messaging.md`
  - `../project/2026-04-22-dual-packet-decision-map.md`
  - `../project/2026-04-22-ak-decision-attachment-summaries-dual-packet.md`
  - `../project/2026-04-22-ak-decision-body-drafts-dual-packet.md`
  - `../project/2026-04-23-review-peer-session-messaging-primitive-rfc.md`
  - `../project/2026-04-22-subagent-contrib-salvage-boundary-status.md`

This document records the accepted repo-local architecture judgment.
Canonical decision-runtime legality and state remain in AK `decision:19`.

## How to read this ADR with the supporting packet

Read this as the **decision layer** distilled from the current packet:

- RFC: [`../project/2026-04-22-rfc-peer-session-messaging-primitive.md`](../project/2026-04-22-rfc-peer-session-messaging-primitive.md)
- umbrella split: [`../project/2026-04-22-dual-salvage-packet-orchestrator-ux-and-peer-messaging.md`](../project/2026-04-22-dual-salvage-packet-orchestrator-ux-and-peer-messaging.md)
- contrib salvage map: [`../project/2026-04-22-subagent-contrib-salvage-boundary-status.md`](../project/2026-04-22-subagent-contrib-salvage-boundary-status.md)
- contrib prior art: `softwareco/contrib/pi-intercom`

Use the RFC for fuller rationale and future-facing detail.
Use this ADR for the actual architecture judgment.

## Executive summary

`pi-extensions` should adopt a **separate narrow same-machine peer-session messaging primitive**.

That primitive should:

- own local peer presence
- own same-machine broker/client delivery
- support direct `send` and bounded correlated `ask`
- preserve `intercom` compatibility at the adapter layer

That primitive should **not**:

- become canonical authority
- become part of ASC's execution/runtime kernel
- become part of orchestrator's coordination/control-plane ownership
- absorb broader room/network semantics without later explicit evidence and decision

## Decision

Inside `pi-extensions`, peer-session messaging is a **separate package concern**.

### Ownership assignment

- **AK** remains canonical authority/runtime truth
- **ASC** remains execution/runtime owner for subagent behavior
- **`pi-society-orchestrator`** remains coordination/control-plane owner
- **the peer-session messaging package** owns only same-machine session presence and direct peer messaging

### Architectural rule

Messages and replies are **communication only**.
They are never canonical operational state, evidence, or legal effect by themselves.

If a consumer later wants to turn a message into durable workflow meaning, that consumer must do so through its own owned contract and the appropriate canonical authority surface.

## Context

The owned stack already has:

- AK for authority/runtime truth
- ASC for subagent execution/runtime
- orchestrator for coordination/control-plane behavior

What it still lacks is an owned primitive for **same-machine peer-session communication** between live Pi sessions.

Contrib `pi-intercom` already demonstrates that this concern is useful and can remain narrow:

- direct 1:1 peer messaging
- local presence discovery
- local broker/client IPC
- bounded `ask` / reply behavior
- minimal operator-facing adapter UX

The architectural problem is therefore **not** whether the concern exists.
It is where it should live, and how narrow it should stay.

## Decision drivers

- preserve the already-landed AK / ASC / orchestrator owner split
- own the messaging concern instead of leaving it as contrib-only prior art
- keep the stable core smaller than any tool, overlay, or consumer-specific policy helper
- preserve the direct same-machine 1:1 bias that made contrib `pi-intercom` useful
- avoid hidden authority drift and avoid transport/policy coupling
- keep rollback simple if the first slice proves wrong

## Decision synthesis

This decision was chosen by forcing three strong architectural instincts into direct confrontation:

1. **boundary purism**
   - keep the primitive very small and prevent orchestration or authority leakage
2. **compatibility pragmatism**
   - preserve an `intercom`-compatible public adapter where that materially lowers migration and adoption cost
3. **future-scale ambition**
   - avoid foreclosing later collaboration growth if future evidence exceeds same-machine 1:1 messaging

The accepted synthesis is:

- side with **boundary purism** for the stable core
- side with **compatibility pragmatism** for the first public adapter
- reject **future-scale ambition** as a first-slice driver unless later evidence proves the primitive itself is the limiting layer

## Options considered

### Option A — separate narrow local messaging package **(chosen)**

Define a package-local presence/message/runtime contract and implement same-machine broker/client delivery around it.

Why chosen:

- preserves owner boundaries
- is testable
- allows orchestrator and others to consume the primitive later without owning it
- avoids monolith revival

### Option B — put peer messaging inside orchestrator

Rejected.

Reason:
- would couple transport to coordination policy and make reuse harder

### Option C — put peer messaging inside ASC

Rejected.

Reason:
- would blur execution/runtime ownership with peer-session transport

### Option D — keep contrib `pi-intercom` as the de facto answer

Rejected.

Reason:
- leaves an actually useful concern outside the owned package architecture

### Option E — broaden immediately to room or network fabric

Rejected for the first slice.

Reason:
- insufficient evidence
- larger blast radius
- weakens the narrow same-machine direct-message boundary

### Option F — let consumers improvise local messaging ad hoc

Rejected.

Reason:
- preserves duplicated local glue and inconsistent semantics

## Stable core vs adapter boundary

### Stable core

The stable core of the decision is a package-local messaging/runtime contract consisting of:

- `PeerPresence`
- `PeerMessage`
- `PeerAttachment`
- `PeerMessagingRuntime`
- same-machine addressing rules
- bounded `send` / `ask` / `status` semantics
- request/reply correlation
- runtime-only fallback addressing for unnamed sessions

### Adapters

Adapters may include:

- an `intercom`-compatible tool surface
- a minimal overlay/picker/compose flow
- reply-hint rendering
- future consumer-specific helpers in other packages

### Adapter rule

Adapters are public-facing and useful, but they are **not** the authority model.
The stable core remains the package-local presence/message/runtime contract.

## Addressing and interaction rules

### Addressing

- explicit session id wins over name-like addressing
- duplicate visible names must fail closed for name-based delivery and require exact selection or id targeting
- adapters should surface duplicate-name ambiguity clearly using `name + short id` style disambiguation
- unnamed-session fallback aliases are runtime-only and addressability-only
- fallback aliases must not overwrite stored Pi session titles by convenience

### `ask` semantics

- `ask` uses explicit request/reply correlation
- `ask` has bounded timeout behavior with an explicitly documented default
- the initial recommended default remains 10 minutes unless a later explicit compatibility decision changes it
- ambiguity, disconnect, cancellation, and timeout fail closed
- the first accepted contract allows only **one in-flight `ask` per local session**

## Compatibility posture

Contrib `pi-intercom` is prior-art evidence, not owned authority.

The owned package should preserve an **`intercom`-compatible first public adapter** because that lowers adoption friction, but that compatibility remains at the adapter layer.
It does not make the adapter name the architecture authority.

By default, treat that `intercom`-compatible first public adapter as stable unless a later explicit compatibility decision changes it.

## Scope limits carried by this decision

This decision covers:

- same-machine peer presence
- same-machine direct messaging
- bounded `ask` / reply behavior
- minimal tool/UI adapters over the stable core

This decision does **not** cover:

- networked or cross-machine transport
- room/swarm/group semantics
- orchestration policy
- execution/runtime behavior
- canonical authority or evidence mutation

## Migration posture

The first accepted direction is additive:

1. land the stable presence/message/runtime core
2. expose an `intercom`-compatible adapter over that core
3. optionally add minimal overlay UX later
4. let consumer packages add policy above the primitive only when needed

## Rollback posture

If the first slice proves wrong:

- remove or disable the owned package adapters
- keep AK / ASC / orchestrator boundaries unchanged
- do not preserve failed adapter choices as authority artifacts
- continue treating contrib `pi-intercom` only as prior art, not as fallback owned truth

## Acceptance criteria carried forward

Before this decision should be treated as successfully landed in implementation, the resulting package should prove at least:

- `ask` has bounded timeout behavior with a documented default
- `ask` reply correlation is explicit and fail-closed on ambiguity, disconnect, timeout, or cancellation
- duplicate visible names fail closed and require exact targeting
- runtime fallback aliases remain non-persistent and addressability-only
- adapters surface duplicate-name ambiguity clearly
- message delivery and reply receipt never count as canonical state, evidence, or workflow completion by convenience

## Consequences

### Positive

- one owned home for same-machine peer-session messaging
- clear separation from ASC and orchestrator ownership
- reusable primitive for future consumers
- better discipline around communication vs authority
- cleaner future migration than continuing ad hoc or contrib-only usage

### Tradeoffs

- one more package boundary to maintain
- first-slice constraints remain intentionally narrow
- future pressure for broader transport or richer collaboration semantics will require another explicit decision
- consumers must still own their own workflow meaning instead of relying on the primitive to provide it

## Non-goals

This ADR does **not** say:

- peer messaging becomes canonical truth
- peer messaging belongs in orchestrator
- peer messaging belongs in ASC
- a room/network fabric is now approved
- richer coordination policy should live inside the primitive package

## Bottom line

Adopt a **separate narrow same-machine peer-session messaging primitive** in `pi-extensions`.

Keep:

- AK as authority
- ASC as execution/runtime owner
- orchestrator as coordination/control-plane owner
- peer messaging as a reusable but bounded communication primitive

Preserve `intercom` compatibility at the adapter layer.
Do not let message traffic become authority by convenience.

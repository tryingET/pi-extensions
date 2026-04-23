---
summary: "Draft AK decision attachment summaries for the two post-contrib packets: orchestrator workflow composition UX over ASC and the separate peer-session messaging primitive."
read_when:
  - "You are preparing AK decision attachments for the post-contrib orchestrator/workflow and peer-messaging concerns."
  - "You need concise attachment-ready summaries instead of re-reading the whole packet."
  - "You are deciding whether to open one AK decision or two for these two concerns."
type: "reference"
system4d:
  container: "Repo-root AK decision attachment helper for the dual-packet concern set."
  compass: "Turn the local packet into concise AK-facing decision summaries without collapsing the two concerns back into one architecture."
  engine: "name each concern -> state decision -> list attached artifacts -> list acceptance criteria and explicit non-goals -> suggest AK split."
  fog: "The main risk is attaching too much prose, or worse, collapsing the workflow-composition and peer-messaging packets into one ambiguous AK decision."
---

# 2026-04-22 — AK decision attachment summaries for the dual packet

## Why this note exists

The repo-local packet now includes:

- one broad accepted boundary ADR
- two narrow RFCs
- two narrow concern-local ADR drafts
- one map explaining how those pieces relate

The remaining step is canonical decision-runtime closure in AK.
This note exists to make that handoff shorter and cleaner.

## Recommended AK split

Recommended default:

- open **two separate AK decisions**

Why:

- the two concerns have different owners, different failure modes, and different implementation timing
- keeping them separate preserves the exact boundary the packet worked to establish
- a single umbrella decision risks blurring:
  - orchestrator workflow composition UX
  - peer-session messaging primitive

Use one shared umbrella AK decision only if AK or governance explicitly requires one higher-level container.
Even then, keep the two narrow concern decisions or sub-concerns separately legible.

## Decision A — orchestrator workflow composition UX over ASC

## Proposed AK decision title

`Adopt thin chain/parallel/worktree workflow composition UX in pi-society-orchestrator above ASC`

## Short attachment summary

`pi-society-orchestrator` should own a **thin workflow-composition layer** for chain, parallel, and optional worktree fan-out behavior **above** ASC's public execution seam. The accepted local direction preserves ASC as the only execution/runtime owner, keeps AK as canonical authority outside the workflow runtime, and treats commands/UI/persistence as adapters over a small package-local workflow request/result contract rather than as authority by convenience.

## Primary attached artifacts

- RFC:
  - `packages/pi-society-orchestrator/docs/project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md`
- concern-local ADR draft:
  - `packages/pi-society-orchestrator/docs/adr/2026-04-22-chain-parallel-worktree-ux-over-asc.md`
- broad accepted boundary ADR:
  - `packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`
- packet map:
  - `docs/project/2026-04-22-dual-packet-decision-map.md`
- contrib salvage context:
  - `docs/project/2026-04-22-subagent-contrib-salvage-boundary-status.md`

## Decision statement for AK attachment

The workflow-composition concern is accepted locally on these terms:

- orchestrator may own chain / parallel / optional worktree workflow composition as a control-plane concern
- ASC remains the only execution/runtime owner for subagent behavior
- the stable core is a package-local `WorkflowRequest` / `WorkflowResult` contract
- commands, builder UX, and saved workflows are adapters rather than the authority model
- `src/chains.yaml` is non-authoritative for this packet unless later explicitly accepted as an adapter path
- no workflow summary or local artifact becomes canonical task/evidence truth by convenience

## Acceptance criteria to carry into AK

- workflow request/result contracts remain narrow and explicit
- routing/team validation fails closed before execution starts
- orchestrator still consumes only ASC's public execution seam
- step execution preserves ASC status and `failureKind` truth
- fan-in aggregation is truthful and clearly orchestrator-owned
- worktree dirty-repo and incompatible-cwd cases fail closed if worktree support lands
- the first public adapter remains thin over the workflow core
- package docs describe workflow core first and adapters second

## Explicit non-goals for AK attachment

- reviving a second orchestrator execution runtime
- promoting commands, builders, or saved workflow artifacts into authority
- treating `src/chains.yaml` as first-slice runtime authority
- folding peer-session messaging transport into this concern
- replacing AK as canonical authority

## Decision B — peer-session messaging primitive

## Proposed AK decision title

`Adopt a separate same-machine peer-session messaging primitive in pi-extensions`

## Short attachment summary

`pi-extensions` should own a **separate narrow same-machine peer-session messaging primitive** rather than burying peer messaging inside orchestrator or ASC. The accepted local direction preserves AK as canonical authority, preserves ASC as execution/runtime owner, keeps orchestrator as a consumer rather than owner of transport, and defines a small package-local presence/message/runtime contract with `intercom` compatibility preserved at the adapter layer only.

## Primary attached artifacts

- RFC:
  - `docs/project/2026-04-22-rfc-peer-session-messaging-primitive.md`
- concern-local ADR draft:
  - `docs/decisions/peer-session-messaging-primitive.md`
- dual-packet umbrella:
  - `docs/project/2026-04-22-dual-salvage-packet-orchestrator-ux-and-peer-messaging.md`
- packet map:
  - `docs/project/2026-04-22-dual-packet-decision-map.md`
- contrib salvage context:
  - `docs/project/2026-04-22-subagent-contrib-salvage-boundary-status.md`

## Decision statement for AK attachment

The peer-session messaging concern is accepted locally on these terms:

- peer-session messaging belongs in a separate package concern, not in ASC or orchestrator by default
- the stable core is a package-local presence/message/runtime contract
- messages and replies are communication only; they are never canonical operational state, evidence, or legal effect by themselves
- same-machine direct-message bias remains the first-slice boundary
- `intercom` compatibility is preserved at the adapter layer, not the authority layer
- duplicate visible names fail closed and require exact targeting
- unnamed-session fallback aliases remain non-persistent and addressability-only
- the first stable primitive contract keeps one in-flight `ask` per local session unless later explicitly changed

## Acceptance criteria to carry into AK

- `ask` has bounded timeout behavior with a documented default
- `ask` reply correlation is explicit and fail-closed on ambiguity, disconnect, timeout, or cancellation
- duplicate visible names fail closed for name-based delivery and require id targeting
- adapters surface duplicate-name ambiguity clearly
- runtime fallback aliases remain non-persistent and addressability-only
- message delivery and reply receipt never count as canonical state, evidence, or workflow completion by convenience
- the `intercom`-compatible public adapter remains an adapter rather than the authority model

## Explicit non-goals for AK attachment

- making peer messaging canonical authority
- making peer messaging part of ASC
- making peer messaging part of orchestrator by default
- broadening to room/swarm/network semantics in the first slice
- embedding planner/worker or orchestration policy in the primitive package

## Suggested AK opening note

If you want one concise note to paste into both AK decisions as context:

> These two concerns emerged from the same post-contrib salvage review but should remain separate in AK because they preserve different owner boundaries: orchestrator workflow composition UX above ASC, and a separate same-machine peer-session messaging primitive. The repo-local packet already contains RFCs, concern-local ADR drafts, and a dual-packet decision map; AK is now being asked only to provide canonical decision-runtime closure, not to reopen the owner split already established in the accepted orchestrator boundary ADR.

## Bottom line

The local packet is ready for AK handoff.
The most truthful next move is:

- open **two separate AK decisions**
- attach the corresponding narrow RFC + ADR-draft artifacts to each
- use the broad accepted orchestrator boundary ADR only as supporting context, not as a substitute for these narrower decisions

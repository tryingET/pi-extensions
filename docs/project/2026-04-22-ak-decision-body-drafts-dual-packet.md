---
summary: "Paste-ready AK decision body drafts for the two post-contrib concerns: orchestrator workflow composition UX over ASC and the separate peer-session messaging primitive."
read_when:
  - "You are opening the actual AK decisions for the two post-contrib packets and want ready-to-paste body text."
  - "You already have the RFCs, ADR drafts, and attachment summaries, and now need concise decision descriptions/bodies."
  - "You want the shortest truthful wording that preserves the owner boundaries already established in the packet."
type: "reference"
system4d:
  container: "Repo-root helper for turning the local packet into AK decision rows with minimal rewrite friction."
  compass: "Make the AK decision-opening step crisp and faithful to the packet instead of inventing new wording under time pressure."
  engine: "Provide title -> short summary -> paste-ready decision body -> attachment set for each concern."
  fog: "The main risk is opening AK decisions with vague wording that accidentally reopens settled owner boundaries or collapses the two concerns into one."
---

# 2026-04-22 — AK decision body drafts for the dual packet

## Why this note exists

The packet now already contains:

- RFCs
- concern-local ADR drafts
- a dual-packet decision map
- AK attachment summaries

The remaining friction is often the actual **AK decision row wording**.
This note provides concise, paste-ready text for the two separate decisions.

Recommended default remains:

- open **two AK decisions**, not one merged one

## Decision A — orchestrator workflow composition UX over ASC

## Suggested AK decision title

`Adopt thin chain/parallel/worktree workflow composition UX in pi-society-orchestrator above ASC`

## Suggested short summary

Adopt a thin orchestrator-local workflow-composition layer for chain, parallel, and optional worktree UX above ASC's public execution seam while preserving ASC as execution/runtime owner, AK as canonical authority, and commands/UI/persistence as adapters over a stable package-local workflow contract.

## Paste-ready AK decision body

This decision concerns whether `pi-society-orchestrator` should own a narrow workflow-composition layer for chain, parallel, and optional worktree behavior above the already-landed ASC execution seam.

The proposed decision is:

- `pi-society-orchestrator` may own chain / parallel / optional worktree workflow composition as a **control-plane concern**
- ASC remains the **only execution/runtime owner** for subagent behavior
- the stable core is a package-local `WorkflowRequest` / `WorkflowResult` contract
- commands, UI, builders, and saved workflows are **adapters** over that core rather than the authority model
- `src/chains.yaml` is non-authoritative for this concern unless later explicitly accepted as an adapter/import path
- no workflow summary, adapter artifact, or local persistence form becomes canonical task/evidence authority by convenience

This decision does **not** reopen the accepted broad boundary ADR that already places execution in ASC and coordination in orchestrator. It refines that broad split for one narrower concern: workflow-composition UX above ASC.

## Suggested acceptance criteria wording

Treat the decision as correctly implemented only when all of the following are true:

- workflow request/result contracts remain narrow and explicit
- routing/team validation fails closed before execution starts
- orchestrator still consumes only ASC's public execution seam
- step execution preserves ASC status and `failureKind` truth
- fan-in aggregation is clearly orchestrator-owned and truthful
- worktree dirty-repo and incompatible-cwd cases fail closed if worktree support lands
- the first public adapter remains thin over the workflow core
- package docs describe workflow core first and adapters second
- no workflow output becomes canonical task/evidence authority by convenience

## Suggested explicit non-goals wording

This decision does not authorize:

- reviving a second orchestrator execution runtime
- promoting commands, builders, or saved workflow artifacts into authority
- treating `src/chains.yaml` as first-slice runtime authority
- folding peer-session messaging transport into this concern
- replacing AK as canonical authority

## Attach these artifacts

- `packages/pi-society-orchestrator/docs/project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md`
- `packages/pi-society-orchestrator/docs/adr/2026-04-22-chain-parallel-worktree-ux-over-asc.md`
- `packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`
- `docs/project/2026-04-22-dual-packet-decision-map.md`
- `docs/project/2026-04-22-ak-decision-attachment-summaries-dual-packet.md`

## Decision B — peer-session messaging primitive

## Suggested AK decision title

`Adopt a separate same-machine peer-session messaging primitive in pi-extensions`

## Suggested short summary

Adopt a separate narrow same-machine peer-session messaging primitive in `pi-extensions` rather than embedding peer messaging in ASC or orchestrator, while preserving AK as canonical authority, preserving `intercom` compatibility at the adapter layer, and keeping the stable core limited to presence/message/runtime semantics.

## Paste-ready AK decision body

This decision concerns whether same-machine peer-session messaging should become an owned package concern in `pi-extensions`, and if so where it belongs and how narrow it should stay.

The proposed decision is:

- peer-session messaging belongs in a **separate narrow package concern**, not in ASC or orchestrator by default
- the stable core is a package-local presence/message/runtime contract
- messages and replies are **communication only**; they never become canonical operational state, evidence, or legal effect by themselves
- the first accepted boundary remains **same-machine, direct-message biased, and bounded**
- `intercom` compatibility is preserved at the adapter layer, not the authority layer
- duplicate visible names fail closed and require exact targeting
- unnamed-session fallback aliases remain non-persistent and addressability-only
- the first stable primitive contract keeps one in-flight `ask` per local session unless later explicitly changed

This decision does not move peer messaging into ASC, does not make orchestrator the transport owner, and does not broaden the primitive into room/network semantics without later explicit evidence and decision.

## Suggested acceptance criteria wording

Treat the decision as correctly implemented only when all of the following are true:

- `ask` has bounded timeout behavior with a documented default
- `ask` reply correlation is explicit and fail-closed on ambiguity, disconnect, timeout, or cancellation
- duplicate visible names fail closed for name-based delivery and require id targeting
- adapters surface duplicate-name ambiguity clearly
- runtime fallback aliases remain non-persistent and addressability-only
- message delivery and reply receipt never count as canonical state, evidence, or workflow completion by convenience
- the `intercom`-compatible public adapter remains an adapter rather than the authority model

## Suggested explicit non-goals wording

This decision does not authorize:

- making peer messaging canonical authority
- making peer messaging part of ASC
- making peer messaging part of orchestrator by default
- broadening to room/swarm/network semantics in the first slice
- embedding planner/worker or orchestration policy inside the primitive package

## Attach these artifacts

- `docs/project/2026-04-22-rfc-peer-session-messaging-primitive.md`
- `docs/decisions/peer-session-messaging-primitive.md`
- `docs/project/2026-04-22-dual-salvage-packet-orchestrator-ux-and-peer-messaging.md`
- `docs/project/2026-04-22-dual-packet-decision-map.md`
- `docs/project/2026-04-22-ak-decision-attachment-summaries-dual-packet.md`

## Minimal shared opening note if both AK decisions want the same context paragraph

These two concerns came out of the same post-contrib salvage review, but they should remain separate in AK because they preserve different owner boundaries. One concern is orchestrator workflow-composition UX above ASC. The other is a separate same-machine peer-session messaging primitive. The repo-local packet already contains RFCs, concern-local ADR drafts, and a decision map. AK is being asked to provide canonical decision-runtime closure, not to reopen the already-accepted broad owner split.

## Bottom line

If you want the fastest truthful AK-opening path:

- use the two titles above
- paste the matching short summary into each AK decision row
- use the matching body block as the initial decision description/body
- attach the matching packet artifacts

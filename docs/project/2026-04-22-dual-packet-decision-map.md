---
summary: "One-screen map of the post-contrib dual packet: the two RFCs, the two concern-local ADR drafts, the accepted broad boundary ADR, and the remaining AK decision-closure step."
read_when:
  - "You need the shortest truthful map of how the two post-contrib packets fit together."
  - "Before asking whether an RFC, ADR draft, or accepted ADR already exists for the peer-messaging or orchestrator-workflow concerns."
  - "When preparing the final AK decision attachment/closure pass for these two concerns."
type: "reference"
system4d:
  container: "Repo-root cross-packet decision map for the post-contrib orchestration-UX and peer-messaging concerns in pi-extensions."
  compass: "Keep broad boundary ADRs, narrow concern RFCs, concern-local ADR drafts, and AK decision closure distinct instead of collapsing them into one status word."
  engine: "Map current accepted boundary -> map each concern's RFC and ADR draft -> state what is still missing for canonical decision closure."
  fog: "The main risk is confusing an accepted broad boundary ADR with a narrower concern ADR, or confusing repo-local ADR drafts with final AK decision runtime closure."
---

# 2026-04-22 — dual packet decision map

## Why this note exists

The post-contrib follow-on work now spans:

- one already-accepted broad boundary ADR
- two newer concern RFCs
- two newer concern-local ADR drafts
- one remaining canonical closure step through AK decision runtime

Without one map, it is easy to ask:

- don't we already have an ADR for this?
- is this concern already decided or only packetized?
- what still remains before canonical closure?

This note is the shortest truthful answer.

## The broad boundary that already exists

There is already one **accepted broad package-boundary ADR** for orchestrator/ASC/package ownership:

- `packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`

What it already decides:

- ASC owns execution/runtime behavior for subagents
- `pi-society-orchestrator` owns coordination/control-plane behavior
- duplicate orchestrator-local execution paths are prohibited
- lower-plane ownership stays with the canonical package/CLI owners

What it does **not** decide in full detail:

- the exact narrow chain/parallel/worktree workflow contract above ASC
- the exact narrow peer-session messaging primitive as a separate package concern

So the answer to "do we already have an ADR?" is:

- **yes** for the broad boundary
- **not yet fully** for the two newer narrow concerns unless you count the new concern-local ADR drafts below

## The two narrow concern packets

## Packet A — orchestrator workflow composition UX over ASC

### RFC
- `packages/pi-society-orchestrator/docs/project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md`

### Concern-local ADR draft
- `packages/pi-society-orchestrator/docs/adr/2026-04-22-chain-parallel-worktree-ux-over-asc.md`

### What this packet decides at the repo-doc layer
- orchestrator may own a thin workflow-composition layer for chain / parallel / optional worktree UX
- ASC remains execution/runtime owner
- the stable core is a package-local workflow contract
- commands/UI/persistence are adapters
- `src/chains.yaml` is non-authoritative for this packet unless later explicitly accepted as an adapter path

### What this packet does **not** yet provide by itself
- canonical AK decision runtime closure

## Packet B — peer-session messaging primitive

### RFC
- `docs/project/2026-04-22-rfc-peer-session-messaging-primitive.md`

### Concern-local ADR draft
- `docs/decisions/peer-session-messaging-primitive.md`

### What this packet decides at the repo-doc layer
- peer-session messaging belongs in a separate narrow package concern
- it remains same-machine, direct-message biased, and communication-only
- it does not belong in ASC or orchestrator by default
- `intercom` compatibility is preserved at the adapter layer, not the authority layer

### What this packet does **not** yet provide by itself
- canonical AK decision runtime closure

## The actual closure ladder

For both concerns, the truthful decision ladder is:

1. **Broad accepted package-boundary ADR**
   - already exists where applicable
2. **Narrow concern RFC**
   - problem framing, options, stable core, migration, validation
3. **Concern-local ADR draft**
   - local architecture judgment distilled from the RFC
4. **AK decision attachment and closure**
   - canonical decision runtime legality / passport / closure

Interpretation:

- repo-local ADR drafts are valuable, but they are still **not** the final canonical decision runtime
- the canonical closure step remains AK

## One-table version

| Concern | Broad accepted ADR already exists? | Narrow RFC exists? | Narrow concern-local ADR draft exists? | Canonical AK decision closure still needed? |
|---|---|---:|---:|---:|
| orchestrator chain / parallel / worktree UX over ASC | yes — `packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md` | yes | yes | yes |
| peer-session messaging primitive | broad owner split exists indirectly through the same package-boundary stack + salvage packet, but no older dedicated narrow ADR existed before this wave | yes | yes | yes |

## Relationship between the files

### Root-level packet files

These files explain the dual-packet split across the repo:

- `docs/project/2026-04-22-subagent-contrib-salvage-boundary-status.md`
- `docs/project/2026-04-22-dual-salvage-packet-orchestrator-ux-and-peer-messaging.md`
- this file: `docs/project/2026-04-22-dual-packet-decision-map.md`

### Orchestrator packet files

These files define the narrow orchestrator-side workflow packet:

- RFC: `packages/pi-society-orchestrator/docs/project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md`
- ADR draft: `packages/pi-society-orchestrator/docs/adr/2026-04-22-chain-parallel-worktree-ux-over-asc.md`
- broad accepted boundary ADR: `packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`

### Peer-messaging packet files

These files define the narrow peer-session messaging packet:

- RFC: `docs/project/2026-04-22-rfc-peer-session-messaging-primitive.md`
- ADR draft: `docs/decisions/peer-session-messaging-primitive.md`

## What is still missing

The remaining missing step for both packets is **not** another repo-local RFC or ADR draft.
The remaining missing step is:

- attach the packet artifacts to the appropriate **AK decision(s)**
- inspect legality through AK decision runtime surfaces
- record closure there

That is the last step that turns these packetized local decisions into canonical decision-runtime truth.

## Bottom line

The short truthful answer is:

- **yes**, there was already a broad accepted boundary ADR
- **yes**, both new narrow concerns now also have RFCs and concern-local ADR drafts
- **no**, those local docs are still **not** the final canonical decision closure by themselves
- **yes**, the remaining step for both concerns is AK decision attachment and closure

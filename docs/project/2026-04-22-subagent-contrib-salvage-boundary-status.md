---
summary: "Cross-package status note for what remains worth salvaging from contrib pi-subagents and pi-intercom after the orchestrator→ASC execution-plane cutover."
read_when:
  - "You need the shortest truthful answer to what is already extracted into ASC/orchestrator versus what still only lives in contrib repos."
  - "Before proposing chain UX, worktree fan-out, agent-manager, or peer-session messaging work in pi-extensions."
  - "When deciding whether contrib pi-subagents or pi-intercom should be ported, rebuilt, or rejected."
type: "reference"
system4d:
  container: "Repo-root cross-package boundary note for contrib salvage above the current orchestrator→ASC split."
  compass: "Keep execution ownership in ASC, coordination UX in orchestrator, peer messaging separate, and AK as canonical authority."
  engine: "Reconfirm owned owners -> classify remaining contrib-only concerns by concern, not package name -> decide target landing or rejection."
  fog: "The main risk is reviving a pi-subagents-style monolith or collapsing execution kernel, coordination UX, and peer-session messaging into one package again."
---

# 2026-04-22 — contrib subagent salvage boundary status

## Why this note exists

A fresh-context comparison was requested across:

- owned `pi-society-orchestrator`
- owned `pi-autonomous-session-control` (ASC)
- contrib `pi-subagents`
- contrib `pi-intercom`

The question was not whether the owned stack has subagent operations.
That is already settled.
The question was what still remains worth salvaging **above** the current orchestrator→ASC split.

This note records the smallest truthful current answer so later work can start from the actual owned boundaries instead of replaying an earlier uncertainty packet.

## Current owned boundary already proven

## 1. ASC already owns the execution kernel

ASC is already the strongest current Pi-side execution/runtime owner for subagent behavior.

What is already landed there:

- `dispatch_subagent`
- public package seam: `pi-autonomous-session-control/execution`
- `createAscExecutionRuntime(...)`
- prompt-envelope application
- runtime invariants and failure taxonomy
- session-name reservation and concurrency reservation
- session/status artifacts
- subagent dashboard and inspection surfaces

Primary evidence:

- `packages/pi-autonomous-session-control/README.md`
- `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
- `packages/pi-autonomous-session-control/execution.ts`
- `packages/pi-autonomous-session-control/extensions/self/subagent.ts`
- `packages/pi-autonomous-session-control/extensions/self/subagent-runtime.ts`
- `packages/pi-autonomous-session-control/extensions/self/subagent-dashboard.ts`

## 2. Orchestrator already owns coordination/control-plane behavior

`pi-society-orchestrator` is already the owned coordination/control-plane package.

What is already landed there:

- `cognitive_dispatch`
- `loop_execute`
- routing/team selection via `/agents-team`
- runtime truth surfaces via `/runtime-status`
- control-plane loop sequencing and KES/evidence-oriented coordination
- orchestrator-local timeout/output policy wrapped around the ASC seam

Primary evidence:

- `packages/pi-society-orchestrator/README.md`
- `packages/pi-society-orchestrator/docs/project/runtime-status-semantics.md`
- `packages/pi-society-orchestrator/src/runtime/status-semantics.ts`
- `packages/pi-society-orchestrator/src/runtime/subagent.ts`
- `packages/pi-society-orchestrator/src/loops/engine.ts`

## 3. Orchestrator already cut over to ASC's public seam

The duplicate orchestrator-local runtime path is already retired.

Primary evidence:

- `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- `diary/2026-03-30--feat-asc-public-execution-contract.md`
- `diary/2026-03-30--feat-orchestrator-asc-runtime-cutover.md`
- `diary/2026-03-31--execution-seam-review.md`

Interpretation rule:

- do **not** reopen execution-plane ownership unless new code disproves this split
- current repo evidence does **not** disprove it

## 4. Prompt preparation is already separated from both

Prompt-template retrieval/preparation is no longer a contrib-style local glue problem inside orchestrator.

Exact cognitive-tool prompt preparation now routes through the supported `pi-vault-client/prompt-plane` seam.

Primary evidence:

- `packages/pi-society-orchestrator/docs/project/2026-04-10-prompt-plane-consumer-cutover.md`
- `packages/pi-society-orchestrator/src/runtime/cognitive-tools.ts`

Architectural consequence:

- contrib `prompt-template-bridge` is not a target architecture to revive

## What still only exists in contrib by concern

## 1. Chain / parallel / background orchestration UX

Still contrib-only in meaningful form:

- `/run`, `/chain`, `/parallel`
- background execution UX
- async status overlay
- chain clarification UI
- fan-out/fan-in chain composition

Primary evidence:

- `softwareco/contrib/pi-subagents/README.md`
- `softwareco/contrib/pi-subagents/slash-commands.ts`
- `softwareco/contrib/pi-subagents/chain-execution.ts`
- `softwareco/contrib/pi-subagents/subagent-executor.ts`

Classification:

- **coordination UX**, not execution kernel

## 2. Agent manager / builder surfaces

Still contrib-only in meaningful form:

- agent manager overlay
- parallel builder
- chain editor and chain detail views
- file-backed agent and chain authoring flows

Primary evidence:

- `softwareco/contrib/pi-subagents/agent-manager.ts`
- `softwareco/contrib/pi-subagents/agent-manager-parallel.ts`
- related `agent-manager-*.ts` files

Classification:

- **coordination UX**

Important boundary note:

- the file-backed `.md` / `.chain.md` registry shape in contrib is prior art, not current owned truth
- current owned routing in orchestrator is team-based and package-owned, not a contrib agent-registry contract

## 3. Worktree fan-out UX

Still contrib-only in meaningful form:

- parallel worktree creation
- optional worktree setup hook
- diff/patch capture and fan-in summary

Primary evidence:

- `softwareco/contrib/pi-subagents/worktree.ts`
- `softwareco/contrib/pi-subagents/chain-execution.ts`

Classification:

- **coordination UX / execution-adjacent helper**, but still above the ASC kernel

## 4. Peer-session messaging / presence / ask-send fabric

Still contrib-only in meaningful form:

- local broker + client IPC
- session presence registry
- `send` / `ask` / reply-hint behavior
- session picker + compose overlay
- runtime-only unnamed-session aliasing

Primary evidence:

- `softwareco/contrib/pi-intercom/README.md`
- `softwareco/contrib/pi-intercom/index.ts`
- `softwareco/contrib/pi-intercom/types.ts`
- `softwareco/contrib/pi-intercom/broker/broker.ts`
- `softwareco/contrib/pi-intercom/broker/client.ts`
- `softwareco/contrib/pi-intercom/broker/framing.ts`
- `softwareco/contrib/pi-intercom/broker/spawn.ts`

Classification:

- **peer messaging**, not execution kernel and not canonical authority

## 5. Prompt-template bridge glue

Contrib still contains a prompt-template event bridge, but this concern is no longer missing in the owned architecture in the same form.

Primary evidence:

- `softwareco/contrib/pi-subagents/prompt-template-bridge.ts`
- owned counterevidence: `packages/pi-society-orchestrator/src/runtime/cognitive-tools.ts`
- owned counterevidence: `packages/pi-society-orchestrator/docs/project/2026-04-10-prompt-plane-consumer-cutover.md`

Classification:

- **glue that should be rejected as a target landing**

## Salvage matrix

| Concern | Current owned owner | Contrib source | Salvage? | Target landing | Why |
|---|---|---|---|---|---|
| Subagent execution kernel | ASC | `pi-subagents` runtime/execution path | no | stay in ASC | already extracted; public seam + parity + cutover are landed |
| Chain / parallel workflow UX | no active owned UX surface; orchestrator is the truthful control-plane owner | `pi-subagents` slash/chain execution surfaces | yes, rebuild cleanly | `pi-society-orchestrator` | this is coordination above ASC, not a reason to revive a second runtime |
| Agent manager / builder UI | orchestrator owns routing/team control-plane semantics; ASC owns runtime profiles and status surfaces | `pi-subagents` manager/builder overlays | partial, UX only | `pi-society-orchestrator` | manager ideas are useful; contrib file-registry architecture is not current owned truth |
| Worktree fan-out UX | no current owned owner | `pi-subagents` worktree helpers | yes, narrow salvage | orchestrator-local helper first | useful for parallel coordination; not an ASC concern |
| Peer-session messaging / presence / ask-send | no current owned package | `pi-intercom` broker/client/tool/UI | yes | separate narrow package | orthogonal local peer-messaging primitive; should not be fused into ASC or orchestrator |
| Delegated worker ask/send policy | no current owned owner | `pi-subagents` intercom bridge | partial | orchestrator layered over a peer-messaging package | policy belongs with coordination; transport belongs in the messaging primitive |
| Prompt-template glue | `pi-vault-client` prompt-plane + orchestrator consumer seam + ASC prompt envelope | `pi-subagents` prompt-template bridge | no | reject | current owned stack already has cleaner owner boundaries |

## What should be rejected outright

## 1. A `pi-subagents` monolith as the target architecture

Do **not** rebuild or import a monolith that mixes:

- execution runtime
- coordination UX
- peer messaging
- prompt-template glue
- agent registry persistence

Why:

- execution ownership is already extracted into ASC
- coordination ownership already belongs in orchestrator
- peer messaging is a separate concern
- prompt preparation already has a supported owner seam in `pi-vault-client`

## 2. Contrib file-backed agent/chain registry as current owned truth

Contrib agent files and `.chain.md` files are useful prior-art for UX, but they should not be treated as the owned authority model.

Current owned boundaries instead center on:

- orchestrator routing/team policy
- ASC runtime profiles and session artifacts
- AK as canonical authority

## 3. Prompt-template bridge as a new owned seam

The owned stack already moved away from raw prompt-body and contrib-style event-bridge glue.
That concern should not be reintroduced under a different package name.

## What should stay where

## Keep in ASC

Only execution/runtime-kernel concerns such as:

- public execution seam
- request/result normalization
- prompt-envelope application
- lifecycle/state/status artifacts
- runtime invariants
- dashboard/inspection surfaces tied to runtime ownership

## Keep in orchestrator

Control-plane concerns such as:

- chain/parallel/worktree orchestration UX
- routing and team policy
- higher-level agent manager/builder UX if revived
- delegation policy over lower-plane owners

## Keep as a separate narrow peer-messaging primitive

Local peer-session communication concerns such as:

- presence
- broker/client IPC
- `send` / `ask`
- reply threading / reply hints
- picker/compose overlay

Interpretation rule:

- this is **not** canonical authority
- this is **not** “Pi querying itself”
- this is a local session-to-session messaging fabric

## Current owned gap statement

The remaining gap above the current orchestrator→ASC split is therefore **not** a missing execution kernel.
It is a combination of:

1. missing orchestrator-native chain/parallel/worktree UX
2. missing owned agent-manager/builder UX, if that UX is still wanted
3. missing separate peer-session messaging primitive

That is materially different from “port `pi-subagents`”.

## Next bounded move

The next truthful move is a planning slice, not a monolithic port.
That planning split is now materialized as two sibling follow-on packets:

- [`2026-04-22-dual-salvage-packet-orchestrator-ux-and-peer-messaging.md`](2026-04-22-dual-salvage-packet-orchestrator-ux-and-peer-messaging.md)
- [`packages/pi-society-orchestrator/docs/project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md`](../../packages/pi-society-orchestrator/docs/project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md)
- [`2026-04-22-rfc-peer-session-messaging-primitive.md`](2026-04-22-rfc-peer-session-messaging-primitive.md)

The architecture rule remains the same: proceed with both slices, but keep them separate.

## 1. Open one orchestrator-side design packet for clean coordination UX

Scope it to:

- chain / parallel workflows
- worktree fan-out UX
- optional manager/builder UX
- explicit reuse of ASC's public seam

Guardrails:

- no private ASC imports
- no revived orchestrator execution runtime
- no prompt-plane ownership drift
- no peer-messaging transport fused into the package

## 2. Open one separate narrow peer-messaging packet

Scope it to:

- broker/client transport
- session presence
- `send` / `ask`
- minimal UI affordances

Guardrails:

- no AK authority claims
- no execution-kernel responsibilities
- no orchestrator control-plane logic hidden in the transport layer

## Bottom line

The owned stack already extracted the execution kernel into ASC and the coordination/control plane into orchestrator.
What remains worth salvaging from contrib is mostly:

- orchestration UX from `pi-subagents`
- peer-session messaging from `pi-intercom`

The right target shape is therefore:

- **ASC** for execution/runtime
- **orchestrator** for chain/parallel/worktree/manager UX above that runtime
- **a separate narrow package** for local peer messaging
- **explicit rejection** of a new `pi-subagents` monolith

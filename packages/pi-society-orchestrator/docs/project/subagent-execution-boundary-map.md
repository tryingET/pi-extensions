---
summary: "Central map for the cross-package subagent execution-boundary packet spanning pi-society-orchestrator and pi-autonomous-session-control."
read_when:
  - "You need one place that explains which subagent-boundary doc is evidence, which is decision, which is seam proposal, and which is backlog."
  - "You are starting the ASC public execution-contract work and want the current AK decomposition without rediscovering the packet."
system4d:
  container: "Cross-package execution-boundary orientation doc."
  compass: "Keep ASC as the execution-plane owner, keep orchestrator as the coordination-plane owner, and make the supporting docs legible in one pass."
  engine: "state current truth -> map doc roles -> show chronology -> bind the next AK wave."
  fog: "The main risk is rereading the packet as competing documents instead of one evidence -> decision -> contract -> migration chain."
---

# Subagent execution-boundary map

## Why this file exists

The subagent/runtime-boundary work currently spans two packages and several document types:

- evidence/discovery
- an adopted boundary decision
- a contract-shaping RFC
- a migration backlog / HTN
- current owner-package runtime docs
- current duplicate-runtime code in orchestrator

This file is the **single starting point** so the packet stops feeling scattered.

## Current truth in one screen

- **ASC (`pi-autonomous-session-control`) is the current execution-plane owner** for subagent runtime behavior.
- **`pi-society-orchestrator` is the current coordination/control-plane owner** and now consumes ASC through the public execution seam instead of carrying a second long-term spawn/runtime path.
- **Upstream Pi** already owns generic widgets, footers, overlays, and custom-editor primitives.
- **`pi-interaction`** owns interaction-runtime behavior such as trigger brokering, picker/selection flows, and editor mounting.
- **`pi-vs-claude-code`** is a pattern/reference repo, not the canonical runtime owner.
- The execution wave itself is now landed:
  - ASC exposes the public package-level execution contract proposed by the RFC
  - the published contract is intentionally the headless execution seam (`createAscExecutionRuntime`) rather than a mixed runtime+tool-registration surface
  - parity between the tool path and public runtime is covered on the ASC side
  - orchestrator now routes `cognitive_dispatch` and loop execution through that seam via `src/runtime/subagent.ts`
  - the seam now has an explicit post-cutover charter defining why it exists, what it must not grow into, and when it should be reconsidered
- The remaining execution-seam debt is narrower:
  - orchestrator tarballs currently bundle `pi-autonomous-session-control`
  - installed-package smoke now lifts bundled dependencies and host peers so direct node imports stay truthful during headless validation

## Read order

1. **This file** — one-screen orientation and current AK wave
2. [Execution seam charter](2026-03-31-execution-seam-charter.md) — why the seam exists, what it must stay, and when it should be reviewed or removed
3. [Phase A UI capability discovery](2026-03-10-ui-capability-discovery.md) — evidence for package placement
4. [ADR — control-plane boundaries](../adr/2026-03-11-control-plane-boundaries.md) — adopted boundary decision
5. [RFC — ASC public execution contract](2026-03-10-rfc-asc-public-execution-contract.md) — preferred seam shape under the ADR
6. [Architecture convergence backlog](2026-03-10-architecture-convergence-backlog.md) — migration HTN and broader dependency cleanup
7. ASC current runtime owner docs/code:
   - [ASC README](../../pi-autonomous-session-control/README.md)
   - [ASC tool surface overview](../../pi-autonomous-session-control/docs/project/tool-surface-overview.md)
   - `../../pi-autonomous-session-control/extensions/self.ts`
   - `../../pi-autonomous-session-control/extensions/self/subagent.ts`
7. Orchestrator current consumer-side adapter/call sites:
   - `../../pi-society-orchestrator/src/runtime/subagent.ts`
   - `../../pi-society-orchestrator/extensions/society-orchestrator.ts`
   - `../../pi-society-orchestrator/src/loops/engine.ts`

## What each document is for

| Artifact | Kind | Current status | Use it to answer |
|---|---|---|---|
| [2026-03-31-execution-seam-charter.md](2026-03-31-execution-seam-charter.md) | stewardship charter | current | "Why does the seam exist at all, how small should it stay, and when should it be removed or reviewed?" |
| [2026-03-10-ui-capability-discovery.md](2026-03-10-ui-capability-discovery.md) | evidence note | complete | "Why doesn't this belong in a new helper package or in pi-vs-claude-code?" |
| [2026-03-11-control-plane-boundaries.md](../adr/2026-03-11-control-plane-boundaries.md) | ADR / decision | accepted direction, implementation incomplete | "Who owns what plane and which seams are allowed?" |
| [2026-03-10-rfc-asc-public-execution-contract.md](2026-03-10-rfc-asc-public-execution-contract.md) | implementation RFC | historical proposal with landed follow-up narrowing | "What seam was proposed first, and where did the final public contract end up narrower?" |
| [2026-03-10-architecture-convergence-backlog.md](2026-03-10-architecture-convergence-backlog.md) | backlog / HTN | active planning surface | "What is the migration order and how do we decompose it?" |
| [../../pi-autonomous-session-control/README.md](../../pi-autonomous-session-control/README.md) | owner-package charter | current runtime truth | "Where does the real subagent runtime live today?" |
| `../../pi-society-orchestrator/src/runtime/subagent.ts` | code reality | consumer-side adapter over the ASC public runtime | "How does orchestrator preserve its package-local policy while delegating execution to ASC?" |

## Chronology

| Date | Artifact/event | Why it matters |
|---|---|---|
| 2026-03-10 | Discovery note + RFC were authored for the execution-plane question | Evidence and seam-shape thinking existed before the boundary packet was made legible enough |
| 2026-03-11 | The ADR first landed with the package scaffold | The boundary decision started one day after the RFC wave rather than replacing it |
| 2026-03-22 / 2026-03-30 | Later doc refreshes updated the package charter and surrounding convergence notes | The packet grew, but the chronology became harder to see |
| 2026-03-30 | This map reconciles the packet and makes the execution wave explicit again | Future work should start here instead of rediscovering the same split |

## Current implementation gap

### What is already true

ASC already owns the stronger runtime behaviors:

- `dispatch_subagent`
- prompt-envelope application
- session lifecycle and status artifacts
- runtime invariants / Edge Contract Kernel guards
- dashboard and inspect surfaces
- the public execution entrypoint used by orchestrator consumers

### What is still missing

The ownership seam is now implemented and the publish/install cleanup for the current packaging model is in place:

- orchestrator currently bundles `pi-autonomous-session-control` into its tarball as a temporary installability bridge; the allowed lifetime, exit criteria, and review trigger now live in [bundled ASC bridge lifecycle](2026-03-31-bundled-asc-bridge-lifecycle.md)
- installed-package smoke now validates the real packaged import graph, including bundled ASC plus host-peer linking for Pi runtime packages while that bridge remains active
- the seam charter now defines the explicit anti-drift justification, supported scope, guardrails, and removal criteria
- post-cutover work should only extend the seam if a real consumer gap appears, not because the original ownership question is still open

## Current AK decomposition

AK is the authority for execution state. The core subagent execution-boundary wave is now complete:

| AK task | Purpose | Status |
|---:|---|---|
| `#604` | Expose `pi-autonomous-session-control` public execution contract for subagent runtime consumers | done |
| `#605` | Add a parity harness proving the ASC public runtime matches `dispatch_subagent` tool behavior | done |
| `#606` | Adopt the ASC public execution runtime in `pi-society-orchestrator` and retire the duplicate subagent path | done |

Dependency order that landed:

```text
#604 -> #605 -> #606
```

Interpretation:
- `#604` created the seam
- `#605` proved the seam is behaviorally trustworthy
- `#606` cut orchestrator over and retired the old duplicate spawn/runtime path
- the remaining work is post-cutover packaging/runtime hygiene, not reopening execution-plane ownership

## Non-goals that still hold

- Do **not** create a second long-term subagent runtime in orchestrator.
- Do **not** treat `pi-vs-claude-code` as the canonical runtime owner.
- Do **not** create a new UI-helper package unless a real multi-consumer gap is proven later.
- Do **not** use private `../pi-autonomous-session-control/extensions/self/*` imports as the long-term orchestrator seam.
- Do **not** let tool-UX polish substitute for fixing the execution-plane boundary first.

## Practical rule

When the question is:

- **"Who owns the subagent runtime?"** → ADR + ASC README
- **"Why that owner?"** → discovery note
- **"What seam should we implement?"** → ASC public execution contract RFC
- **"What should we do next in code?"** → treat `#604` → `#605` → `#606` as landed history, then focus only on post-cutover packaging/runtime hygiene or new evidence-backed seam gaps

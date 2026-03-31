---
summary: "Charter for keeping the ASC public execution seam minimal, justified, and removable after the orchestrator cutover."
read_when:
  - "You are deciding whether the ASC public execution seam should grow, stay narrow, or be removed later."
  - "You need the shortest truthful answer to why the seam exists at all after #604 -> #605 -> #606."
system4d:
  container: "Post-cutover execution-boundary stewardship note."
  compass: "Keep ASC as execution-plane owner, keep orchestrator as a narrow consumer, and prevent abstraction creep."
  engine: "state why the seam exists -> define supported scope -> name guardrails -> define removal criteria."
  fog: "The main risk is letting a tactical anti-drift seam become a vague permanent abstraction by inertia."
---

# Execution seam charter — 2026-03-31

## Decision in one sentence

Keep the ASC public execution seam because `pi-society-orchestrator` needs **programmatic access** to ASC-owned execution behavior, but keep that seam **headless, minimal, and removable**.

## Why the seam exists at all

After the orchestrator cutover, there are only three realistic options:

1. **Duplicate the runtime in orchestrator**
   - rejected because it recreates drift in spawn semantics, abort handling, buffering, lifecycle invariants, and result shaping
2. **Import ASC private internals from `extensions/self/*`**
   - rejected because it couples orchestrator to an unstable source layout and `self`-specific composition details
3. **Expose a narrow public execution seam**
   - accepted because it preserves single ownership of execution behavior in ASC while giving orchestrator a supported programmatic path

The seam is therefore an **anti-drift boundary**, not an architecture trophy.

## Supported scope

The seam should stay limited to the smallest headless runtime contract that a non-UI consumer needs:

- `createAscExecutionRuntime(...)`
- request/result/runtime types needed to call it truthfully
- optional `AbortSignal` propagation
- execution truth in `result.details` needed for orchestration decisions

## Explicit non-goals

This seam does **not** exist to:

- expose arbitrary `extensions/self/*` helpers as public API
- turn ASC dashboard/UI composition into shared runtime surface
- provide a general helper package for unrelated Pi extensions
- create a stable contract for every internal subagent utility
- justify a second long-term execution owner besides ASC

## Consumer capability map

| Consumer | Current call path | Capability actually needed | Why the public seam is sufficient |
|---|---|---|---|
| Orchestrator direct dispatch | `extensions/society-orchestrator.ts` -> `src/runtime/subagent.ts` | custom prompt composition, cwd, optional abort, execution truth, bounded output policy wrapping | needs execution behavior, not ASC UI/tool internals |
| Orchestrator loop execution | `src/loops/engine.ts` -> `src/runtime/subagent.ts` | repeated phase dispatch, injected tool content, optional abort, execution truth | same execution core, different orchestration context |
| ASC tool surface | `extensions/self/subagent.ts` | tool registration bound to the same runtime core | should continue to compose the shared core internally, not redefine it |

## Guardrails

Any future seam change should preserve these rules:

1. **No private ASC imports from orchestrator**
   - do not import `../pi-autonomous-session-control/extensions/self/*` as a consumer seam
2. **No orchestrator-local execution runtime revival**
   - do not reintroduce a second spawn/runtime implementation in orchestrator
3. **No UI creep into the headless contract**
   - tool registration and dashboard composition stay ASC-owned extension-layer concerns
4. **Transport-safety invariants stay contract-level**
   - abort propagation, bounded output/event buffering, lifecycle uniqueness, and hard I/O failure surfacing must stay covered
5. **Verification layers must stay explicit**
   - ASC package-local contract tests prove seam semantics and transport-safety invariants
   - orchestrator package-local consumer tests prove the narrow adapter still preserves that truth in repo-local source
   - installed-package smoke proves packaged import/install behavior, including the current bundled ASC bridge
   - do not let any one layer stand in for the others
6. **Run the seam-change checklist before modifying the contract**
   - use the companion [execution contract change checklist](../../pi-autonomous-session-control/docs/project/execution-contract-change-checklist.md) before widening, narrowing, or re-shaping the public runtime

## Removal criteria

The seam should be reconsidered for removal if any of the following becomes true:

- orchestrator no longer needs programmatic access to ASC-owned execution behavior
- ASC becomes the only remaining real caller of the headless runtime
- a successor governed delegated cognition runtime replaces both today's orchestrator-consumer path and ASC's current public seam
- the seam's packaging/compatibility cost exceeds its anti-drift value based on actual consumer count and maintenance history

## Review trigger

Run an explicit seam review when:

- a second external consumer asks for new capabilities
- packaging/release pressure forces the seam to widen
- the trigger in [bundled ASC bridge lifecycle](2026-03-31-bundled-asc-bridge-lifecycle.md) fires for retiring the temporary installability bridge
- installed-package smoke starts diverging from the package-local contract or consumer tests
- one to two release cycles have passed with enough evidence to judge whether the seam is still earning its keep

## Current bias

Current answer:

- **keep** the seam
- **keep it small**
- **do not broaden it without evidence**
- **treat removal as a future evidence-based decision, not a default assumption**

## Companion docs

- [Subagent execution-boundary map](subagent-execution-boundary-map.md)
- [ASC public execution contract RFC](2026-03-10-rfc-asc-public-execution-contract.md)
- [Architecture convergence backlog](2026-03-10-architecture-convergence-backlog.md)
- [Bundled ASC bridge lifecycle](2026-03-31-bundled-asc-bridge-lifecycle.md)
- [ASC public execution contract](../../pi-autonomous-session-control/docs/project/public-execution-contract.md)
- [Execution contract change checklist](../../pi-autonomous-session-control/docs/project/execution-contract-change-checklist.md)

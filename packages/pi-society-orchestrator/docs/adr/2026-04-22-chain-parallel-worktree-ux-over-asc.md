---
summary: "Accepted package-local ADR for adding chain, parallel, and optional worktree orchestration UX in pi-society-orchestrator above ASC's public execution seam without reviving a second runtime or a contrib-style monolith."
status: accepted
read_when:
  - "You are deciding whether chain/parallel/worktree workflow UX belongs in pi-society-orchestrator under the current ASC boundary."
  - "You need the ADR-layer decision text distilled from the chain/parallel/worktree RFC."
  - "You are reviewing whether this new workflow packet reopens the accepted control-plane boundary ADR."
system4d:
  container: "Package-local ADR for workflow-composition UX in pi-society-orchestrator."
  compass: "Own workflow composition and optional worktree coordination in orchestrator while preserving ASC as execution owner and AK as canonical authority."
  engine: "state problem -> compare options -> choose owner/layer -> define stable core and guardrails -> carry forward acceptance criteria."
  fog: "The biggest risk is reviving an orchestrator-local execution runtime or promoting convenience persistence and UI surfaces into the authority model."
---

# ADR — Chain / parallel / worktree UX over ASC for `pi-society-orchestrator`

## Status

Accepted as the package-local ADR for this workflow packet.

Canonical decision-runtime closure is recorded in `AK decision 20`:

- `Adopt thin chain/parallel/worktree workflow composition UX in pi-society-orchestrator above ASC`

This document is **not** the canonical decision runtime by itself.
It is the package-local ADR artifact recorded by that AK decision.

## How to read this ADR with the supporting packet

Read this as the **decision layer** distilled from the current packet:

- RFC: [`../project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md`](../project/2026-04-22-rfc-chain-parallel-worktree-ux-over-asc.md)
- broad boundary ADR: [`2026-03-11-control-plane-boundaries.md`](2026-03-11-control-plane-boundaries.md)
- execution packet map: [`../project/subagent-execution-boundary-map.md`](../project/subagent-execution-boundary-map.md)
- execution seam charter: [`../project/2026-03-31-execution-seam-charter.md`](../project/2026-03-31-execution-seam-charter.md)
- contrib salvage note: [`../../../../docs/project/2026-04-22-subagent-contrib-salvage-boundary-status.md`](../../../../docs/project/2026-04-22-subagent-contrib-salvage-boundary-status.md)

Use the RFC for fuller rationale and future-facing detail.
Use this ADR for the actual architecture judgment.

## Relationship to the accepted boundary ADR

This ADR does **not** reopen the accepted package boundary in [`2026-03-11-control-plane-boundaries.md`](2026-03-11-control-plane-boundaries.md).

That accepted ADR already established that:

- ASC owns execution/runtime behavior for subagents
- `pi-society-orchestrator` owns coordination/control-plane behavior
- duplicate orchestrator-local execution paths are prohibited

This ADR refines that accepted split by deciding a narrower question:

> should orchestrator own chain / parallel / worktree workflow composition UX **above** ASC's public execution seam?

Answer:

- **yes**
- but only as a thin workflow-composition layer with a small package-local workflow contract as the stable core
- and without turning commands, saved workflows, or builders into the authority model

## Executive summary

`pi-society-orchestrator` should adopt a **thin workflow-composition layer** for:

- chain execution
- parallel execution
- optional worktree isolation and fan-in summaries

That layer should:

- live in orchestrator
- validate against current orchestrator agent/routing semantics
- execute delegated steps only through ASC's public execution seam
- keep commands/UI/persistence as adapters over a stable package-local workflow contract

That layer should **not**:

- become a second execution runtime
- import private ASC internals
- treat `src/chains.yaml` or future saved workflow artifacts as the authority model
- become a hidden replacement for AK authority or the existing loop family

## Decision

Inside `pi-society-orchestrator`, chain / parallel / optional worktree workflow UX is a **package-local control-plane concern** above ASC.

### Ownership assignment

- **AK** remains canonical authority/runtime truth outside the local workflow runtime
- **ASC** remains execution/runtime owner for subagent behavior
- **`pi-society-orchestrator`** owns workflow composition, team/routing validation, fan-out/fan-in shaping, and optional worktree coordination

### Architectural rule

Workflow composition is **control-plane orchestration**, not execution ownership.

Step execution truth remains ASC-owned.
Canonical task/evidence truth remains AK-owned.

If a workflow later wants to write durable task/evidence meaning, that must happen through the appropriate owned contract and canonical authority surface, not by treating workflow summaries or adapter artifacts as authority by convenience.

## Context

The current package already has:

- a narrow current agent profile model (`scout`, `builder`, `reviewer`, `researcher`)
- routing/team semantics (`full`, `explore`, `implement`, `quality`)
- loops as a separate phase-driven cognitive workflow family
- an orchestrator-side adapter over ASC's public execution seam in `src/runtime/subagent.ts`

What it still lacks is an owned workflow-composition UX for concerns that contrib `pi-subagents` explored and that still sit above the current orchestrator→ASC split:

- run a sequence of delegated steps
- run tasks in parallel
- optionally isolate parallel code-changing runs with worktrees
- maybe later provide thin launch/build helpers

The architectural problem is therefore not whether execution is missing.
It is whether this workflow-composition layer belongs in orchestrator, and how narrow its authority surface should remain.

## Decision drivers

- preserve the already-landed ASC/orchestrator execution boundary
- recover useful chain / parallel / worktree coordination UX without reviving a contrib-style monolith
- keep the stable core smaller than commands, builders, or persistence formats
- avoid promoting convenience persistence into the authority model too early
- avoid premature shared-package extraction before a second real consumer exists
- keep loops and workflow composition separate unless later evidence proves they should converge
- keep rollback to the current direct-dispatch + loops posture simple and truthful

## Decision synthesis

Several strong architectural instincts compete here, and the disagreement is substantive rather than stylistic.

### Boundary-first discipline

This position says the only durable win is to keep one execution owner and one authority model.
From this view, any workflow surface that drifts into local spawn logic, local lifecycle truth, or persistence-led authority is already a regression, even if the UX feels better in the moment.
What it sees correctly is that brownfield convenience usually reintroduces shadow runtimes by degrees rather than by announcement.

### Ergonomics-first recovery

This position says the owned stack still lacks a usable operator surface for multi-step delegation.
From this view, a pure boundary story that offers only direct dispatch and generic loops leaves real coordination value stranded in contrib.
What it sees correctly is that chain / parallel / worktree UX is not decorative; it is the practical reason to rebuild a workflow layer at all.

### Abstraction-first reuse

This position says the cleanest answer is to extract a generic engine or persistence model up front.
From this view, package-local workflow logic is only a temporary special case and should be generalized before it hardens.
What it sees correctly is that successful local workflow cores often create later reuse pressure.

### Minimalist no-new-surface discipline

This position says the safest move is to add nothing and route operators to existing loops and dispatch paths.
What it sees correctly is that every new surface creates new implied contracts and maintenance burden.

The collisions between these positions are real:

- boundary-first and ergonomics-first can coexist only if ergonomics stays strictly downstream of the workflow core and the ASC seam
- boundary-first and persistence-first cannot govern the first slice together, because a saved-workflow registry would immediately start acting like the authority model
- abstraction-first and evidence-first cannot both win today, because there is no proven second consumer yet
- loops-only minimalism and workflow-composition recovery cannot both describe the missing surface, because the gap is not phase-loop execution but arbitrary multi-step fan-out/fan-in coordination

The chosen architecture is therefore an ordered dominance, not a compromise:

1. boundary discipline governs execution ownership and authority
2. workflow ergonomics is admitted only as a thin adapter layer above that boundary
3. shared-engine and persistence pressure are deferred until real evidence appears
4. loops remain a separate family unless later evidence proves convergence is the better architecture

This ordering preserves the only synthesis that does not smuggle contradiction back into the package:

- ASC remains the only execution/runtime owner
- orchestrator gains the missing workflow-composition surface where it legitimately belongs
- commands, builders, and saved workflows stay subordinate to the workflow core rather than redefining it

## Options considered

### Option A — thin structured workflow core over ASC **(chosen)**

Define a small package-local workflow request/result contract and execute it through current orchestrator routing + ASC seam.

Why chosen:

- preserves execution ownership in ASC
- keeps commands/UI as adapters rather than authority
- is testable
- avoids monolith revival

### Option B — saved workflow registry first

Rejected as the first authority-bearing surface.

Reason:
- persistence shape would gain too much authority too early and import contrib assumptions before the core is proven

### Option C — extract a shared workflow helper/package first

Rejected for the first slice.

Reason:
- insufficient evidence for a second real consumer
- optimizes for hypothetical reuse instead of current truthful ownership

### Option D — keep current state and rely on loops only

Rejected.

Reason:
- does not address the identified chain / parallel / worktree UX gap

### Option E — port contrib `pi-subagents` wholesale

Rejected.

Reason:
- would reintroduce the exact monolithic failure pattern already ruled out by the salvage packet

## Stable core vs adapter boundary

### Stable core

The stable core of the decision is a package-local workflow contract consisting of:

- `WorkflowRequest`
- `WorkflowResult`
- `WorkflowStepResult`
- team/routing validation against current orchestrator semantics
- delegation through ASC's public execution seam only
- optional worktree behavior bounded to parallel groups

### Adapters

Adapters may include:

- one package-local workflow tool/runtime entrypoint
- optional `/chain` and `/parallel` command wrappers
- optional read-only inspection views
- optional builder/manager UX later
- optional saved workflow artifacts later
- legacy `src/chains.yaml` import/adapter logic only if explicitly accepted later

### Adapter rule

Commands, builders, and persistence are useful, but they are **not** the authority model.
The stable core remains the package-local workflow contract.

### Compatibility posture

The first public adapter should default to one package-local `workflow_execute`-style tool/runtime entrypoint.
Optional `/chain` and `/parallel` commands may exist as thin wrappers over that same core.
Treat those wrappers as adapters, not as the authority model.

## Workflow contract and boundaries carried by the decision

### Workflow request shape

The first stable workflow contract is a narrow explicit structured surface:

- `mode: "chain" | "parallel"`
- `steps: WorkflowNode[]`
- `WorkflowStep` uses the current fixed agent profile set
- `WorkflowParallelGroup` carries optional `concurrency` and `worktree`

### Routing and team validation

- validation happens before execution starts
- the first slice is intentionally constrained to current orchestrator agent/team semantics
- richer agent-definition persistence is not implied by this decision

### Worktree boundary

- worktree is a **parallel-group option**, not a workflow-global setting
- all worktree tasks in one parallel group share one effective repo/cwd root
- dirty repo state fails closed
- incompatible task-level cwd overrides fail closed
- worktree diff/patch capture is orchestrator-owned aggregation, not ASC runtime behavior

### Pass-through ASC truth vs orchestrator-owned aggregation

- step execution status remains ASC truth
- step `failureKind` remains ASC truth
- step output shaping remains ASC truth, subject only to existing orchestrator display policy
- grouping, fan-in aggregation, and worktree summaries are orchestrator-owned control-plane outputs
- canonical task/evidence truth remains AK-owned

## Current package constraints carried forward

### Current agent/routing model is intentionally narrow

The first accepted surface is constrained to the package's current owned model:

- agent profiles: `scout`, `builder`, `reviewer`, `researcher`
- routing teams: `full`, `explore`, `implement`, `quality`

This constraint is deliberate, not an accidental temporary omission.

### `src/chains.yaml` is non-authoritative for this packet

The package currently ships `src/chains.yaml`, but this ADR does **not** treat it as workflow runtime authority.

For this packet it is:

- historical/dormant package content
- not the stable core contract
- at most a future adapter input or migration seed if later explicitly accepted

## Scope limits carried by this decision

This decision covers:

- chain workflow composition
- parallel workflow composition
- optional worktree coordination for parallel groups
- one stable workflow core with adapters around it

This decision does **not** cover:

- execution/runtime ownership
- prompt-plane ownership
- peer-session messaging transport
- saved workflow formats as first-slice authority
- convergence of loops and workflow composition
- richer agent-definition persistence

## Migration posture

The first accepted direction is additive:

1. land the stable workflow core
2. expose one package-local workflow tool/runtime entrypoint as the first public adapter
3. optionally add thin command wrappers
4. optionally add worktree coordination
5. only later reassess builders or saved workflow adapters if the thin surface proves useful

## Rollback posture

If the first slice proves wrong:

- remove or disable the new workflow adapters
- leave ASC execution seam untouched
- keep direct dispatch and existing loops as current truth
- do not preserve failed adapter or persistence decisions as authority artifacts
- keep `src/chains.yaml` dormant/non-authoritative unless a later explicit adapter decision lands

## Acceptance criteria carried forward

Before this decision should be treated as successfully landed in implementation, the resulting package surface should prove at least:

- workflow request/result contracts remain narrow and explicit
- routing/team validation fails closed before execution starts
- orchestrator still consumes only ASC's public execution seam
- step execution preserves ASC status and `failureKind` truth
- fan-in aggregation is truthful and clearly orchestrator-owned
- worktree dirty-repo and incompatible-cwd cases fail closed if worktree support lands
- the first public adapter remains a thin adapter over the workflow core rather than a second authority surface
- commands, if added, remain thin adapters over the workflow core
- package docs describe the workflow core first and adapters second
- no workflow output becomes canonical task/evidence authority by convenience

## Consequences

### Positive

- one owned home for chain / parallel / optional worktree workflow composition
- clear separation from ASC execution ownership
- reusable workflow contract inside orchestrator without prematurely extracting a shared engine
- cleaner future migration than continuing direct-dispatch-only or contrib-shaped workflow assumptions
- better discipline around control-plane aggregation vs execution truth

### Tradeoffs

- one more local contract surface to maintain inside orchestrator
- first-slice constraints stay intentionally narrow
- future pressure for richer persistence, broader agent models, or shared extraction will require later explicit decisions
- commands/builders cannot be treated as the architecture just because they are more visible than the core

## Non-goals

This ADR does **not** say:

- orchestrator may revive a second execution runtime
- `src/chains.yaml` is now authoritative
- builder/manager UX is approved as part of the first slice
- saved workflow artifacts are now the authority model
- loops and workflow composition have converged
- AK authority is replaced by workflow summaries or local artifacts

## Bottom line

Adopt a **thin orchestrator-local workflow-composition layer** for chain / parallel / optional worktree UX above ASC.

Keep:

- AK as authority
- ASC as execution/runtime owner
- orchestrator as workflow composition and control-plane owner
- commands/UI/persistence as adapters over a small package-local workflow contract

Do not let workflow convenience surfaces become authority by convenience.

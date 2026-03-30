---
summary: "Proposal for an ASC-owned public execution contract that pi-society-orchestrator can consume without private imports or duplicate runtime logic."
read_when:
  - "Before deciding how pi-society-orchestrator should reuse ASC execution behavior."
  - "When reviewing whether ASC should expose a public runtime contract or force immediate extraction."
system4d:
  container: "Focused proposal for the execution-plane seam between ASC and pi-society-orchestrator."
  compass: "Preserve ASC as execution-plane owner while creating the smallest reusable public contract."
  engine: "state pain -> propose additive contract -> constrain blast radius -> define migration."
  fog: "The main failure mode is leaking `self`-specific extension concerns into the consumer-facing seam."
---

# ASC public execution contract proposal

## Role in the packet

This RFC is the **seam-shaping document** under the adopted boundary decision in [../adr/2026-03-11-control-plane-boundaries.md](../adr/2026-03-11-control-plane-boundaries.md).

Use it together with:
- the central map: [subagent-execution-boundary-map.md](subagent-execution-boundary-map.md)
- the discovery evidence: [2026-03-10-ui-capability-discovery.md](2026-03-10-ui-capability-discovery.md)
- the migration backlog: [2026-03-10-architecture-convergence-backlog.md](2026-03-10-architecture-convergence-backlog.md)

Interpretation rule:
- the ADR answers **who owns the execution plane**
- this RFC answers **what the first supported public seam should look like**
- the backlog / AK tasks answer **what to implement next**

## A) Proposal summary

`pi-autonomous-session-control` should expose a small, stable **public execution contract** for non-UI consumers so `pi-society-orchestrator` can reuse ASC-owned subagent execution behavior without either duplicating runtime logic or importing private `extensions/self/*` internals. The smallest useful change is to promote the existing `dispatch_subagent` runtime path into a package-level public entrypoint that keeps ASC as the execution-plane owner, preserves current tool behavior, and leaves extraction to a future shared runtime package only if the public contract cannot be made clean without leaking `self`-specific concerns.

## B) Current behavior and limitation

- Current behavior:
  - `pi-society-orchestrator` currently carries its own local execution runtime in `src/runtime/subagent.ts`, consumed from `extensions/society-orchestrator.ts` and `src/loops/engine.ts`:
    - local `buildCombinedSystemPrompt(...)`
    - local `spawnPiSubagent(...)`
    - local Pi subprocess/session-file handling for spawned execution
  - ASC already owns the stronger execution-plane implementation in `pi-autonomous-session-control`:
    - `dispatch_subagent` tool registration in `extensions/self/subagent.ts`
    - spawn lifecycle in `extensions/self/subagent-spawn.ts`
    - lifecycle/state/session invariants in `extensions/self/subagent-session.ts` and `extensions/self/subagent-edge-contract.ts`
    - prompt-envelope application in `extensions/self/subagent-prompt-envelope.ts`
    - operator/dashboard support in `extensions/self/subagent-dashboard*.ts`
  - ASC package surface is currently extension-first:
    - `package.json` ships `extensions/self.ts` and `extensions/self/`
    - `extensions/self.ts` composes delegation runtime internally via `registerDelegationRuntime(...)`
    - there is no documented package-level public non-tool execution entrypoint for downstream consumers
    - there is also no package-level `exports` contract or published runtime-oriented file whitelist for this seam yet
- Limitation:
  - `pi-society-orchestrator` cannot currently consume ASC execution behavior through a supported package seam.
  - That leaves two bad options:
    1. keep a duplicate local execution runtime in orchestrator
    2. import private ASC internals from `../pi-autonomous-session-control/extensions/self/*`
- Current workaround and why it is fragile:
  - Current workaround is the local orchestrator runtime duplication.
  - It is fragile because it bypasses ASC's stronger lifecycle handling, timeout behavior, prompt-envelope support, session-status artifacts, and invariant checks.
  - Private source imports would be equally fragile because they would couple orchestrator to ASC internal layout and `self` extension bootstrapping details rather than a stable contract.

## C) Requested change

- Primary change:
  - Add a public ASC execution entrypoint for non-UI consumers that exposes the `dispatch_subagent` runtime as a supported package contract.
  - Keep the surface minimal and execution-plane-only:
    - request/result types
    - runtime/state construction
    - execution method
    - optional tool-registration helper for ASC's own extension entrypoint
- Optional follow-up changes:
  - Add a small public helper for session-status/dashboard data access if a second consumer needs it.
  - Add structured execution events or callbacks only if orchestrator later proves a real need beyond `onUpdate`/result details.
  - Extract a separate shared execution-runtime package only if the ASC public contract cannot avoid leaking `self`-specific concerns.

## D) Why this matters

- Developer impact:
  - lets `pi-society-orchestrator` delete duplicate spawn/runtime code instead of maintaining a second execution plane
  - gives downstream consumers a stable supported seam instead of forcing private imports
  - clarifies package ownership: ASC owns execution, orchestrator owns coordination
- Reliability/safety impact:
  - downstream consumers inherit ASC's timeout handling, lifecycle invariants, prompt-envelope behavior, session-name reservation, and diagnostic shaping
  - reduces drift between the tool path (`dispatch_subagent`) and any code-level execution path
- Ecosystem/tooling impact:
  - creates a reusable internal contract for future packages without prematurely extracting a new package
  - gives the monorepo a cleaner dependency story: control-plane packages depend on an ASC public seam, not on copied subprocess code

## E) Proposed API shape

Provide concise TypeScript-style snippets.

```ts
export interface DispatchSubagentRequest {
  profile: "explorer" | "reviewer" | "tester" | "researcher" | "minimal" | "custom";
  objective: string;
  tools?: string;
  systemPrompt?: string;
  name?: string;
  timeout?: number;
  prompt_name?: string;
  prompt_content?: string;
  prompt_tags?: string[];
  prompt_source?: string;
}

export interface DispatchSubagentDetails {
  profile?: string;
  objective?: string;
  status?: "done" | "error" | "timeout" | "spawning";
  elapsed?: number;
  exitCode?: number;
  fullOutput?: string;
  prompt_name?: string;
  prompt_source?: string;
  prompt_tags?: string[];
  prompt_applied?: boolean;
  prompt_warning?: string;
}

export interface AscExecutionRuntimeOptions {
  sessionsDir: string;
  modelProvider: () => string;
  spawner?: SubagentSpawner;
}

export interface AscExecutionRuntime {
  state: SubagentState;
  execute(
    request: DispatchSubagentRequest,
    ctx: { cwd: string },
    onUpdate?: (update: { text: string; details?: Record<string, unknown> }) => void,
  ): Promise<{ text: string; details: DispatchSubagentDetails; ok: boolean }>;
}

export function createAscExecutionRuntime(
  options: AscExecutionRuntimeOptions,
): AscExecutionRuntime;

export function registerDispatchSubagentTool(
  pi: ExtensionAPI,
  runtime: AscExecutionRuntime,
): void;
```

## F) Compatibility and migration

- Backwards compatibility expectations:
  - existing `dispatch_subagent` tool behavior remains unchanged
  - ASC default extension entrypoint continues to register the same tool/commands/dashboard behavior
  - new public contract is additive
- Migration path:
  - step 1: ASC adds the public execution entrypoint and keeps `extensions/self.ts` as a wrapper/composer
  - step 2: `pi-society-orchestrator` replaces its local `spawnSubagent(...)` path with the ASC public runtime
  - step 3: orchestrator removes duplicate execution logic only after parity is proven
- No-break guarantee scope:
  - guarantee stability for the new public execution entrypoint and tool behavior
  - do not guarantee stability for private `extensions/self/*` internal module layout

## G) Alternatives considered

- Alternative 1:
  - Keep `pi-society-orchestrator`'s local execution runtime indefinitely.
- Alternative 2:
  - Let orchestrator import ASC internals directly from `extensions/self/*`.
- Why the proposed approach is preferred:
  - it preserves single ownership of the execution plane in ASC
  - it avoids source-layout coupling
  - it is additive and reversible
  - it postpones extraction until real evidence shows the public contract cannot stay clean

## H) Acceptance criteria

- [ ] ASC exposes a documented package-level public execution entrypoint for non-UI consumers.
- [ ] ASC default extension entrypoint composes that same runtime instead of keeping a divergent private-only path.
- [ ] `pi-society-orchestrator` can adopt the public contract without importing `../pi-autonomous-session-control/extensions/self/*`.
- [ ] The public execution contract does not require `self`-specific concepts unrelated to execution runtime.
- [ ] Existing `dispatch_subagent` behavior remains compatible for current users.
- [ ] Tests cover both the tool path and the public runtime path against the same lifecycle/prompt-envelope expectations.

## I) Implementation sketch (maintainer-oriented)

- Discovery/parsing layer changes:
  - factor the current `dispatch_subagent` execution path into a public runtime module that owns:
    - input normalization
    - invariant validation
    - prompt-envelope application
    - subagent spawn lifecycle
    - result shaping
  - keep dashboard/UI registration and `self`-specific composition outside the minimal consumer-facing seam
- API exposure changes:
  - add a package-level public entrypoint for the execution contract
  - re-export stable request/result/runtime types from that entrypoint
  - keep `extensions/self.ts` as the extension composition layer that calls into the same runtime
  - update package metadata/files if needed so the public entrypoint is intentionally published
- Tests/docs updates:
  - add docs for the public execution entrypoint and its non-goals
  - add a contract test showing parity between:
    - `dispatch_subagent` tool behavior
    - public runtime `execute(...)` behavior
  - add an orchestrator-side adoption spike or harness proving no private imports are needed

## J) Copy-paste issue body

### What do you want to change?

Expose a small public execution contract from `pi-autonomous-session-control` so downstream packages like `pi-society-orchestrator` can reuse ASC-owned subagent execution behavior without duplicating runtime logic or importing private `extensions/self/*` internals.

### Why?

ASC already owns the strongest execution-plane implementation (`dispatch_subagent`, lifecycle invariants, prompt envelopes, timeout/session handling), but there is no supported package-level runtime seam for non-UI consumers. That pushes downstream packages toward either duplicate subprocess logic or private imports.

### How? (optional)

Add an additive package-level public entrypoint that exposes the `dispatch_subagent` runtime as a stable execution contract (request/result types + runtime constructor + execute method), then have ASC's own extension entrypoint compose that same runtime so the tool path and code-level path stay aligned.

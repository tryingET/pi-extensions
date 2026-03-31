---
summary: "Handoff after landing the ASC public execution contract for non-tool consumers and wiring dispatch_subagent onto the same shared runtime."
read_when:
  - "Starting the next session in packages/pi-autonomous-session-control"
  - "Before changing the public execution seam, dispatch_subagent behavior, or cross-package orchestrator integration"
system4d:
  container: "Canonical-home handoff for pi-autonomous-session-control after the public execution-contract slice."
  compass: "Keep ASC as the execution-plane owner, keep the public seam minimal, and prove parity before orchestrator cutover."
  engine: "Re-enter the execution-boundary packet -> preserve the shared runtime seam -> add proof/harnesses before downstream adoption."
  fog: "The main trap is widening the seam with self/UI leakage or cutting orchestrator over before parity is explicit."
---

# Next Session Prompt

## Mission

The first cross-package ASC execution-boundary slice is now implemented:
- ASC exposes a supported package-level public runtime entrypoint at `pi-autonomous-session-control/execution`
- `dispatch_subagent` now composes the same shared execution core instead of carrying a private-only execution path
- the next truthful wave is to **prove parity** and then let orchestrator adopt the seam

Start from the orchestrator-owned packet docs before changing the seam again:
- `../pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- `../pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`
- `../pi-society-orchestrator/docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
- `../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`

Execution order still in force:
1. public runtime seam
2. parity harness against `dispatch_subagent`
3. orchestrator adoption / duplicate-runtime retirement

## What landed this session

### Public execution contract

Implemented:
- added the shared runtime core in `extensions/self/subagent-runtime.ts`
- added the package-level public entrypoint `execution.ts`
- added a supported registration helper `registerDispatchSubagentTool(...)`
- updated `extensions/self/subagent.ts` so the tool path now delegates to the shared runtime core
- added focused tests for the new consumer-facing seam in `tests/public-execution-contract.test.mjs`

### Package metadata + docs

Implemented:
- updated `package.json` publish surface / exports so `./execution` is an intentional package entrypoint
- documented the seam in:
  - `README.md`
  - `docs/project/public-execution-contract.md`
- refreshed this handoff to make `#605` the next active slice

## Structural decisions still in force

- Keep ASC the **execution-plane owner**; do not move ownership into orchestrator.
- Keep the public seam **minimal and execution-scoped**.
- Do **not** reintroduce private `extensions/self/*` imports as the downstream integration contract.
- Keep dashboard/UI composition separate from the non-UI runtime seam.
- Treat extraction into a smaller shared runtime package as a fallback only if real `self` leakage appears.

## Brownfield anchors to preserve

- `execution.ts`
- `extensions/self/subagent-runtime.ts`
- `extensions/self/subagent.ts`
- `extensions/self/subagent-spawn.ts`
- `extensions/self/subagent-session.ts`
- `extensions/self/subagent-session-name.ts`
- `tests/public-execution-contract.test.mjs`
- `tests/dispatch-subagent.test.mjs`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `../pi-society-orchestrator/src/runtime/subagent.ts`
- `../pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`

## Recommended next slices

### Option A — parity harness (`#605`) **default next move**

Prove that the public runtime and `dispatch_subagent` tool path behave the same where they are supposed to.

Good target:
- one harness that exercises both paths against the same injected spawner expectations
- explicit assertions for:
  - prompt-envelope application
  - rate-limit / invariant failures
  - session-name reservation behavior
  - result/provenance shaping

Avoid:
- silently duplicating tests without one parity intent
- claiming behavioral equivalence only from separate happy-path tests

### Option B — orchestrator cutover (`#606`) only after parity is real

Once parity is explicit:
- let `pi-society-orchestrator` consume `pi-autonomous-session-control/execution`
- remove the duplicate long-term runtime path in `../pi-society-orchestrator/src/runtime/subagent.ts`
- keep the migration additive/reversible until the duplicate path is truly unnecessary

### Option C — return to local ASC-only UX/deprecation work only if operator redirects

If the operator does **not** want to stay on the execution-boundary wave, the safe secondary threads remain:
- one clearly lifecycle-safe recovery affordance for the dashboard
- or applying the deterministic legacy deprecation workflow to the next real legacy repo

## Validation evidence from this session

Passed:
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
npm run docs:list
npm run check
```

Additional note:
- monorepo root still had pre-existing unrelated working-tree changes outside this package/task area at session start
- this slice intentionally stayed scoped to ASC package files + repo-level handoff/diary artifacts

## Files changed this session

Package-local:
- `execution.ts`
- `extensions/self/subagent-runtime.ts`
- `extensions/self/subagent.ts`
- `tests/public-execution-contract.test.mjs`
- `package.json`
- `README.md`
- `docs/project/public-execution-contract.md`
- `next_session_prompt.md`

Repo-level:
- `diary/2026-03-30--feat-asc-public-execution-contract.md`

## Remaining gaps

### Gap to trustworthy downstream adoption

Still unresolved:
- no dedicated parity harness yet proves the public runtime matches `dispatch_subagent`
- orchestrator still carries its duplicate runtime path
- no end-to-end consumer test yet demonstrates cutover without private imports

### Gap to minimal public-seam discipline

Watch for drift:
- avoid adding dashboard/UI concerns to `execution.ts`
- avoid expanding the public contract with convenience exports that are really package internals
- avoid changing runtime result semantics independently of the tool path

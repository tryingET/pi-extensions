---
summary: "Handoff after landing the ASC public execution contract and parity harness proving the public runtime stays aligned with dispatch_subagent."
read_when:
  - "Starting the next session in packages/pi-autonomous-session-control"
  - "Before changing the public execution seam, dispatch_subagent behavior, or cross-package orchestrator integration"
system4d:
  container: "Canonical-home handoff for pi-autonomous-session-control after the public execution-contract slice."
  compass: "Keep ASC as the execution-plane owner, keep the public seam minimal, and preserve the parity proof while orchestrator cuts over."
  engine: "Re-enter the execution-boundary packet -> preserve the shared runtime seam -> use the parity harness as the guardrail for orchestrator adoption."
  fog: "The main trap is widening the seam with self/UI leakage or changing runtime semantics without extending the parity proof."
---

# Next Session Prompt

## Mission

The first two cross-package ASC execution-boundary slices are now implemented:
- ASC exposes a supported package-level public runtime entrypoint at `pi-autonomous-session-control/execution`
- `dispatch_subagent` composes the same shared execution core instead of carrying a private-only execution path
- a dedicated parity harness now proves both paths stay aligned for the promised shared behavior:
  - prompt-envelope application
  - rate-limit / invariant failures
  - session-name reservation behavior
  - result / provenance shaping
- the next truthful wave is to let orchestrator adopt the seam and retire its duplicate runtime path

Start from the orchestrator-owned packet docs before changing the seam again:
- `../pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- `../pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`
- `../pi-society-orchestrator/docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
- `../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`

Execution order still in force:
1. public runtime seam ✅
2. parity harness against `dispatch_subagent` ✅
3. orchestrator adoption / duplicate-runtime retirement

## What landed this session

### Public runtime parity harness

Implemented:
- added `tests/public-execution-parity.test.mjs`
- built one parity harness that executes both the public runtime and the actual `dispatch_subagent` tool path against the same injected spawner expectations
- covered the shared behavior that downstream consumers are allowed to rely on:
  - prompt-envelope application
  - rate-limit / invariant failures
  - live lock collision suffixing
  - concurrent same-name reservation behavior
  - shaped updates/results/provenance

### Docs + handoff refresh

Implemented:
- updated `README.md` to make the parity guarantee explicit at the package overview level
- updated `docs/project/public-execution-contract.md` so the first two AK slices are now documented as complete
- refreshed this handoff to make `#606` the next active slice instead of leaving parity as an implied follow-up

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
- `tests/public-execution-parity.test.mjs`
- `tests/dispatch-subagent.test.mjs`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `../pi-society-orchestrator/src/runtime/subagent.ts`
- `../pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`

## Recommended next slices

### Option A — orchestrator cutover (`#606`) **default next move**

Now that parity is explicit:
- let `pi-society-orchestrator` consume `pi-autonomous-session-control/execution`
- remove the duplicate long-term runtime path in `../pi-society-orchestrator/src/runtime/subagent.ts`
- add the smallest consumer-side proof that the cutover works without private ASC imports
- keep the migration additive/reversible until the duplicate path is truly unnecessary

Avoid:
- widening `execution.ts` preemptively before the cutover proves a real gap
- letting orchestrator keep a shadow runtime path “just in case” after parity already exists

### Option B — extend the seam only if orchestrator cutover proves a real missing contract

Only if `#606` exposes a genuine gap:
- add the smallest ASC-owned runtime addition needed by the consumer
- extend `tests/public-execution-parity.test.mjs` first so the tool path and public runtime remain locked together
- keep dashboard/UI concerns out of the public seam

### Option C — return to local ASC-only UX/deprecation work only if operator redirects

If the operator does **not** want to stay on the execution-boundary wave, the safe secondary threads remain:
- one clearly lifecycle-safe recovery affordance for the dashboard
- or applying the deterministic legacy deprecation workflow to the next real legacy repo

## Validation evidence from this session

Passed:
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
npm run docs:list
node --test tests/public-execution-parity.test.mjs
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-commit
npm run quality:pre-push
npm run quality:ci
npm run check
```

Additional note:
- monorepo root still had pre-existing unrelated working-tree changes outside this package/task area at session start
- this slice intentionally stayed scoped to ASC package files + repo-level handoff/diary artifacts

## Files changed this session

Package-local:
- `tests/public-execution-parity.test.mjs`
- `README.md`
- `docs/project/public-execution-contract.md`
- `next_session_prompt.md`

Repo-level:
- `diary/2026-03-30--feat-asc-public-runtime-parity-harness.md`

## Remaining gaps

### Gap to trustworthy downstream adoption

Still unresolved:
- orchestrator still carries its duplicate runtime path
- no end-to-end consumer test yet demonstrates cutover without private imports
- the parity harness currently proves the ASC side only; `#606` must convert that proof into an actual downstream consumer cutover

### Gap to minimal public-seam discipline

Watch for drift:
- avoid adding dashboard/UI concerns to `execution.ts`
- avoid expanding the public contract with convenience exports that are really package internals
- avoid changing runtime result semantics independently of the tool path without updating `tests/public-execution-parity.test.mjs`

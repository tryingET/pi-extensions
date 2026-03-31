---
summary: "Handoff after the ASC public runtime cutover, transport-safety hardening, and the first post-cutover seam-stewardship docs."
read_when:
  - "Starting the next session in packages/pi-autonomous-session-control"
  - "Before changing the ASC public execution seam, dispatch_subagent behavior, or cross-package execution-boundary docs"
system4d:
  container: "Canonical-home handoff for pi-autonomous-session-control after cutover and first seam-stewardship pass."
  compass: "Keep ASC as the execution-plane owner, keep the public seam minimal, and preserve the named transport-safety contract while post-cutover stewardship continues."
  engine: "Re-enter the post-cutover packet -> preserve transport truth -> choose the next stewardship slice -> validate from package and root."
  fog: "The main trap is treating #604-#606 as active work again or widening the seam without a real consumer gap."
---

# Next Session Prompt

## Mission

The execution-boundary cutover is complete:
- ASC exposes a supported package-level runtime entrypoint at `pi-autonomous-session-control/execution`
- `dispatch_subagent` composes that same runtime core internally
- `pi-society-orchestrator` now consumes the public seam and no longer carries a second long-term runtime path
- transport-safety invariants are now named contract truth in ASC docs and tests
- the companion seam charter explains why the seam exists and how small it should stay

Treat the original execution packet as landed history:
1. public runtime seam (`#604`) ✅
2. parity harness against `dispatch_subagent` (`#605`) ✅
3. orchestrator cutover / duplicate-runtime retirement (`#606`) ✅
4. first stewardship/docs pass for transport-safety truth and seam justification (`#622`) ✅

The next truthful wave is **post-cutover seam stewardship**, not ownership debate.

## Read first

Re-enter the post-cutover packet before changing the seam again:
- `../pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- `../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`
- `../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
- `docs/project/public-execution-contract.md`
- `README.md`

Then anchor on the live runtime + proof surfaces:
- `execution.ts`
- `extensions/self/subagent-runtime.ts`
- `extensions/self/subagent-spawn.ts`
- `extensions/self/subagent-session-name.ts`
- `extensions/self/subagent-session.ts`
- `extensions/self/subagent.ts`
- `tests/public-execution-contract.test.mjs`
- `tests/public-execution-parity.test.mjs`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `tests/subagent-file-lock.test.mjs`

## What is now true

### Runtime ownership and consumer shape

- ASC remains the **execution-plane owner**.
- Orchestrator is now a **narrow consumer** of ASC execution behavior rather than a second runtime owner.
- The supported non-tool seam remains:

```ts
import { createAscExecutionRuntime } from "pi-autonomous-session-control/execution";
```

- Consumers should not treat `extensions/self/*` as their integration contract.

### Named transport-safety invariants are now contract truth

The seam now explicitly carries these expectations:
- optional `AbortSignal` propagation from consumer to spawn path
- bounded assistant output capture with truncation signaling
- bounded raw JSON event buffering for malformed or no-newline stdout
- session-name reservation that treats status sidecars as occupied artifacts
- explicit hard failure when lock creation fails for permanent filesystem reasons
- assistant-protocol truth preserved in shaped execution results

These are currently anchored by:
- `tests/public-execution-contract.test.mjs`
- `tests/public-execution-parity.test.mjs`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `tests/subagent-file-lock.test.mjs`

### Seam stewardship packet now exists

The first post-cutover stewardship docs are now in place:
- seam charter: `../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`
- consumer map + packet index: `../pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- backlog with scored stewardship slices: `../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
- ASC-side contract truth: `docs/project/public-execution-contract.md`

## Structural decisions still in force

- Keep ASC the **execution-plane owner**; do not move ownership back into orchestrator.
- Keep the public seam **headless, minimal, and execution-scoped**.
- Do **not** reintroduce private `extensions/self/*` imports as the downstream consumer seam.
- Do **not** add dashboard/UI composition to `execution.ts`.
- Extend the public seam only if a real consumer gap appears and the parity/contract tests expand first.
- Treat removal of the seam as a future evidence-based decision, not the default next step.

## Recommended next slices

### Option A — execution-contract change checklist (`#623`) **default next move**

Best next stewardship slice:
- add a short, explicit checklist for future seam modifications
- make the negative-path rules easy to apply before code changes
- keep it tied to the real failure modes already named in the charter/contract

Avoid:
- inventing a broad new process document disconnected from the current seam packet
- repeating ownership debate instead of naming concrete guardrails

### Option B — split verification policy (`#624`)

If the next question is verification truth:
- separate package-local contract checks from installed-package smoke expectations
- keep ASC/package proof and orchestrator installed-runtime proof distinct but linked
- document exactly which layer proves contract truth vs packaging truth

### Option C — bundled publish/install bridge lifecycle (`#625`)

If the next question is release topology:
- decide how long the temporary bundled ASC bridge should remain
- define the exit criteria and review trigger
- keep that decision narrow so it does not reopen runtime ownership

### Option D — failure taxonomy or automated seam guardrails (`#626`, `#627`)

Only if the operator explicitly prefers code-facing hardening next:
- normalize failure taxonomy exposed through execution results
- or add automated guardrails against private ASC imports and orchestrator-local runtime revival
- keep either slice bounded and grounded in the charter/contract packet

### Option E — return to other ASC-local work only if operator redirects

Safe only if the operator explicitly leaves the execution-boundary/stewardship wave.
Do not drift back into local UX or dashboard work by default.

## Validation evidence from this slice

Use this validation set when changing the seam, contract docs, or handoff again:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
npm run docs:list
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator
npm run docs:list
npm run check
npm run release:check

cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-commit
npm run quality:pre-push
npm run quality:ci
npm run check
```

## Files refreshed in the handoff closeout

- `packages/pi-autonomous-session-control/next_session_prompt.md`
- `packages/pi-society-orchestrator/next_session_prompt.md`
- `diary/2026-03-31--docs-asc-transport-safety-seam-stewardship.md`

## Remaining gaps

Still unresolved:
- explicit checklist for future seam modifications (`#623`)
- verification-layer split between package-local contract checks and installed-package smoke (`#624`)
- durable lifecycle decision for the bundled ASC publish/install bridge (`#625`)
- normalized failure taxonomy across ASC and orchestrator result surfaces (`#626`)
- automated guardrails against private ASC imports and local-runtime revival (`#627`)

Later work stays blocked in order:
- time-boxed seam review after release evidence accumulates (`#628`)
- expand consumer inventory only if a second real external runtime consumer appears (`#629`)

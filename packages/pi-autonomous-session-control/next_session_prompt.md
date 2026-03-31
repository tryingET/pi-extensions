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
5. execution-contract change checklist (`#623`) ✅
6. verification-layer split between package-local contract truth and installed-package smoke (`#624`) ✅
7. bundled publish/install bridge lifecycle decision and exit criteria (`#625`) ✅
8. normalized failure taxonomy across ASC public results and orchestrator consumer surfaces (`#626`) ✅

The next truthful wave is still **post-cutover seam stewardship**, not ownership debate.

## Read first

Re-enter the post-cutover packet before changing the seam again:
- `../pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- `../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`
- `../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
- `../pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md`
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

### Failure taxonomy is now normalized across the seam

- ASC public execution results now expose canonical `result.details.status` values: `done`, `aborted`, `timed_out`, `error`.
- ASC public execution results also expose `result.details.failureKind` so consumers can distinguish `timed_out`, assistant-protocol failures, parse failures, transport failures, and pre-execution guardrail failures without reverse-engineering raw output.
- `pi-society-orchestrator` now preserves that normalized taxonomy in its direct-dispatch and loop runtime result surfaces instead of collapsing everything into generic transport-only failure.

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

The post-cutover stewardship docs are now in place:
- seam charter: `../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`
- consumer map + packet index: `../pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- backlog with scored stewardship slices: `../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
- bundled bridge lifecycle note: `../pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md`
- ASC-side contract truth: `docs/project/public-execution-contract.md`
- seam-change checklist: `docs/project/execution-contract-change-checklist.md`

Verification layers are now explicit:
- ASC package-local tests prove seam semantics and transport-safety invariants
- `../pi-society-orchestrator/tests/runtime-shared-paths.test.mjs` proves the narrow consumer-side adapter preserves those semantics in repo-local source
- `cd ../pi-society-orchestrator && npm run release:check` proves installed-package/import-graph truth for the packaged consumer artifact

## Structural decisions still in force

- Keep ASC the **execution-plane owner**; do not move ownership back into orchestrator.
- Keep the public seam **headless, minimal, and execution-scoped**.
- Do **not** reintroduce private `extensions/self/*` imports as the downstream consumer seam.
- Do **not** add dashboard/UI composition to `execution.ts`.
- Extend the public seam only if a real consumer gap appears and the parity/contract tests expand first.
- Treat removal of the seam as a future evidence-based decision, not the default next step.

## Recommended next slices

### Option A — time-boxed seam review trigger prep (`#628`) **default next move**

Automated seam guardrails are now landed, so the next truthful stewardship step is:
- prepare the explicit time-boxed seam review follow-up after release evidence accumulates
- keep the slice bounded and grounded in the charter/contract packet rather than reopening seam ownership

### Option B — return to other ASC-local work only if operator redirects

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

- `packages/pi-autonomous-session-control/README.md`
- `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
- `packages/pi-autonomous-session-control/docs/project/execution-contract-change-checklist.md`
- `packages/pi-autonomous-session-control/next_session_prompt.md`
- `packages/pi-society-orchestrator/README.md`
- `packages/pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
- `packages/pi-society-orchestrator/next_session_prompt.md`
- `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs`
- `diary/2026-03-31--execution-seam-guardrails.md`

## Remaining gaps

Still unresolved:
- time-boxed seam review after release evidence accumulates (`#628`)
- expand consumer inventory only if a second real external runtime consumer appears (`#629`)

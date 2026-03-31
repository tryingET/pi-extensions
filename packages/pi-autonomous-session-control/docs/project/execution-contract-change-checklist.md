---
summary: "Checklist for future changes to the ASC public execution contract and its orchestrator-facing seam obligations."
read_when:
  - "Before widening, narrowing, or re-shaping pi-autonomous-session-control/execution."
  - "When a seam change might affect orchestrator consumption, transport-safety invariants, or installed-package proof."
system4d:
  container: "Execution-seam stewardship checklist."
  compass: "Keep ASC as execution-plane owner, keep the seam minimal, and block drift back to private imports or duplicate runtimes."
  engine: "justify change -> run negative-path checks -> update contract docs -> prove both package-local and installed-package truth."
  fog: "The main risk is treating a local convenience change as permission to widen the public seam or weaken transport/failure truth."
---

# Execution contract change checklist

Use this checklist before modifying the public seam at `pi-autonomous-session-control/execution`, widening `createAscExecutionRuntime(...)`, changing execution-result semantics that `pi-society-orchestrator` relies on, or altering the proof packet around that seam.

## 1. Confirm the change is legitimate

- Name the exact consumer and capability gap.
- Confirm the problem cannot be solved by consumer-side composition in `pi-society-orchestrator` or by keeping the change private to ASC internals.
- Do **not** reopen the ownership split: ASC stays the execution-plane owner and orchestrator stays a narrow consumer.
- If there is no real consumer gap, keep the change out of the public contract.

## 2. Run the negative-path guardrails

Do **not** land the change if it would introduce any of the following:

- private `extensions/self/*` imports as the consumer seam
- an orchestrator-local spawn/runtime revival or copied lifecycle logic
- UI, dashboard, or tool-registration concerns in the headless public contract
- unbounded stdout/stderr/raw-event buffering or weaker truncation signaling
- weaker abort, timeout, assistant-protocol, or malformed-output truth in execution results
- weaker session-name reservation, sidecar occupancy handling, or lock-failure surfacing
- public API growth justified only by today's bundled publish/install bridge or smoke-harness convenience

## 3. Keep contract and stewardship docs in sync

When public entrypoints, supported semantics, or stewardship rules change, update the relevant packet directly:

- [`public-execution-contract.md`](public-execution-contract.md)
- [`../../../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`](../../../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md) when supported scope, guardrails, or removal/review logic changes
- [`../../../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`](../../../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md) when the stewardship queue or proof expectations change

Keep the explanation tied to actual callers and real failure modes, not speculative future consumers.

## 4. Re-prove the contract at both truth layers

### ASC package-local contract proof

Re-run the contract tests that anchor the seam itself:

- `tests/public-execution-contract.test.mjs`
- `tests/public-execution-parity.test.mjs`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `tests/subagent-file-lock.test.mjs`

### Orchestrator consumer / installed-package proof

If the change affects consumer-visible behavior, package exports, result semantics, or install topology, also re-run:

- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
- `cd packages/pi-society-orchestrator && npm run release:check`

Until a later stewardship slice explicitly separates these proof layers further, seam changes are not complete unless both the ASC contract checks and the orchestrator installed-package smoke still hold.

## 5. Run the current validation set

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

## 6. Closeout questions before merge

- Does the seam stay headless, minimal, and removable?
- Did the change preserve the named transport-safety invariants?
- Did the change avoid reintroducing private-import or duplicate-runtime drift?
- If the seam widened, what evidence justified it and what future review should test whether the widening still earns its keep?

If you cannot answer those questions cleanly, do not land the seam change yet.

---
summary: "Checklist for future changes to the ASC public execution contract and its orchestrator-facing seam obligations."
read_when:
  - "Before widening, narrowing, or re-shaping pi-autonomous-session-control/execution."
  - "When a seam change might affect orchestrator consumption, transport-safety invariants, or installed-package proof."
system4d:
  container: "Execution-seam stewardship checklist."
  compass: "Keep ASC as execution-plane owner, keep the seam minimal, and block drift back to private imports or duplicate runtimes."
  engine: "justify change -> run negative-path checks -> update contract docs -> prove the right verification layer(s)."
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
- observer launch/rendering ownership in ASC, or any observation-listener result influencing execution, cancellation, settlement, retry, or effect-receipt truth
- observation payloads that carry prompt/objective/output/stderr/environment/session-path/receipt-path content, truncate caller-controlled group identity into collisions, or grow without explicit field/array bounds
- unbounded stdout/stderr/raw-event buffering, a backpressure watchdog that covers only one helper output stream, or weaker truncation signaling
- weaker abort, startup/execution timeout, cancellation identity, assistant-protocol terminal-event, model-selection, or malformed-output truth in execution results
- drift between raw `fullOutput`, normalized `displayOutput`, and consumer-side rendering helpers for the same failure mode
- weaker session-name reservation, sidecar occupancy handling, or lock-failure surfacing
- capacity metadata that the writer can emit but the reader rejects, or age-only reclaim of malformed effect-bearing leases
- caller-expandable shared slot namespaces; one repository session root must retain one atomically published `maxConcurrent` contract and mismatches must fail closed
- post-spawn lease release without exact helper/raw custody and kernel-proven process-group absence, including marker/custody cleanup when exact lease deletion failed
- custody publication that depends on the parent parsing helper stdout, or unlimited execution that also disables parent-death/backpressure supervision
- replaceable custody records, raw Pi start before immutable custody/marker publication, a stale-takeover race with helper custody/start publication, or helper death that leaves the supervised raw child running without a custody-pipe fence
- custom-spawner parent ownership inferred from function identity instead of an explicit runtime option
- a terminal `done`/settled result when exact capacity deletion or managed process-group quiescence was not proved
- process-group containment described as a general sandbox without explicitly excluding deliberate `setsid` escape
- public API growth justified only by today's bundled publish/install bridge or smoke-harness convenience

## 3. Keep contract and stewardship docs in sync

When public entrypoints, supported semantics, or stewardship rules change, update the relevant packet directly:

- [`public-execution-contract.md`](public-execution-contract.md)
- [`../../../pi-little-helpers/docs/project/2026-08-04-asc-execution-observer-contract.md`](../../../pi-little-helpers/docs/project/2026-08-04-asc-execution-observer-contract.md) when observation fields, ownership, privacy, grouping, or failure isolation changes
- [`../../../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`](../../../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md) when supported scope, guardrails, or removal/review logic changes
- [`../../../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`](../../../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md) when the stewardship queue or proof expectations change
- [`../../../../governance/execution-seam-cases/README.md`](../../../../governance/execution-seam-cases/README.md) when a learned edge case should become a named reusable seam scenario

Keep the explanation tied to actual callers and real failure modes, not speculative future consumers.
If the change alters how failure/body text is surfaced or adds a `failureKind`, update the docs to say which field is raw capture (`fullOutput`), which field is consumer-facing normalized body text (`displayOutput`), which normalized failure branch callers should expect, and which helper consumers should call instead of re-deriving output.

## 4. Choose and run the right verification layer

Do **not** use installed-package smoke as a substitute for package-local contract proof, and do **not** use package-local tests as a substitute for packaged-import proof.
The seam currently has four distinct verification layers:

### Layer A — ASC package-local contract truth

Run these whenever the ASC public runtime itself, the named transport-safety invariants, or shaped execution semantics change. Keep `execution.ts` in `tsconfig.json#include` so the package typecheck covers the published `./execution` export target:

- `tests/public-execution-contract.test.mjs`
- `tests/public-execution-parity.test.mjs`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `tests/subagent-protocol.test.mjs`
- `tests/subagent-transport-live.test.mjs`
- `tests/subagent-file-lock.test.mjs`
- `tests/dispatch-subagent-lifecycle-control.test.mjs`
- `tests/subagent-capacity-recovery.test.mjs`
- `tests/execution-observation.test.mjs`

This layer proves the supported seam semantics owned by ASC.
For helper-protocol changes, do not stop at EventEmitter-only mocks: include at least one spawned-helper proof for raw-Pi framing, one complete-line oversize proof, and one raw-child teardown proof when timeout/abort handling changed.
Prefer adding or updating named scenarios in the shared casebook when the change is about a learned edge case rather than a one-off local assertion.

### Layer B — Orchestrator package-local consumer truth

Run this whenever the orchestrator adapter, orchestration decisions derived from `result.details`, or consumer-visible timeout/truncation/abort truth changes:

- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
- `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs`
- `packages/pi-society-orchestrator/tests/loop-observation.test.mjs` when logical run/phase grouping or terminal projection changes

This layer proves the narrow consumer still composes the ASC seam truthfully inside repo-local source and that private-import / duplicate-runtime drift remains fail-closed.
Where practical, reuse the named seam scenarios from `governance/execution-seam-cases/` instead of hand-rolling a second fixture story.

### Layer C — Observer-owner projection truth

Run this whenever the event parser, private snapshot, Ghostty placement, renderer lifecycle, mode policy, retention, or listener cleanup changes:

- `packages/pi-little-helpers/tests/asc-execution-observer.test.mjs`
- `packages/pi-little-helpers/tests/asc-execution-observer-launch.test.mjs`
- `cd packages/pi-little-helpers && npm run check`

This layer proves bounded presentation and fail-open fallback only. It does not prove ASC child execution or effect settlement.

### Layer D — Installed-package smoke / packaging truth

Run this whenever package exports, tarball contents, bundle topology, installed import paths, release-smoke harness behavior, or installed extension registration/behavior changes:

- `cd packages/pi-society-orchestrator && npm run release:check`

This layer proves the packaged orchestrator artifact can still consume the seam after install, including the current bundled ASC bridge and installed import graph.
If packaging truth diverges from the casebook, update the casebook or the artifact, but do not leave the divergence undocumented.

Minimum rule of thumb:
- seam semantics changed -> run **Layer A** and **Layer B**
- observation projection/rendering changed -> run **Layer C**
- install/publish topology changed -> run **Layer D**
- mixed seam + observation + packaging change -> run **all four layers** before closeout

## 5. Run the current full closeout set

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
npm run docs:list
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-little-helpers
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
- Did we run the right verification layer(s) for the kind of change we made?
- If the seam widened, what evidence justified it and what future review should test whether the widening still earns its keep?

If you cannot answer those questions cleanly, do not land the seam change yet.

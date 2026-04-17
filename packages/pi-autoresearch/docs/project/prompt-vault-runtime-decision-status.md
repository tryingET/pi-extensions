---
summary: "Status note for Workstream A of pi-autoresearch: live Prompt Vault setup / next-hypothesis / finalize decisions are now integrated into the bounded runtime and proven with bounded tests plus a live prompt-plane preparation proof."
read_when:
  - "You need the shortest truthful answer to what Workstream A of pi-autoresearch actually landed."
  - "Before claiming the package can already invoke governed Prompt Vault decisions live."
  - "When starting the next resume/control or finalization task and needing to know what decision behavior is already real."
type: "reference"
system4d:
  container: "Package-local closure note for the Prompt Vault runtime-decision workstream in pi-autoresearch."
  compass: "State exactly what the package can now do with governed Prompt Vault procedures without overstating this slice as the full control plane."
  engine: "Summarize the landed adapter + runtime integration -> record the bounded proof -> name what remains outside the workstream."
  fog: "The main risk is over-claiming this landing as AK binding, autonomous resume, router insertion, or finalization materialization when it is still a bounded runtime decision layer."
---

# Status — live Prompt Vault runtime decisions for `pi-autoresearch`

## Why this note exists

Workstream A in [`current-vs-target`](./current-vs-target.md) is now landed across these tasks:

- `#1528` — write the live Prompt Vault decision contract
- `#1529` — implement the bounded decision runtime adapter
- `#1530` — integrate machine-driven Prompt Vault decisions into runtime surfaces
- `#1531` — prove the live decision flow and update package status truth

This note closes umbrella `#1527` / Workstream A by answering four questions:

1. what is now real in the package runtime
2. what the bounded proof actually proved
3. how the operator/runtime surface changed
4. what still remains outside this workstream

## Umbrella closure snapshot

`#1527` is truthful to close because all four child tasks are now done and their outputs are visible in the package:

- `#1528` froze the contract in `prompt-vault-runtime-decision-contract.md`
- `#1529` landed the bounded decision runtime adapter and parser layer
- `#1530` integrated machine-driven decisions into runtime/status surfaces
- `#1531` added the bounded live-proof test and updated package status truth

So this note is both the Workstream A status artifact and the umbrella-closure artifact for `#1527`.

## What is now real

## 1. The package can now invoke the governed setup / next-hypothesis / finalize templates lawfully

`packages/pi-autoresearch/src/core/decisions.ts` now owns one bounded decision runtime that:

- targets the exact template names
  - `pi-autoresearch-setup`
  - `pi-autoresearch-next-hypothesis`
  - `pi-autoresearch-finalize`
- prepares them through the supported public seam:

  ```ts
  import { createVaultPromptPlaneRuntime } from "pi-vault-client/prompt-plane";
  ```
- appends package-owned packet context instead of copying prompt bodies locally
- fails closed when preparation is not exact, visibility is blocked, execution fails, or parsing breaks the contract
- parses the required output labels into typed package results

This means Prompt Vault is now a live decision-procedure owner in the runtime path, not merely a drafted future dependency.

## 2. Runtime surfaces now consume those decisions inside the bounded package seam

The package runtime now uses the decision layer through existing bounded surfaces instead of inventing a second control plane:

- `autoresearch_runtime_status`
  - `action=setup` requests a governed setup packet
  - `action=finalize` requests a governed finalization proposal packet
- `autoresearch_runtime_run`
  - `decisionGoal` requests a governed post-run `next-hypothesis` decision
- `/autoresearch`
  - reports that live governed decision requests are part of the bounded runtime surface

The package therefore owns **when** a decision is requested and **how** the result affects runtime state, while Prompt Vault still owns the durable decision procedures themselves.

## 3. Post-run behavior is no longer only the old unconditional iterate bridge

Workstream A specifically changed the live post-run path.

After a bounded run, `pi-autoresearch` can now map the parsed `next-hypothesis` result into package-owned machine behavior:

- `ready` -> `iterate`
- `rebaseline_needed` -> `rebaseline`
- `finalize_candidate` -> `finalize`
- `blocked` -> `block`

That mapping is package-owned and machine-backed.
The blocked router remains deferred because the package runtime can already perform this status-to-decision mapping locally without moving runtime ownership into Prompt Vault.

## 4. Status/reporting surfaces now tell the truth about live decision availability

The bounded runtime status now records whether governed Prompt Vault decisions are:

- available but not yet used
- last used successfully
- last used in a blocked state

It also carries the last post-run decision summary when present.
So the runtime can now say not only that templates exist, but also whether the bounded runtime actually used them and what next move they produced.

## Bounded proof for `#1531`

## Durable proof added in this task

`packages/pi-autoresearch/tests/decisions.test.ts` now includes a bounded live-proof test that:

1. loads the real `pi-vault-client` prompt-plane runtime implementation
2. prepares the visible `pi-autoresearch-next-hypothesis` template through the public seam
3. verifies exact-template preparation plus packet-context append behavior
4. executes the prepared decision through the package-owned runtime seam with a bounded executor stub
5. parses the returned contract-valid output into a typed next-hypothesis result

This is intentionally still bounded:

- it proves real prompt-plane/template preparation
- it proves real package parsing/mapping behavior
- it does **not** require a live external model call just to prove the runtime seam

The existing runtime integration tests from task `#1530` continue to prove that those parsed decisions affect the bounded runtime and machine projection truthfully.

## Verification commands run for closure

From `packages/pi-autoresearch`:

```bash
node --import tsx --test tests/decisions.test.ts tests/runtime.test.ts
npm run check
npm run release:check:quick
```

These checks verified:

- parser and exact-template preparation behavior
- bounded runtime integration and machine mapping
- package lint/typecheck/test surface
- package release metadata/packageability quick checks

## What changed in operator/runtime behavior

Before Workstream A, the package had:

- live governed templates in Prompt Vault
- a local runtime machine and ledger
- a thin bounded iterate bridge after a run

But it did **not** yet have live machine-invoked Prompt Vault decisions.

After Workstream A, the package now has:

- governed setup packet requests
- governed post-run next-hypothesis requests
- governed finalize proposal requests
- fail-closed handling when those decisions cannot be prepared/executed/parsed lawfully
- truthful runtime status about last live decision usage

So the package runtime is now **decision-aware**, while still remaining below the broader target control plane.

## What this workstream does **not** mean

This workstream should **not** be read as having implemented:

- AK campaign binding or task lifecycle automation
- autonomous resume / continue / rebaseline / stop operator control surfaces
- finalization branch/materialization workflow
- router insertion in Prompt Vault
- Prompt Vault becoming the runtime state machine
- package-local prompt copies as operational truth

Those remain in later workstreams.

## Bottom line

Workstream A is complete when read as the bounded slice that gave `pi-autoresearch`:

- exact governed Prompt Vault decision preparation through the public prompt-plane seam
- typed setup / next-hypothesis / finalize decision parsing
- live bounded runtime consumption of those decisions
- machine-backed mapping for post-run next-step outcomes
- a bounded proof that the live next-hypothesis seam now works end to end

What still comes next is not "make Prompt Vault decisions live."
That is now landed.
What still comes next is the broader control-plane work above this seam:

- resume/control lifecycle
- safer finalization orchestration
- later supervision/lifecycle widening where explicitly contracted

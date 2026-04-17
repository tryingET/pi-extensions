---
summary: "Status note for Workstream B of pi-autoresearch: the package-owned runtime snapshot, operator control surface, and bounded resume/control gating are now landed and proven with loader/control tests plus package validation."
read_when:
  - "You need the shortest truthful answer to what Workstream B of pi-autoresearch actually landed."
  - "Before claiming that pi-autoresearch can now resume control posture across fresh sessions."
  - "When starting Workstream C or D and needing to know which resume/control behavior is already real."
type: "reference"
system4d:
  container: "Package-local closure note for the resume/control workstream in pi-autoresearch."
  compass: "State exactly what package-local resume/control behavior is now real without overstating this slice as full autonomy, AK lifecycle automation, or finalization materialization."
  engine: "Summarize the landed snapshot + control overlay -> record the bounded proof -> name what changed in operator/runtime behavior -> bound what remains outside the workstream."
  fog: "The main risk is over-claiming this landing as a second durable control plane, a generic session runtime, or a full finalization/autonomy system."
---

# Status — resume/control surface for `pi-autoresearch`

## Why this note exists

Workstream B in [`current-vs-target`](./current-vs-target.md) is now landed across these tasks:

- `#1533` — write the resume/control contract and artifact model
- `#1534` — implement the resumable runtime snapshot and loader
- `#1535` — add the operator control surface for continue / rebaseline / finalize / stop
- `#1536` — prove the resume/control lifecycle and update package status truth

This note closes umbrella `#1532` / Workstream B by answering four questions:

1. what is now real in the package runtime
2. what the bounded proof actually proved
3. how the operator/runtime surface changed
4. what still remains outside this workstream

## Umbrella closure snapshot

`#1532` is truthful to close because all four child tasks are now done and their outputs are visible in the package:

- `#1533` froze the contract in `resume-control-surface-contract.md`
- `#1534` landed the checked `autoresearch.runtime.json` snapshot plus control-state loader
- `#1535` landed the explicit `autoresearch_runtime_control` surface and runtime gating
- `#1536` added the remaining legality/fallback proof and updated package status truth

So this note is both the Workstream B status artifact and the umbrella-closure artifact for `#1532`.

## What is now real

## 1. The package now persists one checked runtime snapshot for fresh-session reuse

`packages/pi-autoresearch/src/core/resume.ts` now owns one projection-only runtime snapshot artifact:

- `autoresearch.runtime.json`

That snapshot stores:

- the current bounded machine posture
- the current segment fingerprint and runtime fingerprint
- bounded Prompt Vault decision-summary facts already exposed by the runtime
- the explicit operator control overlay for:
  - `continue`
  - `rebaseline`
  - `finalize`
  - `stop`

The snapshot is still **not** the root authority.
The loader derives current runtime truth from ledger/receipts first, then reuses the saved control overlay only when the snapshot still matches the current posture lawfully.

## 2. The package now exposes one explicit operator control mutation surface

`packages/pi-autoresearch/extensions/pi-autoresearch.ts` now registers:

- `autoresearch_runtime_control`

That surface can:

- inspect the current operator-control posture with `action=status`
- set one explicit bounded decision with `action=set`
- reject illegal decisions fail-closed for the current machine posture

This means the operator no longer has to rely on implicit status prose or hidden machine mutations to express the next local control-plane step.

## 3. Ordinary runtime entrypoints now respect selected control intent

The bounded runtime now gates `autoresearch_runtime_run` against the saved control overlay instead of merely recording it cosmetically.

In particular:

- `continue`
  - is accepted only where the current posture allows it
  - is consumed when the next lawful bounded run starts
- `rebaseline`
  - blocks ordinary run execution
  - is cleared by the reconfigure path that establishes a new config receipt/segment
- `finalize`
  - blocks ordinary run execution
  - preserves finalization intent for the later finalization workstream
- `stop`
  - blocks package-local run progression
  - persists across fresh-session reload until explicitly changed

So Workstream B now has both the **operator write path** and the **runtime-side enforcement path**.

## 4. Status/help surfaces now tell the truth about snapshot reuse and selected control state

The bounded runtime status/help surfaces now report:

- whether the saved runtime snapshot was reused or discarded
- the current control kind
- the currently allowed actions
- the control reason and selected timestamp when present
- the shortest truthful next-step explanation for the current posture

That makes the package control overlay inspectable and resumable without pretending it replaced AK, Prompt Vault, or the append-only runtime artifacts.

## Bounded proof for `#1536`

## Durable proof added in this task

`packages/pi-autoresearch/tests/resume.test.ts` now proves the remaining loader/fallback behavior required to close Workstream B:

- legal saved overlays are reused when the runtime posture still matches
- missing snapshots fall back cleanly to derived runtime truth
- segment mismatch, runtime-ahead mismatch, illegal saved control, and unreadable snapshot files fail closed

`packages/pi-autoresearch/tests/control-surface.test.ts` now proves the operator/runtime contract at the control surface:

- `continue` can be selected from a finalize-worthy posture and is consumed by the next bounded run
- `continue` is rejected from `rebaseline_needed`
- `finalize` is rejected when the runtime is not finalize-worthy
- `rebaseline` blocks ordinary runs until reconfigure/setup work consumes it
- `finalize` blocks ordinary runs while persisting across later inspection
- `stop` persists across fresh-session reload and continues blocking later runs

Together those tests close the four verification layers from the contract note:

1. snapshot write/load proof
2. action-legality proof
3. runtime-gating proof
4. bounded fresh-session proof

## Verification commands run for closure

From `packages/pi-autoresearch`:

```bash
node --import tsx --test tests/resume.test.ts tests/control-surface.test.ts
npm run check
npm run release:check:quick
```

These checks verified:

- loader reuse and fail-closed fallback behavior
- control-surface legality checks and runtime gating
- fresh-session persistence of saved control intent
- package lint/typecheck/test surface
- package release metadata/packageability quick checks

## What changed in operator/runtime behavior

Before Workstream B, the package had:

- the bounded runtime machine and append-only ledger
- live governed setup / next-hypothesis / finalize decision requests
- no explicit package-owned operator control write path
- no checked fresh-session control overlay
- no runtime gating that respected saved continue / rebaseline / finalize / stop selections

After Workstream B, the package now has:

- one checked runtime snapshot for resumable control posture
- one explicit operator control surface above the machine
- fail-closed legality checks for explicit control selection
- runtime-side enforcement/consumption of saved control intent
- truthful status/help reporting for snapshot reuse and control posture across fresh sessions

So the package runtime is now **resume-aware and control-aware** inside the bounded package seam, while still remaining below the broader target control plane.

## What this workstream does **not** mean

This workstream should **not** be read as having implemented:

- a background autonomous loop
- generic session/runtime lifecycle ownership already held by ASC
- AK campaign binding or AK task lifecycle automation
- finalization materialization, grouped branch choreography, or `groups.json` application
- a second durable control plane parallel to AK / Prompt Vault / append-only runtime history
- Prompt Vault becoming the owner of runtime state

Those remain in later workstreams.

## Bottom line

Workstream B is complete when read as the bounded slice that gave `pi-autoresearch`:

- one checked package-local runtime snapshot for resumable control posture
- one explicit operator surface for continue / rebaseline / finalize / stop
- fail-closed legality checks for control selection
- runtime gating and intent consumption that now respect those operator choices
- bounded proof that the overlay survives fresh-session reuse and degrades safely when stale or unreadable

What still comes next is not “make resume/control real.”
That is now landed for the package-local bounded runtime.
What still comes next is the broader control-plane work above this seam:

- safer finalization orchestration
- live supervision / polling
- AK lifecycle automation
- any later widening into broader operator/supervisor surfaces where explicitly contracted

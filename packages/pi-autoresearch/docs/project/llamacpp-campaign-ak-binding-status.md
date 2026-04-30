---
summary: "Status note for the bounded pi-autoresearch slice that reduces one manifest-driven llama.cpp campaign plus one exact AK task anchor into a compact AK-ready snapshot without letting the package mutate AK directly."
read_when:
  - "You need the shortest truthful answer to what the manifest campaign AK-binding slice actually landed."
  - "Before claiming that pi-autoresearch can now derive a compact AK-ready binding snapshot for one exact manifest/task anchor."
  - "When starting any later follow-on above the manifest campaign baseline and needing to know what AK-aware helper behavior is already real."
type: "reference"
system4d:
  container: "Package-local closure note for the manifest-driven campaign AK-binding slice in pi-autoresearch."
  compass: "State exactly what AK-ready helper behavior is now real without overstating this slice as direct AK mutation, semantic benchmark interpretation, or whole-campaign execution."
  engine: "Summarize the contract->implementation->proof chain -> record the bounded verification -> name the operator/runtime change -> bound what remains outside the slice."
  fog: "The main risk is mistaking a compact AK-ready snapshot for package-owned AK truth, automatic task completion, or benchmark winner selection."
---

# Status — manifest campaign AK binding for `pi-autoresearch`

## Why this note exists

The bounded AK-binding slice in [`product-posture`](./product-posture.md) is now landed across these tasks:

- `#1649` — write the AK binding contract and lifecycle shape for manifest-driven llama.cpp campaigns
- `#1650` — implement bounded AK projection/binding helpers for campaign manifests
- `#1651` — prove AK-aware manifest campaign binding and update product-posture

This note closes the proof question for that slice by answering four things:

1. what is now real in the package/tool/runtime surface
2. what the bounded proof actually proved
3. how the operator/runtime posture changed
4. what still remains outside this slice

## What is now real

### 1. The package now owns one exact-task AK-binding helper layer for this concern

`packages/pi-autoresearch/src/core/llamacppCampaign.ts` now exports bounded helpers that can reduce:

- one exact manifest path
- one exact AK task id
- one fresh manifest-derived projection snapshot

into one compact AK-ready binding shape.

That shape now includes:

- the manifest identity and resolved receipt-root context
- the truthful terminal stage for the current manifest (`41`, `42`, or `43`)
- compact expected-vs-present stage counts
- one deterministic `projectionKey`
- one coarse AK milestone/check-type/summary tuple
- one lifecycle classification that distinguishes `evidence_only` from `complete_task_candidate`

The helper still fails closed when the task id is invalid, the manifest is invalid, or the manifest does not define any executable stage expectation.

### 2. The public manifest tool now exposes a non-mutating `build_ak_binding` surface

`packages/pi-autoresearch/extensions/pi-autoresearch.ts` now exposes:

- `autoresearch_llamacpp_campaign` with `action=build_ak_binding`

That public surface can now:

- derive one current binding snapshot for an exact task anchor
- return compact details for a later AK evidence writer
- tell the caller whether the manifest-expected terminal stage is materially complete enough to become a completion candidate

It still does **not**:

- shell `ak`
- write AK evidence directly
- auto-complete the anchored task
- guess tasks by title or fuzzy context

So the package is now **AK-ready** for this concern, not **AK-mutating**.

### 3. Runtime/help/docs now treat the slice as landed instead of still pending

The package surface now reflects the closure truthfully:

- `/autoresearch` help still describes AK-ready binding snapshot derivation as a landed capability
- runtime status/help no longer advertise `ak_campaign_binding` as an active pending next slice
- `README.md` and `product-posture.md` now treat the helper layer as landed and point readers to this status note
- the repo-root AK milestone projection contract now points manifest-campaign readers to the package-local AK-binding contract/status pair instead of leaving the concern implicit

That keeps the docs aligned with the already-landed helper surface instead of leaving stale proof-pending wording behind.

## Bounded proof for `#1651`

### Test coverage added/confirmed in this closure task

`packages/pi-autoresearch/tests/llamacpp-campaign.test.ts` now proves the key AK-binding obligations:

- a planned manifest derives a stable deterministic `projectionKey`
- projection state maps truthfully to `planned`, `materializing`, `stage41_complete`, `stage42_complete`, and `terminal_stage_complete`
- manifests whose highest expected stage is `41`, `42`, or `43` classify terminal completion eligibility truthfully
- invalid task ids and zero-stage manifests fail closed instead of inventing AK truth
- the public `build_ak_binding` tool surface remains non-mutating even when the manifest terminal stage is already complete

`packages/pi-autoresearch/tests/runtime.test.ts` now closes the runtime/help truth obligations:

- the bounded runtime surface no longer reports `ak_campaign_binding` as a still-pending next slice
- status/help output still advertises AK-ready snapshot derivation as landed package behavior
- empty next-slice posture is rendered explicitly instead of collapsing into ambiguous blank text

Together those tests close the slice's proof obligations:

1. binding shape and milestone mapping are stable
2. terminal-stage meaning is truthful for 41/42/43-terminal manifests
3. deterministic idempotence material is present through `projectionKey`
4. negative paths fail closed
5. the public surface remains explicitly non-mutating
6. runtime/docs posture now matches the landed code reality

## Verification commands run for closure

From `packages/pi-autoresearch`:

```bash
npm run check
npm run release:check:quick
```

From the repo root:

```bash
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/pi-autoresearch/docs/project --strict
```

These checks verified:

- package lint/typecheck/test behavior including the AK-binding proof coverage
- package quick packageability checks after the runtime/docs truth updates
- package-doc metadata/structure validity for this new status note and the product-posture updates

## What changed in operator/runtime behavior

Before this slice, the package could:

- plan the manifest-driven branch/lane matrix
- bind one exact stage `41 | 42 | 43`
- write or refresh one bounded manifest-campaign projection artifact

But it still left one truth gap:

- the operator had no package-owned way to reduce the current manifest concern into one exact-task AK-ready milestone snapshot without inventing manual conventions above the projection artifact

After this slice, the package can now:

- derive one exact-task AK-binding snapshot from current manifest/projection truth
- tell an explicit caller whether the result is evidence-only or terminal-stage complete enough to become a completion candidate
- hand back compact details suitable for later AK evidence recording
- keep runtime/help/docs honest about that helper being landed while still leaving AK mutation policy outside the package

So the package is now **binding-aware** for this concern, while still remaining below direct AK mutation and any broader whole-campaign controller.

## What this slice does **not** mean

This slice should **not** be read as having implemented:

- direct `ak` writes from the package helper
- fuzzy task lookup or automatic task creation
- automatic task completion when terminal-stage receipts exist
- semantic interpretation of workstation receipt payloads into benchmark winners or recommendations
- one-shot execution of the full manifest campaign matrix
- a broader autonomous controller or remote-review plane

Those remain outside this slice on purpose.

## Bottom line

The manifest campaign AK-binding slice is now complete when read as the bounded layer that gave `pi-autoresearch`:

- one exact-task, non-mutating AK-ready binding helper
- truthful milestone/lifecycle classification above fresh manifest projection state
- deterministic `projectionKey` material for later idempotent callers
- proof/runtime/doc closure that keeps AK mutation, benchmark semantics, and whole-campaign execution outside the package boundary

What comes next is not "make AK binding real."
That is now landed.

The next bounded follow-on above this slice is now the campaign-local autonomy layer frozen in [`llamacpp-campaign-autonomy-contract.md`](./llamacpp-campaign-autonomy-contract.md):

- derive the current stage-wave posture for one checked manifest
- identify the one truthful next `execute_stage` step without manual stage/build reconstruction
- optionally apply exactly that one step while still stopping below AK mutation, public campaign control, or whole-campaign execution

Any later widening beyond that would still be a different decision about explicit AK mutation policy, semantic campaign interpretation, or broader orchestration above this bounded helper layer.

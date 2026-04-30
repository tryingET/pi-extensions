---
summary: "Status note for the bounded pi-autoresearch slice that projects manifest-driven llama.cpp campaign receipt/status truth into one checked package-local artifact plus runtime/help exposure without inventing a second campaign-truth plane."
read_when:
  - "You need the shortest truthful answer to what the manifest campaign projection slice actually landed."
  - "Before claiming that pi-autoresearch can now summarize manifest-driven llama.cpp campaign progress through a checked local projection artifact."
  - "When starting any later AK-binding follow-on and needing the exact projection/status baseline that is already real."
type: "reference"
system4d:
  container: "Package-local closure note for the manifest-driven campaign receipt/status projection slice in pi-autoresearch."
  compass: "State exactly what projection/status behavior is now real without overstating this slice as whole-campaign execution, workstation-semantic ownership, or AK campaign truth."
  engine: "Summarize the contract->implementation->proof chain -> record the bounded verification -> name the operator/runtime change -> bound what remains outside the slice."
  fog: "The main risk is letting a convenient local projection artifact get mistaken for semantic campaign success, whole-campaign completion, or durable AK truth."
---

# Status — manifest campaign receipt/status projection for `pi-autoresearch`

## Why this note exists

The bounded projection slice in [`product-posture`](./product-posture.md) is now landed across these tasks:

- `#1644` — write the manifest campaign receipt/projection contract and artifact model
- `#1645` — implement manifest campaign receipts plus runtime status/help integration
- `#1646` — prove manifest campaign projection surface and update product-posture

This note closes the proof question for that slice by answering four things:

1. what is now real in the package/tool/runtime surface
2. what the bounded proof actually proved
3. how the operator/runtime surface changed
4. what still remains outside this slice

## What is now real

### 1. The package now owns one checked projection artifact for this concern

`packages/pi-autoresearch/src/core/llamacppCampaign.ts` now derives and writes:

- `autoresearch.llamacpp-campaign.json`

That artifact is intentionally **projection-only**.
It is derived from:

- the checked manifest
- the resolved receipt root
- deterministic per-build stage-output paths
- filesystem presence checks for those paths

It does **not** replace:

- manifest campaign-intent truth
- workstation stage receipt semantics
- AK durable campaign/task truth

### 2. The projection now carries freshness and compact runtime/help status

The projection layer now records the identity/freshness facts this concern needs, including:

- manifest path + campaign id + manifest key
- resolved receipt root and repo anchors
- per-build expected-vs-present stage output visibility
- per-build `highestCompletedStage`
- compact overall state such as `planned_only`, `partially_materialized`, `stage41_complete`, `stage42_complete`, and `stage43_complete`

That gives runtime/help surfaces one truthful summary layer above deterministic receipt paths without reinterpreting workstation payload semantics into benchmark winners or campaign completion truth.

### 3. Runtime/help surfaces now expose projection truth directly

`packages/pi-autoresearch/src/core/runtime.ts` now surfaces the projection state through the bounded runtime/help layer:

- `buildAutoresearchRuntimeStatus(...)` now exposes `llamacppCampaignProjection`
- formatted status/help text now reports `current`, `stale`, or `not_projected`
- at projection-slice closure time, the runtime posture advanced to the later AK-binding follow-on for this concern; that later slice has since landed in [`llamacpp-campaign-ak-binding-status.md`](./llamacpp-campaign-ak-binding-status.md)

So the operator can now answer the narrow truthful questions this slice was meant to support:

- is there a current projection artifact
- which manifest is projected
- which receipt root is being summarized
- what compact overall state the current expected receipt coverage implies
- whether the saved projection is stale relative to the current manifest

### 4. The public manifest tool now refreshes the projection during bounded manifest work

`autoresearch_llamacpp_campaign` now writes or refreshes the projection artifact during bounded manifest work.
That keeps the projection cheap to rebuild and tied to the current manifest-driven workflow seam instead of inventing a second append-only receipt family for this concern.

## Bounded proof for `#1646`

### Test coverage added/confirmed in this closure task

`packages/pi-autoresearch/tests/llamacpp-campaign.test.ts` already proves the core projection artifact behavior:

- `persistLlamacppCampaignProjection(...)` writes the checked projection artifact
- the projection refreshes cleanly after stage receipts appear
- per-build stage visibility and `highestCompletedStage` update from deterministic receipt presence
- `loadLlamacppCampaignProjectionState(...)` reports the saved artifact as `current` when it still matches the active manifest contract

`packages/pi-autoresearch/tests/runtime.test.ts` now closes the runtime/help proof obligations:

- the bounded runtime status reports `not_projected` truthfully before any campaign projection exists
- the runtime status/help surfaces expose the current projection when one exists
- the runtime status marks the projection `stale` when refresh against the current manifest fails
- runtime status/help no longer advertise projection-proof work as an active next slice; at closure time they pointed forward to the later AK-binding concern, which is now closed in [`llamacpp-campaign-ak-binding-status.md`](./llamacpp-campaign-ak-binding-status.md)

Together those tests close the slice's proof obligations:

1. one checked projection artifact can be derived and refreshed from manifest + deterministic receipt paths
2. freshness/staleness handling remains truthful
3. runtime/help surfaces expose the bounded projection state honestly
4. the package baseline now treats projection as landed rather than as proof-pending implementation residue

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

- package lint/typecheck/test behavior including the projection/runtime proof coverage
- package quick packageability checks after the public-surface/docs updates
- package-doc metadata/structure validity for this new status note and the product-posture updates

## What changed in operator/runtime behavior

Before this slice, the package could:

- plan the manifest-driven branch/lane matrix
- prepare fork workspaces safely
- bind one exact stage `41 | 42 | 43` invocation against workstation-owned scripts

But it still left one important truth gap:

- the operator had no compact package-local answer for the current manifest campaign state above deterministic stage-output paths

After this slice, the package can now:

- write or refresh one checked manifest-campaign projection artifact
- expose `current` / `stale` / `not_projected` truth through runtime/help surfaces
- summarize per-build and overall stage-output presence without pretending those files are semantic winners or AK completion truth

So the package is now **projection-aware** for this concern, while still remaining below AK-backed campaign truth and any whole-campaign executor.

## What this slice does **not** mean

This slice should **not** be read as having implemented:

- one-shot execution of the full manifest campaign matrix
- semantic interpretation of workstation receipt payloads into benchmark winners or recommendations
- AK-backed campaign truth or lifecycle automation for this concern
- replacement of workstation ownership for the `41 / 42 / 43` scripts
- a second append-only control plane for the manifest campaign concern

Those remain outside this slice on purpose.

## Bottom line

The manifest campaign receipt/status projection slice is now complete when read as the bounded layer that gave `pi-autoresearch`:

- one checked `autoresearch.llamacpp-campaign.json` projection artifact
- deterministic manifest+receipt-derived freshness and compact status
- truthful runtime/help exposure for `current` / `stale` / `not_projected`
- proof/status closure that leaves AK truth, workstation semantics, and whole-campaign execution outside the package boundary

What came next after this projection slice was the later AK campaign binding follow-on.
That later slice is now also landed and closed in [`llamacpp-campaign-ak-binding-status.md`](./llamacpp-campaign-ak-binding-status.md).

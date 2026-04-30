---
summary: "Status note for the bounded pi-autoresearch slice that binds manifest-listed llama.cpp campaign builds to the workstation-owned 41/42/43 scripts through explicit build-bin and receipt-root contract fields plus fail-closed stage proof."
read_when:
  - "You need the shortest truthful answer to what the manifest-driven 41/42/43 execution-binding slice actually landed."
  - "Before claiming that pi-autoresearch can now plan or apply one exact 41/42/43 stage from a checked campaign manifest."
  - "When starting the next receipt/status projection slice and needing to know which execution-binding behavior is already real."
type: "reference"
system4d:
  container: "Package-local closure note for the manifest-driven 41/42/43 execution-binding slice in pi-autoresearch."
  compass: "State exactly what stage-scoped binding behavior is now real without overstating this slice as a whole-campaign runner, receipt/status projection plane, or AK campaign substrate."
  engine: "Summarize the contract->implementation->proof chain -> record the bounded verification -> name the operator/runtime change -> bound what remains outside the slice."
  fog: "The main risk is over-claiming the slice as direct campaign execution ownership rather than one bounded binding layer above the existing workstation scripts."
---

# Status — manifest-driven 41/42/43 execution binding for `pi-autoresearch`

## Why this note exists

The bounded execution-binding slice in [`product-posture`](./product-posture.md) is now landed across these tasks:

- `#1636` — write the manifest-driven 41/42/43 execution-binding contract and done-state
- `#1640` — implement the bounded manifest-driven 41/42/43 execution surface in `pi-autoresearch`
- `#1642` — prove manifest-driven 41/42/43 execution binding and update product-posture

This note closes the proof question for that slice by answering four things:

1. what is now real in the package/tool surface
2. what the bounded proof actually proved
3. how the operator/runtime surface changed
4. what still remains outside this slice

## One terminology clarification

In this concern, **41 / 42 / 43 are stage/script identifiers, not ports**.
They refer to the existing workstation-owned scripts:

- `scripts/phasee/41-turboquant-pr45-qwen35-validation.py`
- `scripts/phasee/42-turboquant-pr45-qwen35-q8-comparison.py`
- `scripts/phasee/43-turboquant-pr45-qwen35-vllm-comparison.py`

So this slice binds manifest truth to those anchored entrypoints.
It does not invent a network protocol or address space.

## What is now real

## 1. The manifest now carries explicit execution-binding truth

`packages/pi-autoresearch/src/core/llamacppCampaign.ts` now requires the manifest to carry the fields that the planning-only slice intentionally deferred:

- `builds[].buildBinDir`
- `workflow.executionBinding.receiptRootPath`

That means one selected build no longer relies on operator-memory glue for:

- which bin directory should feed the workstation script
- where build-scoped stage outputs should live
- how stage 41 / 42 / 43 output paths derive deterministically

The package resolves those paths explicitly and fails closed when the receipt root escapes the workstation repo boundary.

## 2. The tool now exposes one bounded stage-scoped execution surface

`packages/pi-autoresearch/extensions/pi-autoresearch.ts` now extends:

- `autoresearch_llamacpp_campaign`

with one additional action:

- `execute_stage`

That surface accepts:

- manifest path
- stage `41 | 42 | 43`
- exact build id
- optional `apply=true`

And it can now do two truthful things:

- **plan** one exact stage invocation, including the resolved script path, build-bin path when applicable, prerequisite paths, output paths, and exact argv
- **apply** that one exact invocation through the current workstation-owned script when prerequisites are satisfied

## 3. Stage translation is now explicit and fail-closed

The package does not pretend the workstation scripts are more generic than they are.
Instead it binds to the current script contract honestly:

- stage 41 derives `--kv-types` from `f16` plus the stage-42-relevant manifest lanes for that build
- stage 42 translates the manifest lanes into the current `config_i` + `q8_0` script interface
- stage 43 reuses the derived stage-42 receipt and stage-41 corpus when available

Important failure fences are now real:

- stage 42 apply fails closed when the derived stage-41 receipt is missing
- stage 42 fails closed when the lane shape cannot be translated into the current workstation script contract
- stage 43 apply fails closed when the derived stage-42 receipt is missing
- receipt-root escape outside the workstation repo fails closed

## 4. Runtime/help surfaces now reflect the landed binding layer

The package runtime/help surface now names this concern truthfully:

- `autoresearch_llamacpp_campaign` is part of the runtime-advertised tool set
- `/autoresearch` help text now mentions stage binding in addition to planning/fork preparation
- `nextSlices` now move on to receipt/status projection and later AK binding instead of still advertising execution binding as missing

## Bounded proof for `#1642`

## Test coverage added/confirmed in this task

`packages/pi-autoresearch/tests/llamacpp-campaign.test.ts` now proves all of the key binding obligations:

- manifest planning still expands the explicit stage matrix
- fork preparation still plans/applies correctly
- stage 41 plan resolves exact args plus deterministic build-scoped outputs
- one supported build can apply stage 41 -> 42 -> 43 successfully through stubbed workstation anchors
- stage 42 apply fails closed when the stage-41 receipt is missing
- stage 42 fails closed when the manifest lane set exceeds the current workstation script contract
- stage 43 apply fails closed when the stage-42 receipt is missing
- receipt-root escape outside the workstation repo fails closed
- invalid cherry-pick provenance still fails closed
- the extension-registered tool can expose `execute_stage` through the public surface

`packages/pi-autoresearch/tests/runtime.test.ts` continues to prove the runtime/help integration side:

- the bounded runtime status advertises `autoresearch_llamacpp_campaign`
- the extension still registers the runtime surfaces truthfully

Together those tests close the execution-binding proof obligations from the RFC:

1. exact build-bin and receipt-root contract resolution
2. exact command construction for stages 41, 42, and 43
3. successful bounded apply behavior for one supported build path
4. fail-closed prerequisite and translation fences
5. truthful public/runtime surface exposure

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

- package lint/typecheck/test behavior including the new execution-binding coverage
- package tarball/packageability quick checks after the public-surface/docs updates
- package-doc metadata/structure validity for the new status note and product-posture updates

## What changed in operator/runtime behavior

Before this slice, the package could:

- load the manifest
- explain the explicit 41/42/43 matrix
- prepare the fork workspace safely

But it still left one missing manual step:

- the operator or agent had to translate one manifest-listed build into handwritten script flags, build-bin paths, and output filenames

After this slice, the package can now:

- plan one exact stage invocation from checked manifest data
- apply one exact stage invocation through the existing workstation-owned script
- reuse deterministic build-scoped paths across 41 -> 42 -> 43
- block unsafe or incompatible stage execution before it silently widens the contract

So the package is now **execution-binding aware** for this concern, while still remaining below any broader campaign runner or receipt/status projection plane.

## What this slice does **not** mean

This slice should **not** be read as having implemented:

- one-shot execution of the full campaign matrix
- source-branch checkout/build compilation as hidden package behavior
- receipt/status projection into the broader runtime status surfaces for this concern
- AK-backed campaign truth or lifecycle automation for this concern
- replacement of workstation ownership for the 41/42/43 scripts
- a generic multi-script workflow engine for unrelated workloads

Those remain outside this slice on purpose.

## Bottom line

The manifest-driven 41/42/43 execution-binding slice is now complete when read as the bounded layer that gave `pi-autoresearch`:

- explicit build-bin and receipt-root execution-binding contract fields
- one stage-scoped `execute_stage` surface
- exact plan/apply binding for `41 | 42 | 43`
- fail-closed prerequisite and lane-translation fences
- public/runtime help truth that now advertises the landed binding surface

What comes next is not “make execution binding real.”
That is now landed.
What comes next is the next bounded layer above it:

- manifest campaign receipt/status projection
- later AK binding if the concern proves durable enough

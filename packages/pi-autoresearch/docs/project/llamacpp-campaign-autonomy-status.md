---
summary: "Status note for the bounded pi-autoresearch slice that derives manifest-driven llama.cpp campaign stage-wave posture plus one truthful next execution step without turning the package into a public campaign-control surface, AK mutator, or whole-campaign runner."
read_when:
  - "You need the shortest truthful answer to what the manifest campaign-local autonomy slice actually landed."
  - "Before claiming that pi-autoresearch can now derive and optionally apply one truthful next stage step for a checked manifest-driven llama.cpp campaign."
  - "When starting the later public campaign-control follow-on and needing to know exactly which bounded autonomy behavior is already real."
type: "reference"
system4d:
  container: "Package-local closure note for the manifest-driven campaign-local autonomy slice in pi-autoresearch."
  compass: "State exactly what one-step campaign-local autonomy behavior is now real without overstating this slice as public campaign control, direct AK mutation, or whole-campaign execution."
  engine: "Summarize the contract->implementation->proof chain -> record the bounded verification -> name the operator/runtime change -> bound what remains outside the slice."
  fog: "The main risk is mistaking a truthful next-step helper for a whole-campaign runner, public control surface, or hidden lifecycle plane."
---

# Status — manifest campaign-local autonomy for `pi-autoresearch`

## Why this note exists

The bounded campaign-local autonomy slice in [`product-posture`](./product-posture.md) is now landed across these tasks:

- `#1693` — write the campaign-local autonomy contract and lifecycle shape for manifest-driven llama.cpp campaigns
- `#1694` — implement bounded campaign-local autonomy helpers for manifest-driven llama.cpp campaigns
- `#1695` — prove campaign-local autonomy helpers and update product-posture

This note closes the proof question for that slice by answering four things:

1. what is now real in the package/tool/runtime surface
2. what the bounded proof actually proved
3. how the operator/runtime posture changed
4. what still remains outside this slice

## What is now real

### 1. The package now owns one bounded campaign-local autonomy helper layer for this concern

`packages/pi-autoresearch/src/core/llamacppCampaign.ts` now exports bounded helpers that can:

- derive one current autonomy snapshot for one exact manifest through `buildLlamacppCampaignAutonomy(...)`
- plan or apply exactly one truthful next local step through `advanceLlamacppCampaign(...)`

That autonomy snapshot now includes:

- manifest identity plus receipt-root context
- the truthful terminal stage for the current manifest (`41`, `42`, or `43`)
- compact expected-vs-completed stage counts
- one current phase classification (`stage41_wave`, `stage42_wave`, `stage43_wave`, `terminal_stage_complete`, or `blocked`)
- one exact next step when more local materialization is still needed

The helper still fails closed when:

- the manifest is invalid
- the manifest defines no executable stage expectation
- the next truthful step is blocked and the caller tries to apply it
- the caller tries to apply after terminal-stage completion has already been reached

### 2. The public manifest tool now exposes a bounded `advance_campaign` surface

`packages/pi-autoresearch/extensions/pi-autoresearch.ts` now exposes:

- `autoresearch_llamacpp_campaign` with `action=advance_campaign`

That public surface can now:

- derive the current stage-wave posture for one checked manifest
- identify the one truthful next `execute_stage` step without manual stage/build reconstruction
- apply exactly that one step when it is currently executable

It still does **not**:

- run the entire campaign matrix to completion
- invent hidden fork preparation, source checkout, or build compilation behavior
- write AK evidence or complete tasks
- act as the later public campaign-control surface

So the package is now **one-step autonomy aware** for this concern, not a whole-campaign controller.

### 3. Runtime/help/docs now treat the slice as landed instead of still pending

The package surface now reflects the closure truthfully:

- `/autoresearch` help now advertises one-step campaign-local advancement as landed package behavior
- runtime/help text states that the package still does **not** own a public manifest campaign-control surface
- `README.md` and `product-posture.md` now treat the autonomy helper layer as landed and point readers to this status note

That keeps the package posture honest: the one-step helper is real, while the later public control surface remains a separate follow-on.

## Bounded proof for `#1695`

### Test coverage added/confirmed in this closure task

`packages/pi-autoresearch/tests/llamacpp-campaign.test.ts` now proves the key autonomy obligations:

- stage-wave derivation is truthful for `43`-terminal manifests as stage-41, stage-42, and stage-43 materialization progresses
- `42`-terminal and `41`-terminal manifests also classify terminal completion truthfully instead of assuming every lawful campaign ends at stage `43`
- next-step selection follows manifest order within the active stage wave
- blocked next steps surface as blockers instead of widening into hidden prep/build behavior
- apply mode executes exactly one selected stage step and stops
- terminal-stage completion returns `nextStep.action = "none"`, and apply mode then fails closed instead of silently pretending there is more work to do
- the public `advance_campaign` manifest-tool surface exposes the bounded helper without widening into a whole-campaign runner

`packages/pi-autoresearch/tests/runtime.test.ts` now closes the runtime/help truth obligations:

- the bounded runtime/help text advertises one-step campaign-local advancement as landed behavior
- the same help text explicitly states that the package still does **not** own a public manifest campaign-control surface
- runtime/help posture therefore stays below the later public control-surface slice instead of overstating this autonomy helper as a broader operator plane

Together those tests close the slice's proof obligations:

1. stage-wave derivation is truthful for `41`-, `42`-, and `43`-terminal manifests
2. next-step selection stays stage-gated and manifest-ordered
3. blocked next steps fail closed instead of widening into hidden prep/build behavior
4. one-step apply behavior is real and bounded
5. terminal completion is explicit and no longer ambiguous
6. runtime/docs posture matches the landed code boundary

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

- package lint/typecheck/test behavior including the autonomy proof coverage
- package quick packageability checks after the runtime/docs truth updates
- package-doc metadata/structure validity for this new status note and the product-posture updates

## What changed in operator/runtime behavior

Before this slice, the package could:

- plan the manifest-driven branch/lane matrix
- plan or apply one exact stage `41 | 42 | 43` invocation when the caller already chose the build and stage
- write or refresh one bounded projection artifact
- derive one exact-task AK-ready snapshot when the caller already knew the task id

But it still left one important truth gap:

- the operator had no package-owned way to ask "what is the next truthful local step for this manifest right now?" without reconstructing the answer manually from the projection and stage-binding seams

After this slice, the package can now:

- derive one current stage-wave posture for one checked manifest
- identify the one truthful next stage/build step automatically
- surface blockers truthfully when that next step cannot yet be executed
- apply exactly one next step and then stop
- keep runtime/help/docs honest that this is still below public campaign control, direct AK mutation, and whole-campaign execution

So the package is now **campaign-locally autonomy-aware** for this concern, while still remaining below any broader autonomous controller.

## What this slice does **not** mean

This slice should **not** be read as having implemented:

- a public operator-facing campaign-control surface
- direct `ak` writes or automatic task completion
- whole-campaign `run_until_complete` behavior
- hidden fork preparation, source checkout, or build compilation
- semantic interpretation of workstation receipt payloads into benchmark winners or recommendations
- background polling, supervision, or remote-review choreography

Those remain outside this slice on purpose.

## Bottom line

The manifest campaign-local autonomy slice is now complete when read as the bounded layer that gave `pi-autoresearch`:

- one current stage-wave autonomy snapshot for a checked manifest
- one truthful next-step selector above the existing stage-binding seam
- one bounded `advance_campaign` surface that can apply exactly one next step
- proof/runtime/doc closure that keeps public campaign control, AK mutation, and whole-campaign execution outside the package boundary

What comes next is not "make the package autonomous in general."
That is still out of scope.

The later public campaign-control follow-on above this landed slice is now itself landed and closed in:

- [llamacpp-campaign-control-surface-status.md](./llamacpp-campaign-control-surface-status.md)

Any later widening beyond that would still be a different decision about direct AK mutation policy or broader orchestration above this bounded helper layer.

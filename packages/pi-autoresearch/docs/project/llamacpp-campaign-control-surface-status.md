---
summary: "Status note for the bounded pi-autoresearch slice that exposes a dedicated public consumer/control seam for manifest-driven llama.cpp campaigns by composing the landed autonomy and AK-binding helpers without widening into whole-campaign execution or direct AK mutation."
read_when:
  - "You need the shortest truthful answer to what the manifest public campaign-control slice actually landed."
  - "Before claiming that pi-autoresearch now has a dedicated public autoresearch_llamacpp_campaign_control seam for status plus one-step advancement."
  - "When starting any later follow-on above the public manifest campaign-control baseline and needing to know exactly what public behavior is already real."
type: "reference"
system4d:
  container: "Package-local closure note for the manifest-driven public campaign-control slice in pi-autoresearch."
  compass: "State exactly what public campaign-control behavior is now real without overstating the slice as whole-campaign execution, direct AK mutation, or a second durable control plane."
  engine: "Summarize the contract->implementation->proof chain -> record the bounded verification -> name the operator/runtime change -> bound what remains outside the slice."
  fog: "The main risk is mistaking a truthful public wrapper seam for a whole-campaign runner, hidden AK automation layer, or broader orchestration plane."
---

# Status — manifest public campaign-control surface for `pi-autoresearch`

## Why this note exists

The bounded public campaign-control slice in [`current-vs-target`](./current-vs-target.md) is now landed across these tasks:

- `#1697` — write the public campaign-control contract and consumer seam for manifest-driven pi-autoresearch campaigns
- `#1698` — implement the bounded public campaign-control surface in pi-autoresearch
- `#1699` — prove the public campaign-control surface and update current-vs-target

This note closes the proof question for that slice by answering four things:

1. what is now real in the package/tool/runtime surface
2. what the bounded proof actually proved
3. how the operator/runtime posture changed
4. what still remains outside this slice

## What is now real

### 1. The package now owns one dedicated public manifest campaign-control seam for this concern

`packages/pi-autoresearch/src/core/llamacppCampaign.ts` now exports bounded public-control helpers that can:

- derive one public current-state view for one exact manifest through `inspectLlamacppCampaignControl(...)`
- plan or apply exactly one truthful next public step through `executeLlamacppCampaignControl(...)`
- compose the already-landed autonomy helper with the already-landed exact-task AK-binding helper through `buildLlamacppCampaignControlSurface(...)`

That public control snapshot now includes:

- the current autonomy view for one exact checked manifest
- optional exact-task AK-ready binding context when the caller already knows the task id
- one public `nextStepAction` classification (`advance` or `none`)
- one public `completionCandidate` bit when the exact-task binding says terminal-stage materialization is now completion-eligible
- one shortest truthful public reason string for the current control posture
- one canonical same-call projection basis for the public control view instead of stitching separate helper/projection reads together

The public wrapper still fails closed when:

- the manifest is invalid
- the caller passes `apply=true` with `action="status"`
- the next truthful step is blocked and the caller tries to apply it
- the caller tries to apply after terminal-stage completion has already been reached
- the wrapper would need to guess a task, stage, or build

Additional hardening now landed after the initial public-surface rollout:

- blocked public states no longer advertise `nextStepAction = "advance"`
- the public tool now persists the exact projection it already used to build the response instead of rebuilding a second projection in the extension layer

### 2. The extension now exposes a dedicated public tool instead of making callers compose the lower-level helper actions manually

`packages/pi-autoresearch/extensions/pi-autoresearch.ts` now exposes:

- `autoresearch_llamacpp_campaign_control`

That public surface can now:

- inspect one checked manifest's current public campaign-control posture through `action=status`
- optionally include one exact-task AK-binding snapshot when `taskId` is present
- plan exactly one truthful next public step through `action=advance`
- apply exactly one truthful next public step through `action=advance` with `apply=true`
- reject invalid public input contracts such as `action=status` with `apply=true`

It still does **not**:

- expose raw `stage` / `buildId` inputs as public caller requirements
- auto-run fork preparation or build compilation
- run the whole campaign to completion
- write AK evidence or complete tasks
- replace the lower-level technical `autoresearch_llamacpp_campaign` tool

So the package now has a **public one-step control seam** for this concern, not a whole-campaign controller.

### 3. Runtime/help/docs now treat the public seam as landed instead of pending

The package surface now reflects the closure truthfully:

- `/autoresearch` help now advertises the dedicated public `autoresearch_llamacpp_campaign_control` seam as real package behavior
- the same help text distinguishes that public seam from the lower-level technical `autoresearch_llamacpp_campaign` tool
- `README.md` and `current-vs-target.md` now treat the public seam as landed and point readers to this status note
- runtime status/help no longer pretend there is still an open proof-only next slice for this concern

That keeps the package posture honest: the public wrapper seam is real, while whole-campaign execution, direct AK mutation, and broader orchestration are still outside the slice.

## Bounded proof for `#1699`

### Test coverage added/confirmed in this closure task

`packages/pi-autoresearch/tests/llamacpp-campaign.test.ts` now proves the key public-control obligations:

- `inspectLlamacppCampaignControl(...)` truthfully composes the landed autonomy helper with optional exact-task AK context
- `executeLlamacppCampaignControl(...)` can apply exactly one next public step and then refresh public control truth instead of widening into a loop
- blocked next public steps surface as blocked control posture, public `nextStepAction` now drops to `"none"`, and apply mode then fails closed instead of silently widening into hidden prep/build behavior
- terminal-stage completion returns `public.nextStepAction = "none"`, can surface `completionCandidate = true` when exact-task AK context is present, and does not pretend further public work exists
- the public `autoresearch_llamacpp_campaign_control` extension tool returns the bounded public shape, supports `status` plus `advance`, rejects `action=status` with `apply=true`, and now keeps response-control truth aligned with the persisted projection artifact

`packages/pi-autoresearch/tests/runtime.test.ts` now closes the runtime/help truth obligations:

- the bounded runtime/help text now advertises the dedicated public manifest campaign-control seam as landed behavior
- the same help text explicitly distinguishes the public control seam from the lower-level technical manifest helper surface
- runtime status no longer claims there is still a pending proof-only next slice for this concern
- runtime tool registration now includes both the technical tool and the public control tool

Together those tests close the slice's proof obligations:

1. the public wrapper shape is real
2. public status composes autonomy plus optional exact-task AK context truthfully
3. public advance still executes exactly one step and stops
4. blocked and terminal public states fail closed instead of inventing more work
5. the public seam works both with and without an exact task id
6. runtime/docs posture matches the landed public code boundary

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

Advisory closure check:

```bash
ak task close-check 1699 --machine
```

These checks verified:

- package lint/typecheck/test behavior including the public control proof coverage
- package quick packageability checks after the runtime/docs truth updates
- package-doc metadata/structure validity for this new status note and the current-vs-target updates
- advisory AK closure readiness for the bounded task slice

## What changed in operator/runtime behavior

Before this slice, the package already had:

- one technical manifest helper tool
- one exact-task AK-binding helper
- one campaign-local autonomy helper that could identify or apply one next truthful step

But it still left one important truth gap:

- public callers had no dedicated bounded control seam and still had to know the lower-level helper vocabulary or compose autonomy plus AK-binding context manually

After this slice, the package can now:

- expose one dedicated public `autoresearch_llamacpp_campaign_control` tool
- return one compact public current-state view for one exact manifest
- optionally enrich that public view with one exact-task AK-ready binding snapshot
- plan or apply exactly one truthful next public step without asking the caller for raw `stage` / `buildId`
- surface blocked and terminal public states truthfully instead of pretending more work exists
- keep runtime/help/docs honest that the public seam still remains below whole-campaign execution, direct AK mutation, and remote-review choreography

So the package is now **public-control aware** for this concern, while still remaining below any broader autonomous controller.

## What this slice does **not** mean

This slice should **not** be read as having implemented:

- whole-campaign `run_until_complete` behavior
- automatic fork preparation, source checkout, or build compilation
- direct `ak` writes or automatic task completion
- semantic interpretation of workstation receipt payloads into benchmark winners or recommendations
- a new persisted campaign-control artifact file
- background polling, supervision, or remote-review choreography

Those remain outside this slice on purpose.

## Bottom line

The manifest public campaign-control slice is now complete when read as the bounded layer that gave `pi-autoresearch`:

- one dedicated public `autoresearch_llamacpp_campaign_control` seam
- one truthful public current-state view above the landed autonomy and AK-binding helpers
- one bounded public `advance` path that still plans/applies exactly one step and stops
- proof/runtime/doc closure that keeps whole-campaign execution, AK mutation, and broader orchestration outside the package boundary

What comes next is not "make the package an autonomous controller in general."
That is still out of scope.

No further bounded follow-on is currently committed in `current-vs-target` for this concern.
Any later widening would still need a new explicit bounded decision.

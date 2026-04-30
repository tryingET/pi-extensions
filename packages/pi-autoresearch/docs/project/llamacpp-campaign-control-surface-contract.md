---
summary: "Contract for the bounded pi-autoresearch follow-on that adds a dedicated public consumer/control surface for manifest-driven llama.cpp campaigns by composing the landed autonomy and AK-binding helpers without turning the package into a whole-campaign runner or AK mutator."
read_when:
  - "Before implementing or reviewing tasks 1698 or 1699 in the manifest-driven public campaign-control slice."
  - "When deciding what public surface may sit above autoresearch_llamacpp_campaign without collapsing the technical manifest helpers into the long-term consumer contract."
  - "When you need the exact tool name, action contract, and owner split for the later public campaign-control seam."
type: "reference"
system4d:
  container: "Package-local contract note for the post-target public campaign-control surface follow-on in pi-autoresearch."
  compass: "Expose one truthful public consumer seam above the technical manifest helpers without collapsing stage semantics, AK truth, or whole-campaign execution into the package."
  engine: "State the landed baseline -> freeze the dedicated public tool seam -> define status/advance composition -> define optional AK context -> bound verification and non-goals."
  fog: "The main risks are overloading the technical manifest tool into a public contract, reintroducing manual stage/build selection into the public seam, or silently widening into direct AK mutation or whole-campaign execution."
---

# Contract — manifest public campaign-control surface for `pi-autoresearch`

## Why this note exists

`pi-autoresearch` now already has the lower layers this next slice must build on:

1. a checked manifest-driven llama.cpp campaign surface
2. stage-scoped `41 / 42 / 43` execution binding against the workstation-owned scripts
3. one checked `autoresearch.llamacpp-campaign.json` projection artifact and truthful runtime/help exposure above deterministic stage-output paths
4. one exact-task, non-mutating AK-ready binding helper for callers that already know the anchored task id
5. one bounded campaign-local autonomy helper that can derive the current stage-wave posture and plan/apply exactly one truthful next step

Those facts are already captured in:

- [product-posture](./product-posture.md)
- [llama.cpp campaign AK binding status](./llamacpp-campaign-ak-binding-status.md)
- [llama.cpp campaign autonomy status](./llamacpp-campaign-autonomy-status.md)
- [package README](../../README.md)

What is still missing is the exact contract for the next bounded slice:

> how the package should expose a **dedicated public consumer/control seam** for one manifest-driven campaign without forcing public callers to know the lower-level `plan_matrix` / `prepare_fork` / `execute_stage` action set, while still remaining below whole-campaign execution, direct AK mutation, and workstation-owned stage semantics.

This note freezes that contract for `#1697` and gives `#1698` / `#1699` a bounded implementation/proof target.

---

## Current truthful starting point

Today the package truth for this concern is:

- `autoresearch_llamacpp_campaign` already exists as the **technical manifest helper surface**
- that technical surface can already:
  - plan the exact branch/lane matrix
  - plan/apply fork preparation
  - plan/apply one exact stage-scoped `41 | 42 | 43` invocation
  - derive one exact-task AK-ready binding snapshot
  - plan/apply exactly one truthful next campaign-local step
- the package does **not** yet have one dedicated public tool that presents those landed lower layers as a smaller stable control contract for external consumers/operators
- public callers still have to know internal helper action names and, when they want both current control posture and AK context, manually compose separate helper results
- `/autoresearch` help and `README.md` still truthfully say that the package does **not** yet own a public manifest campaign-control surface

So this slice is **not** about inventing new execution semantics.
It is about freezing the first truthful **public wrapper seam** above already-landed package helpers.

---

## Contract in one sentence

`pi-autoresearch` should add one dedicated public tool named `autoresearch_llamacpp_campaign_control` that, for one exact checked manifest and optional exact AK task id, returns a compact current control snapshot and can plan/apply exactly one truthful next campaign-local step by composing the landed autonomy and AK-binding helpers, while leaving raw stage selection, fork preparation, workstation execution semantics, AK mutation, and whole-campaign execution outside the public contract.

---

## Governing owner split

| Concern | Owner in this slice | Why |
|---|---|---|
| Manifest validation, deterministic stage expectation, projection refresh, autonomy derivation, and optional AK-ready binding derivation | `packages/pi-autoresearch` | These are the landed package-local source seams the public surface should compose |
| Technical matrix/fork/stage helper surface (`autoresearch_llamacpp_campaign`) | `packages/pi-autoresearch` | This remains the expert/technical helper surface below the later public seam |
| Public consumer/control seam (`autoresearch_llamacpp_campaign_control`) | `packages/pi-autoresearch` | This is the new bounded package concern in this slice |
| Stage `41 / 42 / 43` command semantics and receipt meaning | workstation repo + its existing scripts | Public control must not rewrite brownfield execution semantics into a second runtime substrate |
| Exact AK task identity, durable lifecycle truth, evidence/result mutation | AK | Optional task context may be composed in, but AK remains the durable owner |
| Direct AK evidence writes or task completion mutation | explicit caller above the package | This public surface may surface completion candidacy, not mutate AK |
| Whole-campaign execution, hidden loops, remote review choreography, winner selection | out of scope | Not required for a truthful public control seam |

Interpretation rule:

> The package may now publish one small **control view** above the landed helper layers.
> It does **not** thereby become the owner of raw workstation stage semantics, durable AK truth, or an end-to-end autonomous campaign runner.

---

## Slice target done-state

This public campaign-control slice is done when all of the following are true:

1. the package exposes one dedicated public tool named `autoresearch_llamacpp_campaign_control`
2. the tool accepts one exact `manifestPath` and optional exact `taskId`
3. the public surface supports exactly two public actions:
   - `status`
   - `advance`
4. `status` returns one compact current control snapshot derived from the landed autonomy helper and optional AK-binding helper
5. `advance` can either:
   - plan exactly one truthful next step, or
   - apply exactly one truthful next step
6. public callers do **not** need to pass raw `stage` or `buildId` selections through the public seam
7. if `taskId` is present, the public result may include one exact-task AK-ready binding snapshot; if `taskId` is absent, the surface still works without inventing a task
8. the public surface still does **not** expose `plan_matrix`, `prepare_fork`, or raw `execute_stage` as its public contract
9. `/autoresearch`, `README.md`, and `product-posture.md` can point to this public surface truthfully once implemented
10. tests prove that the public seam composes existing helpers correctly without widening into whole-campaign execution, direct AK mutation, or manual stage/build selection

### Explicitly included in this done-state

- one dedicated public tool name
- one compact public control snapshot
- one bounded public plan/apply-next-step flow
- optional exact-task AK context when the caller already knows the task id
- runtime/docs/help closure that clearly distinguishes the public seam from the technical helper surface

### Explicitly **not** included in this done-state

- a new campaign-control JSON artifact
- direct `ak` writes or task completion mutation
- `prepare_fork` as a public automatic side effect
- raw stage/build selection as a public caller obligation
- whole-campaign `run_until_complete` behavior
- background polling or daemonized autonomy
- semantic benchmark winner selection from receipt payloads

---

## Dedicated public consumer seam

### Exact public tool name

The first bounded public tool should be named:

- `autoresearch_llamacpp_campaign_control`

Why this exact name:

- it stays specific to the currently real manifest-driven llama.cpp concern
- it avoids over-claiming a generic campaign-control surface for unrelated future campaign kinds
- it distinguishes the new public seam from the existing technical helper tool `autoresearch_llamacpp_campaign`

### Why a dedicated tool is required

This slice should **not** merely add more actions onto `autoresearch_llamacpp_campaign` and call that the long-term public contract.

The technical helper tool already owns lower-level actions that are still useful but too implementation-shaped for the public seam:

- `plan_matrix`
- `prepare_fork`
- `execute_stage`
- `build_ak_binding`
- `advance_campaign`

Those actions are still valuable for expert/manual workflows.
But the public contract must be smaller and more stable:

- current public callers should ask for the current campaign-control posture
- then optionally plan/apply exactly one next truthful step
- and optionally include exact-task AK context when they already have a task id

So the public seam should be **a wrapper tool**, not a renamed description of the lower-level helper surface.

### Why `/autoresearch` is not the write-path

`/autoresearch` may summarize the public campaign-control surface once it exists.
But the actual public control write/read path should remain a typed tool so that:

- the contract is machine-testable
- callers can use it without scraping help text
- the wrapper seam can stay narrow and explicit

---

## Public input contract

A truthful first input shape is:

```ts
interface AutoresearchLlamacppCampaignControlInput {
  action?: "status" | "advance";
  cwd?: string;
  manifestPath: string;
  taskId?: number;
  apply?: boolean;
}
```

### Field rules

#### `manifestPath`

Required.
This is still the exact checked manifest anchor for the concern.
The public surface must not guess which manifest the caller probably means.

#### `taskId`

Optional, but when present it must be an **exact AK task id**.
The public surface may use it only to compose the already-landed exact-task AK-binding helper.
It must not fuzzy-match tasks, create tasks, or infer likely task ids from campaign metadata.

#### `apply`

Only meaningful for `action = "advance"`.

Rules:

- omitted/false => plan exactly one next step only
- true => apply exactly one next step only
- `apply=true` with `action="status"` must fail closed rather than being silently ignored

#### No raw `stage` or `buildId`

The public surface must **not** require callers to provide `stage` or `buildId`.
Those are precisely the lower-level details that the public seam exists to hide behind the landed autonomy helper.

If a caller needs raw `stage` / `buildId` control anyway, that caller should use the technical helper tool directly.

---

## Public result contract

A truthful first public snapshot shape is:

```ts
interface LlamacppCampaignControlSurfaceV1 {
  type: "llamacpp_campaign_control_surface";
  version: 1;
  autonomy: LlamacppCampaignAutonomyV1;
  akBinding: LlamacppCampaignAkBindingV1 | null;
  public: {
    taskBound: boolean;
    nextStepAction: "advance" | "none";
    completionCandidate: boolean;
    reason: string;
  };
}

interface InspectLlamacppCampaignControlResult {
  action: "status";
  control: LlamacppCampaignControlSurfaceV1;
  nextAction: string;
}

interface ExecuteLlamacppCampaignControlResult {
  action: "advance";
  mode: "plan" | "apply";
  control: LlamacppCampaignControlSurfaceV1;
  executedStep: ExecuteLlamacppCampaignStageResult | null;
  nextAction: string;
}
```

### Interpretation rules

#### `control.autonomy`

This is the landed campaign-local autonomy truth reused directly from the existing helper layer.
The public surface must not invent a second phase model.

#### `control.akBinding`

- `null` when no exact `taskId` was provided
- one exact-task AK-ready binding snapshot when `taskId` was provided

This preserves the already-landed boundary:

- AK context may be composed into the public view
- direct AK mutation still remains outside the package helper

#### `public.taskBound`

`true` only when an exact `taskId` was provided and the public surface successfully composed the AK-binding helper.

#### `public.nextStepAction`

- `"advance"` when the autonomy snapshot says a lawful next step exists and is not terminally done
- `"none"` when the terminal stage is already materially complete or when the public surface has nothing lawful to advance

#### `public.completionCandidate`

`true` only when all of the following are true:

1. the caller provided an exact `taskId`
2. the public surface successfully derived `akBinding`
3. `akBinding.lifecycle.action === "complete_task_candidate"`

Important interpretation rule:

> `completionCandidate` means the current public view includes enough exact-task context to say that the manifest-expected terminal stage is materially complete for that task anchor.
> It does **not** mean the tool may now mutate AK automatically.

#### `public.reason`

This is the shortest truthful explanation for the current public control posture.
Examples:

- stage-41 wave still active; advance next
- next truthful step is blocked by missing build bin or prerequisite receipt
- terminal stage is materially complete locally; supply/use exact task context above this tool if a caller wants to evaluate AK completion externally

---

## Source seam the public tool may trust

The public wrapper should compose source-level helpers in:

- [`packages/pi-autoresearch/src/core/llamacppCampaign.ts`](../../src/core/llamacppCampaign.ts)

The key landed helpers are already there:

- `buildLlamacppCampaignAutonomy(...)`
- `advanceLlamacppCampaign(...)`
- `buildLlamacppCampaignAkBinding(...)`
- projection refresh helpers already used by the current manifest tool

### Trust boundary rule

The public surface should compose these source-level helpers directly.
It must **not**:

- parse formatted text from `formatLlamacppCampaignResult(...)`
- parse `/autoresearch` help text to recover current campaign truth
- require a human to choose stage/build manually through the public seam
- depend on a second persisted campaign-control artifact

A fresh in-process composition of the landed helpers is the truthful source.

---

## Action semantics

## 1. `status`

Meaning:

- derive one current public campaign-control snapshot for the exact manifest
- optionally compose exact-task AK context when `taskId` is present
- do not apply a campaign step

Required behavior:

1. load and validate the exact manifest
2. derive/refresh the current projection/autonomy truth through the landed helper layer
3. if `taskId` is present, derive one exact-task AK-binding snapshot through the landed helper layer
4. return one `LlamacppCampaignControlSurfaceV1`
5. surface the shortest truthful `nextAction` string for the caller

Important boundary:

- `status` does **not** ask the caller for raw stage/build choices
- `status` does **not** mutate AK
- `status` does **not** loop through multiple missing steps

## 2. `advance`

Meaning:

- use the public control snapshot to plan or apply exactly one truthful next campaign-local step

Required behavior:

1. derive current control truth first
2. if `apply !== true`, plan exactly one next step and stop
3. if `apply === true`, apply exactly one next step and stop
4. after plan/apply, return the refreshed public control snapshot
5. if `taskId` is present, compose refreshed AK-binding truth too

Important boundary:

- `advance` may only execute **one** next step
- it must still reuse the landed one-step helper behavior rather than inventing a multi-step loop
- it must not auto-run `prepare_fork`, auto-build binaries, or continue until terminal completion
- it must not mutate AK even when `completionCandidate = true`

### Plan-mode rule

Plan mode is the default for `advance`.
It should report which exact next step would run and why, while leaving execution unchanged.

### Apply-mode rule

Apply mode should:

- fail closed when the next truthful step is blocked
- fail closed when no next step exists because terminal-stage materialization is already complete
- execute exactly one next step and then stop

---

## Boundary to the technical helper surface

The public tool does **not** replace the lower-level helper tool.
Instead the two surfaces should relate like this:

| Surface | Purpose |
|---|---|
| `autoresearch_llamacpp_campaign` | technical/expert helper surface for matrix planning, fork prep, raw stage binding, exact AK binding, and lower-level autonomy access |
| `autoresearch_llamacpp_campaign_control` | public consumer/control seam for status + one-step public advancement + optional exact-task AK context |

Interpretation rule:

> The technical tool remains the brownfield/manual utility surface.
> The new control tool becomes the smaller stable public seam.

---

## Runtime/help contract

Once the public surface lands in `#1698`, the package should update:

- `/autoresearch` help text
- `README.md`
- `product-posture.md`

So that all three say the same thing:

1. `autoresearch_llamacpp_campaign` remains the technical helper surface
2. `autoresearch_llamacpp_campaign_control` is the public consumer/control seam
3. the new public seam still remains below direct AK mutation, whole-campaign execution, and remote-review choreography

For `#1697`, docs/help may say only that this contract is now frozen and implementation remains pending.

---

## Fail-closed rules

The public surface must fail closed when any of the following is true:

- `manifestPath` is missing or invalid
- `taskId` is present but invalid
- `apply=true` was provided for `action="status"`
- the exact manifest cannot be loaded or validated
- the composed autonomy helper fails or surfaces a blocked next step and the caller requested apply mode
- the public surface would need to guess a task, stage, or build to continue
- the implementation would need to auto-run lower-level technical actions outside the existing one-step advancement helper

### Missing `taskId` is **not** a failure

The public surface must work without task context.
It should simply return `akBinding = null` and keep the control snapshot package-local.

---

## What this slice must not do

V1 must **not** do any of the following:

- add whole-campaign `run_until_complete` behavior
- auto-run `prepare_fork`
- require or accept raw `stage` / `buildId` selections in the public contract
- shell `ak` directly from the public helper just because `taskId` is present
- create or guess AK tasks
- write AK evidence or complete tasks automatically
- reinterpret receipt payloads into benchmark winner semantics
- add a new persisted campaign-control artifact file
- collapse `/autoresearch` help text into the real machine/API contract

Those remain separate bounded decisions if they are ever needed later.

---

## Verification contract for tasks 1698–1699

The follow-on implementation is good enough when it proves all of the following:

1. **public-shape proof**
   - tests show the dedicated public tool returns the expected control snapshot shape
2. **composition proof**
   - `status` truthfully composes the landed autonomy helper and optional AK-binding helper instead of re-deriving incompatible public state
3. **one-step proof**
   - `advance` still plans/applies exactly one step and stops
4. **optional-task proof**
   - the public surface works both with and without an exact `taskId`
5. **boundary proof**
   - the public surface does not expose raw `stage` / `buildId` as required public inputs and does not silently call AK mutation paths
6. **blocked/terminal proof**
   - blocked next steps fail closed in apply mode, and terminal-stage completion does not pretend more work exists
7. **runtime/docs closure proof**
   - `/autoresearch`, `README.md`, and `product-posture.md` now distinguish the technical helper surface from the new public seam without overstating it as whole-campaign execution or direct AK mutation

---

## Bottom line

The next truthful widening above the landed autonomy helper is **not** “make the current technical manifest tool more magical.”
It is to add one smaller, explicit, public wrapper seam:

- exact manifest in
- optional exact task context in
- compact current control snapshot out
- optional one-step plan/apply behavior out
- no hidden whole-campaign loop
- no direct AK mutation

That is the smallest truthful move from:

- “the package has expert helper actions for this concern”

to:

- “the package also has one bounded public campaign-control contract that other callers can rely on.”

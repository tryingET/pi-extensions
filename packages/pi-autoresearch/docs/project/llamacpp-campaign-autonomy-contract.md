---
summary: "Contract for the bounded pi-autoresearch follow-on that adds campaign-local autonomy helpers for manifest-driven llama.cpp campaigns by deriving one truthful current stage-wave posture and one exact next execution step without inventing a second control plane, daemon, or whole-campaign runner."
read_when:
  - "Before implementing or reviewing tasks 1694 or 1695 in the manifest-driven campaign-local autonomy slice."
  - "When deciding what campaign-local sequencing truth may be derived from the checked manifest/projection seam versus what still belongs to workstation scripts, AK, or a later public control surface."
  - "When you need the exact lifecycle shape for one-step stage advancement above the landed manifest campaign AK-ready binding baseline."
type: "reference"
system4d:
  container: "Package-local contract note for the post-target manifest campaign-local autonomy follow-on in pi-autoresearch."
  compass: "Let the package derive and advance one truthful next campaign step at a time without turning the manifest concern into a hidden runner, daemon, or second durable control plane."
  engine: "State the landed baseline -> freeze the owner split -> define the current autonomy snapshot and one-step advance helper -> define phase ordering and blockers -> bound verification and non-goals."
  fog: "The main risks are turning point tools into a whole-campaign executor, silently reviving fork/build automation as hidden behavior, or confusing local next-step derivation with AK mutation or public campaign control."
---

# Contract — manifest campaign-local autonomy for `pi-autoresearch`

## Why this note exists

`pi-autoresearch` now already has the lower layers this next slice must build on:

1. a checked manifest-driven llama.cpp campaign surface
2. stage-scoped `41 / 42 / 43` execution binding against the workstation-owned scripts
3. one checked `autoresearch.llamacpp-campaign.json` projection artifact and truthful runtime/help exposure above deterministic stage-output paths
4. one exact-task, non-mutating AK-ready binding helper for callers that already know the anchored task id

Those facts are already captured in:

- [current-vs-target](./current-vs-target.md)
- [llama.cpp benchmark campaign manifest RFC](./2026-04-18-llamacpp-benchmark-campaign-manifest-rfc.md)
- [llama.cpp execution-binding status](./llamacpp-execution-binding-status.md)
- [manifest campaign projection status](./llamacpp-campaign-projection-status.md)
- [manifest campaign AK binding status](./llamacpp-campaign-ak-binding-status.md)

What is still missing is the exact contract for the next bounded slice:

> how the package should derive one truthful current campaign-local lifecycle snapshot and one exact next `execute_stage` step for a checked manifest-driven campaign, and optionally apply that one step, without turning `pi-autoresearch` into a whole-campaign runner, hidden daemon, AK mutator, or public control plane.

This note freezes that contract for `#1693` and gives `#1694` / `#1695` a bounded implementation/proof target.

---

## Current truthful starting point

Today the package truth for this concern is:

- the manifest already owns explicit build / branch / lane / provenance / workflow intent
- `execute_stage` can already plan or apply one exact stage `41`, `42`, or `43` invocation for one manifest-listed build
- `autoresearch.llamacpp-campaign.json` can already summarize expected-vs-present stage receipts for the current manifest
- runtime/help surfaces can already report `current`, `stale`, or `not_projected` truthfully for that local projection
- `build_ak_binding` can already reduce one exact manifest + task anchor into a compact AK-ready snapshot when a caller already knows the task id
- the package still does **not** have one bounded helper that says:
  - which stage-wave is currently active for this campaign
  - which exact build/stage is the next truthful local step
  - whether that next step is blocked by missing prerequisites
  - whether the campaign has locally reached terminal-stage materialization for its own manifest contract
- the operator still has to manually reconstruct the next step by inspecting projection truth and selecting a stage/build call by hand

So this slice is **not** about inventing the manifest, inventing execution binding, inventing projection truth, or inventing AK-ready lifecycle mapping.
It is about adding the first truthful **campaign-local autonomy helper layer** above those already-landed seams.

---

## Contract in one sentence

`pi-autoresearch` should add bounded package-local helpers that, for one exact checked manifest, derive the current campaign-local stage-wave posture, choose one exact next `execute_stage` step in lawful order, and optionally apply that one step, while keeping stage execution semantics with the existing workstation scripts, keeping AK binding explicit and separate, and leaving any public campaign-control surface or background autonomy loop to later tasks.

---

## Governing owner split

| Concern | Owner in this slice | Why |
|---|---|---|
| Manifest validation, deterministic stage expectation, and current receipt/projection derivation | `packages/pi-autoresearch` | This is the package-local source seam for the concern |
| Exact stage `41 / 42 / 43` command semantics and receipt meaning | workstation repo + its existing scripts | This slice still must not reinterpret brownfield execution semantics into a second runtime substrate |
| Campaign-local next-step derivation and one-step advancement | `packages/pi-autoresearch` helper logic | This is the new bounded package concern |
| Exact AK task identity, durable lifecycle status, evidence/result truth | AK | This slice must not silently turn local progress into task mutation |
| Exact AK-ready binding payloads for callers that already have a task anchor | existing `build_ak_binding` helper | Already landed and still separate from local next-step autonomy |
| Public operator/consumer control surface for manifest campaigns | later follow-on (`#1697`-`#1699`) | This slice is intentionally below the public seam |
| Whole-campaign execution, background polling, winner selection, remote review choreography | out of scope | Not required for truthful one-step local autonomy |

Interpretation rule:

> The package may derive and advance **one truthful next local step** for one manifest-driven campaign.
> It does **not** become the owner of workstation benchmark semantics, durable task truth, AK mutation policy, or a public multi-step control plane merely because it can compute that next step.

---

## Slice target done-state

This campaign-local autonomy slice is done when all of the following are true:

1. the package can derive one current autonomy snapshot for one exact manifest from fresh manifest/projection truth
2. that snapshot reports:
   - the manifest identity and terminal stage
   - the current projection overall state
   - the active campaign-local phase
   - compact expected-vs-completed stage counts
   - whether the manifest has locally reached terminal-stage materialization
   - the exact next step, if one exists
3. the package can plan one exact next step without the caller having to choose the stage/build manually
4. the package can optionally apply **exactly one** next step by reusing the already-landed `execute_stage` path
5. phase order stays truthful and bounded:
   - stage `41` wave before stage `42`
   - stage `42` wave before stage `43`
   - terminal meaning still depends on the manifest's highest expected stage (`41`, `42`, or `43`)
6. the helper fails closed on invalid manifests, missing executable stage expectation, or blocked next-step prerequisites
7. the helper does **not** write AK, auto-complete tasks, or loop through the whole campaign matrix in one call
8. this slice does **not** add a new dedicated autonomy artifact file; current truth is still derived from the manifest plus existing projection/receipt seams
9. if this helper is exposed before the later public control-surface slice, it stays a bounded manifest-tool action rather than a new `/autoresearch` command plane
10. tests prove phase ordering, next-step selection, terminal-stage classification, blocker surfacing, and one-step-only apply behavior
11. a later status/proof note can close the slice without overstating it as a whole-campaign runner, AK automation layer, or public campaign-control surface

### Explicitly included in this done-state

- one current autonomy snapshot derived in-process
- one exact next-step selector above existing stage bindings
- one bounded one-step advance helper with plan/apply behavior
- truthful terminal-stage completion classification for `41` / `42` / `43` terminal manifests
- fail-closed blocker surfacing when the next step is not currently executable

### Explicitly **not** included in this done-state

- a new `autoresearch.llamacpp-campaign.autonomy.json` artifact
- automatic fork preparation or hidden source/build compilation
- looping through every missing build/stage in one call
- direct AK evidence writes or task completion mutation
- public runtime/help/control-surface exposure for operators
- semantic interpretation of benchmark winner quality from workstation receipts
- a background daemon, polling loop, or broader autonomous controller

---

## No new autonomy artifact

This slice should **not** mint a second current-state file for campaign autonomy.

Why:

- current campaign intent already lives in the checked manifest
- current expected-vs-present execution truth already lives in derived projection state above deterministic receipt paths
- the only new need here is one truthful **derived next-step view**, not a second durable projection layer

So the autonomy helper should derive current truth fresh from source-level functions and return it directly.
It may continue to refresh the existing campaign projection as part of a tool action, but it must not make a new autonomy JSON file the authoritative source.

---

## Lifecycle shape

### Phase model

A truthful first phase model is:

```ts
type LlamacppCampaignAutonomyPhase =
  | "stage41_wave"
  | "stage42_wave"
  | "stage43_wave"
  | "terminal_stage_complete"
  | "blocked";
```

### Why stage-wave phases are enough

The projection layer already gives the package truthful current materialization facts.
What is missing is not another fine-grained machine.
What is missing is a small campaign-local answer to:

- which stage-wave is still active
- whether the campaign has already reached its own terminal stage
- what the next exact step is if local progression should continue

A stage-wave model is therefore enough for v1.

### Phase ordering rule

The first autonomy slice should treat campaign-local progression as **stage-gated**:

1. materialize all expected stage-41 outputs
2. then materialize all expected stage-42 outputs
3. then materialize all expected stage-43 outputs when the manifest expects them
4. then stop with `terminal_stage_complete`

This is intentionally stricter than a possible future per-build interleaving strategy.
The stricter rule is chosen because:

- it matches the existing projection's coarse overall-state model
- it makes the next-step selector deterministic and easy to audit
- it avoids inventing hidden sequencing policy while the current brownfield scripts still own stage semantics

### Terminal-stage rule

Terminal meaning still depends on the highest stage the manifest actually expects:

- terminal stage = `43` when `workflow.stage43BuildIds` is non-empty
- else terminal stage = `42` when `workflow.stage42Matrix` is non-empty
- else terminal stage = `41` when `workflow.stage41BuildIds` is non-empty
- else fail closed because the manifest does not define any executable stage expectation

### Completion rule

`terminalStageMaterialized = true` only when:

1. the current manifest/projection truth loads successfully
2. the helper can derive one terminal stage
3. the expected builds for that terminal stage all have the expected materialized outputs

Important interpretation rule:

> `terminalStageMaterialized` means “the manifest-expected terminal-stage outputs are present locally.”
> It does **not** mean “AK must be completed now,” “the benchmark is semantically good,” or “the package may claim winner-selection truth.”

If an explicit caller later also knows an exact task id, it may compose this state with the already-landed `build_ak_binding` helper.
That composition remains outside this slice.

---

## Source seam the helper may trust

The first helper should live in:

- [`packages/pi-autoresearch/src/core/llamacppCampaign.ts`](../../src/core/llamacppCampaign.ts)

The relevant existing bounded facts are already there:

- `loadLlamacppCampaignManifest(...)`
- `buildLlamacppCampaignProjection(...)`
- `deriveLlamacppCampaignTerminalStage(...)`
- `executeLlamacppCampaignStage(...)`
- the existing projection/build status types

### Trust boundary rule

The helper should derive current truth from source-level functions, not from formatted output.
So it must **not**:

- parse runtime/help prose to recover stage state
- require a human to pass the next stage/build choice explicitly
- infer benchmark winner semantics from receipt payload bodies
- assume AK context exists when no exact task id was provided
- depend on a second persisted autonomy artifact

A fresh in-process projection plus the existing stage-binding planner is the truthful input.

---

## Helper contract

A truthful first shape is:

```ts
type LlamacppCampaignAutonomyPhase =
  | "stage41_wave"
  | "stage42_wave"
  | "stage43_wave"
  | "terminal_stage_complete"
  | "blocked";

interface LlamacppCampaignAutonomyStageCounts {
  stage41ExpectedBuilds: number;
  stage41CompletedBuilds: number;
  stage42ExpectedBuilds: number;
  stage42CompletedBuilds: number;
  stage43ExpectedBuilds: number;
  stage43CompletedBuilds: number;
}

interface LlamacppCampaignAutonomyNextStep {
  action: "execute_stage" | "none";
  stage: 41 | 42 | 43 | null;
  buildId: string | null;
  reason: string;
}

interface LlamacppCampaignAutonomyV1 {
  type: "llamacpp_campaign_autonomy";
  version: 1;
  manifest: {
    path: string;
    campaignId: string;
    manifestKey: string;
    receiptRootPath: string;
    terminalStage: 41 | 42 | 43;
  };
  projection: {
    overallState: LlamacppCampaignProjectionOverallState;
    updatedAt: number;
  };
  stages: LlamacppCampaignAutonomyStageCounts;
  lifecycle: {
    phase: LlamacppCampaignAutonomyPhase;
    terminalStageMaterialized: boolean;
    reason: string;
  };
  nextStep: LlamacppCampaignAutonomyNextStep;
}

interface AdvanceLlamacppCampaignResult {
  action: "advance_campaign";
  mode: "plan" | "apply";
  autonomy: LlamacppCampaignAutonomyV1;
  executedStep: ExecuteLlamacppCampaignStageResult | null;
  nextAction: string;
}
```

### Helper interpretation

#### `buildLlamacppCampaignAutonomy(...)`

This helper derives the current autonomy snapshot only.
It does not mutate files outside the already-existing projection refresh path.

#### `advanceLlamacppCampaign(...)`

This helper uses the autonomy snapshot to either:

- plan the exact next step, or
- apply the exact next step

But it may advance **only one** step per call.

If no next step exists because terminal-stage materialization is already complete, it must return `executedStep = null` and a truthful next action explaining that local execution is complete for the manifest contract.

### Tool-surface rule for this slice

If `#1694` exposes the helper through `autoresearch_llamacpp_campaign`, it should do so as one additional exact manifest action such as `advance_campaign`.
That is acceptable because it stays inside the existing bounded manifest tool.

What this slice must **not** do is claim that a broader operator-facing campaign-control surface already exists.
That belongs to the later `#1697`-`#1699` slice.

---

## Next-step selection rules

### Stage 41 wave

When not all expected stage-41 outputs are materialized, the helper should:

1. stay in `phase = "stage41_wave"`
2. scan `workflow.stage41BuildIds` in manifest order
3. choose the first build whose required stage-41 outputs are not both present
4. return `nextStep = { action: "execute_stage", stage: 41, buildId, ... }`

### Stage 42 wave

Only after stage-41 expectations are fully materialized should the helper consider stage 42.
Then it should:

1. stay in `phase = "stage42_wave"`
2. scan manifest stage-42 build membership in manifest order
3. choose the first build whose stage-42 receipt is still missing
4. return `nextStep = { action: "execute_stage", stage: 42, buildId, ... }`

### Stage 43 wave

Only after stage-42 expectations are fully materialized should the helper consider stage 43.
Then it should:

1. stay in `phase = "stage43_wave"`
2. scan `workflow.stage43BuildIds` in manifest order
3. choose the first build whose stage-43 receipt is still missing
4. return `nextStep = { action: "execute_stage", stage: 43, buildId, ... }`

### Terminal completion

When the manifest-expected terminal stage is fully materialized, the helper should:

- return `phase = "terminal_stage_complete"`
- set `terminalStageMaterialized = true`
- return `nextStep = { action: "none", stage: null, buildId: null, ... }`

### Blocked state

The helper should use `phase = "blocked"` when the next truthful step exists in theory but is not currently executable through the bounded stage-binding seam.

Examples:

- the next build's `buildBinDir` is missing for the selected step
- a prerequisite receipt required by the selected step is missing or incompatible
- the selected next step cannot be planned cleanly through the current `execute_stage` contract

The helper should surface the blocker truthfully rather than skipping ahead, guessing a different build, or widening into hidden prep/build behavior.

---

## Apply-mode rules

Apply mode should:

1. derive the current autonomy snapshot first
2. fail closed if `nextStep.action = "none"`
3. fail closed if `phase = "blocked"`
4. call the existing `execute_stage` implementation for the selected next step with `apply = true`
5. execute exactly one step and stop
6. return enough context for callers/tests to prove which exact step was chosen and why

Apply mode must **not**:

- automatically continue into a second build or stage
- auto-refresh into a loop until terminal completion
- auto-compose with `build_ak_binding`
- write AK evidence or complete the task
- auto-run `prepare_fork`
- auto-build binaries or mutate source/fork worktrees outside the current stage-binding contract

---

## Verification target for `#1695`

The proof task should verify at minimum:

1. stage-wave derivation is truthful for `41`-, `42`-, and `43`-terminal manifests
2. next-step selection follows manifest order within the active stage wave
3. the helper does not skip to a later stage when an earlier stage wave is still incomplete
4. blocked next steps surface as blockers instead of widening into hidden prep/build behavior
5. apply mode executes exactly one selected stage step and stops
6. terminal-stage materialization returns `nextStep.action = "none"`
7. public runtime/help posture still does **not** overstate this slice as the later public campaign-control surface

---

## Explicit non-goals

This slice still does **not** include:

- whole-campaign `run_campaign` or `advance_until_complete` behavior
- automatic fork preparation, branch checkout, or build compilation
- a new append-only or current-state autonomy artifact
- direct AK mutation or auto-completion policy
- benchmark winner selection or semantic receipt interpretation
- a public operator control surface for manifest campaigns
- background polling, supervision, or remote-review choreography

---

## Bottom line

The next truthful widening above the landed manifest/projection/AK-binding baseline is **campaign-local autonomy**, but only in the bounded sense that the package can:

- derive the current stage-wave posture for one checked manifest
- identify the one truthful next `execute_stage` step
- optionally apply exactly that one step
- stop cleanly when the manifest's own terminal stage is materially complete

Anything broader than that — especially public campaign control, AK mutation, or whole-campaign execution — remains outside this slice on purpose.

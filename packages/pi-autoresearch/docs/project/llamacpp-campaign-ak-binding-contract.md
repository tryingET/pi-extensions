---
summary: "Contract for the bounded pi-autoresearch follow-on that binds manifest-driven llama.cpp campaign projection truth to exact AK task anchors through compact milestone/evidence snapshots and terminal-stage completion eligibility without turning the package into an AK mutator."
read_when:
  - "Before implementing or reviewing tasks 1650 or 1651 in the manifest-driven campaign AK binding slice."
  - "When deciding what may be derived from the checked manifest/projection seam versus what still belongs to AK or workstation receipts."
  - "When you need the exact lifecycle shape above the landed manifest campaign projection baseline."
type: "reference"
system4d:
  container: "Package-local contract note for the post-target manifest campaign AK binding follow-on in pi-autoresearch."
  compass: "Bind manifest-driven llama.cpp campaign progress to exact AK task truth without collapsing manifest/projection/workstation ownership into a second control plane."
  engine: "State the landed baseline -> freeze the owner split -> define the exact helper/binding payload -> define milestone/lifecycle mapping -> bound completion eligibility and non-goals."
  fog: "The main risks are guessing tasks, treating receipt presence as benchmark semantics, or letting package-local helpers silently mutate AK."
---

# Contract — manifest campaign AK binding for `pi-autoresearch`

## Why this note exists

`pi-autoresearch` now already has the lower layers this next slice must build on:

1. a checked manifest-driven llama.cpp campaign surface
2. stage-scoped `41 / 42 / 43` execution binding against the workstation-owned scripts
3. one checked `autoresearch.llamacpp-campaign.json` projection artifact and truthful runtime/help exposure above deterministic stage-output paths

Those facts are already captured in:

- [current-vs-target](./current-vs-target.md)
- [llama.cpp benchmark campaign manifest RFC](./2026-04-18-llamacpp-benchmark-campaign-manifest-rfc.md)
- [manifest campaign receipt/projection contract](./llamacpp-campaign-receipt-projection-contract.md)
- [manifest campaign projection status](./llamacpp-campaign-projection-status.md)
- [repo-root AK milestone projection contract](../../../../docs/project/pi-autoresearch-ak-projection-contract.md)

What is still missing is the exact contract for the next bounded slice:

> how the package should reduce one current manifest-driven campaign into one exact AK-task-bound milestone snapshot and lifecycle classification without pretending that local projection files are the durable campaign truth, that workstation receipts already encode benchmark semantics, or that the package may freely mutate AK.

This note freezes that contract for `#1649` and gives `#1650` / `#1651` a bounded implementation/proof target.

---

## Current truthful starting point

Today the package truth for this concern is:

- the manifest already owns explicit build / branch / lane / provenance / workflow intent
- `execute_stage` can already plan or apply one exact stage `41`, `42`, or `43` invocation for one manifest-listed build
- `autoresearch.llamacpp-campaign.json` can already summarize expected-vs-present stage receipts for the current manifest
- runtime/help surfaces can already report `current`, `stale`, or `not_projected` truthfully for that local projection
- the package does **not** yet derive one exact AK-binding snapshot for this concern from an exact AK task id
- the package does **not** yet define how a manifest campaign becomes an AK milestone or completion candidate without over-claiming semantic success
- no bounded helper exists yet for later callers to reuse when they want compact AK-ready evidence payloads for manifest campaigns

So this slice is **not** about inventing the manifest, inventing execution binding, or inventing another package-local projection artifact.
It is about adding the first truthful **AK binding helper layer** above the already-landed manifest + receipt projection seam.

---

## Contract in one sentence

`pi-autoresearch` should add bounded package-local helpers that, given one exact manifest path and one exact AK task id, derive one compact current AK-binding snapshot from the manifest plus fresh projection truth, map it to one coarse AK milestone/check type/projection key/summary, and mark whether the manifest-expected terminal stage is materially complete, while leaving actual AK evidence writes and task mutations to explicit callers.

---

## Governing owner split

| Concern | Owner in this slice | Why |
|---|---|---|
| Manifest validation, path resolution, stage expectation, and fresh projection derivation | `packages/pi-autoresearch` | This is the package-local source seam for the concern |
| Stage `41 / 42 / 43` receipt payload semantics and benchmark meaning | workstation repo + its existing scripts | This slice still must not reinterpret brownfield execution semantics into package-owned truth |
| Exact AK task identity, scope, title, status, and durable terminal truth | AK | This remains repo-native execution truth |
| Compact AK-binding snapshot derivation for the manifest concern | `packages/pi-autoresearch` helper logic | This is the new bounded package concern |
| Actual AK evidence writes or `ak task complete` mutation | explicit caller above the helper | The helper must classify truth, not silently mutate AK |
| Whole-campaign orchestration, winner selection, or remote review choreography | out of scope | Not required for truthful AK binding in this slice |

Interpretation rule:

> The package may classify the current manifest campaign into one exact AK-ready milestone snapshot.
> It does **not** become the owner of AK mutation policy, workstation benchmark semantics, or durable campaign truth merely because it can derive that snapshot.

---

## Exact AK anchor contract

### Required anchor

The binding helper requires an **exact AK task id**.

That task id is the durable AK-side anchor for this concern.
The helper must not search by title, create a new task, or infer a likely task from nearby runtime context.

### One task, one manifest campaign objective

V1 assumes one AK task maps to one bounded manifest-driven campaign objective.

That means the anchored task should already represent:

- the operator-facing benchmark objective
- the repo/file/workstation boundary the operator intends
- the fact that this manifest campaign exists at all as a durable execution concern

### Rebind rule

The same AK task may stay bound only while the campaign objective remains materially the same.

Examples that may stay on the same task:

- the same `campaignId` with more receipts materialized over time
- the same manifest campaign where the saved projection is refreshed against current filesystem truth
- the same campaign where small notes or proof details change without changing the durable objective

Examples that should **not** silently stay on the same task:

- the `campaignId` changes materially
- the source/workstation roots change enough that the old task scope is no longer the same concern
- the expected terminal stage changes in a way that materially changes what “done” means for the task
- the operator has actually started a different benchmark wave and only the file name reuse makes it look related

When that boundary is crossed, open a new AK task instead of letting one task blur two campaign truths together.

---

## Source seam the helper may trust

The first helper should live in:

- [`packages/pi-autoresearch/src/core/llamacppCampaign.ts`](../../src/core/llamacppCampaign.ts)

The relevant existing bounded facts are already there:

- `loadLlamacppCampaignManifest(...)`
- `buildLlamacppCampaignProjection(...)`
- `createLlamacppCampaignManifestKey(...)`
- `deriveStagePaths(...)`
- the existing projection/build inventory types

### Why these are enough

Together they already provide the bounded truth this slice needs:

- current manifest identity
- current deterministic stage expectations
- current stage-output presence
- a stable manifest key for idempotence
- enough per-stage coverage to classify the next durable AK milestone

### Trust boundary rule

The helper should derive current truth from source-level functions, not from formatted output.

So it must **not**:

- parse runtime/help text to recover stage state
- require the saved `autoresearch.llamacpp-campaign.json` file to already exist before it can classify the campaign
- guess AK lifecycle from workstation receipt payload contents
- rely on a human-written prose note as the real lifecycle source

A fresh in-process projection derived from the current manifest plus filesystem checks is the truthful input.

---

## Bounded v1 decision

The first manifest-campaign AK binding is:

- **exact-task-bound**
- **helper-derived**
- **projection-backed**
- **lifecycle-aware**
- **non-mutating**

V1 means:

1. the caller passes one exact manifest path and one exact AK task id
2. the helper derives a fresh current manifest projection in-process
3. the helper returns one compact AK-binding snapshot with a deterministic milestone/check-type/projection-key/summary
4. the helper marks whether the manifest-expected terminal stage is currently complete enough to become a completion candidate
5. the helper does **not** shell AK, write evidence, create tasks, or complete tasks itself

This keeps the slice small enough to be truthful:

- AK can get a stable execution-truth summary later
- the package stays the source seam for manifest/projection derivation
- callers above the helper keep explicit control over actual AK mutation
- no second hidden lifecycle plane is created

---

## Terminal-stage rule

The lifecycle shape for this concern depends on the **highest stage the manifest actually expects**.

A truthful first rule is:

- terminal stage = `43` when `workflow.stage43BuildIds` is non-empty
- else terminal stage = `42` when `workflow.stage42Matrix` is non-empty
- else terminal stage = `41` when `workflow.stage41BuildIds` is non-empty
- else fail closed because the manifest does not describe any executable stage expectation

### Why this matters

Not every lawful manifest campaign needs stage `43`.
Some campaigns may truthfully stop at `42`, and narrower validation waves may truthfully stop at `41`.
So the helper must not hard-code “stage 43 exists” as the only terminal meaning for this concern.

### Completion-eligibility rule

`completionEligible = true` only when all of the following are true:

1. the fresh projection was derived successfully from the current manifest
2. the helper can identify one terminal stage from the manifest
3. the projection `overallState` has reached the state that corresponds to that terminal stage
4. the helper is only claiming **materialized expected stage evidence**, not winner selection, benchmark semantic success, or operator sign-off beyond the manifest contract

Important interpretation rule:

> `completionEligible` means “the manifest-expected terminal stage outputs are materially present.”
> It does **not** automatically mean “the benchmark result is semantically good” or “a caller must complete the AK task now.”

---

## Helper contract

A truthful first shape is:

```ts
type LlamacppCampaignAkMilestone =
  | "planned"
  | "materializing"
  | "stage41_complete"
  | "stage42_complete"
  | "terminal_stage_complete";

type LlamacppCampaignAkLifecycleAction = "evidence_only" | "complete_task_candidate";

interface LlamacppCampaignAkBindingV1 {
  type: "llamacpp_campaign_ak_binding";
  version: 1;
  taskId: number;
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
    projectionKey: string;
  };
  stages: {
    buildCount: number;
    stage41ExpectedBuilds: number;
    stage41PresentReceipts: number;
    stage41PresentCorpora: number;
    stage42ExpectedBuilds: number;
    stage42PresentReceipts: number;
    stage43ExpectedBuilds: number;
    stage43PresentReceipts: number;
  };
  ak: {
    milestone: LlamacppCampaignAkMilestone;
    checkType: string;
    result: "pass";
    summary: string;
  };
  lifecycle: {
    completionEligible: boolean;
    action: LlamacppCampaignAkLifecycleAction;
    reason: string;
  };
}
```

### Field interpretation

#### `manifest.manifestKey`

Reuse the existing resolved manifest fingerprint logic.
That key is already the compact durable identity for the current manifest contract after path resolution.

#### `projection.projectionKey`

This is the idempotence key for later AK writers.
It must be deterministic from the bounded AK-binding snapshot, not from wall-clock time.

At minimum it should incorporate:

- exact `taskId`
- `manifestKey`
- terminal stage
- current projection `overallState`
- compact stage expected/present counts

It may be a plain stable string or a hash of that stable string.
The logical ingredients must remain the same.

#### `stages`

These are the compact counts a later AK writer needs.
They keep the payload inspectable without dumping every build row into AK evidence.

#### `ak.result`

For lawful projected milestones in v1, this should stay `pass`.
Anything untrustworthy should fail closed locally instead of inventing synthetic `skip`/`fail` campaign truth in AK.

#### `lifecycle.action`

- `evidence_only` means the caller may attach/update AK evidence but should not infer task completion from this helper alone
- `complete_task_candidate` means the helper believes the manifest-expected terminal stage is materially complete and a caller may now evaluate whether the anchored task objective is satisfied strongly enough for completion

---

## Milestone and lifecycle mapping

The helper should map fresh projection truth to AK milestone truth like this:

| Fresh projection truth | Terminal-stage relation | AK milestone | AK `checkType` | Lifecycle action |
|---|---|---|---|---|
| `overallState = planned_only` | any lawful terminal stage | `planned` | `autoresearch:llamacpp-campaign:planned` | `evidence_only` |
| `overallState = partially_materialized` | any lawful terminal stage | `materializing` | `autoresearch:llamacpp-campaign:materializing` | `evidence_only` |
| `overallState = stage41_complete` | terminal stage is `42` or `43` | `stage41_complete` | `autoresearch:llamacpp-campaign:stage41-complete` | `evidence_only` |
| `overallState = stage42_complete` | terminal stage is `43` | `stage42_complete` | `autoresearch:llamacpp-campaign:stage42-complete` | `evidence_only` |
| `overallState = stage41_complete` and terminal stage is `41` | terminal reached | `terminal_stage_complete` | `autoresearch:llamacpp-campaign:terminal-stage-complete` | `complete_task_candidate` |
| `overallState = stage42_complete` and terminal stage is `42` | terminal reached | `terminal_stage_complete` | `autoresearch:llamacpp-campaign:terminal-stage-complete` | `complete_task_candidate` |
| `overallState = stage43_complete` and terminal stage is `43` | terminal reached | `terminal_stage_complete` | `autoresearch:llamacpp-campaign:terminal-stage-complete` | `complete_task_candidate` |

### Why there is no separate `stage43_complete` milestone in v1

For this concern, stage `43` is always terminal when it is expected at all.
So the truthful durable milestone is not “stage 43 happened and maybe later more stages exist.”
It is simply “the manifest-expected terminal stage is complete.”

### Why `partially_materialized` stays coarse

The package already has the detailed per-build projection rows.
AK does not need every partial path transition as a separate lifecycle state.
One compact “materializing” milestone is enough until a durable stage boundary is fully crossed.

---

## Compact AK evidence payload contract for later callers

A later caller that wants to record this snapshot into AK should be able to serialize a compact details payload shaped roughly like this:

```json
{
  "contract_version": 1,
  "binding_owner": "pi-autoresearch",
  "campaign_kind": "pi-autoresearch-llamacpp-campaign",
  "task_id": 1648,
  "milestone": "stage42_complete",
  "projection_key": "task:1648|manifest:7f...|terminal:43|overall:stage42_complete|41:4/4|42:4/4|43:0/2",
  "manifest": {
    "path": "/abs/path/to/wave-001.json",
    "campaign_id": "llamacpp-wave-001",
    "manifest_key": "7f...",
    "receipt_root_path": "/abs/path/to/receipts",
    "terminal_stage": 43
  },
  "projection": {
    "overall_state": "stage42_complete",
    "updated_at": 1713436800000
  },
  "stages": {
    "build_count": 4,
    "stage41_expected_builds": 4,
    "stage41_present_receipts": 4,
    "stage41_present_corpora": 4,
    "stage42_expected_builds": 4,
    "stage42_present_receipts": 4,
    "stage43_expected_builds": 2,
    "stage43_present_receipts": 0
  },
  "summary": "campaign llamacpp-wave-001 reached stage 42 for 4/4 expected builds; stage 43 remains pending for 2 builds"
}
```

### Payload rules

- keep it compact and stage/count oriented
- do not dump every per-build row unless a later contract explicitly widens that payload
- do not embed workstation receipt payload bodies
- do not embed winner claims or recommendations
- do not embed the whole saved projection file just because it exists locally

---

## Fail-closed rules

The helper must fail closed when any of the following is true:

- `taskId` is missing or invalid
- the manifest cannot be loaded or validated
- the helper cannot derive a fresh current projection from the current manifest + filesystem truth
- the manifest implies no executable terminal stage at all
- the helper would have to guess a task, a terminal stage, or a semantic benchmark conclusion that the manifest/projection seam does not actually contain

These are helper failures, not AK milestones.
They should be surfaced as local errors to the caller instead of being rewritten into AK as fake durable campaign truth.

### Missing saved projection file is **not** itself a failure

The helper should be able to derive fresh projection truth directly.
The saved `autoresearch.llamacpp-campaign.json` artifact is useful context, but it is not required if the helper can rebuild the same truth from the current manifest and filesystem state.

---

## What this slice must not do

V1 must **not** do any of the following:

- shell `ak` directly from the helper
- auto-create AK tasks
- fuzzy-match or guess AK tasks
- rewrite AK task title, scope, or description to mirror every manifest update
- assume terminal-stage receipt existence equals semantic benchmark success
- infer benchmark winners from stage receipt payload bodies
- dump every build row or receipt payload into AK evidence by default
- create a second package-local artifact just for AK binding when the current manifest/projection seam is already enough
- widen into a whole-campaign runner or autonomous controller

Those are separate bounded decisions if they are ever needed later.

---

## Verification contract for tasks 1650–1651

The follow-on implementation is good enough when it proves all of the following:

1. **binding-shape proof**
   - unit tests show the helper returns the expected compact binding shape from a lawful manifest/projection input
2. **milestone-mapping proof**
   - `planned_only`, `partially_materialized`, `stage41_complete`, `stage42_complete`, and terminal-stage cases map to the expected milestone/check-type/lifecycle action
3. **terminal-stage proof**
   - manifests whose highest expected stage is `41`, `42`, or `43` all classify completion eligibility truthfully
4. **idempotence proof**
   - unchanged binding snapshots produce the same deterministic `projectionKey`
5. **negative-path proof**
   - invalid manifests, zero-stage manifests, or untrustworthy projection derivation fail closed instead of inventing AK truth
6. **boundary proof**
   - helper tests confirm this slice does not shell AK or mutate task state directly
7. **closure proof**
   - the later status note and `current-vs-target` update do not overstate this slice as direct AK mutation, semantic benchmark interpretation, or whole-campaign execution

---

## Bottom line

The next truthful AK layer for manifest-driven llama.cpp campaigns is **not** fuzzy task automation and **not** a new control plane.
It is one exact-task-bound, compact, helper-derived lifecycle classification above the current manifest + receipt projection seam.

That is the smallest lawful move from:

- “the package can summarize current manifest campaign state locally”

to:

- “the package can hand later callers one deterministic AK-ready snapshot of that concern without collapsing owners or inventing benchmark semantics that the current artifacts do not actually prove.”

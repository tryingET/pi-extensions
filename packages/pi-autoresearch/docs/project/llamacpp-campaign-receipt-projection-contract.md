---
summary: "Contract for the bounded pi-autoresearch follow-on that projects manifest-driven llama.cpp campaign receipt/status truth into one checked package-local artifact without inventing a second execution or campaign-truth plane."
read_when:
  - "Before implementing or reviewing tasks 1645 or 1646 in the manifest campaign receipt/status projection slice."
  - "When deciding what should stay in the manifest, what should stay in workstation stage receipts, and what may live in one package-local projection artifact."
  - "When you need the exact local artifact model for truthful runtime/help integration above the landed execution-binding seam."
type: "reference"
system4d:
  container: "Package-local contract note for the post-target manifest campaign receipt/status projection slice in pi-autoresearch."
  compass: "Make manifest campaign status projection real without turning pi-autoresearch into the owner of workstation execution truth, AK campaign truth, or a second append-only control plane."
  engine: "State the landed baseline -> freeze the owner split -> define the projection artifact -> define freshness and status rules -> bound non-goals."
  fog: "The main risks are inventing a duplicate receipt family, overstating receipt existence as semantic success, or letting a local status file become campaign truth."
---

# Contract — manifest campaign receipt/status projection for `pi-autoresearch`

## Why this note exists

`pi-autoresearch` now already has the lower layer this next slice must build on:

1. a checked manifest-driven llama.cpp campaign surface
2. a bounded `autoresearch_llamacpp_campaign` tool for `plan_matrix`, `prepare_fork`, and stage-scoped `execute_stage`
3. explicit build-bin and receipt-root execution binding to the workstation-owned `41 / 42 / 43` scripts

Those facts are already captured in:

- [current-vs-target](./current-vs-target.md)
- [llama.cpp benchmark campaign manifest RFC](./2026-04-18-llamacpp-benchmark-campaign-manifest-rfc.md)
- [llama.cpp execution-binding status](./llamacpp-execution-binding-status.md)
- [package README](../../README.md)

What is still missing is the exact contract for the next bounded slice:

> how the package should project current manifest-campaign receipt/status truth into one checked local artifact and later surface it through runtime/help without pretending that the package now owns workstation execution semantics, whole-campaign execution, or AK campaign truth.

This note freezes that contract for `#1644` and gives `#1645` / `#1646` a bounded implementation/proof target.

---

## Current truthful starting point

Today the package truth is:

- the manifest already owns explicit branch / lane / build / provenance / workflow-binding intent for this concern
- workstation stage outputs already live at deterministic derived paths under `workflow.executionBinding.receiptRootPath`
- `autoresearch_llamacpp_campaign execute_stage` can already plan or apply one exact stage `41`, `42`, or `43` invocation for one manifest-listed build
- the package does **not** yet write one checked current-state projection artifact for this concern
- the runtime/help surfaces do **not** yet show a truthful manifest-campaign status view above those deterministic stage outputs
- the package still does **not** own AK-backed campaign truth, whole-campaign execution, or workstation script semantics

So this slice is **not** about inventing the manifest, inventing execution binding, or widening into a generic workflow engine.
It is about adding the first package-owned **projection layer** above the already-landed stage-binding seam.

---

## Contract in one sentence

`pi-autoresearch` should add one checked package-local `autoresearch.llamacpp-campaign.json` projection artifact that is derived from the current manifest plus the deterministic workstation stage-output paths, and later expose that projection through bounded runtime/help surfaces, while the manifest remains campaign-intent truth, workstation stage receipts remain execution evidence truth, and AK remains durable campaign truth.

---

## Governing owner split

| Concern | Owner in this slice | Why |
|---|---|---|
| Manifest shape, build inventory, lane inventory, and stage bindings | checked manifest + `packages/pi-autoresearch` validator | That campaign intent is already the explicit contract input |
| Stage `41 / 42 / 43` execution semantics and result payload semantics | workstation repo + its existing scripts | This slice must not pull brownfield execution truth into the package |
| Deterministic mapping from manifest builds to expected stage-output paths | `packages/pi-autoresearch` | This is package-owned binding/projection logic |
| Current manifest-campaign status projection artifact | `packages/pi-autoresearch` local artifact | This is a bounded current-state projection only |
| Durable campaign/task truth, result ownership, and lifecycle truth | AK | This slice still must not move campaign authority into local JSON |
| Higher-order autonomous orchestration, whole-campaign runners, or remote review planes | out of scope | Not required for truthful receipt/status projection |

Interpretation rule:

> `pi-autoresearch` may project what the current manifest and deterministic stage-output paths imply.
> It does **not** become the owner of stage semantics, whole-campaign truth, or AK lifecycle authority merely because it can summarize those files.

---

## Receipt/projection slice target done-state

This slice is done when all of the following are true:

1. the package can derive one exact current-state projection from:
   - the checked manifest
   - the resolved `receiptRootPath`
   - deterministic per-build stage-output paths
   - filesystem existence checks for those derived paths
2. the package writes one checked local projection artifact:
   - `autoresearch.llamacpp-campaign.json`
3. that artifact records enough identity/freshness facts to detect when it no longer matches the current manifest contract
4. that artifact records per-build stage expectations and current stage-output presence without reinterpreting workstation result semantics
5. the projection is explicitly labeled as **derived from manifest + receipts**, not as a new primary source of campaign truth
6. runtime/help surfaces can later consume that artifact truthfully without claiming that receipt existence alone proves campaign success, winner selection, or AK completion
7. tests can later prove projection derivation, freshness/discard behavior, and truthful runtime/help exposure

### Explicitly included in this done-state

- one current-state projection artifact
- deterministic per-build path projection for stages `41`, `42`, and `43`
- manifest identity / freshness fields
- per-build expected-vs-present stage visibility
- a compact overall state for runtime/help use

### Explicitly **not** included in this done-state

- a second append-only package receipt log for this concern
- parsing stage payload contents into benchmark winners or final recommendations
- a one-shot `run_campaign` surface
- hidden build compilation or source-branch checkout automation
- AK-backed campaign truth or lifecycle mutation
- replacement of workstation ownership for the `41 / 42 / 43` scripts

---

## Local artifact model

This slice should keep the already-landed manifest and workstation receipts, and add exactly one package-local projection artifact.

| Artifact | Kind | Role in this slice | Authority posture |
|---|---|---|---|
| checked manifest JSON | campaign-intent artifact | explicit build / lane / workflow truth for the concern | current campaign-intent input |
| `<receiptRootPath>/<buildId>-stage41-validation.json` | workstation stage output | stage-41 evidence input | workstation execution evidence |
| `<receiptRootPath>/<buildId>-stage41-corpus.txt` | workstation stage output | stage-41 auxiliary evidence input | workstation execution evidence |
| `<receiptRootPath>/<buildId>-stage42-q8-vs-config-i.json` | workstation stage output | stage-42 evidence input | workstation execution evidence |
| `<receiptRootPath>/<buildId>-stage43-vllm-comparison.json` | workstation stage output | stage-43 evidence input | workstation execution evidence |
| `autoresearch.llamacpp-campaign.json` | latest projection artifact | current manifest-campaign status for bounded runtime/help use | checked projection only |

### Why only one new package-local artifact

The deterministic workstation stage outputs already exist.
What is missing is not more receipts.
What is missing is one compact package-owned **projection** that tells the runtime/help surface what the current manifest shape plus current output presence imply.

So this slice should **not** add a second append-only log for this concern.
It should add one current-state artifact that is cheap to rebuild and easy to discard when stale.

---

## Projection contract

A truthful first shape is:

```ts
type LlamacppCampaignProjectionOverallState =
  | "planned_only"
  | "partially_materialized"
  | "stage41_complete"
  | "stage42_complete"
  | "stage43_complete";

interface LlamacppCampaignProjectionV1 {
  type: "llamacpp_campaign_projection";
  version: 1;
  cwd: string;
  updatedAt: number;
  manifest: {
    path: string;
    campaignId: string;
    manifestKey: string;
    receiptRootPath: string;
    sourceRepoPath: string;
    workstationRepoPath: string;
    workflowKind: "phasee-41-43";
  };
  status: {
    projectionKind: "derived_from_manifest_and_receipts";
    overallState: LlamacppCampaignProjectionOverallState;
    stale: boolean;
    staleReason: string | null;
  };
  builds: Array<{
    buildId: string;
    title: string;
    branch: string;
    buildBinDir: string;
    buildBinDirExists: boolean;
    highestCompletedStage: 0 | 41 | 42 | 43;
    notes: string[];
    stages: {
      "41": {
        expected: boolean;
        receiptPath: string;
        corpusPath: string;
        receiptExists: boolean;
        corpusExists: boolean;
      };
      "42": {
        expected: boolean;
        receiptPath: string;
        receiptExists: boolean;
      };
      "43": {
        expected: boolean;
        receiptPath: string;
        receiptExists: boolean;
      };
    };
  }>;
}
```

### Field interpretation

#### `manifestKey`

A deterministic fingerprint of the current manifest contract **after** path resolution for the campaign inputs that matter to this concern.
It should change when the manifest changes materially for projection purposes, including:

- build inventory
- stage bindings
- receipt root
- resolved build-bin paths
- resolved workflow anchors relevant to the current manifest contract

#### `overallState`

This is a compact runtime/help summary, not a substitute for the detailed per-build rows.
A truthful interpretation is:

- `planned_only` — no expected stage outputs exist yet
- `partially_materialized` — some expected outputs exist, but the highest expected complete layer is not yet fully present
- `stage41_complete` — all expected stage-41 receipts exist
- `stage42_complete` — all expected stage-41 and stage-42 receipts exist
- `stage43_complete` — all expected stage-41, stage-42, and stage-43 receipts exist

#### `highestCompletedStage`

This is a per-build convenience summary derived from output presence only.
It should be the highest stage whose expected receipt file exists for that build.
It does **not** by itself mean that the workstation judged the result good, selected a winner, or finished the broader campaign.

#### `notes`

This is where the projection may record bounded local anomalies such as:

- a stage-42 receipt exists without the derived stage-41 receipt
- a stage-43 receipt exists without the derived stage-42 receipt
- a stage output exists for a stage not expected by the manifest
- the resolved `buildBinDir` is currently missing even though the manifest names it

Notes are projection aids, not authority transfer.

---

## Derivation rules

The projection should follow these rules exactly:

1. load the checked manifest through the existing package validator
2. resolve the existing deterministic stage-output paths for each manifest build
3. determine stage expectation from manifest membership:
   - stage 41 expected when the build is listed in `workflow.stage41BuildIds`
   - stage 42 expected when the build appears in `workflow.stage42Matrix`
   - stage 43 expected when the build is listed in `workflow.stage43BuildIds`
4. use filesystem existence checks for the derived output paths
5. compute `highestCompletedStage` from output presence only
6. compute `overallState` from expected receipt coverage only
7. never reinterpret workstation payload contents in this slice

Important interpretation rule:

> receipt existence is **evidence presence**, not broad semantic success.
> This slice may say that the derived stage-42 receipt exists.
> It must not silently upgrade that into “the campaign is complete” or “the best build is known” unless a later slice explicitly owns that semantic lift.

---

## Freshness, reuse, and discard rules

This artifact should be cheap to rebuild.
So reuse is optional and rebuild is always lawful.

### Reuse is allowed only when

- the current `cwd` still matches
- the current manifest path still matches
- the current `manifestKey` still matches the current manifest contract
- the resolved `receiptRootPath` still matches

### The projection should be marked stale or discarded when

- the manifest path changed
- the manifest contents changed materially
- the resolved receipt root changed
- the build inventory or stage bindings changed
- the current runtime/help surface is looking at a different campaign manifest than the one the projection captured

### Stale posture rule

A stale projection may still be useful as an operator hint, but runtime/help surfaces must label it truthfully.
If there is any doubt, discard and rebuild from the current manifest plus filesystem checks.

---

## Runtime/help integration boundary

This note freezes the artifact model and projection rules.
It does **not** require `#1644` to finish the runtime/help surface itself.

The follow-on implementation task should use this contract to add bounded runtime/help integration that can answer questions such as:

- which manifest is currently projected
- which builds have stage-41 / 42 / 43 outputs present
- what the compact overall state is
- whether the current projection is stale

But that later runtime/help integration must still preserve the current boundary:

- no new campaign runner
- no claim that the package owns workstation script semantics
- no claim that local projection files replace AK campaign truth

---

## Bottom line

The next truthful layer above execution binding is **not** another package receipt log and **not** a whole-campaign executor.
It is one bounded projection artifact:

- derived from the checked manifest
- derived from deterministic workstation stage-output paths
- cheap to rebuild
- explicit about freshness
- truthful enough for later runtime/help surfaces

That is the smallest lawful move from “one exact stage can be bound and run” to “the package can truthfully summarize current manifest-campaign progress without inventing a second control plane.”

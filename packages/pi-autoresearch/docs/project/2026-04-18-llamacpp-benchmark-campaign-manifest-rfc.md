---
summary: "RFC for the typed manifest-driven llama.cpp campaign surface in pi-autoresearch and its landed execution-binding, receipt/projection, and AK-binding follow-ons, while preserving workstation execution truth and avoiding a second control plane."
read_when:
  - "Before implementing or reviewing the manifest-driven llama.cpp campaign surface or its landed execution-binding, projection, and AK-binding layers in pi-autoresearch."
  - "When deciding whether branch/lane benchmarking intent belongs in prose, runtime code, or one checked contract artifact."
system4d:
  container: "Package-local RFC for post-target widening around manifest-driven brownfield benchmark campaigns."
  compass: "Introduce campaign-as-data for llama.cpp benchmarking without making pi-autoresearch a second execution substrate."
  engine: "Restate the problem -> choose the additive contract/tool shape -> fix the authority split -> define first slice and non-goals."
  fog: "The main risks are over-automating too early, letting prose remain the true contract, or pulling workstation-owned execution concerns into the package."
---

# RFC — manifest-driven llama.cpp benchmark campaign surface for `pi-autoresearch`

## Status

The first slice from this bounded **post-target widening** RFC is now landed locally for `packages/pi-autoresearch`:

- checked manifest schema/validator
- bounded `autoresearch_llamacpp_campaign` support for `plan_matrix` and `prepare_fork`
- example manifest plus package-local problem-intent/RFC docs

The bounded **manifest-driven 41/42/43 execution-binding** follow-on described below is also now landed locally through `#1636`, `#1640`, and `#1642`.

The bounded **manifest campaign receipt/status projection** follow-on described below is now also landed locally through `#1644`, `#1645`, and `#1646`.
Its closure/status artifact is [`llamacpp-campaign-projection-status.md`](./llamacpp-campaign-projection-status.md).

The bounded **manifest campaign AK binding** follow-on described below is now also landed locally through `#1649`, `#1650`, and `#1651`.
Its closure/status artifact is [`llamacpp-campaign-ak-binding-status.md`](./llamacpp-campaign-ak-binding-status.md).

Together, umbrella `#1634` is now landed locally as the bounded post-target execution-memory widening for this concern across:

- stage-scoped 41/42/43 execution binding
- manifest campaign receipt/status projection
- exact-task, non-mutating AK-ready binding derivation

This RFC follows:

- [current-vs-target](./current-vs-target.md)
- [llama.cpp benchmark campaign manifest problem-intent](./2026-04-18-llamacpp-benchmark-campaign-manifest-problem-intent.md)
- [package README](../../README.md)

## A) Decision in one sentence

`pi-autoresearch` should add a **typed llama.cpp benchmark campaign manifest** plus one bounded `autoresearch_llamacpp_campaign` tool that can deterministically emit the exact branch/lane workflow matrix and safely plan/apply fork preparation, while leaving workstation execution ownership with the existing 41/42/43 workflow and related runtime surfaces.

## B) What this RFC is deciding

This RFC decides:

1. the new artifact shape for brownfield benchmark campaign intent
2. the new bounded tool surface that consumes that artifact
3. the authority split between `pi-autoresearch` and workstation execution surfaces
4. the exact first slice and its non-goals
5. the landed stage-scoped 41/42/43 execution-binding follow-on contract
6. the landed bounded receipt/status projection contract for this concern
7. the landed bounded AK-binding contract and lifecycle shape for this concern

This RFC does **not** yet decide:

- broad one-shot campaign execution across all stages/builds
- direct AK mutation or broader lifecycle automation for this concern
- ontology promotion for benchmark-campaign semantics
- semantic winner selection or recommendation policy above workstation receipts

## C) Problem this RFC answers

The package can already run bounded local optimization loops, but it still cannot represent a brownfield campaign like:

- builds A-E
- branch lineage and cherry-pick provenance
- lane matrix
- workstation workflow anchors
- fork prep in `../../fork/`

without relying on chat context or human reconstruction.

That leaves the agent in a weak position:

- it must infer what the branch matrix means
- it must guess whether a cherry-pick is required or optional
- it must guess which lanes belong in the active matrix
- it must guess how the current 41/42/43 scripts fit the campaign

So the real missing capability is **explicit benchmark campaign intent**, not more runtime cleverness.

## D) Chosen shape

## Decision

Add two bounded elements:

### 1. One checked manifest artifact

A typed JSON manifest with at minimum:

- campaign id
- objective
- source repo path
- workstation repo path
- fork target + base ref + working branch
- build inventory
- explicit cherry-pick provenance
- lane inventory
- explicit 41/42/43 stage bindings
- expected evidence paths + metrics

### 2. One bounded tool surface

Add:

- `autoresearch_llamacpp_campaign`

with exactly these first actions:

- `plan_matrix`
- `prepare_fork`

Interpretation:
- `plan_matrix` is read-only and expands the explicit stage matrix
- `prepare_fork` is plan-first and may optionally apply the fork prep safely

## E) Authority split

| Concern | Owner | Why |
|---|---|---|
| Campaign manifest validation, matrix expansion, and fork-prep safety checks | `packages/pi-autoresearch` | This is the new package-local planning/prep concern |
| Stages 41/42/43 execution semantics and runtime truth | workstation repo (`infra/workstation`) | Existing brownfield workflow already owns those execution surfaces |
| Bounded benchmark runtime machine / ledger / control / finalize surfaces | `packages/pi-autoresearch` | Already landed package-local runtime truth |
| Durable campaign/task truth | AK | Still not moved into this widening slice |
| Durable prompt/control procedures | Prompt Vault | Unchanged by this RFC |

Interpretation rule:

> `pi-autoresearch` may describe and prepare the campaign.
> It does not become the owner of workstation execution truth merely because it can read the campaign manifest.

## F) What stays explicit vs inferred

## Decision

The manifest must make these things explicit:

- build ids and branch names
- cherry-pick commits
- lineage summary for compound candidates
- lane ids and runtime meanings
- stage 41 build set
- stage 42 build/lane matrix
- stage 43 build set
- fork target/base/working-branch
- expected evidence paths and required metrics

The tool may still infer small conveniences such as:

- expanded stage-42 rows from `buildId + laneIds`
- whether the target repo already exists
- whether the working branch already exists

But it must **not** infer the actual campaign shape from prose.

## G) First slice done-state

The first slice is done when all of the following are true:

1. a checked manifest schema/validator exists
2. invalid cherry-pick provenance fails closed
3. `plan_matrix` returns the exact explicit stage matrix
4. `prepare_fork` can:
   - plan clone/checkout steps, and
   - safely apply them when requested
5. README + current-vs-target + package-local problem-intent/RFC docs are updated
6. package tests prove validation, matrix expansion, and fork preparation

## H) Explicit non-goals for this RFC

This RFC explicitly rejects the following for the first slice:

- direct execution of the manifest through stages 41/42/43
- replacing `lane-op` or workstation-owned runtime scripts
- inventing a second event ledger or second run-history system for this concern
- broad git automation beyond the bounded fork workspace preparation
- fuzzy campaign inference from prose when a manifest is required

## I) Why this is the smallest truthful move

This shape is chosen because it deletes ambiguity without creating a second platform.

It is better than adding a generic `run_matrix` tool first because:

- it makes campaign intent durable before adding automation
- it prevents hidden assumptions from getting baked into execution code
- it lets later execution work consume the same explicit manifest
- it keeps the package brownfield-compatible with the workstation workflow

## J) Landed first-slice status

The first slice described in this RFC is now the package-local baseline:

- manifest-as-data is real
- branch / lane / provenance / fork intent no longer has to live only in prose
- `plan_matrix` and `prepare_fork` are the current bounded tool actions

But that landed slice is still planning/prep only.
The next missing layer is exact execution binding to the existing workstation-owned scripts.

## K) Landed bounded follow-on — manifest-driven 41/42/43 execution binding

### Decision in one sentence

Extend `autoresearch_llamacpp_campaign` with one stage-scoped `execute_stage` action that can plan or apply one exact stage 41, 42, or 43 invocation for one manifest-listed build by resolving explicit build-bin and build-scoped receipt paths from the manifest, while keeping the existing workstation scripts as the owners of measurement/execution semantics.

This execution-binding follow-on is now the landed baseline for the next layer.
What follows next is no longer execution binding itself, but truthful receipt/status projection above that stage-scoped seam.

### Additional manifest contract for this follow-on

The manifest should add exactly two new kinds of explicit execution-binding truth:

1. `builds[].buildBinDir`
   - path to the already-built llama.cpp bin directory for that build
   - resolved relative to the manifest directory unless absolute
   - may point into the source clone, a prepared fork workspace, or another explicitly managed build root
2. `workflow.executionBinding.receiptRootPath`
   - repo-relative path under the workstation repo where build-scoped stage outputs live
   - the package resolves it against `workstationRepoPath` and must fail closed if it escapes that repo root

From that explicit data, the package derives deterministic stage paths:

- stage 41 receipt: `<receiptRootPath>/<buildId>-stage41-validation.json`
- stage 41 corpus: `<receiptRootPath>/<buildId>-stage41-corpus.txt`
- stage 42 receipt: `<receiptRootPath>/<buildId>-stage42-q8-vs-config-i.json`
- stage 43 receipt: `<receiptRootPath>/<buildId>-stage43-vllm-comparison.json`

The manifest does not need one extra receipt field per stage/build if these derived names stay exact and documented.

### Stage binding rules

| Stage | Manifest requirements | Derived binding | Apply-mode prerequisites |
|---|---|---|---|
| 41 | build id is listed in `stage41BuildIds`; `buildBinDir` exists | invoke `stage41Script` with `--build-bin-dir`, derived `--output`, derived `--corpus-output`, and `--kv-types = f16 + distinct kvCacheMode values` that later matter for that build | build bin dir exists and the stage-41 script anchor exists |
| 42 | build id appears in `stage42Matrix`; the matrix resolves to exactly one `config_i_*` lane plus one or more supported `q8_0_*` lanes; `buildBinDir` exists | invoke `stage42Script` with derived `--reference-receipt`, derived `--output`, `--build-bin-dir`, `--config-i-kv-type`, and `--q8-kv-types` | the derived stage-41 receipt exists and the manifest lanes translate cleanly into the current workstation script contract |
| 43 | build id is listed in `stage43BuildIds` | invoke `stage43Script` with derived `--reference-receipt`, derived `--output`, and derived `--corpus-input` when the stage-41 corpus exists | the derived stage-42 receipt exists and still satisfies the current workstation script expectations |

Additional interpretation rules:

- stage 42 plan/apply must fail closed if the build's manifest lanes cannot be translated into the current `config_i` + `q8_0` script interface
- stage 43 plan/apply must fail closed rather than pretending the workstation script is more generic than it is
- the package may surface exact commands and warnings, but it does not replace the workstation script's internal heuristics or result interpretation

### Execution surface contract

`execute_stage` should accept:

- manifest path
- stage `41 | 42 | 43`
- build id
- `apply` boolean (plan by default)

Plan mode should return at minimum:

- resolved script path
- resolved build-bin path when applicable
- resolved output path
- resolved prerequisite receipt/corpus paths
- exact command argv
- warnings
- next action

Apply mode should:

- create the build-scoped receipt root when missing
- run exactly one anchored workstation script invocation
- return the same resolved context plus command/result summary
- fail closed on missing paths, missing prerequisite receipts, unsupported lane translation, or out-of-root receipt paths

### Follow-on done-state for tasks 1640–1642

The execution-binding follow-on is done when all of the following are true:

1. the manifest contract makes `buildBinDir` and `workflow.executionBinding.receiptRootPath` explicit
2. the example manifest demonstrates those fields truthfully
3. `autoresearch_llamacpp_campaign` exposes one stage-scoped `execute_stage` action with plan/apply behavior
4. plan mode emits exact script args and derived build-scoped output paths for stages 41, 42, and 43
5. apply mode can invoke one selected stage through the current workstation script anchors without widening into a campaign runner
6. stage 42 apply fails closed when the derived stage-41 receipt is missing or the manifest lanes do not fit the current script contract
7. stage 43 apply fails closed when the derived stage-42 receipt is missing or incompatible with the current script contract
8. tests prove path resolution, command construction, prerequisite fencing, and bounded script invocation behavior
9. README + current-vs-target can later be updated in the proof task without overstating this slice as receipt/status projection or AK campaign truth

### Explicit non-goals for the execution-binding follow-on

This follow-on still does **not** include:

- source-branch checkout/build compilation as hidden package behavior
- a one-shot `run_campaign` surface that auto-executes every stage/build
- receipt/status projection into the broader runtime help/status surfaces
- AK-backed campaign truth or lifecycle mutation
- replacing workstation ownership of the 41/42/43 scripts
- generalizing beyond the current brownfield script contract before the scripts themselves change

## L) Next bounded follow-on — manifest campaign receipt/status projection

### Decision in one sentence

Add one checked package-local `autoresearch.llamacpp-campaign.json` projection artifact that is derived from the current manifest plus the deterministic workstation stage-output paths, and later surface it through bounded runtime/help views, while keeping the manifest as campaign-intent truth, workstation stage receipts as execution evidence truth, and AK as durable campaign truth.

### Why this follow-on exists

After execution binding landed, the next missing layer is no longer "can one exact stage be planned or applied?"
That is already real.
The next missing layer is:

- which manifest is currently being summarized
- which expected stage outputs currently exist per build
- what compact overall posture that implies for the campaign
- whether the current local summary is stale relative to the current manifest contract

Without that layer, runtime/help surfaces still cannot answer the current bounded status question for this concern truthfully.

### Projection artifact model

This follow-on should add exactly one package-local current-state artifact:

- `autoresearch.llamacpp-campaign.json`

Its role is to summarize:

- manifest identity (`path`, `campaignId`, `manifestKey`)
- resolved `receiptRootPath`
- per-build stage expectations
- per-build stage-output presence for derived stage `41`, `42`, and `43` paths
- a compact overall state such as `planned_only`, `partially_materialized`, `stage41_complete`, `stage42_complete`, or `stage43_complete`
- staleness facts when the saved projection no longer matches the current manifest contract

This is intentionally a **projection artifact**, not a second append-only receipt family.
The stage outputs already exist under the workstation-owned receipt root.
The package should summarize them, not duplicate them.

### Projection rules

The projection must:

1. load the current manifest through the existing package validator
2. derive the deterministic stage-output paths from the existing execution-binding contract
3. determine stage expectation from manifest membership (`stage41BuildIds`, `stage42Matrix`, `stage43BuildIds`)
4. use filesystem existence checks for those derived paths
5. compute per-build and overall progress from output presence only
6. stay explicit that receipt existence is evidence presence, not a semantic proof of benchmark success, winner selection, or AK completion

### Follow-on done-state for tasks 1645–1646

This projection follow-on is done when all of the following are true:

1. the package can derive and write `autoresearch.llamacpp-campaign.json` from the current manifest plus derived receipt paths
2. the artifact records manifest identity/freshness facts strongly enough to reject stale reuse
3. the artifact records per-build expected-vs-present stage status without reinterpreting workstation script payload semantics
4. runtime/help surfaces can report the projection truthfully
5. tests prove projection derivation, freshness/discard behavior, and runtime/help exposure
6. current-vs-target can later be updated in the proof task without overstating this slice as whole-campaign execution or AK campaign truth

### Explicit non-goals for the projection follow-on

This follow-on still does **not** include:

- a second append-only package receipt log for this concern
- parsing stage payloads into benchmark winners or recommendations
- a one-shot `run_campaign` surface
- hidden branch checkout or build compilation behavior
- AK-backed campaign truth or lifecycle mutation
- replacement of workstation ownership for the `41 / 42 / 43` scripts

## M) Landed bounded follow-on — manifest campaign AK binding to execution truth

### Decision in one sentence

Add bounded package-local helpers that accept one exact manifest path plus one exact AK task id and derive one compact AK-ready milestone snapshot, deterministic projection key, and terminal-stage completion-candidate classification from current manifest/projection truth, while leaving actual AK evidence writes and task mutations to explicit callers.

### Why this follow-on exists

After projection landed, the next missing layer is no longer “can the package summarize the current manifest locally?”
That is already real.

The next missing layer is:

- which exact AK task this manifest campaign currently binds to
- which compact durable milestone the current manifest/projection state implies
- when the highest manifest-expected stage has materially completed strongly enough to become a completion candidate
- how later callers can reuse one deterministic package-local binding shape without guessing tasks or over-claiming workstation receipt semantics

Without that layer, the package can summarize local state but still cannot reduce it into exact AK execution truth for this concern.

### Binding/lifecycle contract

The bounded contract for this follow-on is frozen in:

- [manifest campaign AK binding contract](./llamacpp-campaign-ak-binding-contract.md)
- [manifest campaign AK binding status](./llamacpp-campaign-ak-binding-status.md)

That contract fixes these rules:

1. the caller must provide an exact AK task id; no fuzzy task lookup or auto-create behavior is allowed
2. the helper derives fresh current truth from the checked manifest plus current projection logic in `src/core/llamacppCampaign.ts`
3. the helper maps current projection state into one compact AK milestone/check-type/projection-key/summary tuple
4. terminal meaning is derived from the highest stage the manifest actually expects, not hard-coded to `43`
5. terminal-stage materialization may become a completion candidate, but the helper itself must not shell AK or claim benchmark semantics the receipts do not actually prove

### Follow-on closure for tasks 1649–1651

This AK-binding follow-on is now landed locally because all of the following are true:

1. `#1649` froze the exact helper/evidence/lifecycle contract in package-local docs
2. `#1650` landed bounded helper exports in `packages/pi-autoresearch/src/core/llamacppCampaign.ts`
3. those helpers now reduce one exact manifest + task anchor into one deterministic AK-ready binding snapshot
4. `#1651` proved milestone mapping, terminal-stage classification, idempotent projection-key behavior, and fail-closed negative paths
5. current-vs-target/runtime/README closure landed without overstating this slice as direct AK mutation, whole-campaign execution, or semantic winner selection

### Explicit non-goals for the AK-binding follow-on

This follow-on still does **not** include:

- fuzzy task discovery or automatic task creation
- direct AK writes or `ak task complete` mutation inside the package helper itself
- parsing workstation receipt payloads into benchmark winners or recommendations
- dumping whole per-build projection rows into AK by default
- a whole-campaign executor
- broader autonomy or remote-review control-plane work

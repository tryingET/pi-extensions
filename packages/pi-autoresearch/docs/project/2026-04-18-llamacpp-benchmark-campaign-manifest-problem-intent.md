---
summary: "Problem-intent for moving pi-autoresearch from manifest-driven planning/prep into bounded 41/42/43 execution binding without turning the package into a second execution control plane."
read_when:
  - "Before widening pi-autoresearch from manifest-driven planning/prep into bounded 41/42/43 execution binding."
  - "When deciding how build-bin paths and build-scoped receipt roots should become explicit instead of operator-memory glue."
system4d:
  container: "Package-local problem-intent note for the execution-binding follow-on after manifest-driven benchmark planning."
  compass: "Make one manifest-listed build executable against the brownfield 41/42/43 anchors while preserving workstation control-plane truth and package boundary honesty."
  engine: "State the missing capability -> bind the brownfield anchors -> define the additive next layer -> keep non-goals explicit."
  fog: "The main risks are letting prose remain the real contract, widening pi-autoresearch into a second execution plane, or automating repo/runtime mutation before campaign intent is explicit."
---

# Problem-intent — manifest-driven llama.cpp campaign execution binding for `pi-autoresearch`

## Problem in one sentence

`pi-autoresearch` can now express brownfield llama.cpp benchmark campaigns as checked data, but it still has **no bounded way to bind one manifest-listed build to the existing 41/42/43 workstation scripts** without hand-translating the manifest into stage args, build-bin paths, and build-scoped receipt locations.

## Why this problem exists now

The first manifest slice is already landed locally:

- one checked campaign manifest contract
- `autoresearch_llamacpp_campaign` `plan_matrix`
- `autoresearch_llamacpp_campaign` `prepare_fork`

That means the package no longer lacks campaign-as-data itself.
The next concrete use case is the obvious follow-on:

- choose one manifest-listed build
- point stage 41/42/43 at the current brownfield workstation workflow anchored by:
  - `scripts/phasee/41-turboquant-pr45-qwen35-validation.py`
  - `scripts/phasee/42-turboquant-pr45-qwen35-q8-comparison.py`
  - `scripts/phasee/43-turboquant-pr45-qwen35-vllm-comparison.py`
- keep the build lineage explicit
- keep build-scoped receipt/output paths deterministic
- fail closed when the current workstation script contract is narrower than the manifest inventory

Today an agent can explain the matrix, but it still must improvise:

- which exact built binary directory belongs to build A/B/C/D/E
- which exact stage-41 receipt path belongs to a given build
- which stage-41 receipt should feed stage 42
- which stage-42 receipt should feed stage 43
- when a manifest lane stays inventory-only because the current workstation script cannot execute it yet

So the package still lacks the missing layer between:

1. **manifest describes the campaign truthfully**, and
2. **one exact bounded stage invocation can be executed from that manifest without operator-memory glue**.

## What capability is actually missing

The missing capability is **execution binding as data** for brownfield benchmarking.

An operator or agent should be able to point `pi-autoresearch` at one checked manifest plus one selected build/stage and get back:

- the exact workstation script anchor
- the exact built binary directory for that build when applicable
- the exact build-scoped receipt/corpus paths for that stage
- the exact prerequisite receipt path for the next stage when required
- an explicit failure when the current workstation script contract cannot lawfully execute the requested manifest shape

That should happen **without** requiring the agent to reconstruct stage arguments from chat history or handwritten shell notes.

## Why the existing runtime surfaces are not enough

The current bounded runtime surfaces are good at:

- local benchmark/check execution
- machine + ledger projection
- Prompt Vault decision requests
- control/finalization posture
- manifest planning/prep through `plan_matrix` and `prepare_fork`

But they are not designed to answer this different question:

> “How does build C, stage 42, resolve into one exact call of the current workstation script contract?”

The runtime can execute a run.
The manifest can describe a campaign.
What is still missing is the exact binding layer between those two truths.

## Brownfield constraints that must be respected

Any solution has to preserve current truth:

### 1. Workstation control-plane truth stays outside the package

`pi-autoresearch` must not replace or shadow:

- workstation `lane-op`
- the existing 41/42/43 workflow scripts
- runtime family ownership inside `infra/workstation`

The package may **plan and prepare** against those surfaces, but not silently become their new owner.

### 2. Prose cannot remain the real campaign contract

If branch lineage and lane scope stay informal:

- agents will keep guessing
- repeated work will diverge subtly
- cherry-pick provenance will drift
- branch prep will become operator-memory-dependent

So this concern must become explicit.

### 3. The next widening slice must stay additive

The next layer should add:

- explicit `buildBinDir` bindings for executable builds
- one explicit build-scoped receipt root
- one bounded stage-scoped tool action that resolves those inputs into the existing workstation scripts

It should **not** start by adding a giant run orchestrator, a second ledger regime, or a replacement for existing workstation scripts.

### 4. Repo mutation must remain bounded and explicit

Fork preparation is useful, but it should be:

- plan-first
- fail-closed on dirty trees / missing refs
- scoped to the declared target repo/branch

No broad repo mutation policy should sneak in under “helpful automation.”

## Historical first-slice success state

The already-landed manifest/planning slice was solved truthfully when the package could do all of the following:

1. load a checked llama.cpp campaign manifest
2. validate branch/lane/provenance references deterministically
3. emit the exact 41/42/43 branch-lane matrix
4. plan or apply the fork workspace preparation safely
5. explain remaining non-goals explicitly

## Smallest truthful success state for the next slice

After the first manifest/planning slice, the next bounded slice is solved truthfully when the package can do all of the following:

1. require one exact `buildBinDir` per manifest-listed build that should be executable
2. require one exact build-scoped receipt root under the workstation repo for the campaign
3. plan or apply one exact stage 41, 42, or 43 invocation for one manifest-listed build through the existing workstation script anchors
4. derive script flags from explicit manifest data instead of chat memory
5. fail closed when prerequisite receipts, supported lane shapes, or anchored scripts are missing
6. explain remaining non-goals explicitly

## What this problem-intent does **not** ask for yet

This note does **not** ask for:

- hidden source-branch checkout/build compilation for every manifest build
- one-shot auto-execution of the full 41/42/43 campaign matrix
- AK campaign truth for this new concern
- new ontology ids for benchmark campaign semantics
- a new package-local receipt/status projection family for these manifest actions
- runtime replacement of workstation-local control surfaces

Those may become later slices, but they are not the first truthful move.

## Why this is the next bounded move

Campaign-as-data was the highest-leverage first layer because it turned an informal brownfield benchmarking language into explicit contract truth.
Now that that layer exists, the next bounded move is not a broad campaign runner.
It is exact execution binding against the existing workstation-owned scripts.

Once that exists, later work becomes much smaller and safer:

- agents can execute one stage without guessing the CLI translation
- build-scoped receipts can stay deterministic
- receipt/status projection can attach to exact stage outputs instead of ad hoc filenames
- later AK binding can consume a real execution seam instead of another prose convention

That is the smallest truthful step from “manifest describes the campaign” to “one bounded stage can be executed from the manifest without operator-memory glue.”

---
summary: "Evidence note for the pi-autoresearch public AK task-verification follow-on: current code, docs, and tests all show that a supplied positive taskId is treated as public task context without live AK existence verification, which makes the public seam stronger than pure local status but weaker than verified AK truth."
read_when:
  - "Before deciding or implementing task 1709 for public AK task verification semantics in pi-autoresearch."
  - "When you need the exact evidence that the current public control seam still treats supplied task ids as unverified public context."
type: "reference"
system4d:
  container: "Package-local evidence note for the public AK task-verification follow-on in pi-autoresearch."
  compass: "Ground the decision in current repo truth rather than intuition about how the public seam probably behaves."
  engine: "Point at code -> point at docs -> point at tests -> show the exact mismatch -> bound what kind of decision is needed."
  fog: "The main risks are hand-waving about the gap without citing the landed public seam, or over-reading the current implementation as already verified AK truth when it is not."
---

# Evidence note — public AK task verification semantics for `autoresearch_llamacpp_campaign_control`

## Why this artifact exists

This note records the concrete repo evidence behind AK task `#1709` and decision `17`.
It answers one narrow question:

> what, exactly, is the current public seam doing today that makes an explicit architecture decision necessary?

## Evidence 1 — current code only shape-validates `taskId`

In `packages/pi-autoresearch/src/core/llamacppCampaign.ts`, the public control state builder currently does this:

- resolves the manifest
- builds the local projection
- derives local autonomy state
- when `taskId` is present, calls `requireAkTaskId(...)`
- then directly derives `akBinding` from the supplied id and the local projection

Key current facts:

- `requireAkTaskId(...)` only checks that the value is a positive integer
- `resolveLlamacppCampaignControlState(...)` does **not** currently perform a live AK lookup before composing `akBinding`
- `buildLlamacppCampaignControlSurface(...)`, `inspectLlamacppCampaignControl(...)`, and `executeLlamacppCampaignControl(...)` all inherit that behavior

So the current public seam validates **shape**, not **live task existence**.

## Evidence 2 — current public output semantics can sound stronger than the proof available

The same file currently builds public reasoning strings such as:

- terminal stage is materially complete locally and AK task `N` is now a completion candidate
- a caller above the package may now evaluate whether AK task `N` should be completed explicitly

Those strings are bounded and still say the surface does not mutate AK directly.
But they also read like the task anchor is exact live public context even though the code path only proved integer shape.

That is the core evidence of the truth gap:

- the public seam is not pure local status anymore
- but it is also not verified AK truth
- and the public result does not yet surface that distinction explicitly

## Evidence 3 — the status docs already record this as a real limitation

The public-control status note explicitly says the current surface does **not** verify that a caller-supplied positive `taskId` corresponds to a live AK task before composing exact-task context.

Current docs that already name the limitation:

- `packages/pi-autoresearch/docs/project/llamacpp-campaign-control-surface-status.md`
- `packages/pi-autoresearch/docs/project/current-vs-target.md`
- `packages/pi-autoresearch/README.md`

So this is not speculative future cleanup.
The repo already treats the gap as durable runtime work and already bound it into AK.

## Evidence 4 — tests currently assert caller-supplied task context, not live verification

The public control tests in `packages/pi-autoresearch/tests/llamacpp-campaign.test.ts` currently prove that:

- a supplied `taskId` makes `taskBound` true in the public result
- `akBinding.taskId` equals the supplied id
- `completionCandidate` may become true when the local campaign reaches terminal-stage materialization and task-aware binding context is present

Those are good tests for the currently landed public seam.
But they also show that the current public contract is keyed off the supplied id itself, not off verified live AK existence.

So the tests confirm the same evidence as the code and docs:

- current behavior is stable
- current behavior is intentionally bounded
- current behavior still does not distinguish supplied versus verified task context

## Evidence 5 — AK already has the decision/runtime membrane for this kind of concern

The repo-local AK decision runtime docs explicitly reserve `ak decision` for architecture-significant questions such as:

- authority boundary
- canonical source of truth
- lifecycle legality
- default workflow behavior
- architecture-significant packet/contract shape

That matches this concern exactly.
This is not merely an implementation bug.
It is a contract decision about a public seam that touches package-local truth versus AK-owned truth.

## Evidence 6 — the decision runtime already shows the exact missing lifecycle artifacts

`ak decision passport 17` previously showed:

- `ready_for_decision_pending => ready`
- `ready_for_adr_required => blocked (missing: problem_brief, evidence_note)`

That means the decision runtime already had enough evidence to say:

- the RFC + review closure were substantively strong enough
- the remaining blocker was the missing problem/evidence artifact chain

So adding those artifacts is not process theater.
It directly clears the missing runtime truth that AK said was absent.

## What this evidence proves

Together, the current code, docs, tests, and AK decision runtime prove all of the following:

1. the public seam currently treats a supplied positive `taskId` as usable public task context without live AK existence verification
2. the repo already knows this is a bounded but real limitation
3. the limitation is specifically about public contract semantics, not about a missing general AK mutation feature
4. the current public seam is strong enough to need a decision, but narrow enough that the decision can stay bounded

## What this evidence does **not** prove

This evidence does **not** prove that the right answer is automatically:

- mandatory verification
- zero verification forever
- broader AK lifecycle automation
- changing the lower-level technical `build_ak_binding` helper to the same stricter public semantics

Those remain decision questions.

## Bottom line

The repo evidence is already strong enough to justify decision `17` and task `#1709`.

The gap is real, bounded, and specific:

- **the public seam currently treats supplied task ids as public context without proving live AK task existence, and that is strong enough to require an explicit contract decision before further implementation proceeds.**

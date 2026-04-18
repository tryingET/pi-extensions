---
summary: "Problem brief for the pi-autoresearch follow-on that must decide how the public autoresearch_llamacpp_campaign_control surface handles caller-supplied AK task ids without overstating unverified task context as live AK truth."
read_when:
  - "Before advancing decision 17 or task 1709 for public AK task verification semantics in pi-autoresearch."
  - "When deciding why public llama.cpp campaign control needs a bounded architecture decision instead of another ad-hoc helper tweak."
type: "reference"
system4d:
  container: "Package-local problem brief for the public AK task-verification follow-on in pi-autoresearch."
  compass: "Name the smallest architecture-significant gap in the public campaign-control seam without widening immediately into AK mutation or a broader control plane."
  engine: "State the landed baseline -> isolate the public truth gap -> explain why this is architecture-significant -> name the exact decision needed next."
  fog: "The main risks are letting caller-supplied task ids read like live AK truth, or over-correcting by making a non-mutating public helper depend on AK availability for ordinary local control use cases."
---

# Problem brief — public AK task verification semantics for `autoresearch_llamacpp_campaign_control`

## Why this artifact exists

The bounded public campaign-control surface for manifest-driven llama.cpp campaigns is already landed in `packages/pi-autoresearch`.
It is intentionally smaller than the lower-level technical helper surface and intentionally remains below:

- direct AK mutation
- whole-campaign execution
- workstation-owned stage semantics

But one public contract question remained explicitly unresolved and was deferred into AK task `#1709`:

> when a caller supplies `taskId` to `autoresearch_llamacpp_campaign_control`, what exact verification semantics should the public surface apply before presenting that task context as public AK-aware control truth?

This artifact freezes the problem statement for that deferred concern.

## Current landed baseline

Today the package already has:

- one dedicated public `autoresearch_llamacpp_campaign_control` tool
- package-local autonomy derivation for one manifest-driven campaign
- one-step `status` / `advance` public behavior
- one lower-level technical `build_ak_binding` helper for exact manifest + task-id binding derivation
- runtime/docs/status notes that explicitly say the public seam does **not** mutate AK directly

So the problem is **not** that AK-aware concepts were added by accident.
The problem is that the public seam now sits at a boundary where caller-supplied task intent and live AK truth are too easy to blur.

## Exact problem statement

The current public control surface accepts optional `taskId` input.
In the landed implementation, that `taskId` is only validated as a positive integer before the public surface composes task-aware AK-binding context.

That means the public surface can currently present outputs that read like:

- this control snapshot is task-bound
- this task is now a completion candidate
- a caller above the package may evaluate whether AK task `N` should be completed

without first proving that a live AK task `N` currently exists.

This is a bad middle state:

- stronger than pure package-local status
- weaker than live AK truth
- but not clearly labeled as such

## Why this is architecture-significant

This concern is architecture-significant because it changes one of the things that the repo-wide decision workflow explicitly reserves for `ak decision` rather than ordinary task execution:

- authority boundary
- default workflow behavior
- packet/contract shape at a public seam

The decision is not merely about one line of validation logic.
It decides whether the public package surface:

- may depend on AK runtime availability
- must distinguish supplied task intent from verified task context
- may surface AK-bound semantics only after live verification
- should degrade gracefully when AK is unavailable or a supplied task is missing

Those are public contract questions, not just implementation details.

## Decision that must be made next

The next decision must choose one of three postures for the **public** control seam:

1. **mandatory live verification**
   - any supplied `taskId` must resolve live in AK or the public call fails
2. **optional best-effort live verification with surfaced status**
   - verification is attempted when `taskId` is supplied
   - success upgrades the public result into verified AK context
   - failure/unavailability downgrades the result back to package-local truth with explicit status
3. **no live verification**
   - keep treating a supplied positive integer as enough public task context for AK-aware control semantics

The follow-on must also decide whether this choice applies only to the public seam or also to the lower-level technical `build_ak_binding` helper.

## Why the package cannot just ignore the gap

If the gap is ignored:

- the public seam keeps implying stronger AK truth than it actually proves
- task-aware public guidance remains easy to misread by operators and later callers
- the package loses a clean distinction between:
  - public consumer/control behavior
  - expert/manual technical helper behavior

That confusion gets more expensive later if additional public AK-aware reads are added on top of the same seam.

## Out of scope

This problem brief does **not** argue for:

- direct AK evidence writes
- automatic AK task completion
- fuzzy task lookup or task creation
- whole-campaign execution
- a broader public controller
- replacing the lower-level technical helper with the same contract as the public seam

The bounded follow-on is only about truthful public task-context semantics.

## Bottom line

The exact missing fact is no longer whether `pi-autoresearch` has a public control seam.
It does.

The missing fact is:

- **what counts as verified AK task context on that public seam, and how the public contract must behave when such verification is missing, fails, or cannot be established.**

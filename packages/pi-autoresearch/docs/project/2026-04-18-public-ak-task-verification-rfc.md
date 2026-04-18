---
summary: "RFC for exact AK task verification semantics on the public autoresearch_llamacpp_campaign_control surface, choosing optional best-effort live verification with explicit surfaced status while keeping the package below AK mutation and usable without AK."
read_when:
  - "Before implementing or reviewing task 1709 for the pi-autoresearch public campaign-control surface."
  - "When deciding whether public llama.cpp campaign control should require live AK verification, surface best-effort verification state, or keep caller-supplied task ids unverified."
system4d:
  container: "Package-local RFC for the post-target follow-on that refines AK task-context semantics for public manifest campaign control."
  compass: "Correct misleading caller-asserted public task context without turning a non-mutating public helper into an AK-dependent controller."
  engine: "Restate the gap -> compare verification postures -> choose the smallest truthful contract -> define public result semantics -> bound proof and non-goals."
  fog: "The main risks are over-coupling a non-mutating helper to AK availability, silently implying live task truth that has not been verified, or widening into AK mutation / fuzzy task lookup."
---

# RFC — exact AK task verification semantics for `autoresearch_llamacpp_campaign_control`

## Status

This RFC is the bounded decision-attending artifact for package task `#1709`:

- task: `#1709` — decide exact AK task verification semantics for the public campaign-control surface
- current landed limitation: the public control seam accepts a positive caller-supplied `taskId`, validates only that it is a positive integer, and then composes AK-ready binding context without proving that a live AK task currently exists
- current binding note: this follow-on is explicitly deferred in AK with trigger ref `decision:pi-autoresearch-public-task-verification`

This RFC follows the landed public-control baseline in:

- [llamacpp-campaign-control-surface-contract](./llamacpp-campaign-control-surface-contract.md)
- [llamacpp-campaign-control-surface-status](./llamacpp-campaign-control-surface-status.md)
- [current-vs-target](./current-vs-target.md)
- [`packages/pi-autoresearch/src/core/llamacppCampaign.ts`](../../src/core/llamacppCampaign.ts)

## A) Decision in one sentence

`autoresearch_llamacpp_campaign_control` should keep `taskId` optional, attempt **best-effort read-only live AK verification** when `taskId` is supplied, surface that verification state explicitly in the public result, and only expose task-bound / completion-candidate AK context when live verification succeeds, while continuing to work package-locally when AK is unavailable or the task is missing.

## B) What this RFC is deciding

This RFC decides:

1. whether public campaign control should use mandatory verification, optional best-effort verification, or no live verification
2. the exact public semantics for "task id supplied" versus "live AK task verified"
3. whether `akBinding` remains visible when live verification fails or is unavailable
4. when public `taskBound` and `completionCandidate` may evaluate to `true`
5. whether `status` / `advance` should fail or degrade gracefully when AK verification cannot be established
6. the bounded proof contract for task `#1709`
7. the package-local documentation/UX cleanups that should land with the implementation

This RFC does **not** decide:

- any direct AK mutation from the public control surface
- fuzzy task lookup, task creation, or task inference from campaign metadata
- changes to the lower-level technical helper `autoresearch_llamacpp_campaign action=build_ak_binding`
- whole-campaign execution, background polling, or broader autonomy for this concern

## C) Problem this RFC answers

The landed public control seam is already truthful about many boundaries:

- the public tool is bounded to `status` and one-step `advance`
- it remains below direct AK mutation
- it keeps workstation stage semantics outside the package
- it does not require `taskId` to remain useful

But one public truth gap remains:

- when a caller supplies `taskId`, the current implementation only checks that it is a positive integer
- the public result can then present `taskBound`, `akBinding`, and `completionCandidate` semantics that read like exact live task context even though no live AK task existence check happened

That creates a bad middle state:

- stronger than pure package-local status
- weaker than live AK truth
- but not clearly labeled as such

So the missing move is **not** broader automation.
It is one exact contract that separates:

- caller-supplied task intent
- live AK verification state
- public AK-aware control semantics

## D) Options considered

### Option 1 — mandatory live verification

Meaning:
- if `taskId` is supplied, the public tool must verify the live AK task before returning successfully
- AK unavailability or missing task would fail the public call

Why this is not chosen:
- it turns a non-mutating package helper into a hard AK-dependent surface
- it makes `status` and `advance` worse for legitimate package-local workflows that only want local control posture plus optional task context
- it widens the public helper too far toward orchestrator-style authority checks even though it still does not mutate AK

### Option 2 — no live verification

Meaning:
- keep the current posture where `taskId` is only shape-validated
- continue surfacing public AK-aware context from the caller-supplied id alone

Why this is not chosen:
- it keeps public task context easier to misread as live AK truth than it really is
- it lets `taskBound` / `completionCandidate` semantics look stronger than the evidence
- it leaves the known limitation in place instead of resolving it

### Option 3 — optional best-effort live verification with surfaced status

Meaning:
- `taskId` remains optional
- the public helper attempts a bounded read-only live verification when `taskId` is supplied
- verification success upgrades the public result into verified AK context
- verification failure or AK unavailability downgrades the public result back to package-local control truth with explicit surfaced verification state

Why this **is** chosen:
- it is the smallest truthful correction to the current gap
- it preserves package-local usefulness without `taskId`
- it does not equate caller intent with live AK truth
- it stays below AK mutation and below whole-campaign control widening

## E) Authority split

| Concern | Owner | Why |
|---|---|---|
| Manifest validation, projection refresh, autonomy derivation, and one-step public control | `packages/pi-autoresearch` | Already-landed package-local public seam |
| Read-only live verification of whether one supplied `taskId` currently resolves in AK | bounded package helper behavior for this public seam | This follow-on only decides whether the helper may compose one read-only truth check |
| Durable AK task identity, status, scope, lifecycle truth, and any mutation | AK | Remains the durable owner |
| Direct AK evidence writes or task completion | explicit caller above the package | Still out of scope for this public surface |
| Raw deterministic binding derivation from exact manifest + task id regardless of live AK availability | technical helper `autoresearch_llamacpp_campaign action=build_ak_binding` | Keep the expert helper surface distinct from the public seam |

Interpretation rule:

> The public helper may ask AK one bounded read-only question when the caller supplies `taskId`.
> It still does not become the owner of AK mutation policy, durable task truth, or whole-campaign control.

## F) Chosen public contract

## 1. Input contract

The public input remains:

```ts
interface AutoresearchLlamacppCampaignControlInput {
  action?: "status" | "advance";
  cwd?: string;
  manifestPath: string;
  taskId?: number;
  apply?: boolean;
}
```

Field meaning changes only here:

- `taskId` still means **exact caller-supplied AK task id**
- the helper must still reject invalid integer shape
- the helper must still never fuzzy-match, infer, or create tasks
- but `taskId` now means **candidate task context to verify**, not automatically verified public binding truth

## 2. Public result additions

The public control surface should gain explicit task-context verification semantics.
A truthful first shape is:

```ts
type LlamacppCampaignTaskVerificationState =
  | "not_requested"
  | "verified_live"
  | "not_found"
  | "verification_unavailable";

interface LlamacppCampaignTaskContextV1 {
  suppliedTaskId: number | null;
  verificationState: LlamacppCampaignTaskVerificationState;
  verifiedTaskId: number | null;
  reason: string;
}

interface LlamacppCampaignControlSurfaceV1 {
  type: "llamacpp_campaign_control_surface";
  version: 1;
  autonomy: LlamacppCampaignAutonomyV1;
  taskContext: LlamacppCampaignTaskContextV1;
  akBinding: LlamacppCampaignAkBindingV1 | null;
  public: {
    taskBound: boolean;
    nextStepAction: "advance" | "none";
    completionCandidate: boolean;
    reason: string;
  };
}
```

## 3. Field interpretation

### `taskContext.suppliedTaskId`

- `null` when the caller did not supply `taskId`
- the exact supplied integer when the caller did

This is the public record of caller intent, not proof of live task truth.

### `taskContext.verificationState`

- `not_requested`
  - no `taskId` was supplied
- `verified_live`
  - a bounded read-only AK lookup proved the task currently exists and matches the supplied exact id
- `not_found`
  - the lookup succeeded but no live task matched that exact id
- `verification_unavailable`
  - the helper could not establish live task truth because AK could not be queried reliably

### `taskContext.verifiedTaskId`

- `null` unless `verificationState = "verified_live"`
- the exact verified id when verification succeeds

### `akBinding`

Decision:
- `akBinding` should be non-null **only** when `verificationState = "verified_live"`
- otherwise `akBinding = null`

Why:
- this keeps the public seam from presenting AK-bound semantics when the task anchor is unverified
- it leaves raw deterministic binding derivation to the lower-level technical helper for expert callers who intentionally want it

### `public.taskBound`

Decision:
- `taskBound = true` only when `verificationState = "verified_live"` and `akBinding !== null`

Compatibility note:
- this is a stricter meaning than the current landed behavior
- that narrowing is intentional because `taskBound` should mean **verified public task binding**, not merely "the caller typed a positive integer"

### `public.completionCandidate`

Decision:
- `completionCandidate = true` only when:
  1. `verificationState = "verified_live"`
  2. `akBinding !== null`
  3. `akBinding.lifecycle.action === "complete_task_candidate"`

If verification is `not_found` or `verification_unavailable`, completion candidacy must evaluate to `false` even when the local campaign has materially completed.

## G) Chosen behavior for `status` and `advance`

## 1. `status`

When `taskId` is omitted:
- the helper behaves like today's package-local public control surface
- `taskContext.verificationState = "not_requested"`
- `akBinding = null`
- `taskBound = false`

When `taskId` is supplied and verification succeeds:
- the helper returns verified task context
- `akBinding` may be included
- `taskBound` may be true
- `completionCandidate` may become true if the verified AK-binding lifecycle says so

When `taskId` is supplied and verification returns `not_found`:
- the public call must still succeed
- `taskContext.verificationState = "not_found"`
- `akBinding = null`
- `taskBound = false`
- `completionCandidate = false`
- `public.reason` and `nextAction` must say that no verified AK task context exists for the supplied id

When `taskId` is supplied and verification is unavailable:
- the public call must still succeed
- `taskContext.verificationState = "verification_unavailable"`
- `akBinding = null`
- `taskBound = false`
- `completionCandidate = false`
- `public.reason` and `nextAction` must say that the public view remains package-local because live AK verification was unavailable

## 2. `advance`

The same verification rules apply.

Additional rule:
- `advance` may still plan/apply exactly one truthful campaign-local step even when verification returns `not_found` or `verification_unavailable`
- it must fail only for the already-bounded local reasons (invalid manifest, blocked next step, terminal completion, invalid input), not solely because live AK verification could not be established

Interpretation rule:

> Missing or unavailable AK verification downgrades the public seam to package-local control truth.
> It does not take away lawful local campaign control behavior.

## H) Public reason / next-action rules

The follow-on must update public explanation text so it no longer implies live task truth unless verification actually succeeded.

Examples:

### No task requested
- reason: `stage 41 build A is the next truthful public campaign-control step; no AK task context was requested`

### Verified task context
- reason: `stage 41 build A is the next truthful public campaign-control step for verified AK task 1709`

### Task not found
- reason: `stage 41 build A is the next truthful public campaign-control step, but supplied taskId 1709 did not resolve to a live AK task`

### Verification unavailable
- reason: `stage 41 build A is the next truthful public campaign-control step, but live AK verification is currently unavailable; the public view remains package-local`

### Terminal local completion without verified task context
- next action: `Local campaign execution is materially complete for manifest llamacpp-wave-001; no verified AK task context is currently attached.`

### Terminal local completion with verified task context
- next action: `Local campaign execution is materially complete for manifest llamacpp-wave-001; a caller above the package may now evaluate whether verified AK task 1709 should be completed explicitly.`

## I) Boundary to the technical helper surface

This RFC intentionally keeps the public seam and the technical helper distinct.

### Public seam
- `autoresearch_llamacpp_campaign_control`
- operator-facing / consumer-facing
- now requires explicit separation of supplied versus verified task context
- should not expose AK-bound semantics without live verification success

### Technical helper
- `autoresearch_llamacpp_campaign action=build_ak_binding`
- expert/manual helper
- may continue accepting exact caller-supplied `taskId` as deterministic binding input without live verification
- remains useful for explicit operator workflows that want raw binding derivation even when AK is unavailable

Interpretation rule:

> The follow-on should tighten the public seam, not silently remove the lower-level technical helper use case.

## J) Proof contract for task `#1709`

The implementation is good enough when it proves all of the following:

1. **verification-state proof**
   - tests cover `not_requested`, `verified_live`, `not_found`, and `verification_unavailable`
2. **task-bound truth proof**
   - `taskBound` becomes true only for `verified_live`
3. **akBinding truth proof**
   - `akBinding` is present only for `verified_live`
4. **completion-candidate proof**
   - `completionCandidate` becomes true only when verified task context exists and the verified AK-binding lifecycle says so
5. **graceful-degradation proof**
   - `status` and `advance` still work package-locally when verification is `not_found` or `verification_unavailable`
6. **boundary proof**
   - the public helper performs only bounded read-only verification; it does not write AK evidence, complete tasks, create tasks, or fuzzy-match tasks
7. **technical-surface separation proof**
   - the public change does not silently redefine `build_ak_binding` into the same contract as the public helper
8. **docs/help proof**
   - status notes / current-vs-target / README or help text no longer imply that a supplied positive task id is automatically verified public task context

## K) Nice-to-have improvements that should ride with the slice

These are not the architectural core decision, but they should ship with the same bounded follow-on when practical:

1. **supplement `taskBound` with explicit task-context fields**
   - do not rely on a single boolean to express supplied versus verified state
2. **docs/examples for all task-context modes**
   - no task id
   - verified task id
   - task not found
   - verification unavailable
3. **explicit wording cleanup in reason/next-action text**
   - never imply verified AK truth when only caller intent is known

## L) Explicit non-goals

This follow-on still does **not** include:

- mandatory AK availability for public campaign control
- direct `ak` writes, evidence mutation, or task completion
- fuzzy task search by title/repo/campaign metadata
- task creation or automatic rebind logic
- changes to the lower-level technical `build_ak_binding` helper contract
- whole-campaign execution or broader public controller widening

## M) Why this is the smallest truthful move

This RFC chooses the narrowest correction that makes the public seam honest:

- stronger than today's implicit caller-asserted task semantics
- weaker than a hard AK-dependent controller
- explicit about when the public view is truly AK-bound versus only package-local

That is the smallest truthful move from:

- "a positive integer taskId is enough to make the public view look task-bound"

to:

- "the public view only presents verified task-bound AK context when AK actually confirms it, while remaining useful locally when no such confirmation is available."

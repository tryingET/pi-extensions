---
summary: "Accepted package-level decision for how the public autoresearch_llamacpp_campaign_control surface handles caller-supplied AK task ids: optional best-effort live verification with explicit surfaced status, while preserving package-local control behavior and keeping the lower-level technical binding helper distinct."
status: accepted
read_when:
  - "Before implementing or reviewing task 1709 in pi-autoresearch."
  - "When deciding whether public llama.cpp campaign control should require live AK verification, treat caller-supplied task ids as sufficient, or degrade gracefully while surfacing verification state."
  - "When you need the durable accepted package-level contract after decision 17 reached ADR recording."
system4d:
  container: "Package-local ADR for public AK task verification semantics in pi-autoresearch."
  compass: "Make the public campaign-control seam truthful about AK task context without turning a non-mutating helper into an AK-dependent controller."
  engine: "stage the strongest schools of thought -> force confrontation -> choose the smallest durable decision -> bind scope, seams, and rollout invariants."
  fog: "The main risks are overstating unverified task context as live AK truth, over-coupling the public helper to AK availability, or collapsing the public and technical helper surfaces into one contract."
---

# ADR — public AK task verification semantics for `autoresearch_llamacpp_campaign_control`

## Status

Accepted as the package-level architectural contract for `decision:17`.

- date: 2026-04-18
- owner: `packages/pi-autoresearch`
- reviewers:
  - `decision:17` current-track review memo
- related_docs:
  - `../project/2026-04-18-problem-brief-public-ak-task-verification.md`
  - `../project/2026-04-18-evidence-note-public-ak-task-verification.md`
  - `../project/2026-04-18-public-ak-task-verification-rfc.md`
  - `../project/2026-04-18-review-public-ak-task-verification-rfc.md`
  - `../project/llamacpp-campaign-control-surface-contract.md`
  - `../project/llamacpp-campaign-control-surface-status.md`
  - `../project/product-posture.md`

## Executive summary

The public `autoresearch_llamacpp_campaign_control` surface must no longer treat a caller-supplied positive `taskId` as enough to present verified AK-bound public control semantics. The accepted decision is to attempt bounded read-only live AK verification when `taskId` is supplied, surface that verification status explicitly, expose `akBinding` / `taskBound` / `completionCandidate` only when verification succeeds, and otherwise degrade gracefully to package-local control truth without widening into AK mutation, fuzzy task lookup, or a hard AK dependency.

## Context

`pi-autoresearch` already owns a bounded public campaign-control seam for manifest-driven llama.cpp campaigns.
That seam is intentionally below:

- direct AK mutation
- whole-campaign execution
- workstation-owned stage semantics

But the landed implementation accepted optional `taskId` and only proved that it was a positive integer before composing task-aware public context.
That created a public middle state:

- stronger than pure package-local status
- weaker than verified live AK truth
- but too easy to read as exact task-bound context anyway

The problem/evidence/RFC/review chain for `decision:17` established that this is not merely a local implementation bug.
It is a package-level contract question about where public task context stops being caller intent and starts being verified AK truth.

## Problem statement

The public campaign-control surface needed a durable answer to this ambiguity:

> when a caller supplies `taskId`, what exactly must the public seam prove before it may present task-bound AK-aware control semantics?

Without a durable answer, the public surface risks either:

- overstating unverified task context as live AK truth, or
- over-correcting by making a non-mutating helper depend on AK availability for ordinary local control use cases

## Decision drivers

- truthful public semantics for supplied versus verified task context
- preserve package-local usefulness when AK is absent, unavailable, or irrelevant
- keep the public seam below AK mutation and below a broader controller role
- keep the lower-level technical `build_ak_binding` helper distinct from the public consumer/control seam
- fail closed on false public certainty, not on lawful local campaign control behavior

## Decision

Use **optional best-effort live AK verification with explicit surfaced status** for the **public** `autoresearch_llamacpp_campaign_control` seam.

This decision was chosen after a many-of-the-greats confrontation among three first-rate schools:

1. **Reliability absolutism**
   - if public task context matters, it must be verified live or the call should fail
2. **Boundary purism**
   - the package should never consult AK from this seam; caller-supplied ids are either accepted as-is or ignored
3. **Truthful public contract design**
   - the public seam should distinguish supplied from verified context explicitly, attempt bounded verification when asked, and degrade gracefully when verification cannot be established

The accepted decision is the third path.
It preserves what the first school correctly sees — unverified public task context should not be treated as live truth — without paying the cost the second school underestimates: a public seam that keeps implying stronger AK truth than it really has.

### Scope
- in scope:
  - public `taskId` semantics for `autoresearch_llamacpp_campaign_control`
  - explicit task-context verification states
  - rules for when `akBinding`, `taskBound`, and `completionCandidate` may be surfaced publicly
  - graceful degradation behavior for `not_found` and `verification_unavailable`
  - human-facing reason / next-action wording that must not imply live AK truth unless verification succeeded
- out of scope:
  - direct AK mutation
  - fuzzy task lookup or task creation
  - whole-campaign execution
  - broader public controller widening
  - changing the lower-level technical `autoresearch_llamacpp_campaign action=build_ak_binding` helper into the same contract as the public seam

### Ownership / seam / policy notes
- owner:
  - `packages/pi-autoresearch` owns the public control contract and its bounded verifier composition
- allowed seams:
  - exact manifest loading and local projection/autonomy derivation
  - bounded read-only AK verification for one exact caller-supplied task id
- prohibited patterns:
  - treating a supplied positive integer as enough for verified public task binding
  - mandatory AK dependence for otherwise lawful local status/advance flows
  - AK mutation from the public seam
  - fuzzy task search or task inference
  - collapsing the public seam and technical helper into the same contract

## Alternatives considered

### Option A — mandatory live verification
- description:
  - if `taskId` is supplied, the public call must verify a live AK task or fail
- pros:
  - strongest fail-closed public truth posture
  - simplest meaning for task-bound public semantics
- cons:
  - over-couples a non-mutating helper to AK availability
  - makes package-local public status/advance worse for legitimate local workflows
  - drifts toward orchestrator-style authority checks without gaining mutation authority
- why not chosen:
  - it solves the truth problem by making the public helper too dependent on AK for a bounded package seam

### Option B — no live verification
- description:
  - keep current behavior and let positive integer shape validation stand in for public task context
- pros:
  - smallest implementation change
  - zero AK dependency from the public seam
- cons:
  - preserves misleading public semantics
  - keeps `taskBound` / `completionCandidate` too easy to read as verified AK truth
  - leaves the known limitation unresolved
- why not chosen:
  - it preserves the exact ambiguity the decision exists to remove

### Option C — optional best-effort live verification with surfaced status
- description:
  - attempt bounded read-only verification when `taskId` is supplied; surface whether task context is verified, not found, unavailable, or not requested; only expose public AK-bound semantics when verification succeeds
- pros:
  - makes the public seam truthful without requiring AK to be up for local control behavior
  - keeps public semantics narrower and clearer than the technical helper contract
  - preserves package-local utility and bounded scope
- cons:
  - introduces a richer public state model instead of one boolean
  - requires implementation and tests to keep the verifier seam deterministic and narrow
- why chosen or not chosen:
  - chosen because it is the smallest durable decision that preserves truth without inflating authority

## Consequences

### Positive
- public task context becomes explicitly truthful rather than implicitly optimistic
- `taskBound` and `completionCandidate` gain a defensible meaning
- missing or unavailable AK verification downgrades the public surface to package-local truth instead of breaking lawful local behavior
- the technical `build_ak_binding` helper can remain available for expert/manual workflows without forcing the same public contract

### Costs
- the public result shape must grow explicit task-context fields
- human-facing output must change to render verification state clearly
- focused tests are required for verified / not-found / unavailable scenarios

### Risks
- the implementation could accidentally over-import broader AK task checks into a bounded package seam
- consumers used to the old `taskBound` meaning may assume no behavior changed
- the public seam may still hide the richer contract if task-context rendering remains too subtle

### Mitigations
- make task-context state explicit in machine-readable output and visible in human-facing formatting
- keep verification bounded to one exact read-only AK lookup
- document the difference between the public seam and the technical helper
- add tests that prove `akBinding`, `taskBound`, and `completionCandidate` only arise from verified live task context

## Migration / rollout

- phase 1:
  - add explicit public task-context verification state
  - add a bounded verifier seam for exact-task read-only AK checks
  - null out public `akBinding` when verification is not established
- phase 2:
  - update public reason / next-action rendering
  - add tests for `not_requested`, `verified_live`, `not_found`, and `verification_unavailable`
  - update README / status docs / current-vs-target references as needed
- rollback / escape hatch:
  - if live verification integration proves unstable, keep the public seam package-local by surfacing `verification_unavailable`, `akBinding = null`, and `taskBound = false` rather than reverting to caller-asserted public task truth

## Architecture fitness functions / validation

- invariant 1:
  - public `taskBound` is true only when live verification succeeded for the exact supplied task id
- invariant 2:
  - public `completionCandidate` is true only when live verification succeeded and the verified binding lifecycle says `complete_task_candidate`
- command checks:
  - `cd packages/pi-autoresearch && npm run check`
  - `cd packages/pi-autoresearch && npm run release:check:quick`
  - `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/pi-autoresearch/docs --strict`
- test / review gates:
  - focused tests for `not_requested`, `verified_live`, `not_found`, and `verification_unavailable`
  - explicit proof that public `status` / `advance` still function package-locally when AK verification is missing or unavailable
  - explicit proof that the lower-level technical `build_ak_binding` helper remains a distinct contract

## Follow-up decisions / open questions
- should the public formatter render task-context as its own dedicated section so operators cannot miss the supplied-versus-verified distinction?
- should the lower-level technical helper remain fully caller-asserted indefinitely, or should a later bounded read-only verified variant be added separately?
- should the bounded verifier abstraction be reused by later public AK-aware read seams if this pattern recurs?

## Supersession
- supersedes:
- superseded_by:

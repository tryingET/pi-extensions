---
summary: "Validation, rollout, and rollback note for the first bounded pi-autoresearch slice that changes the public campaign-control seam from caller-asserted task context to explicitly surfaced verified/unverified task-context semantics."
read_when:
  - "You are validating or rolling out task 1709."
  - "You need the bounded validation and rollback contract for public AK task verification semantics in pi-autoresearch."
  - "You want the smallest truthful rollout note after decision 17 was ADR-recorded."
type: "reference"
system4d:
  container: "Bounded validation and rollback contract for public AK task verification semantics in pi-autoresearch."
  compass: "Prove the public seam is more truthful without overstating the slice as a broader AK integration or controller change."
  engine: "name checks -> name rollout boundary -> name rollback semantics -> guard against overclaim."
  fog: "The main risk is reading a bounded public truth-tightening slice as approval for AK mutation, fuzzy lookup, or mandatory AK dependence across the package."
---

# Validation / Rollout / Rollback — public AK task verification semantics for `autoresearch_llamacpp_campaign_control`

This note applies only to the first bounded post-ADR slice under `decision:17` and task `#1709`.
It must not be read as approval for broader AK lifecycle automation, fuzzy task discovery, or whole-campaign controller widening.

## Validation checks

The bounded slice is considered validated when all applicable checks pass:
- `cd packages/pi-autoresearch && npm run check`
- `cd packages/pi-autoresearch && npm run release:check:quick`
- `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs packages/pi-autoresearch/docs --strict`
- focused `llamacpp-campaign` tests added for:
  - `not_requested`
  - `verified_live`
  - `not_found`
  - `verification_unavailable`
  - tightened `akBinding` / `taskBound` / `completionCandidate` semantics
  - continued package-local `status` / `advance` behavior when AK verification is unavailable
- `ak decision passport 17`
- `ak task show 1709`

Validation truth should confirm all of the following:
- decision `17` remains accepted and ADR-recorded
- task `1709` remains the bounded package-local execution slice for this change
- the public seam now distinguishes supplied task intent from verified task context
- public AK-bound semantics only appear when live verification succeeds
- local status/advance behavior still works when the task is missing or AK is unavailable
- the lower-level technical `build_ak_binding` helper remains distinct
- no AK mutation, fuzzy lookup, or task creation was added by this slice

## Rollout posture

This rollout is additive and package-local.

### What rolls out now
- explicit public task-context verification state
- bounded exact-task read-only AK verification for the public control seam
- stricter public `akBinding` / `taskBound` / `completionCandidate` semantics
- clearer public reason / next-action text for verified versus unverified context
- focused tests and bounded docs for the new behavior

### What does not roll out now
- direct AK writes or task completion
- fuzzy task lookup or task creation
- broader AK-aware public controller behavior
- changes to the lower-level technical `build_ak_binding` helper contract
- whole-campaign execution changes
- cross-package consumer cutover work

## Rollback posture

If this slice proves misleading or too broad, rollback means:
1. stop treating the public seam as wider than the ADR allows
2. narrow the public verifier behavior through forward correction or a superseding ADR if necessary
3. preserve the decision/task/docs history as durable governance trace
4. prefer degrading back to package-local control truth over returning to caller-asserted public AK semantics

This is primarily a **semantic / contract rollback**, not destructive data rollback.
The slice should add package-local code, tests, and docs, so later narrowing should happen through forward correction rather than erasure.

## Point of caution

False confidence appears if operators read this slice as proof that:
- any supplied positive `taskId` is still enough for public task-bound AK semantics
- the package now depends on AK for all public status or advance behavior
- the lower-level technical binding helper now follows the same stricter public rules automatically
- AK mutation or fuzzy task discovery is now implied by the public seam
- later broader controller work is already approved

The bounded slice is successful only if the system continues to distinguish:
- caller-supplied task intent
- verified public AK task context
- package-local control truth when verification is unavailable
- technical helper behavior below the public seam
- and later broader AK/lifecycle/controller work that still needs separate evidence and acceptance

---
summary: "Validation, rollout, and rollback note for the first bounded pi-vault-client prompt-plane V3 slice: package-owned headless seam now, continuation envelope now, no V4 graph persistence yet."
read_when:
  - "You are validating or rolling out task #1050."
  - "You need the explicit validation and rollback contract for the first non-UI prompt-plane slice."
  - "You want the smallest truthful rollout note after decision #14 is unblocked."
type: "reference"
system4d:
  container: "Bounded validation and rollback contract for the first pi-vault-client prompt-plane V3 slice."
  compass: "Prove the seam without implying consumer cutover or V4 graph persistence."
  engine: "name checks -> name rollout boundary -> name rollback semantics -> guard against overclaim."
  fog: "The main risk is reading a package-local seam proof as approval for broader runtime or persistence changes."
---

# Validation / Rollout / Rollback — pi-vault-client Non-UI Prompt-Plane Seam (V3)

This note applies only to the first bounded post-ADR slice under decision `#14`.
It must not be read as approval for V4 continuation-graph persistence or downstream consumer cutover in the same change.

## Validation checks

The first bounded slice is considered validated when all applicable checks pass:
- `cd packages/pi-vault-client && npm run docs:list`
- `cd packages/pi-vault-client && npm run typecheck`
- `cd packages/pi-vault-client && npm run check`
- targeted prompt-plane seam tests added for task `#1050`
- `cd packages/pi-vault-client && npm run release:check` when package export / packaging behavior changes
- `ak decision passport 14 -F json`
- `ak task show 1050 -F json`
- `ak direction export --repo . -F json`

Validation truth should confirm all of the following:
- decision `#14` remains accepted and unblocked
- task `#1050` remains the bounded package-local execution slice
- the public seam is owned by `pi-vault-client`, not AK
- selection preparation uses package-owned visibility and preparation logic
- continuation preparation works only from the machine-readable envelope contract
- prose-only next-step text is not treated as operational continuation truth
- receipt / replay invariants remain package-owned and intact
- no V4 graph persistence or continuation-edge storage was introduced by this slice

## Rollout posture

This rollout is additive and package-local.

### What rolls out now
- accepted package-level contract for the prompt-plane seam
- explicit package-owned headless runtime seam
- selection preparation through that seam
- continuation-envelope preparation through that seam
- focused tests/docs for the seam

### What does not roll out now
- orchestrator consumer cutover
- AK-native continuation runtime/storage
- V4 continuation graph persistence
- prompt-plane extraction into a new shared package
- Prompt Vault schema changes
- freeform prose parsing as continuation control-plane truth

## Rollback posture

If this slice proves misleading or too broad, rollback means:
1. stop treating the seam as wider than the ADR actually allows
2. supersede the ADR/plan with a narrower bounded follow-up if needed
3. preserve the decision artifacts and task history as durable governance trace
4. keep package ownership, continuation-envelope truth, and V4 deferral explicit rather than pretending the accepted boundary never existed

This is primarily a **semantic / contract rollback**, not destructive data rollback.
The slice should add package-local code/docs/tests and decision artifacts, so later narrowing should happen through supersession and forward correction rather than erasure.

## Point of caution

False confidence appears if operators read this post-ADR pack as proof that:
- prose next-step text is now good enough without an envelope
- AK now owns prompt-plane runtime behavior
- V4 graph persistence is implicitly approved
- downstream packages may continue private `src/*` imports until convenient
- task `#1050` is allowed to widen into consumer cutover or schema redesign

The bounded slice is successful only if the system continues to distinguish:
- package-owned prompt-plane runtime semantics
- machine-readable continuation truth
- downstream consumer adoption work
- decision/workflow authority in AK
- and later V4 graph lineage work that still needs separate evidence and acceptance

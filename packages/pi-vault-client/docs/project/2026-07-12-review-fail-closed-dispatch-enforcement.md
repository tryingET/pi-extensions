---
summary: "Formal adversarial review attempt 1 of the fail-closed dispatch RFC; outcome revise_rfc."
read_when:
  - "Reviewing the decision lifecycle for fail-closed Vault dispatch."
  - "Checking why RFC revision 2 was required."
type: "review-memo"
review_attempt: 1
review_outcome: "revise_rfc"
system4d:
  container: "Independent adversarial review of the proposed Vault dispatch authorization architecture."
  compass: "Do not accept enforcement architecture while supported bypasses or owner ambiguities remain."
  engine: "Attack API compatibility, composites, identity, projections, receipts, rollout, and rollback."
  fog: "A strong policy statement can still leave executable legacy paths unchanged."
---

# Review Attempt 1 — Fail-Closed Prompt Vault Dispatch Enforcement

## Outcome

**`revise_rfc`**

The direction is sound, but RFC revision 1 was not ready for ADR. Independent review identified implementation-blocking contradictions.

## Blocking objections

### B1 — additive V2 preserved the supported V1 raw-text bypass

The existing public prompt-plane can return `ready + prepared_text` for gated templates. Adding V2 without changing V1 would violate the no-weaker-path invariant and the accepted V3 prompt-plane contract needed explicit amendment.

Required revision: V1 may return executable text only for `text_ready`; all other dispositions block with no executable text. State deprecation/removal gates.

### B2 — singular authorization could not represent grounding/composites

Grounding composes a primary template with multiple governed framework templates. Every member must be classified and identity-bound, and the final composition itself needs a digest.

Required revision: define aggregate authorization with all members, all-or-nothing failure, mixed-disposition blocking, and final composed-byte identity.

### B3 — exact identity and TOCTOU were asserted but undefined

The proposal did not define digest canonicalization, required ID/version behavior, renderer/wrapper identity, sealed bytes, or the host-call linearization point.

Required revision: freeze canonical serialization/digest rules and require execution of exactly the sealed bytes and frozen binding revalidated at the final package boundary. State cross-process atomicity limits.

### B4 — projected-prompt quarantine lacked an owner or mechanism

`pi-vault-client` observes projection freshness but does not own Prompt Vault CLI export or machine-local prompt mutation.

Required revision: name the Prompt Vault projection owner, cross-owner task/handoff, export receipt, activation dependency, installed bypass proof, and rollback-to-quarantine rule.

### B5 — receipt correlation lacked durable pre-handoff semantics

The proposal did not say whether a receipt failure blocks dispatch, who allocates correlation identity, or how current `success=true` execution rows relate to executor outcome.

Required revision: Vault allocates and durably persists a handoff identity before gated dispatch; executor receipts cite it; persistence failure blocks; legacy success is explicitly not executor outcome evidence.

### B6 — rollout and rollback lacked executable gates

The proposal named phases but not owners, exit criteria, shadow cutoff, activation dependencies, or an emergency posture that cannot re-enable raw gated execution.

Required revision: add owner/exit-gate matrix, fixed shadow bound, deterministic ingress coverage, owner-remediation gate, installed proof, and disable-to-blocked rollback semantics.

## Source anchors

The review checked:

- `src/promptPlane.ts` and `.d.ts`;
- `src/vaultGrounding.ts`;
- `src/vaultDb.ts`;
- `src/dispatchRuntime.ts`;
- `src/dispatchPosture.ts`;
- `src/vaultReceipts.ts`;
- `extensions/vault.ts`;
- `package.json`;
- `docs/adr/2026-04-10-non-ui-prompt-plane-and-continuation-contract.md`;
- `docs/dev/vault-execution-receipts.md`.

## Revision response

RFC revision 2 responds to all six blockers. This memo does not judge those changes; a separate independent rereview must produce the controlling outcome.

## Non-authorizations

This review does not authorize ADR recording, implementation, projection mutation, Prompt Vault mutation, consumer migration, release, or publication.

---
summary: "Source-grounded evidence for the pi-vault-client advisory-to-enforced dispatch gap."
read_when:
  - "Reviewing the fail-closed dispatch RFC."
  - "Checking whether the architecture problem is evidenced rather than hypothetical."
type: "evidence-note"
system4d:
  container: "Evidence supporting the fail-closed dispatch-enforcement decision."
  compass: "Separate observed behavior from proposed architecture."
  engine: "Inspect source and tests -> adversarial probes -> rank findings -> state coverage limits."
  fog: "Existing dispatch tests prove classification, not end-to-end enforcement."
---

# Evidence Note — Fail-Closed Prompt Vault Dispatch Enforcement

## Method

This note records a read-only package review plus an independent adversarial source review. No implementation files were changed during the review.

## Critical findings

### E1 — package-owned execution paths bypass dispatch posture

Observed paths prepare or submit selected templates without making dispatch classification a mandatory gate:

- `src/vaultCommands.ts` — `/vault` command preparation/submission;
- `src/vaultPicker.ts` — live `/vault:` trigger;
- `src/promptPlane.ts` — public headless candidate preparation;
- `src/vaultTools.ts` — query/retrieve surfaces append warnings but do not centralize execution authorization.

Consequence: a loop/workflow declaration can remain advisory while raw prompt text proceeds.

### E2 — missing-template aggregates can report ready

`src/dispatchRuntime.ts` computes missing names but can return `ok: true` and `status: "ready"` with an empty or partial result set.

Consequence: consumers checking only the headline status can proceed after incomplete resolution.

### E3 — binding authority is mutable in-process

`src/dispatchPosture.ts` exposes nested mutable binding records and a public `registerLoopBinding()` mutation seam. Shallow snapshots share nested objects.

Consequence: a returned diagnostic or another in-process consumer can mutate future classification behavior without a new policy identity or audit event.

### E4 — unknown semantic values fail open

Classification recognizes exact known loop/workflow values and otherwise falls through toward ordinary text behavior. Database parsing supplies permissive defaults, and public types allow arbitrary strings.

Consequence: typoed, malformed, case-drifted, or future ontology values can accidentally become `text_ok`.

### E5 — check-to-execution identity is incomplete

Dispatch lookup reads template ID/version, but the public posture result does not bind authorization to those values, a content digest, company context, binding-registry version, or execution surface.

Consequence: metadata can drift after check and before dispatch without invalidating the decision.

### E6 — authorization and execution receipts have no explicit correlation contract

Existing receipts prove prepared prompt/send-time behavior. The dispatch runtime has no executor outcome seam. The actual orchestrator remains the rightful owner of loop/workflow runtime completion.

Consequence: the package cannot truthfully claim that an authorized loop completed, while a downstream executor cannot currently cite an exact Vault authorization identity.

## Supporting quality findings

- Company identity is supplied by environment, cwd, or caller context. It is a governance-routing context, not authentication against hostile principals.
- Receipt files can inherit permissive filesystem modes even though receipt content contains prepared prompts and context.
- Commit failures may be downgraded to warnings, allowing a write to be reported without durable commit truth.
- Test runs accumulate ignored `.tmp-test` receipt residue.
- Generated runtime checks mutate generated artifacts before validation and do not prove the tree was already synchronized.

These are real follow-ups but are not all part of the first dispatch-enforcement implementation wave.

## Existing strengths to preserve

- visibility-aware lookup;
- package-owned prompt preparation;
- schema-v9 compatibility diagnostics;
- optimistic mutation checks;
- send-time prepared-prompt identity verification;
- signed local receipts and replay/drift classification;
- explicit dispatch posture vocabulary and loop bindings;
- extensive package tests.

## Evidence confidence

| Finding | Confidence | Severity |
|---|---|---|
| execution bypass | high | critical |
| missing reported ready | high | critical |
| mutable bindings | high | critical |
| unknown metadata fails open | high | high |
| identity drift window | high | high |
| receipt-owner ambiguity | medium-high | high |

## Coverage limits

This review establishes package behavior, not the full downstream orchestrator or Pi-host runtime. Installed-host and packed-artifact tests are therefore required in the implementation wave before an end-to-end enforcement claim is accepted.

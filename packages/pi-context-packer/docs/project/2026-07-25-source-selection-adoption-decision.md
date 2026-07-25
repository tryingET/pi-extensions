---
summary: "Owner decision from the real source-list and SCI source-selection benchmark: refine evidence while rejecting automatic invocation."
read_when:
  - "Deciding whether pi-context-packer should invoke source-list automatically."
  - "Planning any follow-up source-selection experiment or provider wiring."
type: "reference"
system4d:
  container: "Owner adoption decision for source-list-assisted context selection."
  compass: "Adopt only when quality, unnecessary-read, omission, cost, and trust gates all clear."
  engine: "Freeze evidence -> rank once -> independently review -> record owner decision."
  fog: "A near-threshold aggregate can hide uneven repository value and automatic-invocation cost."
---

# Source-selection adoption decision — 2026-07-25

## Decision

**REFINE the evidence program; REJECT automatic `source-list` invocation and production wiring.**

This is the pi-context-packer owner decision for AK-4173 and FCOS coordination item `context-packer-source-selection-adoption`. It supersedes no provider contract and authorizes no implementation task.

The real four-arm benchmark is valid, independently reviewed, and promising, but one conjunctive gate fails:

- equal-repository precision delta: +0.106667 — PASS;
- unnecessary-selection/read proxy reduction: 16.0494% — **FAIL** versus 20%;
- omission delta: -0.433333 per case — PASS;
- eligible population: 3 independent repositories / 30 cases — PASS;
- actual SCI availability and separate semantics: PASS;
- staleness sampling and cost/trust disclosure: PASS, with bounded limitations.

Because the unnecessary-selection gate fails, no production-wiring task is lawful. Structural and fusion results cannot substitute for the source-list gate.

## Evidence

- Frozen pre-run commit: `357af5667343de532b013bcd738fc6c14f32cf19`.
- Result SHA-256: `5421fd6a29329263f9922b7e2ce4eac20a010434c7cd04c6d2630df641c6b275`.
- Prepared input SHA-256: `257ee6ac37dfd146d445971b9783a840de68a7d770ef1ffeb4a804320046f2b8`.
- Experiment index: `experiments/source-selection/2026-07-25-v2/README.md`.
- Independent post-ranking review: `experiments/source-selection/2026-07-25-v2/independent-review.md`.
- Review peer run: `scoutpeer-ms0bhtu6-52277a97`.

## Interpretation

The result establishes that authored source metadata can materially improve precision and omissions across three eligible repositories. It does not establish sufficiently strong or uniform unnecessary-read reduction:

- agent-scripts: 8.00%;
- engineering-core: 14.8148%;
- DSPx: 24.1379%.

Only DSPx clears the 20% reduction independently. The pi-extensions control remains metadata-ineligible at 18.33% and demonstrates that eligibility discovery itself has nonzero large-repository cost.

## Allowed next work

A new scoped **non-production experiment** may be proposed only if it:

1. uses new preregistered bytes and review before ranking;
2. does not edit metadata or ranking against this visible result to manufacture a pass;
3. targets the identified unnecessary-selection and eligibility/cost failure modes;
4. preserves at least three independent eligible repositories and honest controls;
5. prices invocation, bytes/tokens, staleness, trust, and maintenance; and
6. records a new explicit decision.

Manual or caller-requested `source-list` use remains available through Agent Scripts. The current result does not justify an automatic adapter, provider registration, broad metadata campaign, or source-list/SCI semantic expansion.

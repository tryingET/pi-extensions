---
summary: "Review synthesis for bounded campaign-endurance proof before matrix automation."
read_when:
  - "Before accepting the campaign endurance ADR."
  - "When checking whether a smoke run can be claimed as hour-scale proof."
type: "review-synthesis"
system4d:
  container: "Package-local review synthesis for campaign-endurance proof."
  compass: "Accept sustained bounded execution only with truthful proof labels and authority boundaries."
  engine: "Check ownership, stop gates, dashboard data, resume posture, and matrix relationship."
  fog: "A short successful run can be overclaimed as campaign autonomy."
---

# Review synthesis — bounded campaign endurance proof

## Review stance

The RFC is directionally correct. It identifies the missing layer exposed by matrix dogfooding: the system must prove the single campaign loop can create and maintain useful runtime truth before matrix automation can responsibly coordinate many cells.

## Accepted constraints

1. **Runtime owner stays `pi-autoresearch`.**
   - Campaign loop execution, receipts, event ledger, dashboard, closeout, candidate-result packets, and resume/finalize plans remain package-owned.

2. **Orchestrator remains above the seam.**
   - `pi-society-orchestrator` may start/observe/supervise exact-task runs and project verified evidence, but it must not become the benchmark/check loop.

3. **AK remains durable authority.**
   - Local runtime receipts are evidence inputs, not canonical task truth.

4. **Smoke proof and endurance proof are different claims.**
   - A short dogfood segment can prove wiring and dashboards.
   - It cannot prove hour-scale self-sustaining usefulness.

5. **Dashboard follows receipts.**
   - `/autoresearch export` is useful after runtime data exists; it is misleading when opened before a configured segment and receipt history exist.

6. **Matrix remains downstream.**
   - Matrix cells may eventually compose bounded campaign segments, but only after the single campaign loop has earned trust.

## Risks and mitigations

### Risk: hidden daemon drift

Mitigation: require explicit budgets, foreground/live-supervised execution, and stop gates. Do not introduce background indefinite execution in this proof.

### Risk: local runtime artifacts pollute source control

Mitigation: ignore regenerated runtime artifacts at the repo root and treat them as projections.

### Risk: short smoke run gets overclaimed

Mitigation: record AK evidence with a `smoke` caveat and keep hour-scale proof as a follow-on requirement.

### Risk: matrix absorbs runtime ownership

Mitigation: ADR should state that matrix automation, if later accepted, composes `pi-autoresearch` campaign segments rather than reimplementing campaign execution in orchestrator.

## Recommendation

Accept the ADR for a two-step proof:

1. AK-governed smoke dogfood now;
2. later hour-scale endurance dogfood from a clean checkout with explicit budget and operator-visible dashboard observation.

The immediate implementation should not add new campaign architecture. First verify and document whether the landed bounded loop already satisfies the smoke-level contract.

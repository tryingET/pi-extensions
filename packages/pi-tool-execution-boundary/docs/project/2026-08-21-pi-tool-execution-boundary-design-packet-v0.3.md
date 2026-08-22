---
summary: "Normative v0.3 implementation baseline for pi-tool-execution-boundary, integrating the Release 0.1 micro-VM design with a closed compiler/IR pipeline, effect-tiered durability, split guest TCB, daemon self-confinement, immutable TCB generations, backend conformance bake-off, PSI-aware admission, structured requirements, and operator explainability."
read_when:
  - "Beginning implementation of pi-tool-execution-boundary."
  - "Reviewing the semantic chain from human policy through attested backend plan and admitted operation."
  - "Implementing or verifying D0 read and D1 workspace-effect durability."
  - "Building the Phase 0 backend conformance bake-off or the Slice A semantic core."
system4d:
  container: "A thin Pi adapter, one self-confined user daemon, closed semantic IRs, one attested offline micro-VM lease, split guest controller components, fresh per-call execution cells, guest-owned writable storage, and typed export."
  compass: "Human policy is never interpreted by a backend; every effect derives from a closed operation type; durability is proportional to effect; a lease is bound to one immutable and attested TCB generation; failure never becomes host execution."
  engine: "Strict JSON policy -> normalized/effective policy IR + subset proof -> semantic plan IR -> rendered backend plan IR -> canary plan -> attestation -> requested operation IR -> admitted operation IR -> D0 or D1 execution -> effect disposition IR -> typed change-set export."
  fog: "Remaining uncertainty is empirical backend conformance, owner-workstation performance, and implementation correctness—not unresolved semantic authority."
---

# `pi-tool-execution-boundary` design packet — specification v0.3

**Status:** Normative pre-implementation replacement specification  
**Date:** 2026-08-21  
**Target repository:** `tryingET/pi-extensions`  
**Recommended package path:** `packages/pi-tool-execution-boundary`  
**Recommended npm name:** `@tryinget/pi-tool-execution-boundary`  
**Specification version:** `0.3`  
**First product release covered normatively:** `0.1.x / microvm-offline`  
**Primary operator:** Solo, local-first Linux builder on a Threadripper workstation  
**Security implementation languages:** TypeScript for the Pi adapter; Rust for the host daemon, minimal privileged `boundary-init`, and unprivileged `boundary-agent`

---

## Section index

- [0. Revision disposition and change closure](design-v0.3/00-0-revision-disposition-and-change-closure.md)
- [1. Normative claim set and semantic trust chain](design-v0.3/01-1-normative-claim-set-and-semantic-trust-chain.md)
- [2. Frozen Release 0.1 product scope and durability classes](design-v0.3/02-2-frozen-release-0-1-product-scope-and-durability-classes.md)
- [3. Cross-domain decision register](design-v0.3/03-3-cross-domain-decision-register.md)
- [4. Trust and threat model](design-v0.3/04-4-trust-and-threat-model.md)
- [5. Concrete semantic and runtime architecture](design-v0.3/05-5-concrete-semantic-and-runtime-architecture.md)
- [6. Source snapshot and import](design-v0.3/06-6-source-snapshot-and-import.md)
- [7. Guest storage and quota mechanism](design-v0.3/07-7-guest-storage-and-quota-mechanism.md)
- [8. Immutable guest root, TCB generation, and supply chain](design-v0.3/08-8-immutable-guest-root-tcb-generation-and-supply-chain.md)
- [9. Persistent lease lifecycle, boot identity, and immutable generation](design-v0.3/09-9-persistent-lease-lifecycle-boot-identity-and-immutable-generation.md)
- [10. Split guest TCB and fresh execution cells](design-v0.3/10-10-split-guest-tcb-and-fresh-execution-cells.md)
- [11. Closed Operation IR and exact Pi tool mapping](design-v0.3/11-11-closed-operation-ir-and-exact-pi-tool-mapping.md)
- [12. Workspace consistency and generation model](design-v0.3/12-12-workspace-consistency-and-generation-model.md)
- [13. Typed change export and promotion boundary](design-v0.3/13-13-typed-change-export-and-promotion-boundary.md)
- [14. Protocol, canonical identity, and call linearization](design-v0.3/14-14-protocol-canonical-identity-and-call-linearization.md)
- [15. Effect-tiered SQLite authority and bounded audit](design-v0.3/15-15-effect-tiered-sqlite-authority-and-bounded-audit.md)
- [16. Global admission, PSI, inference coexistence, and retention](design-v0.3/16-16-global-admission-psi-inference-coexistence-and-retention.md)
- [17. Strict policy DSL, typed lattice, and compiler pipeline](design-v0.3/17-17-strict-policy-dsl-typed-lattice-and-compiler-pipeline.md)
- [18. DataExposureIR, privacy, and truthful claims](design-v0.3/18-18-dataexposureir-privacy-and-truthful-claims.md)
- [19. Backend conformance bake-off, rendered plans, and attestation](design-v0.3/19-19-backend-conformance-bake-off-rendered-plans-and-attestation.md)
- [20. Orphan and crash recovery](design-v0.3/20-20-orphan-and-crash-recovery.md)
- [21. Effect disposition, retry, and truthfulness](design-v0.3/21-21-effect-disposition-retry-and-truthfulness.md)
- [22. Performance, D0/D1 SLOs, PSI, and local voice coexistence](design-v0.3/22-22-performance-d0-d1-slos-psi-and-local-voice-coexistence.md)
- [23. Operator experience: doctor, status, explain, destroy](design-v0.3/23-23-operator-experience-doctor-status-explain-destroy.md)
- [24. Package and component structure](design-v0.3/24-24-package-and-component-structure.md)
- [25. Correct implementation sequence](design-v0.3/25-25-correct-implementation-sequence.md)
- [26. Verification strategy and evidence architecture](design-v0.3/26-26-verification-strategy-and-evidence-architecture.md)
- [27. Formal state model v0.3](design-v0.3/27-27-formal-state-model-v0-3.md)
- [28. Specification v0.3 release gate](design-v0.3/28-28-specification-v0-3-release-gate.md)
- [29. Deferred releases and explicit debt boundaries](design-v0.3/29-29-deferred-releases-and-explicit-debt-boundaries.md)
- [30. Residual risks after closure](design-v0.3/30-30-residual-risks-after-closure.md)
- [31. Final implementation recommendation](design-v0.3/31-31-final-implementation-recommendation.md)
- [Source notes](design-v0.3/32-source-notes.md)
- [32. Updated expert-perspective simulations](design-v0.3/33-32-updated-expert-perspective-simulations.md)
- [33. Failure-mode and effects analysis](design-v0.3/34-33-failure-mode-and-effects-analysis.md)
- [34. Deliberate technical-debt register](design-v0.3/35-34-deliberate-technical-debt-register.md)
- [35. Normative requirement index](design-v0.3/36-35-normative-requirement-index.md)

---
summary: "Session diary for reviewing the pi-extensions KES stance and defining federated learning boundaries across root and package surfaces."
read_when:
  - "Reviewing why pi-society-orchestrator KES should remain package-owned instead of becoming a repo-global learning seam."
  - "Looking for the reasoning behind the new federated learning boundary note at repo root."
system4d:
  container: "Repo-root diary capture for the KES stance and federated learning boundary review."
  compass: "Preserve local owner truth for learning capture and prevent accidental centralization into a fake monorepo-wide KES surface."
  engine: "Review existing KES and candidate-staging docs -> separate root vs package ownership -> define promotion rules -> record the adopted stance."
  fog: "The main risks are letting package KES proof get reinterpreted as root-global authority, or letting candidate-only learnings drift into shadow policy without review."
---

# Session diary — federated learning and KES boundaries

## Why this review was needed

Recent root and package work created several learning/capture surfaces that look similar but do not have the same owner or authority level:

- root `diary/`
- package `diary/`
- package-owned KES in `pi-society-orchestrator`
- root ontology-candidate staging under `docs/learnings/ontology-candidates/`
- root `docs/project/` synthesis notes

The risk was not that these surfaces were wrong.
The risk was that the repo could start acting as if they were all instances of one shared monorepo KES system.

## First-principles conclusion

The right stance is:

- **KES remains package-owned where a package explicitly owns the seam**
- **repo-root learning remains root-owned where the concern is cross-package or policy-level**
- **cross-package learning should federate upward through explicit synthesis, not automatic replication**

That means the repo should not quietly turn `pi-society-orchestrator`'s KES implementation into a global writer for all packages.

## Evidence reviewed

I grounded the boundary note against:

- root direction docs in `docs/project/strategic_goals.md`, `tactical_goals.md`, and `operating_plan.md`
- the owner-side wave packet in `docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`
- orchestrator's package KES contract in `packages/pi-society-orchestrator/docs/project/2026-04-10-kes-crystallization-contract.md`
- the bounded ontology-candidate staging contract in `docs/project/ontology-candidate-artifact-contract.md`
- the controlled self-to-ontology status note in `docs/project/2026-04-16-controlled-self-to-ontology-candidate-pipeline-status.md`

## Key clarification

The ontology-candidate pipeline already showed the right pattern:

- borrow the **KES shape**
- do **not** borrow orchestrator's exact ownership boundary blindly

That same rule generalizes well to the rest of the monorepo.

## Adopted boundary

### Root should own
- root diary for root/cross-package sessions
- `docs/project/` for reviewed cross-package synthesis and contract notes
- `docs/learnings/ontology-candidates/` only for the narrow repo-level ontology-candidate flow already defined

### Packages should own
- their own raw capture under package `diary/`
- their own candidate-only learning surfaces only when an explicit package contract exists
- package-owned runtime seams such as orchestrator's `src/kes/`

### Promotion should happen by
- explicit reviewed synthesis into root docs
- not automatic copy-up of package artifacts
- not self-driven repo-wide auto-propagation

## Outcome of this pass

- added canonical root note: `docs/project/federated-learning-and-kes-boundaries.md`
- clarified that `pi-extensions` should use a **federated learning** model rather than a single monorepo-global KES authority
- made explicit that orchestrator KES remains package-owned, while root-level semantic staging stays narrow and contract-bound

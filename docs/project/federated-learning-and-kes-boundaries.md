---
summary: "Review note for pi-extensions: KES is currently a package-owned seam in pi-society-orchestrator, while the monorepo should use a federated learning model with owner-local capture and explicit cross-boundary promotion."
read_when:
  - "Before extending KES-like behavior beyond pi-society-orchestrator or introducing new docs/learnings surfaces in this monorepo."
  - "When deciding whether a learning artifact belongs at package scope, repo-root scope, or a governed promotion surface."
system4d:
  container: "Root-level boundary note for learning-capture ownership inside the pi-extensions monorepo."
  compass: "Keep learning capture close to the owner package or repo concern, and require explicit promotion before anything becomes cross-package or governed truth."
  engine: "Review current KES reality -> distinguish root vs package surfaces -> define federated learning rules -> forbid false centralization."
  fog: "The main risks are turning package-local KES into a monorepo-wide dumping ground, letting root docs/learnings become a shadow authority, or letting self/crystallization auto-propagate across owner boundaries."
---

# Federated learning and KES boundaries — `pi-extensions`

## Status

Adopted stance for current monorepo work.

This note reviews the current KES posture in `pi-extensions` and defines the smallest truthful boundary for how learning should move across the repo.

---

## Decision in one sentence

`pi-extensions` should treat learning as **federated by owner**: keep raw capture and candidate staging at the package or repo surface that actually owns the work, treat `pi-society-orchestrator`'s KES seam as **package-local rather than monorepo-global**, and require explicit review/promotion before anything becomes root-level cross-package guidance or governed semantic truth.

---

## Why this note is needed

The repo now has several real but different learning/capture surfaces:

- root `diary/`
- package-local `diary/` folders in some packages
- package-owned KES in `packages/pi-society-orchestrator`
- repo-level ontology-candidate staging under `governance/ontology-candidates/`
- root `docs/project/` notes that synthesize cross-package architecture and contracts

Those surfaces are useful together.
But they are **not one thing**.

Without an explicit boundary note, it becomes too easy to blur:

- package-local KES,
- repo-root session memory,
- candidate-only semantic staging,
- and cross-package policy/architecture synthesis.

---

## Current truthful KES stance

## 1. KES is real in this repo, but only as a bounded package-owned seam

The current proven KES implementation lives in:

- `packages/pi-society-orchestrator/src/kes/`

Its bounded contract and proof are recorded in:

- `packages/pi-society-orchestrator/docs/project/2026-04-10-kes-crystallization-contract.md`
- `packages/pi-society-orchestrator/docs/project/operating_plan.md`
- `packages/pi-society-orchestrator/README.md`
- root direction docs under `docs/project/strategic_goals.md`, `tactical_goals.md`, and `operating_plan.md`

That seam is already explicit about its own limits:

- it is **package-owned**
- it writes only under that package's allowed roots
- it stages learnings as **candidate-only**
- it does not become a shared monorepo learning bus

## 2. The root docs already imply a package-owner boundary

Root direction docs now describe the KES packet as:

- completed history in `pi-society-orchestrator`
- part of a routed package-owner wave
- not a signal that the monorepo root now owns one generic KES writer for all packages

That existing direction should be preserved rather than weakened.

## 3. Root-level ontology-candidate staging borrows the KES shape, not the orchestrator seam itself

The root ontology-candidate pipeline already made an important distinction:

- KES-like **discipline** is good
- direct reuse of the orchestrator-owned KES seam as a root/global owner is not

That distinction is recorded in:

- `docs/project/self-to-ontology-candidate-pipeline.md`
- `governance/ontology-candidates/README.md`
- `docs/project/ontology-candidate-staging-rehome.md`
- `docs/project/2026-04-16-controlled-self-to-ontology-candidate-pipeline-status.md`

So the repo already has evidence for the right pattern:

> reuse the learning-shape where it fits, but do not silently centralize ownership.

---

## What “federated learning” means here

This note uses **federated learning** in an architectural/governance sense, not an ML-training sense.

It means:

- learning is captured first where the work actually happens
- each owner surface keeps its own raw evidence and candidate staging
- cross-owner reuse happens by explicit promotion/synthesis
- there is no single implicit monorepo-wide learning authority that every package writes into automatically

In short:

> **local capture first, explicit federation later**

---

## Boundary model

## Root-owned surfaces

### Root `diary/`
Use for:

- repo-root work
- cross-package planning sessions
- root policy/direction changes
- monorepo-level architecture reassessments

Do not use for:

- package-runtime KES output that belongs inside a package
- package-local execution capture that already has a package owner

### Root `docs/project/`
Use for:

- cross-package contracts
- repo-level architecture notes
- direction/policy notes
- synthesis across packages after review

Do not use for:

- raw session capture
- package-local candidate output that has not been reviewed into a root-level conclusion

### Root `governance/ontology-candidates/`
Use for:

- the specific repo-level candidate-only ontology staging contract already defined for semantic gaps

Do not use for:

- general-purpose monorepo learning dumps
- package KES output copied upward by default
- automatic `self` emission without the existing controlled workflow

## Package-owned surfaces

### Package `diary/`
Use for:

- package-local session capture
- package-local implementation evidence
- owner-local working memory

Current visible examples include:

- `packages/pi-society-orchestrator/diary/`
- `packages/pi-vault-client/diary/`
- `packages/pi-activity-strip/diary/`

### Package `docs/learnings/`
Use only when:

- the package has an explicit candidate-only learning contract
- the package owns the runtime/seam that emits those learnings

Current truthful example:

- `packages/pi-society-orchestrator/docs/learnings/`

Do not assume every package should now get `docs/learnings/` just because orchestrator has one.

---

## Surface/authority matrix

| Surface | Owner | State | What belongs there | What does not |
|---|---|---|---|---|
| `diary/` at repo root | monorepo root | raw capture | root-level sessions and cross-package reasoning | package-owned KES emissions |
| `docs/project/` at repo root | monorepo root | reviewed narrative/contract | cross-package synthesis, architecture, direction | raw package capture |
| `governance/ontology-candidates/` at repo root | monorepo root | candidate-only | repo-level ontology candidate staging | generic learnings or package KES spillover |
| `packages/*/diary/` | package owner | raw capture | package-local session history | cross-package policy truth |
| `packages/*/docs/learnings/` | package owner | candidate-only | package-local reusable claims with explicit contract | monorepo-global learnings by default |
| `packages/pi-society-orchestrator/src/kes/` | orchestrator package | package-owned seam | bounded KES planning/materialization for orchestrator-owned loops | root-global KES ownership |
| `ontology/` | repo ontology owner | governed truth | approved concepts/relations | candidate notes or unreviewed learnings |

---

## Promotion rules for federated learning

## Rule 1 — Capture at the owner surface first

If the work is package-local, start in the package.
If the work is repo-root/cross-package, start at repo root.
Do not jump straight to a broader surface.

## Rule 2 — Candidate staging stays local to the owning boundary

A package-owned candidate belongs in that package's candidate surface, if one exists.
A repo-level semantic candidate belongs in the root ontology-candidate staging surface.

## Rule 3 — Cross-package learning requires explicit synthesis

To move something from a package into root guidance, do not simply copy artifacts upward.
Instead, write an explicit root-level synthesis note in `docs/project/` that:

- names the source package artifact(s)
- states what was learned
- states what remains package-local
- states what, if anything, is now a root-level conclusion

## Rule 4 — Promotion to governed truth is narrower than promotion to reusable narrative

Something can be important enough for a root `docs/project/` note without being ready for:

- ontology mutation
- Prompt Vault mutation
- AK projection change
- repo-wide runtime contract changes

Promotion to those governed surfaces still needs the relevant explicit review path.

## Rule 5 — Self/crystallization is not permission for repo-wide auto-propagation

The bounded self-to-ontology pipeline is already careful about this.
That same discipline should hold more generally:

- `self` memory can crystallize semantic-pressure annotations
- candidate artifacts can stage ontology-specific durable records when warranted
- but neither step should auto-write broad repo policy or cross-package learning truth

---

## Explicit non-goals

This repo should **not** do any of the following by default:

- create one monorepo-global KES writer that all packages share implicitly
- treat `pi-society-orchestrator`'s `src/kes/` as the owner for every package's learning capture
- create a generic root `docs/learnings/` dumping ground for all package output
- auto-promote package `diary/` or `docs/learnings/` content into root policy docs
- let `self` or any other tool emit cross-package learnings without explicit review
- treat candidate-only artifacts as if they were governed truth

---

## Recommended operating stance now

For current `pi-extensions` work, the truthful stance is:

1. keep orchestrator KES exactly where it is: a package-owned seam
2. keep repo-root diary/project docs for root-owned work and cross-package synthesis
3. keep repo-root `governance/ontology-candidates/` narrow and semantics-specific
4. add new package-local learning surfaces only when that package has an explicit owner contract
5. federate knowledge upward by reviewed synthesis, not by automatic artifact replication

---

## Bottom line

`pi-extensions` should not centralize learning capture prematurely.

The repo already has the right building blocks:

- root diary for root work
- package diaries for package work
- package-owned KES in orchestrator
- narrow repo-level candidate staging for ontology
- root `docs/project/` as the cross-package synthesis surface

The correct next posture is therefore:

> **keep KES package-owned, keep learning capture local to the real owner, and federate upward only through explicit reviewed promotion**

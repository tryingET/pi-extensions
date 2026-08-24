---
summary: "G4-A candidate from SoftwareCo: heterogeneous monorepos may declare package-local validation scopes so repo-level check is not the only G1 unit."
read_when:
  - "Reviewing the SoftwareCo v1 G4-A live cycle."
type: "plan"
---

# G4-A candidate — package-local validation scopes in heterogeneous monorepos

**Origin group:** softwareco. **Pilot groups:** holdingco, teachingco (opt-in).
**Expiry / review event:** 2026-09-30. **Opt-in, bounded, cannot become default silently.**

## Minimum decision record

- **problem:** G1 "prove one active v1 resolution per declared scope" needs a
  place to name package-local scopes. In a monorepo, repo-level `just check`
  can pass while a single package's contract is the real consumer boundary.
  Without a declared scope map, proofs either over-claim the whole repo or
  invent scopes at run time.
- **audience and scope:** Heterogeneous monorepos (extensions, packages/*,
  mixed runtimes). Non-goal: splitting every monorepo into many AK repos.
- **invariant or decision rule:** Owner-declared adoption/resolution scopes
  are first-class. A G1 journey names them; a repo-level green check cannot
  stand in for an undeclared package scope.
- **load triggers:** v1 proof or adoption scan of a repo with `packages/*` or
  multiple Justfile/package roots; or a pre-commit gate that only runs on
  staged package roots.
- **evidence references:** 2026-08-24 pi-extensions admission: `just check`
  exit 0 and pre-commit printed `no staged package roots detected under
  packages/` — the repo-level gate and the package-root gate are different
  units. A pre-existing dirty file under `packages/pi-interaction/` was left
  untouched, showing package-local residue can sit beside a green repo check.
- **strongest alternative:** Treat the repository root as the only G1 scope.
  Rejected: it erases the package boundary the product already calls out.
- **counterevidence and exceptions:** A single-package repo should not be
  forced to invent extra scopes. Undeclared scopes stay illegal.
- **falsification conditions:** Declared package scopes cause duplicate
  denominators; or owners use scopes to hide a failing root check.
- **adoption and compatibility:** Optional field on the G1 journey manifest
  if later promoted. No pre-v1 compatibility claim. Rollback: drop the field;
  root scope remains.
- **review trigger:** 2026-09-30 or the first G1 journey that needs a
  package-local scope.
- **retirement signal:** Engineering-core G1 manifest already has a reviewed
  scope map and this candidate is redundant.
- **semantic references:** none.

## Pilot and disposition

Bounded local write-up of the scope distinction observed at admission. No
shared content mutated. Participant disposition: **supports, as a pilot
only** — do not add a G1 field until a second monorepo repeats the need.

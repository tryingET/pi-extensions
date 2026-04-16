---
summary: "Session diary for correcting the pi-autoresearch ontology landing from company scope to repo-local pi-extensions ontology and fixing ontology-workflows layout support."
read_when:
  - "Reviewing the first-principles reasoning behind the ontology topology correction."
  - "Looking for the exact correction path after the mistaken company-ontology landing."
system4d:
  container: "Repo-root diary capture for the ontology-topology correction wave."
  compass: "Land pi-autoresearch semantics at the smallest truthful scope and remove the earlier misplaced company-ontology changes."
  engine: "Reassess scope from first principles -> fix writer topology support -> seed repo-local ontology -> validate -> clean up mistaken landing."
  fog: "The main risks are leaving stale ontology in the wrong repo, keeping docs/tooling inconsistent across layouts, or hardening the wrong scope with more follow-on work."
---

# Session diary — pi-autoresearch ontology topology correction

## First-principles conclusion
The immediate ontology need is to govern semantics for a capability being incubated **inside the `pi-extensions` monorepo**.

That makes the smallest truthful scope:

- **repo-local ontology in `pi-extensions/ontology/`**

not:

- company overlay ontology in `/softwareco/ontology`

### Why
1. the capability is currently specific to this repo and its package family
2. the monorepo already advertises a repo-local `ontology/` root
3. putting the concepts in company ontology too early would create semantic spillover before reuse is proven
4. package-rich monorepos naturally want ontology nested under `ontology/`, not root `src/`

## Multi-order effects considered
### If we kept the company-ontology landing
- company ontology would gain repo-specific semantics prematurely
- later package or command renames would force wider ontology churn
- other repos could start depending on concepts not yet proven stable
- we would normalize the wrong scope and invite more follow-on work in the wrong place

### If we move to repo-local ontology first
- semantics stay close to the actual implementation wave
- promotion to company/core remains possible later
- root CI/ROCS can validate the ontology as part of this monorepo
- the ontology stays aligned with the monorepo’s `ontology/` topology

## Additional systemic issue found
`packages/pi-ontology-workflows` had a layout mismatch:
- workspace targeting could detect company ontology repos with root `manifest.yaml`
- but change planning/writing still assumed nested `ontology/src/...`

That was fixed so the package can now support both:
- repo-local nested ontology layouts (`ontology/src/...`)
- dedicated root-layout ontology repos (`src/...`)

## Outcome of correction
- repo-local ontology was seeded under `pi-extensions/ontology/`
- package tests and root ontology validation/build were run
- the misplaced uncommitted additions in `/softwareco/ontology` were scheduled for cleanup in the paired cleanup task

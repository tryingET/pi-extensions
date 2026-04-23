---
summary: "Session diary for adding repo-local ontology bootstrap and manifest support to pi-ontology-workflows."
read_when:
  - "Reviewing why pi-ontology-workflows was extended beyond concept/relation/system4d/bridge operations."
  - "Looking for the design and verification notes behind bootstrap and manifest support."
system4d:
  container: "Repo-root diary capture for the ontology-workflows bootstrap/manifests slice."
  compass: "Strengthen the ontology workflow boundary without turning it into a full repo scaffolder."
  engine: "Reassess bootstrap gap -> add bounded bootstrap/manifest operations -> verify nested and root-layout behavior -> smoke the live extension."
  fog: "The main risks are over-expanding ontology-workflows into a template engine, breaking dedicated root-layout ontology repos, or leaving repo bootstrap as an ad hoc manual step."
---

# Session diary — ontology-workflows bootstrap and manifest support

## Goal
Follow through on the recommendation that `pi-ontology-workflows` should support repo-root `ontology/` scaffolding better than it did before, but only in a narrow bounded way.

## AK context
- task: `#1400` — `Add ontology bootstrap and manifest support to pi-ontology-workflows`

## First-principles decision
The package should not become a general template/copier system.
But once Pi exposes ontology as a first-class workflow surface, it is architecturally weak if it can:

- add concepts
- add relations
- mutate system4d
- update bridge mappings

while still requiring the operator to hand-author the minimal repo-local ontology skeleton before any repo-scoped ontology work can start.

### Chosen boundary
Add only two new bounded artifact kinds:
- `bootstrap`
- `manifest`

Keep them intentionally **repo-scope only** for now.

That means:
- repo-local nested `ontology/` bootstrapping is supported
- dedicated root-layout company ontology repos are still supported for normal change operations
- but bootstrap/manifests do not pretend to solve company/core overlay bootstrapping yet

## What changed
### Contracts / extension surface
Added artifact kinds:
- `manifest`
- `bootstrap`

Added manifest fields to `ontology_change` request shape:
- `manifestLayers`
- `manifestProfiles`
- `manifestDefaultProfile`

### Workspace routing
Updated workspace resolution so repo-scoped `bootstrap` and `manifest` work can target the current repo even before `ontology/manifest.yaml` exists.

### Core change logic
Added bounded support for:
- creating/updating repo-local `ontology/manifest.yaml`
- bootstrapping a nested repo-local ontology skeleton:
  - `ontology/manifest.yaml`
  - `ontology/index.md`
  - `ontology/src/system4d.yaml`
  - `ontology/src/reference/concepts/README.md`
  - `ontology/src/reference/relations/README.md`
  - `ontology/src/bridge/README.md`
  - `ontology/src/bridge/mapping.yaml`

Also preserved the earlier fix that lets concept/relation/system4d/bridge writes work across both:
- nested repo-local ontology layouts (`ontology/src/...`)
- dedicated root-layout ontology repos (`src/...`)

### Docs
Updated `packages/pi-ontology-workflows/README.md` to document the new bounded bootstrap/manifest surface and its scope limits.

## Verification
### Tests
Passed:
- targeted package tests for:
  - nested repo-local ontology layout
  - root-layout ontology repo
  - bootstrap plan/apply
  - manifest plan/apply
  - workspace routing for bootstrap before manifest exists

### Package check
Passed:
- `cd packages/pi-ontology-workflows && npm run check`

### Live smoke
Passed:
- `cd packages/pi-ontology-workflows && npm run smoke:headless-live`
- output: `SUCCESS`

## Final judgment
Yes, it made sense to do this.

Not because ontology-workflows should own all scaffolding,
but because repo-local ontology bootstrap was an obvious missing seam in a package that already claims to be the stable workflow boundary for ontology work in Pi.

The change stayed bounded and preserved the more important ownership split:
- template repos still own broad scaffolding patterns
- ontology-workflows now owns the minimal ontology-native bootstrap/manifests workflow operators actually need in practice

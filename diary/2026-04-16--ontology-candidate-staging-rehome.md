---
summary: "Session diary for rehoming repo-root ontology candidate staging into governance/ontology-candidates/ and updating the related project docs."
read_when:
  - "Reviewing why the ontology candidate root moved away from docs/learnings/."
  - "Checking which docs were updated by AK task #1479 and how the change was verified."
type: "reference"
system4d:
  container: "Repo-root diary capture for AK task #1479 in the pi-extensions monorepo."
  compass: "Make the ontology candidate staging home explicit without reopening the bounded review-preserving pipeline design."
  engine: "Read the earlier contract/status docs -> define the rehome note and governance README -> realign the older references -> validate the touched files only."
  fog: "The main risks were leaving root docs/learnings semantics misleadingly broad or rewriting historical notes in a way that hid what the earlier landing actually did."
---

# Session diary — ontology candidate staging rehome

## Goal

Rehome the repo-root ontology candidate staging contract from the retired `docs/learnings/ontology-candidates/` path into an explicit governance subtree while keeping the candidate-only workflow unchanged.

- task: `#1479` — `Define governance/ontology-candidates staging contract and rehome path`

## Inputs read

- `docs/project/ontology-candidate-artifact-contract.md`
- `docs/project/self-to-ontology-candidate-pipeline.md`
- `docs/project/federated-learning-and-kes-boundaries.md`
- `docs/project/2026-04-16-controlled-self-to-ontology-candidate-pipeline-status.md`
- `docs/project/2026-04-16-pi-autoresearch-stack-map-boundaries-status.md`
- `governance/README.md`

## Main decision

Make:

```text
governance/ontology-candidates/
```

the canonical repo-root staging surface for ontology candidate artifacts.

Retire:

```text
docs/learnings/ontology-candidates/
```

as the operative path.

## Why the rehome won

- root `docs/learnings/` would read like a generic monorepo learning bus
- package-owned KES and learning capture should remain package-owned
- ontology candidates need an explicit repo-root staging seam, not a broad docs bucket
- `governance/ontology-candidates/` keeps the surface narrow, review-preserving, and clearly distinct from `ontology/` truth

## Outputs written

- `governance/ontology-candidates/README.md`
- `docs/project/ontology-candidate-staging-rehome.md`
- updates across the older project docs so current references point to the rehomed path
- this diary note

## Verification plan

1. run strict docs validation on a temp tree containing only the touched task files
2. run `rg` to check the updated docs/project surfaces for the rehomed path
3. stage and commit only the scoped task files because the working tree already contains unrelated changes outside this task

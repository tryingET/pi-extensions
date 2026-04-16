---
summary: "Session diary for freezing the repo-local ontology candidate artifact contract and staging root in pi-extensions."
read_when:
  - "Reviewing why ontology candidates stage under docs/learnings instead of docs/project or ontology/."
  - "Looking for the reasoning behind the first repo-local ontology candidate artifact contract."
type: "reference"
system4d:
  container: "Repo-root diary capture for a narrow ontology-governance contract slice."
  compass: "Define the smallest truthful artifact contract that keeps candidate staging durable without weakening ontology authority boundaries."
  engine: "Inspect existing pipeline + KES semantics -> choose a staging root -> freeze filename/frontmatter/body rules -> record follow-on seams."
  fog: "The main risk is accidentally choosing a root that turns candidate notes into shadow ontology truth or pollutes project-design docs with per-candidate records."
---

# Session diary — ontology candidate artifact contract

## Goal
Freeze the exact repo-local artifact contract for ontology candidates so later implementation work has a stable answer for:

- where candidate files live
- how they are named
- what metadata they carry
- what they are not allowed to do

## AK context
- task: `#1421` — `Define repo-local ontology candidate artifact contract and staging root`

## Inputs used
- `docs/project/self-to-ontology-candidate-pipeline.md`
- `diary/2026-04-16--self-to-ontology-candidate-pipeline.md`
- `diary/README.md`
- `packages/pi-society-orchestrator/docs/project/2026-04-10-kes-crystallization-contract.md`

## Main decision
Use:

```text
docs/learnings/ontology-candidates/
```

as the repo-local staging root for ontology candidate artifacts.

## Why this root won

### Against `docs/project/`
`docs/project/` is the right place for reusable design notes and contracts.
It is the wrong place for a growing set of per-candidate semantic records.

### Against `ontology/`
`ontology/` must stay governed semantic truth.
Candidate artifacts are not truth yet.
Placing them there would blur the review boundary the earlier pipeline design was trying to protect.

### In favor of `docs/learnings/`
The repo already frames `diary/` as raw capture that later crystallizes into `docs/learnings/`.
An ontology candidate is exactly that kind of durable-but-still-candidate crystallization artifact.

## Contract choices recorded
1. stage candidate artifacts under `docs/learnings/ontology-candidates/`
2. keep the root lazy rather than pre-creating it in this docs-only task
3. use filenames shaped as `YYYY-MM-DD--candidate-<concept|relation>-<slug>.md`
4. require standard repo frontmatter plus an `ontology_candidate` metadata block
5. require explicit body sections for meaning, evidence, collision notes, and next step
6. keep candidate artifacts non-authoritative until explicit review promotes them into ontology planning

## Output written
- `docs/project/ontology-candidate-artifact-contract.md`

## Follow-on work implied
1. add a writer/helper seam that materializes the root lazily
2. let `self` and/or proposal workflows emit or update candidate artifacts through that seam
3. keep apply behavior outside the writer; promotion must stay review-driven

---
summary: "Canonical staging contract for repo-local ontology candidate artifacts in pi-extensions."
read_when:
  - "Before creating or reviewing a candidate artifact under governance/ontology-candidates/."
  - "When deciding whether a semantic gap belongs in repo-local staging instead of ontology/ or docs/project/."
type: "reference"
system4d:
  container: "Repo-root governance staging contract for candidate-only ontology artifacts."
  compass: "Keep semantic-gap staging durable, inspectable, and review-preserving without turning candidate notes into ontology truth."
  engine: "Define the staging root -> freeze filename/schema rules -> constrain writers and promotion."
  fog: "The main risks are shadow ontology authority, generic learning-dump behavior, and direct candidate-to-apply shortcuts."
---

# Ontology candidate staging contract

## Purpose

`pi-extensions` needs one explicit repo-root place for **candidate-only ontology artifacts**:

- durable enough to review later
- narrow enough to avoid becoming a generic learning bus
- separate from `ontology/`, which remains governed semantic truth
- separate from `docs/project/`, which remains the design/contract surface

The canonical repo-root staging surface is:

```text
governance/ontology-candidates/
```

This directory is for **candidate-only semantic staging**.
It is not ontology truth, not a work-item queue, and not a shortcut around review.

## Contract summary

| Surface | Decision |
|---|---|
| Candidate staging root | `governance/ontology-candidates/` |
| Artifact state | candidate-only, non-authoritative |
| Creation model | `README.md` is pre-created; candidate files are created lazily as needed |
| Producers | operator-authored notes, future repo-local helpers, or controlled writers fed by `self` / `ontology_proposal` workflows |
| Consumers | explicit review, `ontology_proposal`, and later `ontology_change mode=plan` |
| Forbidden behavior | direct ontology apply, direct writes into `ontology/`, or treating staged candidates as ontology truth |

## Why this root is right

### 1. It is explicit staging, not a generic docs bucket

Earlier notes experimented with a root `docs/learnings/ontology-candidates/` path.
That shape made the repo-root candidate surface look too much like a general learning/crystallization bus.

`governance/ontology-candidates/` is more truthful:

- it is clearly repo-root and explicit
- it stays narrow to semantic candidate staging
- it does not imply that root `docs/learnings/` should exist for general package spillover

### 2. It keeps design docs and candidate artifacts separate

`docs/project/` should keep reusable architecture, contract, and status notes.
Per-candidate semantic staging should not accumulate there.

### 3. It keeps ontology truth clean

`ontology/` remains the governed semantic surface after explicit review and ontology workflows.
Candidate artifacts must remain outside that truth surface.

### 4. It keeps task/work tracking separate

`governance/work-items.json` and AK task state are execution-planning surfaces.
Ontology candidates may inform later tasks, but the candidate artifact itself is a semantic staging record, not a queue row.

## Path model

The intended flow is:

```text
diary/ -> governance/ontology-candidates/ -> explicit review/proposal -> ontology_change plan/apply
```

## Directory contract

All repo-local ontology candidate artifacts live directly under:

```text
governance/ontology-candidates/
```

V1 does not require nested subdirectories.

The directory may contain:

- this `README.md`
- staged candidate markdown files

Do not place unrelated learning notes or package-local KES output here.

## Filename contract

Use:

```text
YYYY-MM-DD--candidate-<concept|relation>-<slug>.md
```

Examples:

```text
governance/ontology-candidates/2026-04-16--candidate-concept-benchmark-harness.md
governance/ontology-candidates/2026-04-16--candidate-relation-evaluates-benchmark.md
```

Rules:

- the date is the first staging date
- `concept|relation` names the candidate kind explicitly
- `<slug>` comes from the human title, not the final ontology id
- do not encode final scope or final ontology id into the filename
- if the same slug is staged twice on one day, append `--2`, `--3`, etc.

## Candidate file contract

Each candidate file should use standard repo frontmatter plus an `ontology_candidate` block.

### Required frontmatter shape

```yaml
---
summary: "Ontology candidate: benchmark harness"
read_when:
  - "Reviewing a staged semantic candidate before ontology planning."
  - "Checking why a concept/relation was captured as a candidate instead of applied directly."
type: "reference"
ontology_candidate:
  contract_version: 1
  state: candidate
  candidate_kind: concept
  proposed_scope: repo
  title: Benchmark harness
  labels:
    - Benchmark harness
  synonyms:
    - benchmark wrapper
  proposed_id_hint: pi.extensions.BenchmarkHarness
  confidence: 0.82
  source:
    tool: self
    memory_id: ontcand-123
    session_ids:
      - session-abc
  evidence_refs:
    files:
      - docs/project/pi-autoresearch-rfc.md
    diary:
      - diary/2026-04-16--analysis-pi-autoresearch.md
    tasks:
      - 1408
  assessment:
    duplicate_risk: medium
    nearest_existing:
      - ont_id: pi.extensions.BenchmarkMetric
        reason: adjacent metric concept, but not the harness itself
  next_step: review
system4d:
  fog:
    risks: []
    assumptions: []
    exceptions: []
    debt: []
---
```

### Minimum field rules

#### `ontology_candidate.contract_version`
Start at `1`.
Bump only for real schema changes.

#### `ontology_candidate.state`
Allowed v1 values:

- `candidate`
- `deferred`
- `rejected`
- `planned`
- `promoted`

Default on first write: `candidate`.

#### `ontology_candidate.candidate_kind`
Allowed values:

- `concept`
- `relation`

#### `ontology_candidate.proposed_scope`
Allowed values:

- `repo`
- `company`
- `core`
- `unknown`

Default conservatively toward `repo` unless evidence already points outward.

#### `title`, `labels`, `synonyms`
- `title` is the clearest human-facing name
- `labels` capture preferred ontology labels under consideration
- `synonyms` are optional but useful for collision checks and recall

#### `proposed_id_hint`
Optional because the final id may change after review.

#### `confidence`
Use a `0..1` decimal describing confidence that the gap is real enough to stage.

#### `source`
Capture provenance when available:

- originating tool or workflow
- `self` memory id when present
- related session ids when known

#### `evidence_refs`
Keep references repo-local and inspectable.
Useful buckets:

- `files`
- `diary`
- `tasks`

#### `assessment`
This is a lightweight staging-time snapshot, not a full proposal report.
Include only what is already known, especially duplicate risk and nearby ontology entries worth checking later.

#### `next_step`
Allowed v1 values:

- `review`
- `merge`
- `plan`
- `reject`
- `defer`

Default on first write: `review`.

## Required body sections

Use this body layout:

```markdown
# Ontology Candidate — <Title>

## Why this candidate exists

## Proposed meaning

## Evidence

## Why existing ontology is insufficient

## Suggested next step

## Review notes
```

## Writer and review guardrails

### 1. Candidate artifacts are not ontology truth
They are staging records only.

### 2. No direct apply from candidate writing
A writer/helper may create or update a candidate artifact.
It may not jump directly to `ontology_change mode=apply`.

### 3. Keep staging repo-local
A candidate may recommend `company` or `core`, but it still stages here until explicit review chooses a broader action.

### 4. Preserve the original evidence trail
Later edits may add review notes or change state, but they should not erase why the candidate was staged.

### 5. Create candidate files lazily
This directory exists so the contract is stable and discoverable.
Actual candidate files should appear only when there is a truthful staged candidate.

### 6. Rejection is still useful state
Rejected candidates should retain their rejection reason so the repo does not rediscover the same bad ontology idea repeatedly.

## Relationship to adjacent repo surfaces

| Surface | Role |
|---|---|
| `diary/` | raw session capture and attributable working memory |
| `docs/project/` | cross-cutting design and status notes |
| `governance/ontology-candidates/` | durable candidate-only semantic staging |
| `ontology/` | governed semantic truth after explicit ontology workflow review and apply |

## Non-goals

This contract does **not** by itself:

- add a writer helper
- make `self` emit files automatically
- auto-promote candidates into ontology plans or applies
- turn this directory into a generic repo learning surface

## Bottom line

For repo-root ontology candidate staging in `pi-extensions`, use:

```text
governance/ontology-candidates/
```

Candidate artifacts live here as **durable, reviewable, non-authoritative semantic staging records** until explicit review decides whether ontology planning or promotion should happen.

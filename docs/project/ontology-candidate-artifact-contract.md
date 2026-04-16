---
summary: "Contract for repo-local ontology candidate artifacts in pi-extensions: where they stage, how they are named, what metadata they carry, and how they stay candidate-only until review."
read_when:
  - "Implementing or reviewing repo-local ontology candidate staging for self, ontology-workflows, or later helper seams."
  - "Before writing the first docs/learnings/ontology-candidates artifact in this repo."
type: "reference"
system4d:
  container: "Repo-root contract note for candidate-only ontology staging before governed ontology promotion."
  compass: "Keep semantic-gap capture durable and reviewable without turning repo-local notes into a shadow ontology authority."
  engine: "Choose the staging root -> freeze filename/schema rules -> define writer guardrails -> bind promotion boundaries."
  fog: "The main risks are scattering ontology candidates across roots, treating them as truth, or letting the first writer auto-promote beyond repo-local evidence."
---

# Contract — repo-local ontology candidate artifact staging

## Why this note exists

`docs/project/self-to-ontology-candidate-pipeline.md` established the **shape** of the pipeline:

- `self` notices repeated semantic pressure
- candidate-only staging preserves it durably
- proposal/runtime checks evaluate it
- explicit review decides whether ontology planning should happen

What was still missing was the smallest truthful **repo-local artifact contract**:

- the exact staging root
- why that root is the right one
- how a candidate file should be named
- what minimum metadata it should carry
- what a future writer helper is and is not allowed to do

This note freezes that contract before runtime wiring.

## Contract summary

| Surface | Decision |
|---|---|
| Candidate staging root | `docs/learnings/ontology-candidates/` |
| Artifact state | candidate-only, non-authoritative |
| Root creation model | lazy; create only when the first truthful artifact is emitted |
| Producers | operator-authored notes, future repo-local helper seams, or controlled candidate writers fed by `self` / proposal workflows |
| Consumers | explicit review, `ontology_proposal`, and later `ontology_change mode=plan` |
| Forbidden behavior | direct ontology apply, direct writes into `ontology/`, or treating candidate notes as ontology truth |

## Root decision

### Chosen root

Use:

```text
docs/learnings/ontology-candidates/
```

### Why this root is right

This root best matches the repo's existing semantics:

- `diary/` is already the raw-capture surface.
- `docs/project/` is where cross-cutting design and contract notes live.
- `docs/learnings/` is the natural candidate-only crystallization/staging surface.
- `ontology/` must remain governed semantic truth, not pre-truth speculation.

So the truthful path is:

```text
diary/ -> docs/learnings/ontology-candidates/ -> explicit review/proposal -> ontology_change plan/apply
```

### Why not `docs/project/`

`docs/project/` should hold reusable design notes such as this contract, not a growing pile of per-candidate semantic records.

### Why not `ontology/`

Candidate artifacts are not ontology truth. Putting them under `ontology/` would blur the line between:

- governed concepts/relations, and
- review-pending semantic hypotheses

### Why not pre-create the directory in this task

This task freezes the contract only.
The actual root should be created lazily by the future writer/helper when a real candidate needs to be staged.
That keeps the filesystem truthful and matches the existing KES pattern elsewhere in the monorepo.

## Path and filename contract

### Directory

All repo-local ontology candidate artifacts must live directly under:

```text
docs/learnings/ontology-candidates/
```

No nested subtrees are required for v1.

### Filename shape

Use:

```text
YYYY-MM-DD--candidate-<concept|relation>-<slug>.md
```

Examples:

```text
docs/learnings/ontology-candidates/2026-04-16--candidate-concept-benchmark-harness.md
docs/learnings/ontology-candidates/2026-04-16--candidate-relation-evaluates-benchmark.md
```

### Filename rules

- Date reflects first staging date, not every later edit.
- `concept|relation` names the candidate kind explicitly.
- `<slug>` comes from the human title, not the proposed ontology id.
- Do **not** encode scope or final ontology id into the filename; those can change after proposal review.
- If multiple artifacts with the same slug are staged on the same day, append `--2`, `--3`, etc.

## Candidate file contract

Every candidate artifact should use normal repo doc frontmatter plus a dedicated `ontology_candidate` block.

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
Future writers should bump only for real schema changes.

#### `ontology_candidate.state`
Allowed v1 values:

- `candidate`
- `deferred`
- `rejected`
- `planned`
- `promoted`

Default on first write: `candidate`.

#### `ontology_candidate.candidate_kind`
Must be one of:

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
- `title` is the clearest human-facing name.
- `labels` capture preferred ontology labels under consideration.
- `synonyms` are optional, but useful for collision checks and recall.

#### `proposed_id_hint`
Optional, because the final id may change after review/proposal assessment.

#### `confidence`
Use a `0..1` decimal.
This is confidence that the semantic gap is real enough to stage, not confidence that the candidate should definitely be promoted.

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
Include only what is already known, especially:

- duplicate risk
- nearby ontology entries worth checking later

#### `next_step`
Allowed v1 values:

- `review`
- `merge`
- `plan`
- `reject`
- `defer`

Default on first write: `review`.

## Required body sections

Frontmatter gives a compact machine-readable summary.
The markdown body carries the actual reviewable meaning.

Use this section layout:

```markdown
# Ontology Candidate — <Title>

## Why this candidate exists

## Proposed meaning

## Evidence

## Why existing ontology is insufficient

## Suggested next step

## Review notes
```

### Section intent

- **Why this candidate exists**: what repeated semantic pressure or operator instruction caused staging.
- **Proposed meaning**: the actual concept/relation definition in plain language.
- **Evidence**: concrete files, sessions, phrases, or review findings.
- **Why existing ontology is insufficient**: early collision/non-fit explanation.
- **Suggested next step**: what should happen now.
- **Review notes**: optional running notes from later review, defer, merge, or promotion decisions.

## Writer and review guardrails

### 1. Candidate artifacts are not ontology truth

They are a staging surface only.
They must never be mistaken for governed ontology state.

### 2. No direct apply from candidate writing

A writer/helper may create or update a candidate artifact.
It may not jump directly to `ontology_change mode=apply`.

### 3. Keep staging repo-local

V1 staging is repo-local by default.
A candidate may recommend `company` or `core`, but the artifact still stages in this repo until explicit review chooses a broader action.

### 4. Preserve the initial evidence trail

Later edits may add review notes or update state.
They should not erase the original evidence for why the candidate was staged.

### 5. Root creation is lazy

Do not create placeholder files or empty scaffolding just to satisfy the contract.
The first truthful candidate should materialize the root.

### 6. Rejection is still useful state

Rejected candidates should retain the rejection reason in the artifact and, where applicable, feed protection memory so the same bad ontology idea is not rediscovered repeatedly.

## Relationship to adjacent repo surfaces

| Surface | Role |
|---|---|
| `diary/` | raw session capture and attributable working memory |
| `docs/project/` | cross-cutting design/contract notes like this one |
| `docs/learnings/ontology-candidates/` | durable candidate-only semantic staging |
| `ontology/` | governed semantic truth after explicit ontology workflow review and apply |

## Immediate consequence

This task defines the contract only.
It does **not** yet:

- add a writer helper
- extend `self` to emit files automatically
- run proposal assessment automatically
- create `docs/learnings/ontology-candidates/`

Those are follow-on implementation tasks.

## Bottom line

For `pi-extensions`, the correct repo-local staging root for ontology candidates is:

```text
docs/learnings/ontology-candidates/
```

Candidate artifacts live there as **durable, reviewable, non-authoritative semantic staging records** until explicit review decides whether ontology planning or promotion should happen.

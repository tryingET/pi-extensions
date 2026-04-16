---
summary: "Decision note for rehoming repo-root ontology candidate staging from docs/learnings into governance/ontology-candidates/."
read_when:
  - "When older self-to-ontology docs mention docs/learnings/ontology-candidates/ and you need the current path."
  - "Before adding tooling or docs that write repo-root ontology candidate artifacts."
type: "reference"
system4d:
  container: "Repo-root transition note for the ontology candidate staging surface in pi-extensions."
  compass: "Retire the misleading docs/learnings root while preserving the bounded candidate-only ontology workflow."
  engine: "Compare the old path semantics -> choose the clearer home -> define compatibility and migration rules."
  fog: "The main risk is keeping a path that reads like a general root learning bus instead of a narrow semantic staging contract."
---

# Ontology candidate staging rehome

## Decision in one sentence

Repo-root ontology candidate artifacts now stage under:

```text
governance/ontology-candidates/
```

The earlier `docs/learnings/ontology-candidates/` path is retired.

## Why this rehome was needed

Task `#1421` originally froze a candidate-only ontology artifact contract under `docs/learnings/ontology-candidates/`.
That was a useful first boundary because it kept candidate artifacts out of `ontology/` and out of raw `diary/` capture.

But the later repo boundary work exposed a mismatch:

- repo root does **not** otherwise operate a general `docs/learnings/` surface
- package-owned learning/KES capture should stay package-owned
- a root `docs/learnings/` path reads too much like a generic monorepo learning bus
- ontology candidate staging is better modeled as an explicit repo-governance seam than as a general learning bucket

So the contract is now rehomed into a narrow governance subtree.

## What stays the same

The rehome does **not** widen the workflow.
These rules remain unchanged:

- candidate artifacts are still candidate-only and non-authoritative
- `self` still does not auto-write candidate files
- `ontology_proposal` is still the plan-only assessment surface
- explicit review still gates `ontology_change mode=plan` and later `mode=apply`
- the filename and frontmatter/body contract stay materially the same

In other words, the **boundary** stays the same; only the **home** becomes more truthful.

## What changes

## 1. Canonical path

Use:

```text
governance/ontology-candidates/
```

Do not create or revive:

```text
docs/learnings/ontology-candidates/
```

## 2. Canonical contract location

The operative staging contract now lives in:

- `governance/ontology-candidates/README.md`

This note explains the rehome decision.
Older docs may still mention the retired path when describing the initial landing; treat those mentions as historical unless they are explicitly updated.

## 3. Root creation model

The old contract preferred fully lazy root creation.
The rehomed contract instead keeps the directory present with a `README.md` so the governed staging home is discoverable.
Candidate files themselves remain lazy.

## Why `governance/` is the right root

### Against root `docs/learnings/`

A repo-root `docs/learnings/` tree would blur two different ideas:

- package-local learning capture and KES-like crystallization
- repo-root semantic candidate staging

This repo wants the second without implying the first.

### In favor of `governance/ontology-candidates/`

This root makes the intent explicit:

- repo-root
- narrow
- review-preserving
- governance-adjacent without being governed truth itself

It also fits the repo's other explicit root control-plane surfaces better than a new generic docs subtree.

### Against `ontology/`

`ontology/` is the truth surface after review and ontology workflow application.
Candidate artifacts are not truth yet.

### Against `docs/project/`

`docs/project/` should stay the place for design notes, decision records, and status synthesis.
Per-candidate staging artifacts should not accumulate there.

## Operating flow after the rehome

The intended flow is now:

```text
diary/ -> governance/ontology-candidates/ -> explicit review/proposal -> ontology_change plan/apply
```

## Migration rule for future work

When updating docs, tools, helpers, or examples:

1. point new references to `governance/ontology-candidates/`
2. do not create the retired `docs/learnings/ontology-candidates/` root
3. preserve historical notes only when they are explicitly describing the original landing
4. treat `governance/ontology-candidates/README.md` as the canonical artifact contract

## Non-goals

This task does **not**:

- add automatic writer tooling
- add automatic migration tooling for non-existent candidate files
- auto-promote candidate artifacts into ontology truth
- create a generic repo-root learning surface

## Bottom line

The ontology candidate pipeline remains narrow and review-preserving.
What changed is the filesystem truth:

```text
governance/ontology-candidates/
```

is now the explicit repo-root home for ontology candidate staging.

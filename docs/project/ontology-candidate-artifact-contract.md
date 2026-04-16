---
summary: "Historical background note for the first ontology candidate artifact contract; the operative staging root now lives under governance/ontology-candidates/."
read_when:
  - "You encounter older references to docs/learnings/ontology-candidates/ and need the current contract home."
  - "You want the original rationale behind separating candidate artifacts from ontology truth before reading the rehome note."
type: "reference"
system4d:
  container: "Repo-root historical contract note for the first ontology candidate staging decision in pi-extensions."
  compass: "Preserve why candidate staging exists while redirecting runtime-facing readers to the rehomed governance contract."
  engine: "Record the original v1 decision -> state the supersession clearly -> point readers at the active contract artifacts."
  fog: "The main risk is letting a historically useful note keep reading like the current authoritative filesystem contract."
---

# Historical note — first ontology candidate artifact contract

## Status

This note records the **initial v1 contract decision** that originally staged repo-root ontology candidates under:

```text
docs/learnings/ontology-candidates/
```

That path is now **retired**.

The current authoritative staging surface is:

```text
governance/ontology-candidates/
```

## Why keep this note

The original contract still matters as design history because it captured the first key boundary correctly:

- ontology candidates need a durable repo-local staging surface
- that staging surface must stay separate from `ontology/` truth
- candidate artifacts must remain review-preserving and non-authoritative

What changed later was not the bounded workflow, but the filesystem home.

## What supersedes this note

Use these files for current work:

- `governance/ontology-candidates/README.md` — canonical current staging contract
- `docs/project/ontology-candidate-staging-rehome.md` — why the path moved out of `docs/learnings/`
- `docs/project/self-to-ontology-candidate-pipeline.md` — current end-to-end pipeline design

## Bottom line

If you are creating, reviewing, or referencing a repo-root ontology candidate artifact today, do **not** use the original `docs/learnings/ontology-candidates/` path.
Use:

```text
governance/ontology-candidates/
```

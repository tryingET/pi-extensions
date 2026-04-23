---
summary: "Repo-local note for how pi-extensions uses the canonical AK decision runtime: decisions live in agent-kernel, while this repo records concern-local RFC/problem/evidence/review artifacts that feed AK legality."
read_when:
  - "You are reviewing or opening an architecture-significant concern in pi-extensions and need the truthful decision-runtime owner."
  - "A repo-local RFC review asks for docs/project/decision-runtime-and-roadmap.md and you need the local pointer instead of guessing."
type: "reference"
---

# Decision runtime and roadmap — `pi-extensions`

## Short answer

`pi-extensions` does **not** redefine the AK decision runtime locally.
The canonical runtime contract lives in:

- `/home/tryinget/ai-society/softwareco/owned/agent-kernel/docs/project/decision-runtime-and-roadmap.md`

Use that document as the source of truth for:

- what `ak decision` already owns
- what lifecycle artifacts are runtime-visible today
- what blocks ADR legality versus what only blocks later execution tracking

## Repo-local interpretation

For `pi-extensions`, the practical split is:

- this repo owns concern-local RFC/problem/evidence/review/plan/validation artifacts
- AK owns the canonical decision row, legal review closure, and decision passport truth

So when a `pi-extensions` concern changes any of the standard Tier 1 decision triggers, prefer:

1. write or revise the repo-local artifact chain here
2. attach those artifacts to an AK decision
3. inspect legality through `ak decision passport <id>`

## Concern front-door rule

Open an `ak decision` first when the concern changes any of these:

- authority boundary
- canonical source of truth
- lifecycle legality
- default workflow behavior
- architecture-significant packet/contract shape

If the concern is only bounded package execution work after those facts are already accepted, use normal AK task execution instead.

## Bottom line

For architecture-significant `pi-extensions` work, this repo provides the documents.
AK provides the canonical decision runtime.

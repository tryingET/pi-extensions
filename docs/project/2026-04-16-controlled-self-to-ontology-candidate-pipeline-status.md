---
summary: "Implementation status and verification note for the bounded self-to-ontology candidate pipeline landed through AK umbrella task 1412."
read_when:
  - "You need the exact answer to what umbrella task #1412 did and did not implement."
  - "Before claiming the self-to-ontology candidate pipeline is fully automatic end to end."
type: "reference"
system4d:
  container: "Repo-root status note binding the cross-package self/ontology candidate pipeline slice after the child tasks landed."
  compass: "Freeze the smallest truthful statement of what now exists across self memory, ontology proposal assessment, and repo-local candidate staging."
  engine: "Bind child-task outputs -> describe the bounded operator workflow now supported -> record verification -> mark remaining non-goals."
  fog: "The main risk is overstating the slice as a fully auto-wired pipeline when the current landing is intentionally bounded to candidate memory, proposal assessment, and artifact contract definition."
---

# 2026-04-16 — Controlled self-to-ontology candidate pipeline status

## Why this note exists

AK umbrella task `#1412` — `Implement controlled self-to-ontology candidate pipeline` — depended on three narrower slices:

- `#1415` — add ontology proposal/check runtime to `pi-ontology-workflows`
- `#1418` — extend `self` with ontology-candidate memory and query intents
- `#1421` — define repo-local ontology candidate artifact contract and staging root

Those child tasks are now landed.
This note records the exact bounded reality of the umbrella so later sessions do not confuse:

- a truthful first implementation slice, with
- a fully automatic end-to-end promotion pipeline that has **not** been built.

## What is now implemented

## 1. `self` can crystallize ontology candidates

In `packages/pi-autonomous-session-control`, the `self` tool now supports candidate-only ontology memory, including:

- `Remember ontology candidate: ...`
- `What ontology candidates have I crystallized?`
- `Mark ontology candidate as rejected`
- `Forget ontology candidate`

The new memory type is persisted in the same bounded self-memory family as other crystallization/protection state, so candidate state survives extension re-registration.

## 2. `ontology_proposal` can assess a candidate before any ontology mutation

In `packages/pi-ontology-workflows`, the `ontology_proposal` tool now performs plan-only candidate assessment:

- collision / nearest-existing checks
- scope recommendation
- id suggestion
- verdict classification
- plan-ready `ontology_change` payload emission when appropriate

This is deliberately **assessment only**.
It does not apply ontology changes.

## 3. Repo-local candidate artifact staging is contract-bound

At the repo level, the candidate artifact contract is now frozen:

- staging root: `docs/learnings/ontology-candidates/`
- state: candidate-only, non-authoritative
- root creation: lazy
- file naming: `YYYY-MM-DD--candidate-<concept|relation>-<slug>.md`
- metadata/body schema: defined in `docs/project/ontology-candidate-artifact-contract.md`

This means later writers/helpers now have one truthful answer for where ontology-candidate artifacts belong and how they must be shaped.

## Bounded operator workflow now supported

The current landing enables this **controlled** workflow:

1. use `self` to crystallize a repeated semantic gap as an ontology candidate
2. inspect or recall the staged candidate memory
3. use `ontology_proposal` to assess whether ontology is even the right tool, and if so what scope/id/plan shape fits
4. if a durable repo artifact is warranted, stage it under `docs/learnings/ontology-candidates/` using the repo contract
5. only after explicit review, move to `ontology_change mode=plan` and later `mode=apply`

That is a real pipeline.
But it is a **bounded, review-preserving** one.

## What is deliberately not implemented by this umbrella

To avoid false confidence, task `#1412` should **not** be read as having landed any of the following:

- automatic file emission from `self` into `docs/learnings/ontology-candidates/`
- direct `self -> ontology_change mode=apply`
- automatic promotion from candidate artifact to ontology plan/apply
- an orchestrated review loop that merges, defers, or promotes candidates automatically

Those remain future follow-on work if the repo later decides the extra automation is worth the additional boundary surface.

## Child-task mapping

| Task | Commit | Landed surface |
|---|---|---|
| `#1415` | `3643e0d` | `ontology_proposal` runtime/tool + proposal tests |
| `#1418` | `867e083` | `self` ontology-candidate memory, intents, persistence, and tests |
| `#1421` | `5147b17` | repo-local ontology-candidate artifact contract + diary |

## Verification for umbrella closure

The umbrella was re-verified at the package/root level with:

```bash
cd packages/pi-ontology-workflows && npm run check
cd packages/pi-ontology-workflows && node --import tsx --test tests/proposal.test.ts tests/extension.test.ts
cd packages/pi-autonomous-session-control && npm run check
cd packages/pi-autonomous-session-control && node --test tests/self/ontology-candidate.test.mjs tests/self/crystallization.test.mjs tests/self/registration.test.mjs
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs <temp-copy-root> --strict
```

The docs validation is intentionally scoped to the new umbrella-closure artifacts because the repo has unrelated pre-existing strict-docs failures outside this task.

## Bottom line

`#1412` is complete when read as the bounded first landing of a controlled self-to-ontology candidate pipeline:

- candidate-only ontology memory exists
- plan-only ontology proposal assessment exists
- repo-local candidate artifact staging has a frozen contract

What still does **not** exist is an automatic promotion path.
That boundary is intentional.

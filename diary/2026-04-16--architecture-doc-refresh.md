---
summary: "Session diary for refreshing pi-autoresearch and self-to-ontology docs after the runtime-owner and federated-learning architecture corrections."
read_when:
  - "Reviewing why the older pi-autoresearch and self-to-ontology docs were updated on 2026-04-16."
  - "Checking how the refreshed docs align with the architecture-correction and federated-learning notes."
system4d:
  container: "Repo-root diary capture for AK task #1468 in the pi-extensions monorepo."
  compass: "Bring older design/status docs back into alignment with the corrected runtime-owner split and the federated learning boundary."
  engine: "Read the newer correction notes -> patch the older canonical docs -> validate the touched docs only -> commit the scoped refresh."
  fog: "The main risks were leaving the Prompt Vault router over-centralized in pi-autoresearch docs or letting the self-to-ontology design read like a monorepo-global KES surface."
---

# Session diary — architecture doc refresh

## Goal

Refresh the older canonical docs so they match the revised architecture already captured in newer notes.

- task: `#1468` — `Refresh existing pi-autoresearch and self-to-ontology docs to match the revised architecture`
- scope: `docs/project/**` plus this diary note

## Inputs read

- `docs/project/pi-autoresearch-foundation-status.md`
- `docs/project/pi-autoresearch-rfc.md`
- `docs/project/self-to-ontology-candidate-pipeline.md`
- `docs/project/pi-autoresearch-architecture-correction.md`
- `docs/project/federated-learning-and-kes-boundaries.md`
- `docs/project/2026-04-16-controlled-self-to-ontology-candidate-pipeline-status.md`
- `docs/project/ontology-candidate-artifact-contract.md`
- `packages/pi-autoresearch/README.md`

## Refresh applied

### 1. `pi-autoresearch` docs

Updated the older status/RFC docs so they now say clearly:

- executable experiment-loop state belongs in the package, not in AK rows or Prompt Vault routers
- the next truthful runtime slice is a package-local state machine around the bounded helpers
- Prompt Vault's current durable minimum is the three one-shot procedures (`setup`, `next-hypothesis`, `finalize`)
- the drafted state router is now an optional later surface, not the near-term runtime blocker
- AK remains the later owner of campaign identity, scope, and durable evidence truth

### 2. `self` to ontology doc

Updated the design note so it now says clearly:

- the first bounded slice is already landed
- `self` now has ontology-candidate memory
- `ontology_proposal` now exists as the plan-only assessment tool
- repo-root `docs/learnings/ontology-candidates/` is a narrow ontology-specific staging surface
- that root borrows KES-like discipline without becoming a monorepo-global learning bus
- automatic file emission and automatic promotion are still intentionally out of scope

## Files changed

- `docs/project/pi-autoresearch-foundation-status.md`
- `docs/project/pi-autoresearch-rfc.md`
- `docs/project/self-to-ontology-candidate-pipeline.md`
- `diary/2026-04-16--architecture-doc-refresh.md`

## Verification plan

Validate only the touched docs with strict docs-list validation, then commit only the scoped task files because the working tree already contains unrelated changes outside this task.

---
summary: "Session diary for drafting the pi-autoresearch problem description and root-level RFC after the initial integration analysis."
read_when:
  - "Reviewing how the problem statement and RFC were derived from the earlier integration analysis."
  - "Looking for the exact framing decisions behind the proposed packages/pi-autoresearch direction."
system4d:
  container: "Repo-root diary capture for the pi-autoresearch boundary-definition follow-up."
  compass: "Turn the earlier analysis into explicit problem and decision documents without overcommitting implementation details."
  engine: "Restate the real gap -> bind constraints from current owners -> choose a root-level RFC direction and first slices."
  fog: "The main risk is skipping from prototype enthusiasm to package implementation without a shared problem statement and boundary decision."
---

# Session diary — pi-autoresearch problem description and RFC

## Goal
Follow the earlier integration analysis by drafting:

1. a problem description for the missing experiment-loop capability in `pi-extensions`
2. a root-level RFC choosing the package shape and authority split

## AK context
- task: `#1361` — `Draft pi-autoresearch problem description and RFC`

## Inputs used
- `docs/project/pi-autoresearch-integration-analysis.md`
- `docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`
- `packages/pi-vault-client/docs/project/2026-04-09-rfc-non-ui-prompt-plane-and-continuation-contract.md`

## Outputs written
- `docs/project/pi-autoresearch-problem-description.md`
- `docs/project/pi-autoresearch-rfc.md`

## Main framing decisions

### Problem framing
The real problem is not merely “we want autoresearch.”
It is:

- we want the capability proven by upstream `pi-autoresearch`
- but we do not currently have a truthful ecosystem-native home for it
- because it crosses AK, Prompt Vault, ontology, runtime, and shared UX boundaries

### RFC decision
Chosen direction:

- create `packages/pi-autoresearch`
- keep `/autoresearch` as the operator affordance
- treat the package as a governed experiment-loop capability
- keep local JSONL/MD/script artifacts as receipt/projection surfaces
- route campaign truth to AK
- route control-plane prompts to Prompt Vault
- route semantics to ontology/ROCS
- align lifecycle behavior with existing runtime owners instead of recreating a second runtime-control plane

### Explicit rejections
Rejected as-is:

- wholesale import of the upstream monolith
- local files as sole authority
- broad git defaults
- package-local prompt prose as the primary control plane

## Validation note
I reran the repo docs strict listing after adding the docs. The repo still has pre-existing unrelated strict-metadata failures, but the new docs include frontmatter and `read_when` metadata.

## Outcome
The earlier analysis is now followed by:

- a problem statement saying what the real gap is
- an RFC saying what package/authority shape we should pursue

The next truthful follow-ons are:
1. ontology concept inventory
2. Prompt Vault template inventory
3. package scaffold for `packages/pi-autoresearch`

---
summary: "Short explanation of what the pi-extensions monorepo is for."
read_when:
  - "You want the shortest truthful explanation of why these extensions exist."
---

# pi-extensions — terse

## What this repo is

A monorepo of Pi extensions that turn raw Pi host/runtime capabilities into operator-usable tools.

## What the extensions essentially do

They make hidden or awkward Pi capabilities visible and actionable:

- inspect live session/context state
- improve interaction and command/prompt workflows
- add bounded operator helpers
- expose vault, ontology, and society workflows inside Pi
- harden autonomous/subagent execution paths

## Why they must exist

Because the base Pi host gives primitives, not the full operator surfaces needed for daily work.

These packages exist to provide:

- reusable commands instead of one-off local hacks
- tested seams instead of copied ad-hoc glue
- operator-visible truth for context, routing, vault state, and execution status
- a place to absorb host drift without bloating Pi core

## Why this is a monorepo

The packages share compatibility, release, and validation concerns, but still need separate seams and ownership.

## For outsiders

This repo is still useful without Prompt Vault, society DB, or the rest of the internal stack.

Prompt Vault, society workflows, and company-specific routing are optional add-ons, not prerequisites for the whole repo.

## Package map

| Package | Standalone usable? | Essentially does | Notes |
|---|---|---|---|
| `pi-context-overlay` | yes | inspect current session context | good outsider entry point |
| `pi-activity-strip` | yes | show live session/activity strip UI | local desktop/window-manager assumptions may apply |
| `pi-little-helpers` | yes | add small operator helpers | general-purpose utility package |
| `pi-provenance` | yes | extract minimal Pi session/assistant-message provenance | source-owned provider/model/API refs for downstream evidence writers |
| `pi-autonomous-session-control` | yes | provide autonomy/subagent control surfaces | strongest in subagent-heavy workflows |
| `pi-autoresearch` | with extra setup | own the bounded experiment-loop runtime and manifest-campaign control seam | strongest when local campaign receipts and AK/Prompt Vault adjacencies are in play |
| `pi-prompt-template-accelerator` | yes | speed up prompt-template command workflows | picker/prefill UX only |
| `pi-prompt-template-execution` | yes | own prompt-template execution semantics | live successor for external `pi-prompt-template-model`; owns `/commit` extension execution semantics through a minimal guarded entrypoint, with no prompt bundle and no loop/chain/subagent runtime |
| `pi-session-compaction` | yes | own custom compaction summaries | live local `session_before_compact` owner after guarded cutover; handler and fail-closed registration guard are tested, branch augmentation helpers remain non-live |
| `pi-toolbox-discovery` | yes | discover and activate custom-tool bundles on demand | keeps `self`, `interview`, and `toolbox` small/active while heavy package tools stay latent |
| `pi-interaction/pi-interaction` | yes | shared interaction features | host-facing interaction layer |
| `pi-interaction/pi-editor-registry` | yes | provide editor integration seams | lower-level building block |
| `pi-interaction/pi-interaction-kit` | yes | provide reusable interaction helpers | lower-level building block |
| `pi-interaction/pi-runtime-registry` | yes | provide runtime ownership/registry seams | lower-level building block |
| `pi-interaction/pi-trigger-adapter` | yes | provide trigger plumbing for extension commands | lower-level building block |
| `pi-vault-client` | with extra stack | provide governed prompt/vault workflows | strongest with Prompt Vault + company context |
| `pi-ontology-workflows` | with extra setup | provide ontology inspection/change workflows | wants ontology/ROCS setup |
| `pi-society-orchestrator` | with extra stack | run bounded society/loop workflows | wants society/runtime surfaces |

For live release-component inventory, run `node ./scripts/release-components.mjs list --json`.

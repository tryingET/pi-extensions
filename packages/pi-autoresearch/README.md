---
summary: "Overview and quickstart for monorepo package @tryinget/pi-autoresearch."
read_when:
  - "Starting work in this package workspace."
  - "Looking for the current pi-autoresearch package surface and boundary."
system4d:
  container: "Monorepo package for the governed pi-autoresearch experiment-loop capability."
  compass: "Keep the operator affordance obvious while preserving explicit boundaries to Prompt Vault, AK, and ontology."
  engine: "Scaffold the package shell -> land the bounded runtime kernel -> bind upstream control planes later."
  fog: "The main risk is recreating the upstream monolith before the package seams are explicit and tested."
---

# @tryinget/pi-autoresearch

Monorepo package for the governed `pi-autoresearch` capability in Pi.

- Workspace path: `packages/pi-autoresearch`
- Release component key: `pi-autoresearch`
- Extension entry: `extensions/pi-autoresearch.ts`
- Current phase: `live_supervised_target_control_plane`
- Current-vs-target anchor: [docs/project/current-vs-target.md](./docs/project/current-vs-target.md)

## Why this package exists

This package is the local runtime home for the future `pi-autoresearch` experiment loop described in:

- [pi-autoresearch RFC](../../docs/project/pi-autoresearch-rfc.md)
- [pi-autoresearch foundation status](../../docs/project/pi-autoresearch-foundation-status.md)
- [pi-autoresearch architecture correction](../../docs/project/pi-autoresearch-architecture-correction.md)
- [pi-autoresearch runtime machine and event-ledger status](../../docs/project/2026-04-16-pi-autoresearch-runtime-machine-and-ledger-status.md)
- [Prompt Vault template set](../../docs/project/pi-autoresearch-prompt-vault-template-set.md)
- [Prompt Vault rollout](../../docs/project/pi-autoresearch-prompt-vault-rollout.md)
- [Ontology concept set](../../docs/project/pi-autoresearch-ontology-concept-set.md)

The package started as a small shell and still preserves the recognizable `/autoresearch` operator surface while avoiding a premature re-import of the upstream monolith.
The current boundary is now more specific: the package is the runtime owner for the executable experiment-loop machine, while AK and Prompt Vault remain separate durable-truth owners.

## Current public surface

### Command

- `/autoresearch`
  - opens the bounded runtime overview
  - names the current boundary honestly
  - points to the current bounded implementation posture without inventing future slices

### Tools

- `autoresearch_runtime_status`
  - returns the current bounded-runtime status
  - surfaces receipt summaries, machine projection, event-ledger state, current one-shot Prompt Vault alignment, and the current llama.cpp manifest-campaign projection state when one has been projected locally
- `autoresearch_runtime_run`
  - executes one bounded local benchmark/check run
  - bootstraps config receipts when needed
  - appends config/run receipts to `autoresearch.jsonl`
  - appends machine/event entries to `autoresearch.events.jsonl`
- `autoresearch_llamacpp_campaign`
  - loads a typed llama.cpp benchmark campaign manifest
  - expands the exact brownfield `phasee/41-43` branch/lane matrix without re-deriving it from chat prose
  - plans or applies fork workspace preparation for later patch transplant work under `../../fork/`
  - plans or applies one exact stage-scoped `41 | 42 | 43` invocation against the existing workstation scripts
  - writes or refreshes one checked `autoresearch.llamacpp-campaign.json` projection artifact for bounded runtime/help use
  - derives one exact-task AK-ready binding snapshot through `action=build_ak_binding` without mutating AK directly
  - derives or applies exactly one truthful next campaign-local stage step through `action=advance_campaign`
  - does **not** become a public campaign-control surface, a whole-campaign runner, or a replacement for workstation execution ownership

### Runtime helpers

- `src/core/runtime.ts`
  - local receipt-entry types for config and run events
  - structured `METRIC name=value` parsing
  - bounded benchmark/check execution helpers
  - runtime status/help rendering that now integrates receipt summaries with machine/ledger projection plus the current llama.cpp campaign projection state
- `src/core/llamacppCampaign.ts`
  - typed llama.cpp benchmark campaign manifest model
  - explicit `phasee/41-43` stage matrix expansion
  - fork workspace planning/apply helpers with fail-closed git checks
  - stage-scoped execution binding for one exact `41 | 42 | 43` invocation with prerequisite fencing
  - projection artifact derivation, persistence, and refresh logic for `autoresearch.llamacpp-campaign.json`
  - non-mutating AK-binding snapshot + compact details derivation for exact manifest/task anchors
  - campaign-local autonomy snapshot + one-step advance helper for truthful next-step selection without widening into whole-campaign execution
- `src/core/ledger.ts`
  - append-only event-ledger entry types and JSONL helpers
  - ledger replay/projector helpers for the campaign machine
  - replay validation plus receipt-history backfill support for the bounded runtime surface
- `src/machine/events.ts`
  - typed campaign event model for configuration, run execution, receipt recording, decision points, blocking, and completion
- `src/machine/campaign.ts`
  - minimal package-local XState campaign machine for the bounded experiment runtime
  - runtime-status hydration helper for mapping the current bounded status into machine input
- `src/runtime.ts`
  - compatibility re-export for the core runtime surface plus the campaign machine/event model

## Local artifact contract

The bounded runtime kernel now uses the same local artifact plan the shell originally named:

- `autoresearch.jsonl`
- `autoresearch.llamacpp-campaign.json`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.ideas.md`

These stay **local receipts/projections**, not sole campaign truth.

## Prompt Vault alignment

Prompt Vault now already owns three durable one-shot control-plane templates for the capability:

- `pi-autoresearch-setup`
- `pi-autoresearch-next-hypothesis`
- `pi-autoresearch-finalize`

The earlier `pi-autoresearch-state-router` draft still exists as a possible later surface.
But after the architecture correction, it is no longer the main near-term blocker for truthful runtime evolution.
The package now includes a minimal internal XState campaign machine, typed event model, append-only event ledger, one bounded post-target widening surface for manifest-driven llama.cpp benchmark planning/fork preparation, one bounded follow-on surface for stage-scoped `41 | 42 | 43` execution binding, one projection-only `autoresearch.llamacpp-campaign.json` layer for bounded manifest campaign status/help truth, one non-mutating AK-ready manifest-campaign binding helper layer for exact manifest/task anchors, and one bounded campaign-local autonomy helper layer for truthful one-step stage advancement.

The AK-binding slice is now landed and closed in:
- [docs/project/llamacpp-campaign-ak-binding-contract.md](./docs/project/llamacpp-campaign-ak-binding-contract.md)
- [docs/project/llamacpp-campaign-ak-binding-status.md](./docs/project/llamacpp-campaign-ak-binding-status.md)

The campaign-local autonomy slice is now landed and closed in:
- [docs/project/llamacpp-campaign-autonomy-contract.md](./docs/project/llamacpp-campaign-autonomy-contract.md)
- [docs/project/llamacpp-campaign-autonomy-status.md](./docs/project/llamacpp-campaign-autonomy-status.md)

Interpretation rule:
- Prompt Vault owns durable decision procedures
- the package owns executable runtime state and may derive compact AK-ready snapshots plus one bounded next-step autonomy view for explicit callers
- AK still owns durable campaign truth, evidence writes, and any later task completion decision
- the later public campaign-control surface remains a separate follow-on above this bounded helper layer

## Current non-goals

This package does **not** yet implement:

- direct AK writes, fuzzy task lookup, or automatic task completion for the new llama.cpp campaign manifests
- direct execution of manifest-driven 41/42/43 campaigns end to end
- semantic interpretation of manifest-stage payloads into benchmark winners, recommendations, or completion truth
- a public operator campaign-control surface or whole-campaign autonomous lifecycle for the new manifest-driven workflow
- shared higher-order session-control orchestration
- a second control plane that duplicates workstation `lane-op` or the brownfield 41/42/43 scripts

The package now includes the bounded runtime's machine/event-ledger integration, but the broader control-plane and autonomy integrations still belong to later bounded slices after the bounded runtime kernel.
Use [docs/project/current-vs-target.md](./docs/project/current-vs-target.md) as the living package-local map for what is landed vs what still belongs to future verified slices.

## Example manifest

- `examples/llamacpp-wave-001.json` — scaffold for the typed llama.cpp benchmark campaign surface including build-bin / receipt-root execution-binding fields

## Validation

Run from this package directory:

```bash
npm install
npm run check
npm run release:check:quick
```

## Package boundary reminder

This package owns the **local experiment runtime seam** and the future executable experiment-loop machine.
It does **not** own:

- Prompt Vault control-plane truth
- AK campaign truth
- ontology semantics
- shared higher-order session-control lifecycle

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
- Current phase: `bounded_runtime_kernel`
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
  - points to the next bounded implementation slices

### Tools

- `autoresearch_runtime_status`
  - returns the current bounded-runtime status
  - surfaces receipt summaries, machine projection, event-ledger state, and current one-shot Prompt Vault alignment
- `autoresearch_runtime_run`
  - executes one bounded local benchmark/check run
  - bootstraps config receipts when needed
  - appends config/run receipts to `autoresearch.jsonl`
  - appends machine/event entries to `autoresearch.events.jsonl`

### Runtime helpers

- `src/core/runtime.ts`
  - local receipt-entry types for config and run events
  - structured `METRIC name=value` parsing
  - bounded benchmark/check execution helpers
  - runtime status/help rendering that now integrates receipt summaries with machine/ledger projection
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
The package now includes a minimal internal XState campaign machine, typed event model, and append-only event ledger; the machine is wired into the current bounded runtime surfaces, and the next bounded slices are AK binding plus machine-invoked Prompt Vault decision steps.

Interpretation rule:
- Prompt Vault owns durable decision procedures
- the package owns executable runtime state
- AK will own durable campaign truth when the binding slice lands

## Current non-goals

This package does **not** yet implement:

- AK campaign binding
- machine-invoked Prompt Vault decision steps
- finalization branch creation
- autonomous resume/loop lifecycle
- shared higher-order session-control orchestration
- an explicit operator-facing decision surface above the current automatic iterate-bridging used by the bounded run tool

The package now includes the bounded runtime's machine/event-ledger integration, but the broader control-plane and autonomy integrations still belong to later bounded slices after the bounded runtime kernel.
Use [docs/project/current-vs-target.md](./docs/project/current-vs-target.md) as the living package-local map for what is landed vs what still belongs to future verified slices.

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

---
summary: "Umbrella status note for the first pi-autoresearch prompt/control-plane and package-foundation slices."
read_when:
  - "You need the shortest truthful summary of what actually landed for pi-autoresearch so far."
  - "You are deciding the next implementation slice after the first prompt/control-plane and package-foundation work."
system4d:
  container: "Root-level umbrella status note for the pi-autoresearch foundation inside the pi-extensions monorepo."
  compass: "State what is now real, what remains blocked, and which surfaces own each kind of truth."
  engine: "Summarize landed slices -> map current operator/package/control-plane surfaces -> name the next bounded gaps."
  fog: "The main risk is speaking as if prompt routing, AK binding, or autonomous loop control already exist when they do not."
---

# `pi-autoresearch` foundation status

This note summarizes the first **prompt/control-plane and package-foundation** umbrella for `pi-autoresearch`.

It is the shortest truthful answer to:

- what landed already
- what the operator can actually use now
- what is still blocked or explicitly out of scope

## Landed slices

### 1. Prompt Vault template design

The first governed Prompt Vault template set was drafted in:

- `docs/project/pi-autoresearch-prompt-vault-template-set.md`

That template set defined four intended control-plane surfaces:

1. `pi-autoresearch-setup`
2. `pi-autoresearch-next-hypothesis`
3. `pi-autoresearch-finalize`
4. `pi-autoresearch-state-router`

### 2. Prompt Vault rollout

The first live rollout was executed and recorded in:

- `docs/project/pi-autoresearch-prompt-vault-rollout.md`

What actually landed in Prompt Vault:

- `pi-autoresearch-setup`
- `pi-autoresearch-next-hypothesis`
- `pi-autoresearch-finalize`

What did not land:

- `pi-autoresearch-state-router`

Current interpretation:
The router draft still needs governed vocabulary expansion before it can be inserted truthfully.
But after the architecture correction, that router is no longer the main blocker for truthful runtime evolution.
The current durable Prompt Vault minimum is the three one-shot procedures above; revisit a governed router later only if a real shared routing need remains after the package-local state-machine + AK split lands.

### 3. Package scaffold

The package scaffold exists at:

- `packages/pi-autoresearch`

That package established the local runtime home for the capability and preserved the recognizable `/autoresearch` operator surface.

### 4. Bounded runtime kernel

The package now includes a bounded local runtime kernel centered on:

- `packages/pi-autoresearch/src/core/runtime.ts`
- `packages/pi-autoresearch/extensions/pi-autoresearch.ts`

This means the package is no longer only a shell placeholder.

### 5. Architecture correction / runtime-owner clarification

The next architecture lock is recorded in:

- `docs/project/pi-autoresearch-architecture-correction.md`

That note clarifies that executable experiment-loop state should live in a **package-local state machine** (planned as an XState runtime) and that the earlier Prompt Vault router draft is now an optional later decision surface rather than the primary runtime owner.

## What is usable now

### Command

- `/autoresearch`
  - opens the bounded-runtime overview
  - explains the current boundary honestly

### Tools

- `autoresearch_runtime_status`
  - inspects the local bounded runtime state
  - reports current-segment baseline / best / confidence summaries
  - surfaces the current one-shot Prompt Vault alignment and the corrected optional-router posture

- `autoresearch_runtime_run`
  - executes one bounded local benchmark/check run
  - can bootstrap a config receipt when needed
  - appends config/run receipts to `autoresearch.jsonl`

### Local receipt/runtime behavior

The package now truthfully owns:

- append-only local JSONL receipts
- benchmark execution
- checks execution
- structured `METRIC name=value` parsing
- current-segment baseline / best / confidence summaries
- bounded local status/help surfaces

These remain **local receipts/projections**, not sole campaign truth.

## What does not exist yet

The following are still not part of the landed foundation:

- an explicit package-local state machine above the bounded helpers
- AK task/campaign binding
- machine-invoked Prompt Vault decision steps
- autonomous resume / loop lifecycle
- safer finalization path orchestration
- broader shared UX integration

A governed Prompt Vault router is now an optional later follow-on, not the near-term prerequisite for truthful runtime evolution.

## Authority split

### Package owns

- bounded local runtime execution helpers today
- the executable experiment-loop state machine once the next package-local state-machine slice lands
- local receipts and status summaries
- the immediate operator/package seam

### Prompt Vault owns

- durable one-shot prompt content for setup / next-hypothesis / finalize

### AK will own when bound

- campaign identity
- scope
- durable evidence/result references

### Optional later

- governed state-router work only if a real shared routing need remains after the package + AK + one-shot Prompt Vault split

## Current recommended next slices

In order:

1. introduce a minimal package-local state machine around the bounded helpers
2. bind campaign identity / scope / durable evidence truthfully through AK
3. connect setup / next-hypothesis / finalize as explicit machine-invoked Prompt Vault steps
4. narrow the safer finalization path on top of the machine + AK split
5. connect deeper shared UX surfaces only after the control-plane split remains honest
6. revisit a governed router only if later evidence shows it still adds value

## Canonical artifacts for this umbrella

- `docs/project/pi-autoresearch-rfc.md`
- `docs/project/pi-autoresearch-architecture-correction.md`
- `docs/project/pi-autoresearch-prompt-vault-template-set.md`
- `docs/project/pi-autoresearch-prompt-vault-rollout.md`
- `packages/pi-autoresearch/README.md`
- `packages/pi-autoresearch/src/core/runtime.ts`
- `packages/pi-autoresearch/tests/runtime.test.ts`

## Bottom line

`pi-autoresearch` now has a real first foundation in this repo:

- governed one-shot Prompt Vault control-plane templates for setup / next-hypothesis / finalization
- a real package home in `packages/pi-autoresearch`
- a bounded local runtime kernel with receipt-backed benchmark/check execution
- a corrected ownership split that keeps executable runtime state in the package rather than in AK rows or Prompt Vault routers

But it still does **not** have the next package-local state machine layer, AK binding, machine-invoked Prompt Vault decisions, or the full autonomous experiment-loop control plane.
That remains the truthful boundary.

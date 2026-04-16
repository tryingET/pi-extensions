---
summary: "Overview and quickstart for monorepo package @tryinget/pi-autoresearch."
read_when:
  - "Starting work in this package workspace."
  - "Looking for the current pi-autoresearch package surface and boundary."
system4d:
  container: "Monorepo package for the governed pi-autoresearch experiment-loop capability."
  compass: "Keep the operator affordance obvious while preserving explicit boundaries to Prompt Vault, AK, and ontology."
  engine: "Scaffold the package shell -> prove the local receipt/runtime seam -> grow the bounded runtime kernel later."
  fog: "The main risk is recreating the upstream monolith before the package seams are explicit and tested."
---

# @tryinget/pi-autoresearch

Monorepo package for the governed `pi-autoresearch` capability in Pi.

- Workspace path: `packages/pi-autoresearch`
- Release component key: `pi-autoresearch`
- Extension entry: `extensions/pi-autoresearch.ts`
- Current phase: `package_shell`

## Why this package exists

This package is the local runtime home for the future `pi-autoresearch` experiment loop described in:

- [pi-autoresearch RFC](../../docs/project/pi-autoresearch-rfc.md)
- [Prompt Vault template set](../../docs/project/pi-autoresearch-prompt-vault-template-set.md)
- [Prompt Vault rollout](../../docs/project/pi-autoresearch-prompt-vault-rollout.md)
- [Ontology concept set](../../docs/project/pi-autoresearch-ontology-concept-set.md)

The shell intentionally starts small.
It preserves the recognizable `/autoresearch` operator surface while avoiding a premature re-import of the upstream monolith.

## Current public surface

### Command

- `/autoresearch`
  - opens the package shell overview
  - names the current boundary honestly
  - points to the next bounded implementation slices

### Tool

- `autoresearch_runtime_status`
  - returns the current scaffold/runtime status
  - surfaces the local artifact contract and Prompt Vault alignment
  - is intentionally lightweight until the runtime kernel exists

### Runtime helpers

- `src/runtime.ts`
  - local receipt-entry types for config and run events
  - structured `METRIC name=value` parsing
  - scaffold-status and help-text helpers used by the extension and tests

## Local artifact contract

The package shell already names the local artifact plan that later runtime work should honor:

- `autoresearch.jsonl`
- `autoresearch.md`
- `autoresearch.sh`
- `autoresearch.checks.sh`
- `autoresearch.ideas.md`

These stay **local receipts/projections**, not sole campaign truth.

## Prompt Vault alignment

Prompt Vault now already owns three durable control-plane templates for the capability:

- `pi-autoresearch-setup`
- `pi-autoresearch-next-hypothesis`
- `pi-autoresearch-finalize`

The state router remains blocked until governed router vocabulary expands truthfully.
This package shell therefore avoids claiming a router or loop-control surface it cannot yet back with the right control-plane contract.

## Current non-goals

This shell does **not** yet implement:

- benchmark execution
- checks execution
- JSONL append/write to disk
- confidence scoring
- AK campaign binding
- finalization branch creation
- autonomous resume/loop lifecycle

Those belong to later bounded slices after the shell is in place.

## Validation

Run from this package directory:

```bash
npm install
npm run check
npm run release:check:quick
```

## Package boundary reminder

This package owns the **local experiment runtime seam** only.
It does **not** own:

- Prompt Vault control-plane truth
- AK campaign truth
- ontology semantics
- shared higher-order session-control lifecycle

---
summary: "Proposed canonical package topology and root-owned package quality gate for the pi-extensions monorepo."
read_when:
  - "Deciding whether a new extension should be a simple package or a package-group."
  - "Refactoring package-local quality gates into a root-owned implementation."
  - "Updating pi-extensions-template to match monorepo package topology."
system4d:
  container: "Monorepo package architecture decision proposal."
  compass: "Keep package topology explicit and package validation centralized."
  engine: "Choose package shape -> validate through one root gate -> keep package wrappers thin."
  fog: "The main risk is mixing repository-shape language with package-topology language and encoding the wrong distinction in tooling."
---

# Proposal: package topology + root-owned package quality gate

## Status

Proposed.

## Decision

Inside `pi-extensions`, treat package generation and validation in terms of **package topology**, not repo topology.

Two canonical package modes:

1. **simple-package**
   - one package root under `packages/<name>`
   - example: `packages/prompt-template-accelerator`
   - example: `packages/pi-autonomous-session-control`

2. **package-group**
   - one logical capability under `packages/<group-name>` with multiple interlinked packages
   - example: `packages/pi-interaction/`
   - subpackages remain individually publishable or testable, but the group is the main design unit

Validation should be centralized in a monorepo-root implementation:

- `scripts/package-quality-gate.sh`

Package-local `npm run check` remains for ergonomics, but becomes a thin wrapper around the root gate.

## Why this is the right distinction

The meaningful architectural difference in this monorepo is **not**:

- standalone repo vs monorepo package

The meaningful difference is:

- one package is enough for this capability
- or the capability needs a coordinated package-group

That matches current practice:

- `prompt-template-accelerator` is a simple-package
- `pi-autonomous-session-control` is a simple-package
- `pi-interaction` is a package-group

## Canonical ownership model

### Monorepo root owns

- shared package validation implementation
- shared orchestration scripts (`scripts/ci/*.sh`)
- shared governance/review/workflow assets
- shared package topology language and policy

### Package roots own

- package code
- package tests
- package docs
- package metadata
- thin wrapper scripts only when helpful for local DX

## Proposed validation model

Introduce:

- `scripts/package-quality-gate.sh`

This becomes the one canonical implementation of package validation behavior.

Expected responsibilities:

- lint
- typecheck
- tests
- package-local structure validation
- packaging check (`npm pack --dry-run`) when relevant

Expected usage:

```bash
# simple package
./scripts/package-quality-gate.sh ci packages/pi-autonomous-session-control

# package-group root
./scripts/package-quality-gate.sh ci packages/pi-interaction --mode package-group
```

Package wrappers should delegate to it.

## Consequences

### Positive

- one package-quality implementation
- less drift across packages
- simpler package maintenance
- easier future template outputs
- package topology becomes explicit and teachable

### Tradeoffs

- packages become intentionally coupled to monorepo root validation infrastructure
- package-group detection/rules must be defined carefully
- template migration must be phased so current generated packages do not break suddenly

## Non-goal

This proposal does **not** say every package must become a package-group.
Most extensions should remain simple-packages.

## Immediate follow-up docs

This proposal should be paired with:

- a root interface spec for `scripts/package-quality-gate.sh`
- a template redesign note in `pi-extensions-template`

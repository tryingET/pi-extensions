---
summary: "Overview and quickstart for monorepo package @tryinget/pi-ontology-workflows."
read_when:
  - "Starting work in this package workspace."
  - "Looking for the package's ontology workflow surface and architecture."
system4d:
  container: "Monorepo package for ontology workflow delivery in Pi."
  compass: "Keep ontology behavior inside a stable workflow core with thin Pi and ROCS adapters."
  engine: "Inspect -> route -> plan/apply -> validate/build."
  fog: "The main risk is letting transport or shell details become the real architecture instead of the use-case core."
---

# @tryinget/pi-ontology-workflows

Monorepo package for ontology inspection, routing, and change workflows in Pi.

- Workspace path: `packages/pi-ontology-workflows`
- Release component key: `pi-ontology-workflows`
- Release config mode: `component`

## Why this package exists

This package gives Pi a **small ontology-native surface** instead of relying on raw file edits and ad-hoc `rocs` calls.

The package follows the 2026-03-13 learnings from `tpl-template-repo`:

- stable core + thin adapters
- recurring operation language made explicit inside the core

That means:

- the stable thing is the ontology workflow use-case API
- Pi tools and commands are thin adapters over that core
- ROCS invocation is an adapter, not the architecture
- ontology write semantics are explicit contracts, not hidden command conventions

## Public surface

### Tools

- `ontology_inspect`
  - `kind: status|search|pack`
  - routes repo/company/core targets through the workspace adapter
  - uses ROCS for summary/validate/build/pack under one stable inspect use case
- `ontology_change`
  - `mode: plan|apply`
  - supports `concept`, `relation`, `system4d`, `bridge`, `manifest`, and `bootstrap`
  - routes repo/company/core targets and performs post-apply validate/build

### Commands

- `/ontology-status`
  - inspect ontology status for the current repo/company/core context
- `/ontology-bootstrap [title]`
  - create the minimal nested repo-local `ontology/` skeleton for the current git repo
  - if ontology already exists, shows current repo ontology status instead of rewriting it
- `/ontology-manifest`
  - show or update the repo-local `ontology/manifest.yaml`
  - if the repo has no ontology yet, write actions bootstrap first before applying the manifest change

### Picker / editor UX layer

This package now includes its own interaction adapter, so **you do not need to install `@tryinget/pi-interaction` separately** just to get ontology picker UX.

Live editor triggers:

- `/ontology:<query>[::scope]`
  - pick an ontology hit and insert its exact `ontId`
- `/ontology-pack:<query>[::scope]`
  - pick an ontology hit and insert a ready-to-run `ontology_inspect` pack request
- `/ontology-change:<query>[::scope]`
  - pick an ontology hit and insert a ready-to-run `ontology_change` plan request

Supported scope suffixes:

- `repo`
- `company`
- `core`
- `auto`

Examples:

- `/ontology:agent::core`
- `/ontology-pack:SLO::company`
- `/ontology-change:Service::repo`

### Startup behavior

- `session_start`
  - mounts the ontology picker/editor runtime when UI is available
  - detects relevant ontology context
  - sets an ontology footer status when useful
  - sends a one-shot startup notification with ontology shortcuts
  - if the current git repo has no repo-local ontology yet, suggests `/ontology-bootstrap` instead of silently falling through to unrelated status
- `before_agent_start`
  - injects a short ontology workflow hint when the prompt appears ontology-relevant

## Stable-core / thin-adapter architecture

Core use cases live in `src/core/`:

- `inspect.ts` — inspect ontology state
- `change.ts` — plan/apply ontology changes
- `contracts.ts` — explicit operation language

Ports live in `src/ports/`:

- `rocs-port.ts`
- `files-port.ts`
- `workspace-port.ts`

Adapters live in `src/adapters/`:

- `rocs-cli.ts`
- `filesystem.ts`
- `workspace.ts`
- `interaction.ts`
- `format.ts`
- `frontmatter.ts`

The extension entrypoint in [extensions/ontology-workflows.ts](extensions/ontology-workflows.ts) is intentionally thin.

## Explicit operation language

The core makes recurring ontology workflow semantics explicit through typed contracts:

- scope: `auto | repo | company | core`
- inspect kind: `status | search | pack`
- change mode: `plan | apply`
- artifact kind: `concept | relation | system4d | bridge`
- operation: `create | update | upsert`
- system4d action: `append | set | merge`

This keeps semantics out of hidden shell flags or adapter-local conventions.

## Supported change types

### Concept

`ontology_change` can create/update/upsert concept docs under the target ontology source root:

- repo-local ontology: `ontology/src/reference/concepts/<ont_id>.md`
- dedicated company/root-layout ontology repo: `src/reference/concepts/<ont_id>.md`

### Relation

`ontology_change` can create/update/upsert relation docs under the target ontology source root:

- repo-local ontology: `ontology/src/reference/relations/<relation-label>.md`
- dedicated company/root-layout ontology repo: `src/reference/relations/<relation-label>.md`

### System4D

`ontology_change` can mutate the target ontology source-root `system4d.yaml` via:

- `system4dPath`
- `system4dAction`
- `system4dValue`

### Bridge

`ontology_change` can update the target ontology source-root bridge mapping via:

- repo-local ontology: `ontology/src/bridge/mapping.yaml`
- dedicated company/root-layout ontology repo: `src/bridge/mapping.yaml`

### Manifest

`ontology_change` can create/update/upsert the **repo-local ontology manifest** at:

- `ontology/manifest.yaml`

Current boundary:
- this manifest surface is intentionally **repo-scope only**
- it manages repo-local ROCS layers/profiles for nested `ontology/` layouts
- dedicated company/root-layout ontology repo manifests stay out of this first manifest slice

### Bootstrap

`ontology_change` can bootstrap the **repo-local ontology skeleton** for repos that do not yet have one.

Bootstrap creates the minimal nested repo-local ontology layout:

- `ontology/manifest.yaml`
- `ontology/index.md`
- `ontology/src/system4d.yaml`
- `ontology/src/reference/concepts/README.md`
- `ontology/src/reference/relations/README.md`
- `ontology/src/bridge/README.md`
- `ontology/src/bridge/mapping.yaml`

Current boundary:
- bootstrap is intentionally **repo-scope only**
- it is a narrow ontology bootstrap, not a general repo/project scaffolder

## Runtime dependencies

This package expects Pi host runtime APIs and declares them as `peerDependencies`:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-ai`
- `typebox`

Runtime YAML handling uses:

- `yaml`

Integrated interaction-runtime dependencies:

- `@tryinget/pi-editor-registry`
- `@tryinget/pi-trigger-adapter`

This package consumes those as library/package seams inside the same process so the picker/editor UX works after one package install.

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Package checks

Run from package directory:

```bash
npm install
npm run docs:list
npm run check
```

Run the package tests directly:

```bash
node --import tsx --test tests/*.test.ts
```

Optional live smoke:

```bash
npm run smoke:headless-live
```

Run from monorepo root through the canonical package gate:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-ontology-workflows
```

The generated package-local `scripts/quality-gate.sh` stays a thin wrapper over the root-owned monorepo gate.

## Live package activation

Install the package into Pi from the package directory containing this package's `package.json`:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-ontology-workflows
```

Then in Pi:

1. run `/reload`
2. verify with:
   - `/ontology-status`
   - a real `ontology_inspect` call
   - a real `ontology_change` plan/apply flow

## Example use

Inspect company ontology health:

```text
Call ontology_inspect with kind=status and scope=company
```

Search for a concept:

```text
Call ontology_inspect with kind=search, scope=company, query="SLO"
```

Plan a concept addition:

```text
Call ontology_change with:
- mode=plan
- artifactKind=concept
- operation=create
- scope=company
- targetId=co.software.FeatureFlag
- title=Feature Flag
- description=Runtime-controllable feature switch.
```

Bootstrap a repo-local ontology before first repo-scoped changes:

```text
Call ontology_change with:
- mode=apply
- artifactKind=bootstrap
- operation=create
- scope=repo
```

Patch the repo-local ontology manifest:

```text
Call ontology_change with:
- mode=apply
- artifactKind=manifest
- operation=update
- scope=repo
- manifestDefaultProfile=review
- manifestProfiles={ review: { include_layers: ["core", "company"], exclude_layers: ["repo"], budget: 1600 } }
```

Apply a bridge mapping:

```text
Call ontology_change with:
- mode=apply
- artifactKind=bridge
- operation=upsert
- scope=repo
- bridgeMappings=[{ concept_id: "co.software.Service", target: "src/service.ts", kind: "symbol" }]
```

## Release metadata

This package writes component metadata in `package.json` under `x-pi-template`:

- `workspacePath`
- `releaseComponent`
- `releaseConfigMode`

Use these values when wiring monorepo-level release-please component maps.

## Docs map

- [Project foundation](docs/project/foundation.md)
- [Project vision](docs/project/vision.md)
- [Project resources](docs/project/resources.md)
- [Architecture decision](docs/decisions/2026-03-14-stable-core-thin-adapters.md)
- [Trusted publishing runbook](docs/dev/trusted_publishing.md)
- [Next session prompt](next_session_prompt.md)

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.
itted.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

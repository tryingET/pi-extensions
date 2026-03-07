---
summary: "Interface design for a root-owned package-quality-gate script covering both simple-package and package-group topologies."
read_when:
  - "Implementing scripts/package-quality-gate.sh."
  - "Updating package package.json scripts to thin wrappers."
  - "Refactoring scripts/ci/packages.sh to orchestrate package validation through a single contract."
system4d:
  container: "Root package validation interface spec."
  compass: "One contract, predictable stages, topology-aware behavior."
  engine: "Resolve package root -> detect or accept topology -> run stage contract -> return stable exit codes."
  fog: "Without a clear interface, centralization just moves duplication into ad-hoc conditionals."
---

# Interface design: `scripts/package-quality-gate.sh`

## Goal

Provide one root-owned validation contract for package workspaces in `pi-extensions`.

Target path:

- `scripts/package-quality-gate.sh`

## Supported topologies

### `simple-package`

A single package root containing one `package.json` that is the main package artifact.

Example:

- `packages/prompt-template-accelerator`
- `packages/pi-autonomous-session-control`

### `package-group`

A logical group root containing a group-level `package.json` plus one or more child package manifests.

Example:

- `packages/pi-interaction`

## CLI contract

### Preferred form

```bash
scripts/package-quality-gate.sh <stage> <target> [--mode <auto|simple-package|package-group>]
```

Examples:

```bash
scripts/package-quality-gate.sh lint packages/pi-autonomous-session-control
scripts/package-quality-gate.sh ci packages/pi-autonomous-session-control
scripts/package-quality-gate.sh ci packages/pi-interaction --mode package-group
```

### Stage values

- `lint`
- `fix`
- `typecheck`
- `test`
- `pre-commit`
- `pre-push`
- `ci`

## Mode semantics

### `auto` (default)

Behavior:
- if the target contains child package manifests that are intended package members, treat it as `package-group`
- otherwise treat it as `simple-package`

### `simple-package`

Behavior:
- run package-local structure validation for that package root
- run lint/typecheck/tests in that package root
- run `npm pack --dry-run` when stage requires packaging validation

### `package-group`

Behavior:
- validate the group root itself
- discover child package manifests below the group root
- run the package gate recursively for each child package in a deterministic order
- optionally run group-root checks before or after child checks depending on stage

## Expected stage behavior

### `lint`
- run package-local lint only

### `fix`
- run package-local formatting/fixes only

### `typecheck`
- run package-local typecheck only

### `test`
- run package-local tests only

### `pre-commit`
- structure validation
- lint

### `pre-push`
- structure validation
- lint
- typecheck
- test

### `ci`
- structure validation
- lint
- typecheck
- test
- package packaging check

## Package wrapper contract

Package-local scripts should become thin wrappers.

### Simple-package example

```json
{
  "scripts": {
    "quality:ci": "bash ../../scripts/package-quality-gate.sh ci .",
    "check": "npm run quality:ci"
  }
}
```

### Package-group child package

Child packages inside a group can also delegate directly to root:

```json
{
  "scripts": {
    "quality:ci": "bash ../../../scripts/package-quality-gate.sh ci . --mode simple-package",
    "check": "npm run quality:ci"
  }
}
```

### Package-group root

```json
{
  "scripts": {
    "quality:ci": "bash ../../scripts/package-quality-gate.sh ci . --mode package-group",
    "check": "npm run quality:ci"
  }
}
```

## `scripts/ci/packages.sh` contract update

Current role should remain orchestration only.

Proposed behavior:
- discover package roots under `packages/`
- invoke `scripts/package-quality-gate.sh ci <target>`
- avoid embedding package-validation logic in `scripts/ci/packages.sh`

Pseudo-flow:

```bash
find_package_targets | while read -r target; do
  ./scripts/package-quality-gate.sh ci "$target"
done
```

## Detection heuristics for package-group

A target should be considered a `package-group` when:
- it has its own `package.json`, and
- it contains one or more descendant directories with their own `package.json`, and
- those descendants are intended package members, not incidental fixtures

Implementation note:
- exclude `node_modules`
- exclude hidden temp dirs
- keep ordering deterministic

## Important policy note

This root gate should become the **implementation of record** for monorepo packages.
Package-local scripts should stop being independent copies of the same policy.

## Migration path

1. add the root gate
2. migrate one simple-package first
3. migrate one package-group root after that
4. update `scripts/ci/packages.sh`
5. then update the template outputs to emit thin wrappers instead of full private gates

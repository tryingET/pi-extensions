---
summary: "Implemented interface contract for the root-owned package-quality-gate script covering both simple-package and package-group topologies."
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

# Implemented interface: `scripts/package-quality-gate.sh`

## Goal

Provide one root-owned validation contract for package workspaces in `pi-extensions`.

Target path:

- `scripts/package-quality-gate.sh`

## Supported topologies

### `simple-package`

A single package root containing one `package.json` that is the main package artifact.

Example:

- `packages/pi-prompt-template-accelerator`
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
- run package-local structure validation for that package root when the package declares the full monorepo scaffold contract
- otherwise skip structure validation explicitly and continue with runtime/package validation
- run lint/typecheck/tests in that package root
- run `npm pack --dry-run` when stage requires packaging validation

### `package-group`

Behavior:
- treat the group root as the orchestration boundary
- discover child package manifests below the group root
- run the package gate recursively for each child package in a deterministic order
- do not require the package-group root itself to satisfy the full simple-package structure contract unless it intentionally declares one

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

Current role remains orchestration only.

Implemented behavior:
- discover top-level package roots under `packages/`
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

## Implementation status

Completed:
1. added the root gate at `scripts/package-quality-gate.sh`
2. migrated simple-package validation delegation
3. migrated package-group validation delegation for `packages/pi-interaction`
4. updated `scripts/ci/packages.sh`
5. updated monorepo package template output to emit a thin wrapper instead of a full private gate

Current nuance:
- structure validation is only enforced for packages that clearly declare the full monorepo scaffold contract
- lighter-weight or brownfield package members continue through lint/test/package validation without being forced into the full scaffold shape

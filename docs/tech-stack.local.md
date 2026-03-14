---
summary: "Local override notes for the monorepo root validation and package management model."
read_when:
  - "Aligning monorepo-level tooling decisions with package-level TypeScript lanes."
  - "Reconciling root validation behavior with per-package quality gates."
system4d:
  container: "Repo-local deltas on top of package-level stack guidance."
  compass: "Keep monorepo operations reproducible while packages retain their own manifests."
  engine: "Use root validation contract -> use package-local checks -> validate before release/push."
  fog: "Root npm ergonomics can be mistaken for a full workspace unless documented explicitly."
---

# tech-stack.local (pi-extensions monorepo root)

Primary model:

- Root repo is a **monorepo control plane**, not a full npm workspace manifest.
- Packages under `packages/` keep their own manifests and package-local checks.

Repo-local emphasis:

- Root npm validation surface:
  - `npm run quality:pre-commit`
  - `npm run quality:pre-push`
  - `npm run quality:ci`
  - `npm run check`
- Canonical root wrapper:
  - `./scripts/quality-gate.sh`
- Single implementation of full root validation:
  - `./scripts/ci/full.sh`
- Canonical package validation implementation:
  - `./scripts/package-quality-gate.sh`
- Package validation fan-out:
  - `./scripts/ci/packages.sh` discovers top-level package roots under `packages/`
  - package-groups recurse through child packages via `scripts/package-quality-gate.sh`
- Root smoke lane:
  - `./scripts/ci/smoke.sh`
- Root local feedback bootstrap:
  - `bash ./scripts/install-hooks.sh`
- Editor/formatting contract stays package-local for now:
  - no root `biome.jsonc`
  - no root `.vscode/settings.json`
  - package repos/groups own their own formatter/editor settings
- Package-level stack specifics remain owned by each package/group under `packages/`.
- Common package-local pi-ts companions stay package-scoped rather than becoming root defaults:
  - `fast-check`
  - `@cucumber/cucumber`
  - `nunjucks`

Practical rule:

- Use root commands for monorepo-wide validation.
- Use package-local `npm run check` when working inside a specific package.
- Treat package-local stack metadata as the executable contract surface:
  - `policy/stack-lane.json`
  - `docs/tech-stack.local.md`
  - root helper `scripts/validate-tech-stack-contract.mjs`
  - optional `tech-stack-core show <lane> --prefer-repo` smoke checks when available

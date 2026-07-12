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

# engineering.local (pi-extensions monorepo root)

Primary model:

- Root repo is a **monorepo control plane**, not a full npm workspace manifest.
- Packages under `packages/` keep their own manifests and package-local checks.
- Shared upstream guidance comes from `engineering-core` v0.8.0 at immutable commit `8f59f4178f0c40f73d64c417e7a591de42a0f0d2`; root machine-readable recognition lives in `policy/engineering-lane.json`.
- Inspect available upstream catalog/discipline/template surfaces with:
  - `uv tool -n run --from git+https://github.com/tryingET/core_engineering-core.git@8f59f4178f0c40f73d64c417e7a591de42a0f0d2 engineering-core catalog --pretty`
  - `uv tool -n run --from git+https://github.com/tryingET/core_engineering-core.git@8f59f4178f0c40f73d64c417e7a591de42a0f0d2 engineering-core list-disciplines`
  - `uv tool -n run --from git+https://github.com/tryingET/core_engineering-core.git@8f59f4178f0c40f73d64c417e7a591de42a0f0d2 engineering-core list-templates`

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
- `build-graph-acceleration` is conditional only for measured monorepo build/test/package fan-out acceleration work; native npm/package scripts remain canonical unless a repo-local decision accepts an accelerator.

## Repo loop validation

pi-extensions adopts `repo-loop-validation-v1` for monorepo control-plane and package fan-out loop work. The machine-readable declaration lives in `policy/engineering-lane.json`.

- `loop-doctor`: `just loop-doctor` (non-failing git/Node/npm/Just diagnostics)
- `loop-verify-fast`: `just loop-verify-fast` (coherent-slice package pre-commit checks plus root smoke checks)
- `loop-impact-plan`: `just loop-impact-plan` (classifies the selected paths as bounded, expanded, or wide)
- `loop-impact-run`: `just loop-impact-run` (package pre-push checks plus root smoke checks; refuses wide scope)
- `loop-impact-wide`: `LOOP_WIDE_REASON='<reason>' just loop-impact-wide` (explicitly accepted `just ci`)
- `loop-landing-check`: `just loop-landing-check` (maps to the repo-declared `just ci` gate)

Set `LOOP_PATHS` to a newline-separated list of non-empty repo-relative paths when task scope is narrower than the dirty working tree; paths may contain spaces but not newlines or `..` traversal segments. If `LOOP_PATHS` is absent, loop commands inspect unstaged, staged, and untracked paths using NUL-delimited Git output. This explicit input is important in a shared or already-dirty checkout: unrelated changes must not force a focused package slice into wide validation.

Run `loop-verify-fast` after a coherent implementation slice, not after every write. Package paths are deduplicated to their top-level package roots and use the existing package quality gate. Root documentation/policy paths use the smoke gate. Root runtime, dependency, script, build, or unclassified paths escalate to explicit wide validation at the impact phase. The loop commands never format, auto-fix, activate packages, or infer completion.

These commands produce repo-local evidence for loop orchestration. They do not replace AK task/evidence/decision authority, live Pi extension activation/reload proof, package release approval, publication authority, merge approval, or downstream production activation authority.

Practical rule:

- Use root commands for monorepo-wide validation.
- Use package-local `npm run check` when working inside a specific package.
- Treat root policy + audit as the review surface of record:
  - root-owned stance: `docs/engineering.local.md`
  - root validator: `scripts/validate-engineering-contract.mjs`
  - live package audit: `npm run engineering:review-surfaces`
  - current package state + routing notes: `docs/project/engineering-review-surfaces.md`
  - migration contract + exact boundaries: `docs/project/reduced-form-migration-contract.md`
- Reduced-form target for package/template outputs:
  - keep package-local `docs/engineering.local.md` only when a package has a real local override
  - treat package-local `policy/engineering-lane.json` as legacy/full-surface state until package/template follow-up intentionally removes it
  - do not treat `policy-only` as an acceptable end state; local policy metadata should disappear with the same change that lands the truthful reduced-form or no-local-surface target
  - optional `engineering-core show <lane> --prefer-repo` smoke checks stay available when package validation still pins the upstream lane explicitly

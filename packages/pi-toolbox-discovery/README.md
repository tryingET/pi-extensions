---
summary: "Overview and quickstart for monorepo package @tryinget/pi-toolbox-discovery."
read_when:
  - "Starting work in this package workspace."
system4d:
  container: "Monorepo package scaffold for pi extension delivery."
  compass: "Ship safe package-level iterations inside a shared workspace."
  engine: "Plan -> implement -> validate -> coordinate with monorepo release flow."
  fog: "Drift risk if package scripts diverge from monorepo root conventions."
---

# @tryinget/pi-toolbox-discovery

Lazy custom-tool discovery and activation broker for Pi sessions.

The package registers:

- `/toolbox` — human-visible status command
- `toolbox` — model-callable discovery/activation/doctor tool

The package keeps `self`, `interview`, `dispatch_subagent`, `intercom`, Prompt Vault read tools (`vault_query`, `vault_retrieve`, `vault_vocabulary`, `vault_dispatch_check`), and `toolbox` as foundational always-active custom tools while letting heavier package-owned tools and Prompt Vault diagnostics/mutations remain latent until explicitly activated. Current behavior:

- enforces the minimal active tool set on `session_start`
- searches/explains catalog metadata without importing owner packages
- activates bundle profiles only after risk gates pass
- lazily imports owner modules for lazy-ready bundles when tools are not already registered
- tracks unpinned activation TTLs across turns and preserves pinned activations until explicit deactivation
- fails closed for bundle/profile activation if requested profile tools remain unavailable after lazy import
- reports eager registration drift when catalog tools from lazy bundles are already registered without an active lease or lazy-import record, which catches settings drift such as duplicate worktree package entries
- provides `toolbox({ action: "doctor" })` as an evaluative startup-health check covering the always-active baseline, active leases, eager registration drift, unleased active catalog tools, and duplicate/settings suspects

The package-owned lazy-ready production bundles are `vault` via `pi-vault-client/toolbox-bundle`, `ontology` via `@tryinget/pi-ontology-workflows/toolbox-bundle`, `designmd` via `@tryinget/pi-designmd-foundry/toolbox-bundle`, `autoresearch` via `@tryinget/pi-autoresearch/toolbox-bundle`, `orchestrator` via `pi-society-orchestrator/toolbox-bundle`, and `peer-spawn` via `@tryinget/pi-little-helpers/toolbox-bundle`; broader package-owned lazy bundle exports remain governed by [`../../docs/project/2026-05-03-rfc-lazy-pi-toolbox-discovery.md`](../../docs/project/2026-05-03-rfc-lazy-pi-toolbox-discovery.md).

- Workspace path: `packages/pi-toolbox-discovery`
- Release component key: `pi-toolbox-discovery`
- Release config mode: `component`

## Runtime dependencies

This package expects pi host runtime APIs and declares them as `peerDependencies`:

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Package checks

Run from package directory:

```bash
npm install
npm run check
```

Run from monorepo root through the canonical package gate:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-toolbox-discovery
```

The generated package-local `scripts/quality-gate.sh` is a thin wrapper that searches upward for the canonical monorepo root gate.
If you validate the package outside the monorepo tree, set `PACKAGE_QUALITY_GATE_SCRIPT` to the canonical `pi-extensions` root gate path.

## AK task/work-item operations

This package is a monorepo member, not a git root.
Use the monorepo-root AK wrapper for task/work-item operations:

```bash
# from the monorepo root
./scripts/ak.sh --doctor
./scripts/ak.sh task ready

# from this package directory
../../scripts/ak.sh --doctor
../../scripts/ak.sh task show <id> -F json
```

## Documentation placement

Use:
- `docs/project/` for dated RFCs, runbooks, and evidence/progress notes
- `docs/adr/` for adopted architecture decisions

Avoid creating new package-local `docs/dev/` trees.

## Live package activation

Install the package into Pi from the package directory containing this package's `package.json`:

```bash
pi install /absolute/path/to/your/monorepo/packages/pi-toolbox-discovery
```

Then in Pi:

1. run `/reload`
2. verify with a real command or tool call from this package

## Release metadata

This scaffold writes component metadata in `package.json` under `x-pi-template`:

- `workspacePath`
- `releaseComponent`
- `releaseConfigMode`

Use these values when wiring monorepo-level release-please component maps.

## Docs discovery

```bash
npm run docs:list
npm run docs:list:workspace
npm run docs:list:json
```

## Stack lane companions

This package follows the shared `pi-ts` lane.
Add companions only when they materially improve clarity or reuse:

- `fast-check` for parser/rendering/selection invariants
- `@cucumber/cucumber` for executable Gherkin/operator workflows
- `nunjucks` for reusable text/config/prompt/file templates
- `tech-stack-pi-ts.ts-quality.md` when the package explicitly adopts deterministic screening with `ts-quality`

If this package adopts `ts-quality`, prefer repo-local rollout truth in `docs/project/ts-quality-current-vs-target.md` and keep the detailed adoption doctrine upstream in `~/ai-society/softwareco/owned/ts-quality/docs/adoption/`.

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

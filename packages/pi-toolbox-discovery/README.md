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

Custom-tool discovery and active-set broker for Pi sessions.

The package registers:

- `/toolbox` — human-visible status command
- `toolbox` — model-callable discovery/planning/activation/doctor tool

Pi loads/registers the available model-callable tool schema once at startup. `toolbox` does not make missing tools callable mid-session; it discovers the catalog, verifies which tools were registered by their owner extensions, and manages the active set with risk gates.

The package keeps `self`, `interview`, `dispatch_subagent`, `intercom`, Prompt Vault read tools (`vault_query`, `vault_retrieve`, `vault_vocabulary`, `vault_dispatch_check`), pi-little-helpers peer-spawn tools (`fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`), and `toolbox` as foundational always-active custom tools while letting heavier package-owned tools and Prompt Vault diagnostics/mutations remain latent until explicitly activated. Current behavior:

- enforces the standard active tool set on `session_start`
- searches/explains catalog metadata and plans activation without importing owner packages
- plans every activation through one policy path before changing active tools, including raw `tools: [...]` requests
- activates already-registered bundle profiles and explicit tool lists only after risk gates pass; non-catalog explicit tools are treated as high-risk and require acknowledgement plus `riskJustification`
- fails closed when requested tools are not registered in the current Pi session, with instructions to enable/install the owner extension and `/reload`
- tracks unpinned activation TTLs across turns and preserves pinned activations until explicit deactivation
- reports catalog registration gaps separately from active-set/lease problems
- clears lease bookkeeping on `session_start` before re-applying the standard active-tool baseline
- provides `toolbox({ action: "doctor" })` as an evaluative startup-health check covering the always-active baseline, catalog registration completeness, active leases, and unleased active catalog tools

The package-owned production bundles are `vault`, `ontology`, `designmd`, `autoresearch`, `orchestrator`, and `peer-spawn`. Their tools must be registered by the owning package's normal Pi extension entry at startup; toolbox activation only changes the active set.

## Standard startup contract

After a clean `/reload`, the expected healthy baseline is:

```text
active tools (16): read, bash, edit, write, self, interview, dispatch_subagent, intercom, vault_query, vault_retrieve, vault_vocabulary, vault_dispatch_check, fork_peer_spawn, scout_peer_spawn, candidate_peer_spawn, toolbox
missing catalog registrations (0): none
```

Use the model-callable doctor when validating settings or package changes:

```ts
toolbox({ action: "doctor" })
```

Expected healthy signals:

```text
verdict: pass
foundational baseline: ok
missing catalog registrations (0): none
unleased active catalog tools (0): none
```

If doctor reports missing catalog registrations, enable/install the owning package extension and `/reload` or start a fresh session. If doctor reports unleased active catalog tools, deactivate them or reactivate them through toolbox so TTL/pin state is explicit.

## Tool registration invariant

Pi loads/registers all available tools once. `toolbox({ action: "activate" })` can only choose from `pi.getAllTools()` and update the active set. A missing tool is not a recoverable activation problem; it is an installation/settings/startup problem.

For model-callable tools that should be cheap at startup, owner packages should register a lightweight tool schema and lazy-load heavy implementation inside `execute`, not register the tool itself late.

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

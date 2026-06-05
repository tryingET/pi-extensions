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

`toolbox` does not import owner packages or create missing owner-tool registrations. It discovers the catalog, verifies which tools are registered in the current Pi runtime, and manages the active set with risk gates. For already-registered tools, activation updates Pi's active tool set immediately, queues a same-task continuation when the active set changes, and is intended to be visible on the next provider/model request after the toolbox result. It cannot retroactively change an already-issued provider request or an external API/client schema snapshot.

The package keeps `self`, `interview`, `dispatch_subagent`, `intercom`, Prompt Vault read tools (`vault_query`, `vault_retrieve`, `vault_vocabulary`, `vault_dispatch_check`), the lightweight context planning tool (`context_plan`), pi-little-helpers peer-spawn tools (`fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`), the visible-loop checkpoint fallback (`visible_loop_child_complete`), the orchestrator loop dispatcher (`loop_execute`), and `toolbox` as foundational always-active custom tools while letting heavier package-owned tools and Prompt Vault diagnostics/mutations remain latent until explicitly activated. Current behavior:

- enforces the standard active tool set on `session_start`
- searches/explains catalog metadata and plans activation without importing owner packages
- plans every activation through one policy path before changing active tools, including raw `tools: [...]` requests
- activates already-registered bundle profiles and explicit tool lists only after risk gates pass; non-catalog explicit tools are treated as high-risk and require acknowledgement plus `riskJustification`
- queues an extension-origin same-task continuation after activation changes the active tool set, unless `autoContinue: false` is passed
- fails closed when requested tools are not registered in the current Pi session, with instructions to enable/install the owner extension and `/reload` or start a fresh session
- tracks unpinned activation TTLs across turns and preserves pinned activations until explicit deactivation
- reports catalog registration gaps separately from active-set/lease problems
- clears lease bookkeeping on `session_start` before re-applying the standard active-tool baseline
- provides `toolbox({ action: "doctor" })` as an evaluative startup-health check covering the always-active baseline, catalog registration completeness, active leases, and unleased active catalog tools

The package-owned production bundles are `vault`, `context-packer`, `ontology`, `designmd`, `autoresearch`, `orchestrator`, `agent_vent`, and `peer-spawn`. Their tools must be registered by the owning package's Pi extension entry before toolbox activation; toolbox activation only changes the active set. The `context-packer` read profile includes packet planning, bounded packet assembly, and packet-local dogfood receipt evaluation; it does not make dogfood observations canonical evidence.

`agent_vent` is intentionally a diagnostic/local-write bundle: activation can expose the same-named `agent_vent` tool, which may preview or append local JSONL vent records, but it does not create AK tasks, GitHub issues, real incidents, canonical evidence, external telemetry, or ASC/self state. See [Self, toolbox, and agent_vent diagnostic boundary](../pi-agent-vent/docs/project/2026-06-05-self-toolbox-agent-vent-diagnostic-boundary.md) for the cross-package handoff contract.

## Standard startup contract

After a clean `/reload`, the expected healthy baseline is:

```text
active tools (19): read, bash, edit, write, self, interview, dispatch_subagent, intercom, vault_query, vault_retrieve, vault_vocabulary, vault_dispatch_check, fork_peer_spawn, scout_peer_spawn, candidate_peer_spawn, visible_loop_child_complete, context_plan, loop_execute, toolbox
missing catalog registrations (0): none
```

Use the model-callable doctor when validating settings or package changes:

```ts
toolbox({ action: "doctor" })
```

Expected healthy signals:

```text
verdict: pass      # or warn when only optional catalog bundles are missing
foundational baseline: ok
unleased active catalog tools (0): none
```

Missing catalog registrations are warnings when the baseline is healthy because optional owner packages may be filtered/disabled in a given Pi runtime. Enable/install the owning package extension and `/reload` or start a fresh session before activating those optional bundles. If doctor reports unleased active catalog tools, deactivate them or reactivate them through toolbox so TTL/pin state is explicit. If activation succeeds but an outer API client still cannot call the tool after the queued continuation, treat that as a client schema snapshot limitation and reload/start a fresh session after confirming the owner extension is installed.

## Activation continuation and cache behavior

`toolbox({ action: "activate" })` changes the active tool set through Pi and then, when the active set actually changed, queues an extension-origin continuation message with `deliverAs: "steer"` and `triggerTurn: true`. The continuation is not a fake user command; it is a same-task nudge that lets Pi issue another provider/model request after the refreshed active-tool schema is available. Use `autoContinue: false` for activation-only calls.

Changing active tools changes the provider tool-schema prefix. The first request for a newly active tool combination may therefore miss or write a new provider prompt-cache entry. Later requests with the same active-tool combination can reuse cache again. Avoid repeated activate/deactivate oscillation if cache stability matters.

## Tool registration invariant

`toolbox({ action: "activate" })` can only choose from `pi.getAllTools()` and update the active set. A missing tool is not a recoverable activation problem; it is an owner-extension installation/settings/reload problem.

Pi core supports runtime tool registration by owner extensions, but toolbox intentionally does not dynamically import owner packages to register their tools. For model-callable tools that should be cheap to expose, owner packages should register a lightweight tool schema and lazy-load heavy implementation inside `execute`, not rely on toolbox to register the tool itself.

- Workspace path: `packages/pi-toolbox-discovery`
- Release component key: `pi-toolbox-discovery`
- Release config mode: `component`

## Runtime dependencies

This package expects pi host runtime APIs and declares them as `peerDependencies`:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-ai`

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
- `engineering-pi-ts.ts-quality.md` when the package explicitly adopts deterministic screening with `ts-quality`

If this package adopts `ts-quality`, prefer repo-local rollout truth in `docs/project/ts-quality-current-vs-target.md` and keep the detailed adoption doctrine upstream in `~/ai-society/softwareco/owned/ts-quality/docs/adoption/`.

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

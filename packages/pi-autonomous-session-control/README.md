---
summary: "Overview and quickstart for pi-autonomous-session-control."
read_when:
  - "Starting work in this repository."
system4d:
  container: "Repository scaffold for a pi extension package."
  compass: "Ship small, safe, testable extension iterations."
  engine: "Plan -> implement -> verify with docs and hooks in sync."
  fog: "Unknown runtime integration edge cases until first live sync."
---

# pi-autonomous-session-control

Monorepo-home package for subagent lifecycle hardening, failure recovery, and operator visibility in pi.

Canonical package path: `packages/pi-autonomous-session-control`

## Workspace placement

For workspace-level placement and ownership boundaries, read:
- `~/ai-society/holdingco/governance-kernel/docs/core/definitions/ai-society-stack-map.md`
- `~/ai-society/softwareco/owned/agent-kernel/docs/project/ai-society-convergence-architecture.md`
- `~/ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- `~/ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`

Short version:
- this package is the strongest current **Pi-side execution/runtime owner**
- it is not the canonical society-state authority (`ak`/AK own that)
- it is not the workspace-wide control board (FCOS/governance-kernel own that)
- package-local control-plane coordination belongs in `pi-society-orchestrator`

## Cross-package execution-boundary packet

If the work is about **how ASC should expose its runtime to `pi-society-orchestrator`**, start with the orchestrator-owned packet docs:

- `../pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
- `../pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`
- `../pi-society-orchestrator/docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
- `../pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`

Interpretation:
- the ADR decides that ASC remains the execution-plane owner
- the RFC describes the first public runtime seam ASC should expose
- the backlog / AK tasks describe the implementation order
- this package README describes the current runtime owner reality, not the seam design by itself

## Quickstart

1. Install dependencies:

   ```bash
   npm install
   ```

2. Test with pi (one-off, doesn't persist):

   ```bash
   pi -e ./extensions/self.ts
   ```

3. For active development, rely on auto-discovery:

   When you're in this project directory, pi automatically discovers the `package.json` and loads extensions defined in `pi.extensions`. No manual install needed.

## Local Development vs Global Install

**Important:** Avoid double-loading by understanding pi's package identity:

| Source | Identity |
|--------|----------|
| npm package | Package name (`pi-autonomous-session-control`) |
| git source | Repository URL |
| Local path | Resolved absolute path |

**During local development:**
- Do NOT add this package to global `~/.pi/agent/settings.json`
- Rely on project auto-discovery when working in this directory
- Use `pi -e /path/to/package` if you need the extension in another project temporarily

**After publishing to npm:**
```bash
pi install npm:pi-autonomous-session-control
```

**When both exist:**
- Local path and npm package are DIFFERENT identities → both load → conflicts
- Solution: During active development, remove the npm entry from global settings

To temporarily disable a global package while developing locally:
```bash
# Remove from global settings
pi remove npm:pi-autonomous-session-control

# Or manually edit ~/.pi/agent/settings.json and remove from packages array
```

To quickly test the extension in another project without installing:
```bash
pi -e /path/to/pi-autonomous-session-control
```

## Runtime dependencies and packaged files

This extension expects pi host runtime APIs and declares them as `peerDependencies`:

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`

For npm publishing, `package.json` uses a `files` whitelist so required runtime artifacts are explicit:

- `execution.ts`
- `extensions/self.ts`
- `extensions/self/`
- `prompts/`
- `examples/`
- `policy/security-policy.json`
- `policy/stack-lane.json`

If your extension also needs extra runtime assets, add them to `files` intentionally.

### Public execution contract

ASC now exposes a supported package-level execution seam for non-tool consumers:

```ts
import { createAscExecutionRuntime } from "pi-autonomous-session-control/execution";

const runtime = createAscExecutionRuntime({
  sessionsDir: "/tmp/pi-subagent-sessions",
  modelProvider: () => "openai-codex/gpt-5.3-codex-spark",
});

const controller = new AbortController();

const result = await runtime.execute(
  {
    profile: "reviewer",
    objective: "Review the staged changes for risk and missing tests.",
  },
  { cwd: process.cwd() },
  undefined,
  controller.signal,
);
```

What this seam guarantees:
- the same core execution logic now backs both `dispatch_subagent` and public runtime consumers
- prompt-envelope application, lifecycle invariants, runtime-owned concurrency reservation, session-name reservation, result shaping, assistant protocol classification, and abort propagation stay ASC-owned
- result surfaces now use one normalized failure taxonomy: canonical `result.details.status` (`done`, `aborted`, `timed_out`, `error`) plus `result.details.failureKind` for the specific failure branch
- a dedicated parity harness now proves those shared semantics stay aligned across the public runtime and the tool path
- downstream consumers should prefer `pi-autonomous-session-control/execution` over private `extensions/self/*` imports

Current verification split:
- ASC package-local tests prove seam semantics and transport-safety invariants
- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs` proves the narrow consumer-side adapter still preserves those semantics in repo-local source
- `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs` fail-closes drift back to private ASC imports or a revived orchestrator-local execution path
- `cd packages/pi-society-orchestrator && npm run release:check` proves installed-package/import-graph truth for the packaged orchestrator artifact, including the current bundled ASC bridge while the temporary lifecycle defined in [bundled ASC bridge lifecycle](../pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md) remains in force

Companion package doc:
- [ASC public execution contract](docs/project/public-execution-contract.md)

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Repository checks

Run:

```bash
npm run check
```

`check` routes to `quality:ci` via [scripts/quality-gate.sh](scripts/quality-gate.sh).
It enforces structure validation, Biome lint checks, optional TypeScript typechecks, and npm pack dry-run.

## Quality gate lane (TS)

- formatter/lint baseline:
  - [biome.jsonc](biome.jsonc)
  - [.vscode/settings.json](.vscode/settings.json) (Biome formatter + code actions on save for JS/TS/JSON)
  - pinned local binary via `@biomejs/biome` in `devDependencies`
- [scripts/quality-gate.sh](scripts/quality-gate.sh) stages:
  - `pre-commit`
  - `pre-push`
  - `ci`
- npm script entry points:
  - `npm run quality:pre-commit`
  - `npm run quality:pre-push`
  - `npm run quality:ci`
- helper scripts:
  - `npm run fix` (auto-fix)
  - `npm run lint` (check-only)
  - `npm run typecheck`
- lane metadata:
  - [policy/stack-lane.json](policy/stack-lane.json)

## Release + security baseline

This package now uses the **root-owned monorepo release control plane** in component mode.
It keeps its own independent release cadence, but the workflows/config live at monorepo root.

Relevant root-owned files:

- [CI workflow](../../.github/workflows/ci.yml)
- [release-check workflow](../../.github/workflows/release-check.yml)
- [release-please workflow](../../.github/workflows/release-please.yml)
- [publish workflow](../../.github/workflows/publish.yml)
- [release-please config](../../.release-please-config.json)
- [release-please manifest](../../.release-please-manifest.json)
- [root component helper](../../scripts/release-components.mjs)
- [release-check script](scripts/release-check.sh)
- [Security policy](SECURITY.md)

Trusted-publishing defaults now relevant to this package:

- release tags are component-scoped (`pi-autonomous-session-control-vX.Y.Z`)
- root release-please action is pinned to an immutable v4.4.0 SHA
- root publish and release-check workflows both upgrade npm (`>=11.5.1`) for consistent trusted publishing behavior
- setup-node uses `package-manager-cache: false` to avoid implicit caching behavior changes from setup-node v5+
- package metadata must include `repository.url` matching the GitHub repo for npm provenance verification

Recommended before release:

```bash
npm run release:check
# quick mode for CI / no local pi smoke
npm run release:check:quick
```

Optional: add an executable `scripts/release-smoke.sh` for extension-specific smoke checks.
`release-check.sh` will run it with isolated `PI_CODING_AGENT_DIR` and `PACKAGE_SPEC` env vars.

Before first production release under root automation:

1. Confirm/adjust owners in [../../.github/CODEOWNERS](../../.github/CODEOWNERS).
2. Enable branch protection on `main`.
3. Confirm GitHub Actions repo settings:
   - workflow permissions: `Read and write`
   - allow GitHub Actions to create/approve PRs
   - allowed actions policy permits marketplace actions used by workflows
4. Configure npm Trusted Publishing for the monorepo repo + [root publish workflow](../../.github/workflows/publish.yml).
5. If this is a brand-new npm package, perform one bootstrap token publish first, then add the trusted publisher in npm package settings.
6. Let root release-please open the component release PR, then publish from the GitHub release.

## Issue + PR intake baseline

Included files:

- [Bug report form](.github/ISSUE_TEMPLATE/bug-report.yml)
- [Feature request form](.github/ISSUE_TEMPLATE/feature-request.yml)
- [Docs request form](.github/ISSUE_TEMPLATE/docs.yml)
- [Issue template config](.github/ISSUE_TEMPLATE/config.yml)
- [PR template](.github/pull_request_template.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Support guide](SUPPORT.md)
- [Top-level contributing guide](CONTRIBUTING.md)

## Vouch trust gate baseline

Included files:

- [Vouched contributors list](.github/VOUCHED.td)
- [PR trust gate workflow](.github/workflows/vouch-check-pr.yml)
- [Issue-comment trust management workflow](.github/workflows/vouch-manage.yml)

Default behavior:

- PR workflow runs on `pull_request_target` (`opened`, `reopened`).
- `require-vouch: true` and `auto-close: true` are enabled by default.
- Maintainers can comment `vouch`, `denounce`, or `unvouch` on issues to update trust state.
- Vouch actions are SHA pinned for reproducibility and supply-chain review.

Bootstrap step:

- Confirm/adjust entries in [.github/VOUCHED.td](.github/VOUCHED.td) before enforcing production policy.

## Docs discovery

Run:

```bash
npm run docs:list
npm run docs:list:workspace
npm run docs:list:json
```

Wrapper script: [scripts/docs-list.sh](scripts/docs-list.sh)

Resolution order:
1. `DOCS_LIST_SCRIPT`
2. `./scripts/docs-list.mjs` (if vendored)
3. `~/ai-society/core/agent-scripts/scripts/docs-list.mjs`

TypeScript lane reference for pi extensions:

```bash
uv tool run --from ~/ai-society/core/tech-stack-core tech-stack-core show pi-ts --prefer-repo
```

Pinned lane metadata lives in [policy/stack-lane.json](policy/stack-lane.json).

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

## Hook behavior

- Git hooks path is configured to `.githooks` by [scripts/install-hooks.sh](scripts/install-hooks.sh).
- [.githooks/pre-commit](.githooks/pre-commit) runs:
  - `scripts/quality-gate.sh pre-commit`
  - check-only (auto-fix with `npm run fix`)
- [.githooks/pre-push](.githooks/pre-push) runs:
  - `scripts/quality-gate.sh pre-push`
- Repo-local commit workflow prompt:
  - [`.pi/prompts/commit.md`](.pi/prompts/commit.md)

## Subagent Configuration

The `dispatch_subagent` tool spawns subagents with configurable model selection:

**Model selection priority:**
1. `PI_SUBAGENT_MODEL` environment variable (override)
2. Latest session-selected model (`model_select` event)
3. Fallback: `openai-codex/gpt-5.3-codex-spark`

**Session storage:**
- `PI_SUBAGENT_SESSIONS_DIR` — directory for session files (default: `./.pi-subagent-sessions`)
- `PI_SUBAGENT_CLEAR_ON_SESSION_START` — set to `true` to clear `*.json` subagent sessions on `session_start` (default: off / non-destructive)
- `PI_SUBAGENT_RESERVE_SESSION_NAMES` — set to `false` to disable all session-name reservation mechanisms (in-memory + file-lock) for rollback/debugging (default: enabled)
- `PI_SUBAGENT_FILE_LOCK_SESSION_NAMES` — set to `false` to disable only cross-process file-lock reservation while keeping in-memory reservation (default: enabled; ignored when `PI_SUBAGENT_RESERVE_SESSION_NAMES=false`)
- `PI_SUBAGENT_LOCK_STALE_AFTER_MS` — stale-lock reclamation threshold in milliseconds for orphaned subagent locks that no longer have a live owning PID (default: `3600000`)

**Session artifact notes:**
- Local session files in `./.pi-subagent-sessions` are runtime artifacts and are gitignored by default.
- Lock files now store lightweight metadata (`pid`, `ppid`, `sessionName`, `createdAt`) so dead-parent reservations can be reclaimed automatically; live PIDs are never evicted solely due to age.
- Status sidecars (`<session>.status.json`) record `running|done|error|timeout|aborted|abandoned`; dead running sessions are reconciled to `abandoned` on next startup.
- `subagent-status` now reports counts by terminal/runtime status for faster operator diagnosis.
- A persistent read-only widget now surfaces recent subagent sessions, recency, and recommended action hints above the editor.
- If you want long-horizon analysis/retention, set `PI_SUBAGENT_SESSIONS_DIR` to a durable external path (for example `~/.pi/subagent-sessions`).

**Dashboard commands:**
- `/subagent-dashboard` — open a read-only summary of recent subagent sessions
- `/subagent-inspect <session-name>` — open a derived inspection summary with lifecycle metadata, artifact paths, safety notes, and the raw status sidecar for a specific session

**Example:**
```bash
# Use a different model for subagents
PI_SUBAGENT_MODEL=github-copilot/gpt-4o pi

# Custom session directory
PI_SUBAGENT_SESSIONS_DIR=/tmp/pi-sessions pi
```

## Self memory persistence

`self` now persists scoped memory domains across sessions:

- Crystallization (`remember` / `recall` patterns)
- Protection (`mark trap` / trap registry)

Persistence behavior:

- `PI_SELF_MEMORY_PATH` — explicit memory snapshot file path override
- Default path: sibling of the sessions directory, named `<sessionsDirBase>.self-memory.json`
  - default sessions dir `./.pi-subagent-sessions` ⇒ default memory file `./.pi-subagent-sessions.self-memory.json`
- Snapshot format is schema-versioned (`schemaVersion: 1`) and validated on load
- Malformed snapshots fail safe (tool remains usable; snapshot is repaired on next successful scoped persistence)

## Current runtime reality

- `dispatch_subagent` is wired, bounded, and backed by session/status artifacts plus the read-only dashboard and inspection commands.
- The package-level `pi-autonomous-session-control/execution` entrypoint now exposes the supported public execution contract for non-tool consumers.
- Prompt-envelope application, runtime compatibility checks, invariant summaries, failure-memory canary coverage, and Edge Contract Kernel adoption are all live.
- Scoped self-memory persistence is in place; remaining forward-looking work should live in `README.md` + `next_session_prompt.md`, not a separate `status.md` mirror.

## Live package activation

Install the package into Pi from its local package path:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
```

Then in Pi:

1. run `/reload`
2. verify with a real command or tool call from this package

## Docs map

- [Organization operating model](docs/org/operating_model.md)
- [Project foundation model](docs/project/foundation.md)
- [Project vision](docs/project/vision.md)
- [Project incentives](docs/project/incentives.md)
- [Project resources](docs/project/resources.md)
- [Tech stack local override](docs/tech-stack.local.md)
- [Project skills](docs/project/skills.md)
- [ASC public execution contract](docs/project/public-execution-contract.md)
- [Strategic goals](docs/project/strategic_goals.md)
- [Tactical goals](docs/project/tactical_goals.md)
- [Contributor guide](docs/dev/CONTRIBUTING.md)
- [Extension SOP](docs/dev/EXTENSION_SOP.md)
- [Trusted publishing runbook](docs/dev/trusted_publishing.md)
- [Next session prompt](next_session_prompt.md)

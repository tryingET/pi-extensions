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
| npm package | Package name (`@tryinget/pi-autonomous-session-control`) |
| git source | Repository URL |
| Local path | Resolved absolute path |

**During local development:**
- Do NOT add this package to global `~/.pi/agent/settings.json`
- Rely on project auto-discovery when working in this directory
- Use `pi -e /path/to/package` if you need the extension in another project temporarily

**After publishing to npm:**
```bash
pi install npm:@tryinget/pi-autonomous-session-control
```

**When both exist:**
- Local path and npm package are DIFFERENT identities → both load → conflicts
- Solution: During active development, remove the npm entry from global settings

To temporarily disable a global package while developing locally:
```bash
# Remove from global settings
pi remove npm:@tryinget/pi-autonomous-session-control

# Or manually edit ~/.pi/agent/settings.json and remove from packages array
```

To quickly test the extension in another project without installing:
```bash
pi -e /path/to/pi-autonomous-session-control
```

## Runtime dependencies and packaged files

This extension expects pi host runtime APIs and declares them as `peerDependencies`:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-ai`

For npm publishing, `package.json` uses a `files` whitelist so required runtime artifacts are explicit:

- `extensions/self.ts`
- `extensions/self/`
- `dist/` — precompiled JavaScript public execution graph and transport helper executed through `node` from installed packages
- `prompts/`
- `examples/`
- `policy/security-policy.json`

If your extension also needs extra runtime assets, add them to `files` intentionally.
Shared engineering policy now stays root-owned rather than shipping a package-local stack metadata file.

### Prompt surfaces and provenance

ASC owns two distinct prompt-related surfaces:

- package-owned prompt assets in `prompts/`, exposed through `package.json#pi.prompts` and shipped with the package install
- runtime prompt-envelope provenance returned by `dispatch_subagent` result details when callers provide `prompt_name`, `prompt_content`, `prompt_tags`, and `prompt_source`

Keep those surfaces separate from repo-root `.pi/prompts/*` operator prompts in the monorepo root.
Mock/unit prompt-vault contract tests run in the default package check. Live prompt-vault files use the non-default `.live.mjs` suffix, so `npm run check` does not discover them and reports zero live prompt-vault skips. The live cross-extension harness is host-dependent and opt-in; run `npm run test:live:prompt-vault` (or set `ASC_RUN_LIVE_PROMPT_VAULT_TESTS=1`) to prove the `vault_query` -> `vault_retrieve` -> `dispatch_subagent` chain preserves prompt provenance coherently, including the `vault-client-live` source label. When no `PI_VAULT_CLIENT_DIR` / `VAULT_CLIENT_DIR` override is set, the harness tries the legacy installed extension path and then the monorepo sibling `../pi-vault-client` package.

### Prompt-vault compatibility self-check

The `self-prompt-vault-compat` command reports the ASC package version, vault-client version, and prompt-vault schema version. Its ASC floor now comes from a safer feature/manifest policy: source manifests that declare the ASC package name, the public `./execution` export, and shipped `extensions/self` runtime files may use the package source floor (`0.1.0`), while missing/unparseable or feature-incomplete manifests fall back to the historical prompt-envelope floor (`0.1.3`). This avoids certifying arbitrary low manifests (for example `0.0.1`) solely because their checked package version is low. The Dolt schema probe is timeout-bounded and reports schema unavailable instead of hanging when the prompt-vault DB is slow or wedged.

### Capability discovery surfaces

The `self` tool accepts operational handoff queries such as `controller handoff summary` and `closeout summary`. These summaries are mirror-only: they aggregate tracked file touches, recent commands, errors, progress/stall state, loop state, file-budget advisories for touched files, context-pressure heuristics, and handoff cues for the caller to decide what to report. Context-pressure cues are deliberately heuristic: they can notice many turns, repeated install/reload/commit lifecycle commands, or multiple AK task-completion commands and suggest preparing a handoff, but they do not claim exact context-window/token budget or remaining capacity. They are not durable evidence, AK/KES authority, validation authority, or a controller. For proactive compaction/reload handoffs, canonical fresh-session prompt shape now belongs to `pi-session-compaction` (`/compact-handoff` and the `session_compaction_handoff` tool). `self({ query: "create self-contained handoff prompt" })` remains only an ASC mirror/convenience bridge when ASC has useful session-local cues; it must not become the canonical compaction engine. The prompt remains mirror-only and explicitly points fresh sessions back to git/AK/session evidence when ASC evidence is sparse after reload. When a handoff includes `nextMove`, `self({ query: "prefill suggested next move" })` copies that exact operator-facing suggestion into the Pi editor. For agent-actionable low-risk continuations, `self({ query: "continue suggested next move" })`, `self({ query: "continue safely" })`, and `self({ query: "next autonomous step" })` send a follow-up user message through `pi.sendUserMessage`; harness/peer/compaction/high-severity moves remain editor-prefilled for operator review instead of being advanced silently. `controller handoff summary`, explicit `record continuation candidate: <text>`, and the guarded continuation actions record a fresh same-cwd `self.continuation_candidate.v1` when they can see or are given a nextMove. Explicit recording stores a mirror-only hint only; it does not send, execute, launch peers, or write owner truth. When the current operation mirror is sparse after reload, guarded continuation queries may reuse scoped ASC memory; stale, cross-cwd, peer/harness/compaction/campaign/commit/evidence/release-like candidates still fail closed or prefill for review. For explicit low-risk operator notifications, `self({ query: "notify operator: <message>" })` and `self({ query: "send user message: <message>" })` route through the same `pi.sendUserMessage` follow-up seam; missing text and likely secret material fail closed, while action-directive text such as commands, peer launches, commits, durable records, or compaction is editor-prefilled for operator review rather than sent. Slash-command-looking text at the start of a message/line or embedded as a command token is never injected through `pi.sendUserMessage`; ASC reports whether editor prefill actually happened (`operator_submit_required`) or, when no UI is available, returns `operator_manual_submit_required` copy/submit instructions because extension-originated follow-up messages do not invoke Pi slash-command expansion and ASC must not become a hidden loop/campaign launcher.

The `self` tool also accepts `self memory status` / `memory lifecycle status` as a mirror-only status surface for its own scoped memory persistence. It reports the last persisted-memory load status plus counts for patterns, semantic-pressure annotations, traps, checkpoints, follow-ups, and continuation candidates; it does not promote ontology candidates, write evidence, record vents, launch loops, or create durable owner truth.

`self({ query: "action summary" })` reports checkpoint/follow-up totals plus mirror-only continuation candidate counts/previews, separating current-cwd fresh candidates from cross-cwd or expired candidates so agents can inspect whether a same-cwd continuation hint exists before asking the operator to restate context.

The `self` tool accepts `autonomy status` / `what level of autonomy is needed?` as a mirror-only explanation of the self-driving envelope. It makes the autonomy ladder explicit: Level 3 for supervised multi-session discovery/review, Level 4 for visible-loop campaigns, Level 5 for measured campaigns, and Level 6 only for explicitly gated durable owner-surface mutation. This status is not permission by itself and does not authorize hidden infinite loops, unbounded peer launch, candidate merge, owner writes, releases, or publication.

The `self` tool also accepts diagnostic-review queries such as `dogfood self`, `self-evolution`, `evolve self`, `how can self improve?`, and `what friction just happened?`. Diagnostic review is still mirror-only: it can name moment-level friction, return a typed `self.diagnostic_candidate.v1` payload, and suggest toolbox/`agent_vent` follow-up, but it does not write `agent_vent` records, create AK tasks/evidence, open issues, declare incidents, or persist diagnostic recurrence truth inside ASC. When callers provide explicit correction/focus context, diagnostic review prefers that context over recent mirror error evidence so a stale failed command does not hijack a package-specific self-evolution request. `self({ query: "continue diagnostic review" })` may send a low-risk `pi.sendUserMessage` follow-up that keeps working on the mirror-only diagnostic candidate; durable local diagnostic writes such as `self({ query: "prefill agent_vent record" })` remain editor-prefilled for operator review and now prefill `agent_vent action=preview` before any `record` write. The cross-package handoff contract is documented in [Self, toolbox, and agent_vent diagnostic boundary](../pi-agent-vent/docs/project/2026-06-05-self-toolbox-agent-vent-diagnostic-boundary.md).

Loop/stall responses from `self` are mirror-only advisories. Repeated successful validation, provenance-helper, VCS, or AK-completion commands may indicate productive workflow rather than stuckness; stall signals may coexist with recent command evidence when the mirror has not seen a recent file change. The caller decides what the session-local evidence means in task context.

The `self` tool accepts capability meta-queries such as `What can you do?`, `capability discovery`, and `capability routing`. Its response intentionally distinguishes five surfaces:

1. `self` query domains: perception, direction, crystallization, protection, and action queries understood by the ASC self mirror. Action-domain checkpoints and follow-ups are restart-persistent and can be reviewed with `action summary` before Level-4 handoff or dogfood closeout.
2. Toolbox/bundle discovery: use the Pi `toolbox` tool to search, explain, activate, deactivate, or inspect extension bundles. ASC does not add or replace that tool. Recurring agent frustration diagnostics belong to the separate `pi-agent-vent` package and same-named `agent_vent` toolbox bundle/tool, not ASC/self state.
3. Parallel work routing: use ASC-owned `dispatch_subagent` for bounded investigation, review, or testing when parallel cognition reduces risk or latency. Use visible candidate peers only when the controller/operator explicitly wants an isolated worktree mutation lane; candidates propose patches and do not merge, push, or promote themselves.
4. Repo/lane capability-map routing: use documentation surfaces such as `repo-capability-map.md` and `pi-extensions/docs/project/root-capabilities.md` to choose owning repos/packages and read-first docs. These maps are routing guidance, not runtime authority.
5. Durable authority boundaries: use AK/KES/evidence systems for canonical work-item, knowledge, and evidence state. `self` memory remains a session mirror/candidate scratchpad, not canonical AK/KES/evidence authority.

### Public execution contract

ASC now exposes a supported package-level execution seam for non-tool consumers:

```ts
import { createAscExecutionRuntime } from "@tryinget/pi-autonomous-session-control/execution";

const runtime = createAscExecutionRuntime({
  sessionsDir: "/tmp/pi-subagent-sessions",
  modelProvider: () => "openai-codex/gpt-5.4",
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

`modelProvider` may also inspect the execution context (for example `ctx?.model`) when you want public-runtime consumers to mirror the active session model instead of hard-coding one.

What this seam guarantees:
- the same core execution logic now backs both `dispatch_subagent` and public runtime consumers
- prompt-envelope application, request env policy, lifecycle invariants, runtime-owned concurrency reservation, session-name reservation, result shaping, assistant protocol classification, and abort propagation stay ASC-owned
- result surfaces now use one normalized failure taxonomy: canonical `result.details.status` (`done`, `aborted`, `timed_out`, `error`) plus `result.details.failureKind` for the specific failure branch
- a dedicated parity harness now proves those shared semantics stay aligned across the public runtime and the tool path
- downstream consumers should prefer `@tryinget/pi-autonomous-session-control/execution` over private `extensions/self/*` imports

Current verification split:
- ASC package-local tests prove seam semantics and transport-safety invariants
- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs` proves the narrow consumer-side adapter still preserves those semantics in repo-local source
- `packages/pi-society-orchestrator/tests/execution-seam-guardrails.test.mjs` fail-closes drift back to private ASC imports or a revived orchestrator-local execution path
- `npm run test:live:prompt-vault` opts into host-dependent live prompt-vault validation; it runs `tests/prompt-vault-db-integration.live.mjs` and `tests/prompt-vault-cross-extension.live.mjs` to prove real DB/vault-client coherence with ASC-owned prompt provenance on `dispatch_subagent`; default `npm run check` does not discover live prompt-vault files
- `cd packages/pi-society-orchestrator && npm run release:check` proves installed-package/import-graph truth for the packaged orchestrator artifact, including the current bundled ASC bridge while the temporary lifecycle defined in [bundled ASC bridge lifecycle](../pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md) remains in force
- the first time-boxed [execution seam review](../pi-society-orchestrator/docs/project/2026-03-31-execution-seam-review.md) still counts only one real external runtime consumer today (`pi-society-orchestrator`), so no seam widening is justified

Companion package doc:
- [ASC public execution contract](docs/project/public-execution-contract.md)

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Repository checks

Run:

```bash
npm run check
```

`check` routes to `quality:ci` via [scripts/quality-gate.sh](scripts/quality-gate.sh).
It enforces structure validation, Biome lint checks, optional TypeScript typechecks, default unit/mock tests, and npm pack dry-run. Host-dependent live prompt-vault DB / vault-client tests are not discovered by default because they use `.live.mjs` filenames; run them explicitly when the host has the vault DB, Dolt, and vault-client runtime available:

```bash
npm run test:live:prompt-vault
# equivalent env gate for focused node --test runs:
ASC_RUN_LIVE_PROMPT_VAULT_TESTS=1 node --test tests/prompt-vault-db-integration.live.mjs tests/prompt-vault-cross-extension.live.mjs
```

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
- root-owned stack review surface:
  - [../../docs/engineering.local.md](../../docs/engineering.local.md)
  - [../../docs/project/reduced-form-migration-contract.md](../../docs/project/reduced-form-migration-contract.md)

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
uv tool run --from ~/ai-society/core/engineering-core engineering-core show pi-ts --prefer-repo
```

Shared lane stance for this monorepo now lives at root in [../../docs/engineering.local.md](../../docs/engineering.local.md).

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
2. Current session model (`<provider>/<model-id>`) when available
3. Fixed fallback: `openai-codex/gpt-5.4`

The child still launches with `--no-extensions`, but ASC now supports explicit child-only extension bootstrap on top of that minimal base. Empty or whitespace-only requested/effective model selections fail before spawn as structured `model_selection_failed` results and do not expose internal concurrency counters. When the current model uses a numeric-suffix provider alias such as `openai-codex-2`, ASC auto-loads `pi-multi-pass` into the child so the same subscription-backed provider alias remains valid instead of being collapsed to the base provider. ASC also launches the raw child against an isolated copy of the Pi agent dir with a sanitized `settings.json`, so extensionless child runs do not inherit unrelated global default-model warnings from the parent's configured provider aliases.

**Dispatch contract and lifecycle policy:**
- Legacy `{ profile, objective }` requests remain supported. Optional structured fields add `deliverable`, `acceptanceCriteria`, `constraints`, `evidenceRequired`, `mutationPolicy`, `stopConditions`, `allowedPaths`, and `forbiddenPaths`; path fields are advisory task scope, not a filesystem sandbox.
- Profile defaults choose a child thinking level, and callers may select an allowlisted `thinking` value explicitly.
- `startupTimeout` is separately bounded from the execution `timeout`. `timeout=0` is unlimited only when `allowUnlimited=true` and the host sets `PI_SUBAGENT_ALLOW_UNLIMITED_TIMEOUT=true`.
- Each new dispatch gets a stable `dispatchId` and per-run `attemptId`. The canonical dispatch ID is printed in model-visible result content before child output so callers can copy it exactly even when child output is truncated. Only an exact repository- and parent-session-checked `resumeDispatchId` resumes an existing canonical JSONL; current and legacy token formats are accepted only when persisted status metadata matches exactly, missing ownership metadata fails closed, and repeated names keep collision-safe new-session behavior.
- `/subagent-cancel <dispatchId> [reason]` and public `runtime.cancel(...)` target one live child with verified process-start identity. Unsupported identity fails closed, failed signals roll back cancellation intent, and custom-spawner sidecars are observable but cannot signal the parent Pi process.
- Progress updates expose bounded phase/sequence, latest-tool, activity, and usage metadata. The helper probes `pi --version` and declares settlement capability in `transport_ready`: Pi >=0.80 requires exactly one authoritative `agent_settled` after the final terminal assistant outcome. The retained Pi 0.76 mode instead requires clean foreground JSON-mode exit plus final `agent_end.willRetry=false` after that outcome; undeclared streams cannot select this fallback, and unclassified versions fail closed.
- The public runtime returns structured failure results. The `dispatch_subagent` tool adapter throws those failures so Pi records the tool invocation as an error rather than a successful tool call containing `{ status: "error" }`.
- An owned helper exit before its synchronous `raw_child_spawn_intent` marker is classified as `subagent_helper_bootstrap_failed` and may carry `confirmed_no_effects` only when the parent observed an otherwise unambiguous protocol stream. Missing intent after malformed, oversized, or out-of-order protocol data stays effect-indeterminate. Once intent is observed, a nonzero exit before a valid terminal assistant outcome and settlement is `transport_exited_before_settlement` and also remains effect-indeterminate. Both paths preserve bounded transport stderr, exit code, and exit signal when present; partial child work never becomes success.

**Request env policy:**
- `DispatchSubagentRequest.env` is a per-dispatch child environment overlay for provenance sidecars only.
- Allowed keys must match `PI_PROVENANCE_*` (for example `PI_PROVENANCE_REVIEW_LANE_ID` or `PI_PROVENANCE_OUTPUT_FILE`).
- All other request env keys, including `PATH`, `NODE_OPTIONS`, and `PI_CODING_AGENT_DIR`, fail before spawn as structured `env_policy_failed` results; there is no privileged passthrough escape hatch.
- Allowed request env values reach the spawned helper/child process but are not echoed in result details.

**Child skill profile policy:**
- `DispatchSubagentRequest.skillProfile` resolves a named profile through the ai-society skill registry, starts the child with `--no-skills`, and passes a temporary materialized `--skill <dir>`.
- Raw `skills[]` path requests are reserved and rejected fail-closed; use named profiles rather than caller-supplied paths.
- ASC reports `skillProfile`, `loadedSkills`, `librarySkills`, `skillWarnings`, and `skillRegistry` in result/update details, but does not install, promote, or mutate skill-library sources.

**Session storage:**
- Default storage now uses an ASC-owned subdirectory inside Pi's native session tree for the current cwd: `~/.pi/agent/sessions/--<encoded-cwd>--/asc-subagents/`.
- `PI_CODING_AGENT_SESSION_DIR` is respected when Pi is configured to use a custom native session directory.
- `PI_SUBAGENT_SESSIONS_DIR` remains an escape hatch for a separate ASC-owned directory.
- `PI_SUBAGENT_CLEAR_ON_SESSION_START` — legacy startup cleanup flag; retained as a no-op compatibility knob because ASC preserves subagent traces by default
- `PI_SUBAGENT_ALLOW_DESTRUCTIVE_CLEANUP` — legacy compatibility knob; startup cleanup no longer deletes traces, use `/subagent-clear --delete` or `/subagent-cleanup --delete ...` for explicit destructive pruning
- `PI_SUBAGENT_RESERVE_SESSION_NAMES` — set to `false` to disable in-memory + file-lock reservation for rollback/debugging (default: enabled); owned status sidecars still occupy recorded session names to prevent trace reuse
- `PI_SUBAGENT_FILE_LOCK_SESSION_NAMES` — set to `false` to disable only cross-process file-lock reservation while keeping in-memory reservation (default: enabled; ignored when `PI_SUBAGENT_RESERVE_SESSION_NAMES=false`)
- `PI_SUBAGENT_LOCK_STALE_AFTER_MS` — stale-lock reclamation threshold in milliseconds for orphaned subagent locks that no longer have a live owning PID (default: `3600000`)
- `PI_SUBAGENT_EVENT_BUFFER_BYTES` — buffer for the filtered assistant-only subagent protocol consumed by ASC (default: `262144`)
- `PI_SUBAGENT_STDERR_CHARS` — maximum retained transport stderr characters for model-visible failure diagnostics and bounded status previews (default: `16000`)
- `PI_SUBAGENT_RAW_PI_EVENT_BUFFER_BYTES` — raw upstream `pi --mode json` line buffer inside the filter helper before aggregate events are dropped (default: `8388608`)

**Session artifact notes:**
- Subagent child runs are stored as `.jsonl` Pi session files so Pi-native session tooling, export/share workflows, and future dataset pipelines can discover the raw LLM trace.
- ASC keeps its lifecycle metadata in sidecars next to the child session (`<session>.status.json` and transient `<session>.lock`) rather than creating a separate hidden session world by default.
- Human Pi sessions in the same native directory are ignored by ASC statistics and by any explicitly destructive ASC cleanup unless they have an ASC status sidecar.
- `/subagent-clear` and `/subagent-cleanup` preserve traces by default; they delete only when passed `--delete`. Startup cleanup does not delete traces.
- Destructive pruning only deletes expected ASC trace names (`<session>.jsonl` / legacy `<session>.json`) plus matching ASC sidecars; a status sidecar cannot point deletion at an arbitrary contained trace.
- Unless `PI_SUBAGENT_MODEL` overrides it, subagents inherit the current session model when Pi exposes one; the fixed fallback `openai-codex/gpt-5.4` is only used when no current model is available.
- When that requested model points at a numeric-suffix provider alias supplied by an extension (for example `openai-codex-2` from multi-pass), ASC preserves that exact requested/effective model and auto-loads `pi-multi-pass` into the child runtime.
- `dispatch_subagent` also accepts `extensions: ["vault-client", "/abs/path/to/ext.ts", ...]` so a subagent can opt into specific extension-provided tools without inheriting the full parent extension surface.
- `dispatch_subagent` accepts `skillProfile: "minimal" | "ak" | "governance" | "dspx-skill-authoring"` when the child should load an allowlisted skill profile without inheriting all parent skills.
- Result details now expose both the selected model (`requestedModel` / `effectiveModel`) and explicit child bootstrap metadata (`loadedExtensions`, `extensionWarnings`, `skillProfile`, `loadedSkills`, `librarySkills`, `skillWarnings`, `skillRegistry`).
- Subagent transport now runs through a precompiled package-local JavaScript assistant-only JSON filter helper, so installed packages do not depend on Node TypeScript stripping or an ambient loader and large aggregate Pi payloads are removed before ASC parses the stream: `agent_end` is reduced to bounded `agent_run_end.willRetry` metadata for audited Pi 0.76 finality, while `turn_end` and `tool_execution_end` are dropped.
- ASC now treats the helper protocol as authoritative: raw Pi JSON events on the parent seam fail closed instead of being accepted as a compatibility fallback.
- Before spawning raw Pi, the current versioned helper (`subagent-pi-json-filter-v2`) synchronously emits `raw_child_spawn_intent`. The parent requires intent before readiness or lifecycle events. Only a clean owned-helper exit before intent proves helper-bootstrap no-effects; missing or rejected intent after any parser ambiguity stays effect-indeterminate, and observed intent conservatively keeps subsequent failures effect-indeterminate even when no later handshake arrives.
- Helper protocol generations use additive producer and parser filenames because a long-lived parent keeps its parser in memory while a source-path package checkout can change underneath it. Newly loaded parents bind to the paired `subagent-pi-json-filter-v2` / `subagent-protocol-v2` graph, and any future incompatible ordering must use a new generation rather than rewriting `v2`.
- The unversioned helper remains intent-v2 compatible for parents already loaded during the original `8852cbf7` transition. A stricter pre-`8852cbf7` parent cannot share that same mutable filename because it requires `transport_ready` first; those already-running sessions require one `/reload` after this fix lands. This transition limit is explicit rather than weakening either parser.
- Parent-side startup remains independently bounded; execution timeouts arm only after the helper emits one complete `transport_ready` handshake with the probed Pi version and settlement mode. The parent independently reclassifies that version, rejects missing/mismatched handshakes and pre-handshake lifecycle events, and does not let stdout noise or malformed startup output consume the execution budget.
- Helper shutdown now tears down the raw `pi` child process group before parent-side force kill, preventing orphaned raw subprocesses on timeout/abort.
- Lock files now store lightweight metadata (`pid`, `ppid`, `sessionName`, `createdAt`) so dead-parent reservations can be reclaimed automatically; live PIDs are never evicted solely due to age.
- Status sidecars (`<session>.status.json`) record `running|done|error|timeout|aborted|abandoned` plus dispatch/attempt identity, resumability/cancellation metadata, timeout phase, session file path, profile, model, tools, parent session key, parent repo root, bounded result/stderr previews, and pre-settlement transport failure classification; dead running sessions are reconciled to `abandoned` on next startup.
- Status sidecars now also keep a bounded `resultPreview` plus the originating live `parentSessionKey` when available so dashboard/inspection views can stay session-aware without parsing the whole session log.
- `subagent-status` now reports counts by terminal/runtime status for faster operator diagnosis.
- A read-only widget surfaces recent subagent sessions for the current live session only, appears only after this session dispatches a subagent, and auto-clears once entries age past 1 hour.
- If you want to keep subagent traces outside Pi's native session tree, set `PI_SUBAGENT_SESSIONS_DIR` to a durable external path (for example `~/.pi/subagent-sessions`). The default favors native Pi session storage because subagent traces are useful operator/eval data rather than disposable repo-local clutter.

**Dashboard commands:**
- `/subagent-dashboard` — open a read-only summary of recent subagent sessions, including current-session scope and bounded result previews
- `/subagent-inspect <session-name>` — open a derived inspection summary with lifecycle metadata, session scope, bounded replay notes, artifact paths, safety notes, and the raw status sidecar for a specific session

**Example:**
```bash
# Use a different model for subagents
PI_SUBAGENT_MODEL=github-copilot/gpt-4o pi

# Force extra child-only extensions for every subagent
PI_SUBAGENT_EXTENSIONS=vault-client,/abs/path/to/custom-extension.ts pi

# Optional separate ASC session directory instead of Pi-native sessions
PI_SUBAGENT_SESSIONS_DIR=/tmp/pi-sessions pi
```

## Self memory persistence

`self` now persists scoped memory domains across sessions:

- Crystallization (`remember` / `recall` patterns)
- Protection (`mark trap` / trap registry)

Retrieval behavior:

- Pattern recall accepts `context.topic` and natural filters such as `Recall patterns about peer protocol`.
- Pattern recall result details include a non-canonical `topicSummary` for quick topic counts.
- Trap listing accepts `context.topic` and natural filters such as `List traps about validation`.
- Trap listing result details include `topicSummary`; a trap's explicit `context.topic` is stored separately from proximity `triggers`, so retrieval categories cannot create warnings.

Persistence behavior:

- `PI_SELF_MEMORY_PATH` — explicit memory snapshot file path override
- Default path: sibling of the sessions directory, named `<sessionsDirBase>.self-memory.json`
  - default Pi-native sessions dir `~/.pi/agent/sessions/--<encoded-cwd>--` ⇒ default memory file `~/.pi/agent/sessions/--<encoded-cwd>--.self-memory.json`
- Snapshot format is schema-versioned (`schemaVersion: 1`) and validated on load
- Malformed snapshots fail safe (tool remains usable; snapshot is repaired on next successful scoped persistence)
- Self memory remains runtime-local mirror state, not canonical AK/KES/evidence authority.

## Current runtime reality

- `dispatch_subagent` is wired, bounded, and backed by session/status artifacts plus the read-only dashboard and inspection commands.
- The package-level `pi-autonomous-session-control/execution` entrypoint now exposes the supported public execution contract for non-tool consumers.
- ASC now carries an owned rewind runtime slice that captures exact rewind points on turn boundaries, integrates with Pi's built-in `/fork` and `/tree` lifecycle hooks, and can project bounded restore milestones into Replay Fabric when `ASC_REWIND_REPLAY_FABRIC_URL` is configured.
- Prompt-envelope application, runtime compatibility checks, invariant summaries, failure-memory canary coverage, and Edge Contract Kernel adoption are all live.
- Scoped self-memory persistence is in place for crystallization, protection, and action-domain checkpoint/follow-up state; remaining forward-looking work should live in `README.md` + `next_session_prompt.md`, not a separate `status.md` mirror.

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
- [Project skills](docs/project/skills.md)
- [ASC public execution contract](docs/project/public-execution-contract.md)
- [Self continuation harness suggestions](docs/project/self-continuation-harness-suggestions.md)
- [Self `/scoutpeer` continuation dogfood](docs/project/2026-05-22-self-scoutpeer-continuation-dogfood.md)
- [Rewind salvage and integration plan](docs/project/2026-04-22-rewind-salvage-and-integration-plan.md)
- [Strategic goals](docs/project/strategic_goals.md)
- [Tactical goals](docs/project/tactical_goals.md)
- [Contributor guide](docs/dev/CONTRIBUTING.md)
- [Extension SOP](docs/dev/EXTENSION_SOP.md)
- [Trusted publishing runbook](docs/dev/trusted_publishing.md)
- [Next session prompt](next_session_prompt.md)

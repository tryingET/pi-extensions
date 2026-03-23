---
summary: "Overview and quickstart for monorepo package pi-vault-client."
read_when:
  - "Starting work in this package workspace."
system4d:
  container: "Monorepo package scaffold for pi vault delivery."
  compass: "Ship safe package-level iterations inside the shared pi-extensions workspace."
  engine: "Read package context -> implement focused slice -> validate package + monorepo contracts."
  fog: "Main drift risk is carrying standalone-repo assumptions into the monorepo package home."
---

# pi-vault-client

Monorepo package for vault workflows in pi.

- Workspace path: `packages/pi-vault-client`
- Canonical monorepo root: `~/ai-society/softwareco/owned/pi-extensions`
- Legacy standalone repo: retired from active development

## Runtime dependencies

This package expects Prompt Vault schema v9 and pi host runtime APIs.

Prompt rows are consumed through these canonical fields:

- `artifact_kind`
- `control_mode`
- `formalization_level`
- `owner_company`
- `visibility_companies`
- `controlled_vocabulary`
- `export_to_pi`

This package declares pi APIs as `peerDependencies`:

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`
- `@mariozechner/pi-tui`

The package keeps a narrow local seam over the shared interaction runtime packages (`@tryinget/pi-interaction-kit` and `@tryinget/pi-trigger-adapter`) without hand-maintaining a fork of their source.

Current package-boundary contract:

- local monorepo development consumes the shared interaction packages through `file:` dependencies pinned to sibling package paths
- publish/pack flows rewrite those `file:` specs back to versioned manifest entries during `prepack` and restore the working manifest in `postpack`
- no local vendored bridge or bundled-dependency staging remains in the active packaging path
- `npm run build:runtime` generates installable `.js` entrypoints for this package's TypeScript runtime surface

Runtime `.js` entrypoints are generated from the package `*.ts` sources by `npm run build:runtime` and by `prepack`, so installed tarballs load through `extensions/vault.js` instead of relying on TypeScript execution inside `node_modules`.

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.
`/vault-check` is interactive-only; use `vault_schema_diagnostics` or the isolated headless smoke below for `pi -p` verification.

## Package checks

Run from package directory:

```bash
npm install
npm run check
```

Notes:

- `npm run check` regenerates the installed-package runtime `.js` artifacts before running the package gate.
- `npm run test:compat:live-trigger-contract` is the focused validation lane for live `/vault:` behavior across the shared trigger broker, the `150ms` debounce contract, and picker fallback behavior.
- `npm run release:check` proves publish-file determinism, static runtime import coverage, clean-room tarball install, and installed-package smoke.
- if you want the root-owned Pi host compatibility canary for this same seam, run `npm run compat:canary -- --profile current --scenario vault-live-trigger-contract` from the monorepo root.
- if you want to refresh the live-installable runtime without a full check, run `npm run build:runtime`.

Or from monorepo root:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/full.sh
```

## Release metadata

This package writes component metadata in `package.json` under `x-pi-template`:

- `scaffoldMode`
- `workspacePath`
- `releaseComponent`
- `releaseConfigMode`

Use these values when wiring monorepo-level release-please component maps.

## Command surface

Kept commands:

- `/vault`
- live `/vault:`
- `/vault-search`
- `/route`
- `/vault-stats`
- `/vault-check`
- `/vault-live-telemetry`
- `/vault-fzf-spike`
- `/vault-last-receipt` — latest local receipt visible to the current company
- `/vault-receipt <execution_id>` — exact local receipt if visible to the current company
- `/vault-replay <execution_id>` — deterministic replay report for one visible local receipt

Current `/vault` behavior:

- `/vault` opens the full picker
- `/vault <exact-name>` loads the exact exported-and-visible match directly
- `/vault <fuzzy-query>` falls back to picker mode with the query applied
- live `/vault:` uses the shared interaction runtime, applies a short debounce (`150ms`) to avoid rapid-fire picker churn, and allows bare `/vault:` with a follow-up filter prompt
- visibility-sensitive slash-command reads (`/vault`, `/vault:`, `/vault-search`, `/route`, grounding) now fail closed when no explicit company context is available
  - set `PI_COMPANY` or invoke from a company-scoped cwd
  - cwd inference now matches exact workspace/company path segments (for example `ai-society/softwareco/...`) instead of arbitrary substrings; if your checkout path is ambiguous, set `PI_COMPANY`
- canonical Pi-visible reads now centralize on `status='active'` + `export_to_pi=true` + visibility-company filtering
- `/vault`, live `/vault:`, `/route`, and grounding now queue execution provenance at preparation time but write the actual execution row only when the prepared prompt is sent as a real user message
  - opening a template in the editor no longer counts as a successful execution by itself

Tool-query defaults:

- `vault_query` defaults to `limit: 20`
- `vault_executions` defaults to `limit: 20`
- `include_content` defaults to `false`
- `include_governance` defaults to `false`
- `vault_query`, `vault_retrieve`, `vault_replay`, and `vault_executions` use explicit tool-call `ctx.cwd` when available so visibility-sensitive reads stay session-aware on the tool surface too
- visibility-sensitive tool reads now fail closed when no explicit company context is available on the tool surface
  - set `PI_COMPANY` or invoke from a company-scoped cwd
- governed ontology/visibility contracts now refresh in-process when the underlying contract files change
- cross-company `visibility_company` overrides are rejected on the tool surface; use explicit company context for the target company instead of read-side impersonation
- optional `intent_text` can re-rank the governed candidate set without changing visibility/status filtering
- if you already know your working stage, query directly by `formalization_level` instead of using semantic ranking
  - `vault_query({ formalization_level: ["napkin"] })`
  - `vault_query({ artifact_kind: ["procedure"], formalization_level: ["workflow"] })`
- rotate your query style based on what you know already
  - by stage: `vault_query({ formalization_level: ["bounded"] })`
  - by control mode: `vault_query({ control_mode: ["router"], formalization_level: ["structured"] })`
  - by artifact kind: `vault_query({ artifact_kind: ["session"] })`
  - by intent only: `vault_query({ intent_text: "simplify and make retrieval feel almost alien" })`
- for exact feedback binding, inspect recent execution provenance first
  - `vault_executions({ template_name: "nexus", limit: 10 })`
  - if Prompt Vault execution-row lookup fails but local receipts still exist, `vault_executions` now emits an explicit warning and marks the result as partial instead of silently presenting receipt-only success as full truth
- local execution receipts now preserve immutable execution-bound template/company/render snapshots in package-owned JSONL
  - default spool path: `~/.pi/agent/state/pi-vault-client/vault-execution-receipts.jsonl`
  - emergency fallback spool path: `os.tmpdir()/pi-vault-client/vault-execution-receipts.fallback.jsonl`
  - override directory with `PI_VAULT_RECEIPTS_DIR`
  - queued prepared prompts now carry an opaque hidden execution marker so send-time binding can verify the exact prepared prompt at send time
  - execution markers are stripped from user messages before the LLM sees them
  - if the final sent prompt no longer matches the prepared prompt exactly, Vault skips execution logging and local receipt persistence instead of attributing the edited send to the original template
  - if the primary receipt sink is unavailable, Vault falls back to an emergency temp-backed receipt sink before surfacing a send-time warning
  - if every receipt sink fails after execution logging succeeds, Vault now surfaces that as an explicit degraded send-time state instead of silently pretending receipt persistence succeeded
  - `vault_executions` prefers local receipts when present so later archive/export drift does not erase recent provenance from this package's own execution paths
  - `vault_replay({ execution_id })` and `/vault-replay <execution_id>` now expose the local replay core directly with deterministic `match` / `drift` / `unavailable` reporting keyed to the exact execution id

### Receipt and replay operator workflow

- receipts are execution-bound, not editor-bound
  - prepare a prompt first, then send that prepared prompt as a real user message before expecting a local receipt or replayable `execution_id`
  - if you materially edit the prepared prompt before send, Vault now skips execution logging/receipt persistence rather than recording a misleading template execution
- use exact ids end to end
  - interactive: `/vault-last-receipt` to grab the latest visible receipt, then `/vault-receipt <execution_id>` or `/vault-replay <execution_id>`
  - headless/tooling: `vault_executions({ template_name, limit })` to enumerate exact ids, then `vault_replay({ execution_id })`
- replay status contract stays fixed
  - `match` = regenerated prompt still matches the stored prepared baseline
  - `drift` = replay succeeded but the current template/runtime state no longer matches the stored baseline
  - `unavailable` = replay could not be completed truthfully
- visibility stays fail-closed
  - explicit company context is required for receipt inspection and replay surfaces
  - `/vault-receipt <execution_id>` and `/vault-replay <execution_id>` only open visible local receipts in the current company context
  - `vault_replay({ execution_id })` returns the same replay contract on the tool surface, and treats non-visible receipts as `receipt-missing` rather than leaking template identity

Tool mutation surface:

- mutation tools now pass explicit tool-call context when available and disable ambient process-cwd fallback on the tool surface
  - if a tool runtime cannot provide `ctx.cwd`, prefer setting `PI_COMPANY` explicitly for mutation calls
- `vault_insert(...)` now inserts new templates only and fails closed when the exact `name` already exists.
  - mutation requires an explicit active company context (`PI_COMPANY` or a company-scoped cwd)
  - `owner_company` must match the active mutation company
- `vault_update({ name, ...patch })` is the explicit in-place update path for agents.
  - exact `name` only
  - owner-only: the active mutation company must own the current row
  - loads the current row first
  - merges only provided fields
  - revalidates the merged template against schema-v9 ontology/governance/controlled-vocabulary contracts
  - rejects blank content, frontmatter-only bodies, and unsupported explicit `render_engine` values at mutation time
  - uses optimistic locking on `version`; stale writers fail closed and must retry from fresh state
  - no fuzzy targeting, bulk mutation, rename behavior, or owner reassignment in this first slice
- `vault_rate({ execution_id, ... })` now binds feedback to an exact execution row instead of a template name.
  - use `vault_executions(...)` first to retrieve the exact `execution_id`
  - feedback insert succeeds only when exactly one feedback row is written for that execution
  - when a local receipt exists for that execution, `vault_rate` uses the receipt's immutable visibility snapshot so later template archive drift does not block feedback for package-originated executions
  - mutation still uses explicit company context so feedback writes do not silently inherit ambient process cwd

Use `/vault-check` to inspect schema compatibility, resolved company context, and visibility of key shared templates in the interactive TUI.
Use `vault_schema_diagnostics()` on the tool surface when headless or when startup is running in schema-mismatch diagnostic mode.
Schema compatibility now requires Prompt Vault schema `9`, `prompt_templates.version`, and the execution/feedback provenance + capture columns (`executions.entity_version`, `executions.output_capture_mode`, `executions.output_text`, `feedback.execution_id`, etc.) because optimistic locking, exact feedback binding, and execution-capture awareness depend on them.
`/vault-check` now reports expected vs actual schema version plus missing prompt/execution/feedback columns when the boundary is broken.
When schema compatibility fails, the extension stays loaded in diagnostic mode so `/vault-check` and `vault_schema_diagnostics()` remain available even while vault query/mutation surfaces stay gated.

## Dolt temp-dir contract

Vault Dolt subprocesses resolve a writable temp directory in this order:

1. `PI_VAULT_TMPDIR`
2. `${VAULT_DIR}/.dolt/tmp`
3. `${VAULT_DIR}/.tmp`
4. `os.tmpdir()`

Notes:

- execution probes actual writability by creating and removing a temp directory before Dolt runs, so inode exhaustion and bad paths fail fast
- diagnostic surfaces (`/vault-check`, `vault_schema_diagnostics()`) inspect the same candidate order without creating repo-local fallback directories
- if an explicit `PI_VAULT_TMPDIR` is invalid, Vault falls back to the next viable candidate instead of failing closed immediately
- `/vault-check` and `vault_schema_diagnostics()` now report the resolved Dolt temp status/source/path plus probe attempts
- if a Vault error mentions `Dolt temp dir: ...`, inspect both bytes and inodes on host temp storage
  - `df -h /tmp`
  - `df -i /tmp`

## Isolated live validation

For a headless schema-diagnostic call that remains available even during schema mismatch:

```bash
PI_COMPANY=software \
pi --no-extensions -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p \
  "Do not use bash or read. Call the custom tool named vault_schema_diagnostics exactly once with empty arguments, then reply with only SUCCESS or FAILURE based on whether the tool call succeeded."
```

For a headless query smoke that avoids unrelated auto-discovered extensions:

```bash
PI_COMPANY=software \
pi --no-extensions -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p \
  "Do not use bash or read. Call the custom tool named vault_query with limit 1 and include_content false, then reply with only SUCCESS or FAILURE based on whether the tool call succeeded."
```

For a headless replay-boundary smoke keyed to an exact `execution_id`:

```bash
PI_COMPANY=software \
pi --no-extensions -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p \
  "Do not use bash or read. Call the custom tool named vault_replay exactly once with execution_id 999999. If the tool call succeeds and returns text mentioning both 'status: unavailable' and 'receipt-missing', reply with only SUCCESS. Otherwise reply with only FAILURE."
```

For the focused shared-runtime live-trigger contract (shared broker, `150ms` debounce, bare `/vault:` query prompt, picker fallback):

```bash
npm run test:compat:live-trigger-contract
```

For the root-owned Pi host compatibility canary scenario covering the same seam:

```bash
cd /home/tryinget/ai-society/softwareco/owned/pi-extensions
npm run compat:canary -- --profile current --scenario vault-live-trigger-contract
```

For interactive slash-command validation in an isolated runtime:

```bash
export PI_COMPANY=software
pi --no-extensions -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
# then inside pi:
# /vault-check
# /vault meta-orchestration
# /vault:meta-orchestration
```

## Render engine contract

Template rendering is a client-layer concern above Prompt Vault storage.

Supported render engines:

- `none` — plain prompt body, no variable substitution
- `pi-vars` — explicit pi-style positional substitution (`$1`, `$2`, `$@`, `$ARGUMENTS`, `${@:N}`)
- `nunjucks` — opt-in safe variable-only interpolation against the governed render context

Phase-1 contract:

- storage remains schema-v9 compatible; render metadata is carried in prompt-content frontmatter
- if `render_engine` is omitted, generic execution paths treat the template as `none`
- generic `/vault` and live `/vault:` do **not** auto-detect legacy pi-vars syntax from raw prompt text
- specific internal grounding paths may opt into legacy pi-vars auto-detection explicitly while stored templates are migrated
- `nunjucks` renders only when explicitly declared via frontmatter
- `nunjucks` supports variable interpolation such as `{{ current_company }}`, `{{ context }}`, and `{{ args[0] }}` only
- Nunjucks blocks/comments/filters/function calls/prototype traversal are rejected explicitly
- retrieval stays raw; execution paths strip frontmatter and render on use
- frontmatter parsing accepts both LF and CRLF-authored templates
- literal `{{ ... }}` sequences inside substituted data are preserved rather than treated as template syntax

Frontmatter example:

```md
---
render_engine: nunjucks
---
Company: {{ current_company }}
Context: {{ context }}
Template: {{ template_name }}
```

Governed render context keys (path-dependent availability):

- `args`
- `arguments`
- `arg1`, `arg2`, ...
- `current_company`
- `context`
- `template_name`

Current execution behavior:

- grounding flows such as `next-10-expert-suggestions` can explicitly opt into legacy pi-vars auto-detection and pass positional args
- `/vault`, live `/vault:`, `/route`, and grounding now route through a shared structured preparation step with explicit inputs (`currentCompany`, `context`, `args`, `templateName`) and structured success/error output
- `/vault` and live `/vault:` strip frontmatter before inserting prompt text
- `/vault` and live `/vault:` currently populate `current_company`, `context`, and `template_name` but do not supply positional args
- explicit `pi-vars` templates now fail clearly on execution paths that do not provide the positional args they require; they no longer degrade into silent empty-string substitution
- if a Nunjucks template does not reference `context`, the shared preparation step appends a deterministic `## CONTEXT` section instead of silently dropping caller context
- extra render `data` cannot override governed keys such as `current_company`, `context`, `template_name`, `arguments`, or `argN`
- explicit Nunjucks templates render inline at execution time through the safe variable-only subset
- shared preparation now also governs framework-grounding appendices, so migrated framework templates render or fail through the same contract instead of bypassing it as raw text
- unsafe or malformed Nunjucks syntax surfaces explicitly on live vault execution paths
- session-sensitive company resolution is pinned through explicit `ctx.cwd` handoff and session tracking instead of relying only on ambient process cwd
- for visibility-sensitive live verification, pin `PI_COMPANY` instead of relying on cwd inference alone

See [live render-engine validation](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/live-render-engine-validation.md) for installed-package verification evidence, and [legacy render-engine rollout](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/legacy-render-engine-rollout.md) for the operator migration boundary.

## Live package activation

Install the package into Pi from its local package path:

```bash
npm run build:runtime
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
```

Then in Pi:

1. run `/reload`
2. verify with a real command or tool call from this package

For publish-safe validation from the package root, run:

```bash
npm run release:check
```

That release gate now covers:

- `npm pack --dry-run --json`
- portable doc-surface validation for shared markdown in the working tree
- packed-artifact markdown/link validation against the actual tarball contents
- packed README immutability audit so published docs links do not float on `main`
- static runtime dependency audit for bare imports
- packed-manifest dependency rewrite validation
- clean-room tarball install
- `pi install` tarball registration check
- installed-package extension registration smoke

## Docs discovery

```bash
npm run docs:list
npm run docs:list:workspace
npm run docs:list:json
```

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

## Docs map

Repository docs for this package live in the monorepo and are linked below through stable GitHub URLs so the published package README stays portable too.
During `prepack`, those GitHub blob links are pinned to the exact source commit used to build the artifact so the published README does not drift with later `main` changes.

- [Organization operating model](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/org/operating_model.md)
- [Project foundation](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/project/foundation.md)
- [Project vision](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/project/vision.md)
- [Project incentives](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/project/incentives.md)
- [Project resources](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/project/resources.md)
- [Trusted publishing runbook](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/trusted_publishing.md)
- [Vault execution receipts architecture](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/vault-execution-receipts.md)
- [V4 runtime-receipts runtime-target binding](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/v4-runtime-receipts-runtime-target-binding.md)
- [Prompt Vault v9 cutover](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/v9-cutover.md)
- [Historical Prompt Vault relocation handoff](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/prompt-vault-v2-relocation-handoff.md)
- [Live render-engine validation](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/live-render-engine-validation.md)
- [Legacy render-engine rollout](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/docs/dev/legacy-render-engine-rollout.md)
- [Company-context hardening diary](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/diary/2026-03-12-company-context-hardening.md)
- [Replay core diary](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/diary/2026-03-12-vre-08-replay-core.md)
- [Replay surface diary](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/diary/2026-03-12-vre-09-replay-surface.md)
- [Replay docs/tests diary](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/diary/2026-03-12-vre-10-docs-tests.md)
- [Previous receipt hardening diary](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/diary/2026-03-12-receipt-hardening.md)
- [V4 runtime-receipts binding diary](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/diary/2026-03-21-v4-runtime-receipts-runtime-target-binding.md)
- [Next session prompt](https://github.com/tryingET/pi-extensions/blob/main/packages/pi-vault-client/NEXT_SESSION_PROMPT.md)

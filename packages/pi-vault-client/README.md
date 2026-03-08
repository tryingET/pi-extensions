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

This package expects Prompt Vault schema v7 and pi host runtime APIs.

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

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Package checks

Run from package directory:

```bash
npm install
npm run check
```

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

Current `/vault` behavior:

- `/vault` opens the full picker
- `/vault <exact-name>` loads the exact visible match directly
- `/vault <fuzzy-query>` falls back to picker mode with the query applied
- live `/vault:` uses the shared interaction runtime and allows bare `/vault:` with a follow-up filter prompt

Tool-query defaults:

- `vault_query` defaults to `limit: 20`
- `include_content` defaults to `false`
- `include_governance` defaults to `false`
- optional `intent_text` can re-rank the governed candidate set without changing visibility/status filtering
- if you already know your working stage, query directly by `formalization_level` instead of using semantic ranking
  - `vault_query({ formalization_level: ["napkin"] })`
  - `vault_query({ artifact_kind: ["procedure"], formalization_level: ["workflow"] })`
- rotate your query style based on what you know already
  - by stage: `vault_query({ formalization_level: ["bounded"] })`
  - by control mode: `vault_query({ control_mode: ["router"], formalization_level: ["structured"] })`
  - by artifact kind: `vault_query({ artifact_kind: ["session"] })`
  - by intent only: `vault_query({ intent_text: "simplify and make retrieval feel almost alien" })`

Use `/vault-check` to inspect schema compatibility, resolved company context, and visibility of key shared templates.

## Live sync helper

Use [scripts/sync-to-live.sh](scripts/sync-to-live.sh) to copy the extension entrypoint plus shared `src/` modules into `~/.pi/agent/extensions/vault-client/`.

Optional flags:

- `--with-prompts`
- `--with-policy`
- `--all`

After sync, run `/reload` in pi.

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

- [Organization operating model](docs/org/operating_model.md)
- [Project foundation](docs/project/foundation.md)
- [Project vision](docs/project/vision.md)
- [Project incentives](docs/project/incentives.md)
- [Project resources](docs/project/resources.md)
- [Trusted publishing runbook](docs/dev/trusted_publishing.md)
- [Prompt Vault v2 relocation handoff](docs/dev/prompt-vault-v2-relocation-handoff.md)
- [Next session prompt](NEXT_SESSION_PROMPT.md)

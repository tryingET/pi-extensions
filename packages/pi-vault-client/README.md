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

This package expects pi host runtime APIs and declares them as `peerDependencies`:

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

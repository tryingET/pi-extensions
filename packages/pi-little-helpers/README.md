---
summary: "Overview and quickstart for monorepo package @tryinget/pi-little-helpers."
read_when:
  - "Starting work in this package workspace."
system4d:
  container: "Monorepo package for small Pi helper workflows."
  compass: "Keep package behavior useful for daily operator work while aligning to monorepo contracts."
  engine: "Implement focused package changes -> validate package -> validate monorepo root when needed."
  fog: "Main risk is drifting from the legacy package behavior during migration into the monorepo."
---

# @tryinget/pi-little-helpers

Canonical monorepo home for the former standalone `pi-little-helpers` extension package.

- Workspace path: `packages/pi-little-helpers`
- Release component key: `pi-little-helpers`
- Legacy standalone source: `~/programming/pi-extensions/pi-little-helpers`

## Extensions

| Extension | Description |
|---|---|
| `code-block-picker` | Pick a code block from the conversation and copy it safely to the clipboard |
| `html-output-browser` | Auto-open written/edited HTML files in the browser and append clickable `file://` links to the tool output |
| `package-update-notify` | Check for updates to pinned npm/git packages in Pi settings |
| `stash` | Persist and restore stashed editor content across sessions |

Shared utilities live in [lib/package-utils.ts](lib/package-utils.ts).

## Runtime dependencies

This package expects Pi host runtime APIs and declares them as peer dependencies:

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Package checks

From the package directory:

```bash
npm install
npm run check
npm run release:check:quick
```

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-little-helpers
```

## Live package activation

Install the package into Pi from this package directory:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-little-helpers
```

Then in Pi:

1. run `/reload`
2. verify `/codeblocks`, the `stash` shortcuts/commands, and any `write`/`edit` flow that produces an `.html` file in a real session

## Docs discovery

```bash
npm run docs:list
npm run docs:list:workspace
npm run docs:list:json
```

## Release metadata

This package keeps component metadata in `package.json` under `x-pi-template`:

- `workspacePath`
- `releaseComponent`
- `releaseConfigMode`

Monorepo release automation is root-owned; package metadata must stay aligned with the root release-component map.

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

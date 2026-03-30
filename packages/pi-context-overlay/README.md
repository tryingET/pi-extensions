---
summary: "Overview and quickstart for @tryinget/pi-context-overlay."
read_when:
  - "Starting work in this package workspace."
system4d:
  container: "Monorepo package for Pi context inspection UX."
  compass: "Keep the overlay operator-focused and host-compatible without collapsing it into lower-level runtime packages."
  engine: "Template scaffold -> package-specific implementation -> validate in-package and live in Pi."
  fog: "Main risk is Pi host API drift across custom UI/keybinding helpers."
---

# @tryinget/pi-context-overlay

Context inspector overlay for Pi sessions.

## Why this is a standalone package

This feature started as a local operator extension under `~/.pi/agent/extensions/context-overlay`.
It does **not** belong in `packages/pi-interaction/` because it is not an interaction-runtime primitive like editor ownership, trigger routing, or shared UI/runtime adapters.

`@tryinget/pi-context-overlay` is a higher-level operator feature:
- registers the `/c` command
- renders a context inspection overlay
- helps open context-related files in zellij
- ships the `context-report` prompt

So the right monorepo home is its own package seam:
- package path: `packages/pi-context-overlay`
- release component: `pi-context-overlay`
- package name: `@tryinget/pi-context-overlay`

This package was re-scaffolded from `~/ai-society/softwareco/owned/pi-extensions-template` and then remigrated from the local-only extension implementation.

## Commands

- `/c` — open the context inspector overlay
- `/context-report` — generate a concise context-window report

## Package contents

- `extensions/context-overlay.ts` — extension entrypoint
- `src/` — overlay component, snapshot store, token estimation, grouping logic
- `prompts/context-report.md` — prompt template for textual context reports

## Runtime dependencies

This package expects Pi host runtime APIs and declares them as peer dependencies:

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`
- `@mariozechner/pi-tui`

## Verify

```bash
npm install
npm run check
npm run release:check:quick
```

## Live package activation

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-context-overlay
```

Then in Pi:

```text
/reload
```

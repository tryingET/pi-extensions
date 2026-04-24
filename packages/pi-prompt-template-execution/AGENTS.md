---
summary: "Package scope note for pi-prompt-template-execution."
read_when:
  - "You are editing files under packages/pi-prompt-template-execution/."
---

# AGENTS.md — pi-prompt-template-execution

## Scope

`packages/pi-prompt-template-execution/` is the live monorepo-owned successor for model/thinking/args prompt-template execution semantics formerly provided by the external `npm:pi-prompt-template-model` package.

This package is template-baseline-aligned with `../pi-extensions-template` and now exposes a deliberately minimal live Pi extension entrypoint. It registers prompt-template execution commands through the guarded registration path, but does **not** expose package prompt bundles or `package.json#pi.prompts`.

## Boundaries

- Own prompt-template execution semantics for model, thinking, restore, conditionals, and args.
- Do not own prompt picker/prefill UX; that remains `pi-prompt-template-accelerator`.
- Do not own loops/chains/workflows; those belong in `packages/pi-society-orchestrator/`.
- Do not create another subagent runtime; delegated execution must use ASC when that later slice exists.
- Do not reinstall `npm:pi-prompt-template-model` while this package is the live prompt-template execution owner unless performing an explicit rollback.

## Current implementation status

The package has pure loader, argument substitution, model-conditional rendering, skill frontmatter resolution helpers, execution-plan tests, command runner, Pi host adapter, live extension entrypoint, dry-run diagnostic report, pure compatibility canary helpers, real `/commit` fixture parity tests, safety report, and fail-closed command registration guard. The live entrypoint intentionally filters Pi core prompt-template metadata commands out of extension-owner collision checks, while still blocking duplicate extension command owners.

## Validation

```bash
npm run test
npm run check
```

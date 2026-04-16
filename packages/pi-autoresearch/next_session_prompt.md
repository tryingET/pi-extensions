---
summary: "Handoff prompt for package @tryinget/pi-autoresearch inside the pi-extensions monorepo."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep the bounded runtime kernel honest while deeper control-plane integration is still pending."
  engine: "Validate the bounded runtime baseline -> land one explicit next slice -> refresh docs and tests."
  fog: "The main risk is jumping from bounded local runtime support to broad autonomy without preserving the explicit package/control-plane split."
---

# Next session prompt for @tryinget/pi-autoresearch

## Session objective

Continue package work only inside the bounded local experiment-runtime seam.

## Package context

- workspace path: `packages/pi-autoresearch`
- release component key: `pi-autoresearch`
- extension entry: `extensions/pi-autoresearch.ts`
- current runtime tools: `autoresearch_runtime_status`, `autoresearch_runtime_run`
- current command: `/autoresearch`

## Quick start

```bash
npm install
npm run check
npm run release:check:quick
```

## Suggested next bounded slices

1. bind bounded runtime sessions to AK task/campaign truth
2. narrow the safer finalization and git path for kept runs
3. improve operator docs/examples now that the bounded runtime kernel is real
4. keep Prompt Vault, AK, and ontology ownership split explicit

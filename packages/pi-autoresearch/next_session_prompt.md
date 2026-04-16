---
summary: "Handoff prompt for package @tryinget/pi-autoresearch inside the pi-extensions monorepo."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep the first package shell stable while the bounded runtime kernel is still pending."
  engine: "Validate shell baseline -> land one bounded runtime slice -> refresh docs and tests."
  fog: "The main risk is skipping from shell scaffolding to broad autonomy without preserving the explicit package/control-plane split."
---

# Next session prompt for @tryinget/pi-autoresearch

## Session objective

Continue package work only inside the bounded local experiment-runtime seam.

## Package context

- workspace path: `packages/pi-autoresearch`
- release component key: `pi-autoresearch`
- extension entry: `extensions/pi-autoresearch.ts`
- current shell tool: `autoresearch_runtime_status`
- current shell command: `/autoresearch`

## Quick start

```bash
npm install
npm run check
npm run release:check:quick
```

## Suggested next bounded slices

1. add real JSONL append/load helpers around the receipt model
2. add benchmark/check contract helpers
3. add a first truthful runtime command/tool beyond shell status
4. keep Prompt Vault, AK, and ontology ownership split explicit

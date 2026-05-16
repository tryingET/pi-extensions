---
summary: "Handoff prompt for package @tryinget/pi-better-openai inside monorepo workspace."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep package behavior stable while aligning to monorepo contracts."
  engine: "Validate package baseline -> implement focused slice -> update docs/checkpoint."
  fog: "Biggest risk is package/local fixes that diverge from monorepo conventions."
---

# Next session prompt for @tryinget/pi-better-openai

## Session objective

Implement one focused package slice while preserving monorepo compatibility.

## Package context

- workspace path: `packages/pi-better-openai`
- release component key: `pi-better-openai`
- primary extension entry: `extensions/fast.ts`

## Quick start

```bash
# from package directory
npm run check
npm run release:check:quick
```

## Session checklist

1. Read `AGENTS.md` and relevant docs.
2. Implement one scoped change.
3. Run `npm run check`.
4. If release surface changed, run `npm run release:check:quick`.
5. Update docs and this handoff prompt.

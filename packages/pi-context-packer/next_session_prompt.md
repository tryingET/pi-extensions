---
summary: "Handoff prompt for package @tryinget/pi-context-packer inside monorepo workspace."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep package behavior stable while aligning to monorepo contracts."
  engine: "Validate package baseline -> implement focused slice -> update docs/checkpoint."
  fog: "Biggest risk is package/local fixes that diverge from monorepo conventions."
---

# Next session prompt for @tryinget/pi-context-packer

## Session objective

Implement one focused package slice while preserving monorepo compatibility.

Latest landed slice: dogfood observation/evaluation/aggregate surfaces now carry redacted `activityType` labels so implementation/review/validation receipt coverage is visible without becoming evidence or completion proof.

## Package context

- workspace path: `packages/pi-context-packer`
- release component key: `pi-context-packer`
- primary extension entry: `extensions/context-pack.ts`

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

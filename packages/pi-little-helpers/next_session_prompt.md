---
summary: "Handoff prompt for package @tryinget/pi-little-helpers inside the pi-extensions monorepo."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep migrated helper behavior stable while finishing legacy-repo shutdown."
  engine: "Validate package baseline -> make one focused change -> update package docs/handoff."
  fog: "Main risk is fixing the canonical package while Pi still points at the legacy standalone path."
---

# Next session prompt for @tryinget/pi-little-helpers

## Session objective

Continue package work only in the canonical monorepo home.

## Package context

- workspace path: `packages/pi-little-helpers`
- release component key: `pi-little-helpers`
- extension entries:
  - `extensions/code-block-picker.ts`
  - `extensions/package-update-notify.ts`
  - `extensions/stash.ts`
- shared helper: `lib/package-utils.ts`
- legacy standalone repo: `~/programming/pi-extensions/pi-little-helpers` (deprecation target, not implementation home)

## Quick start

```bash
# from package directory
npm run check
npm run release:check:quick
```

## Session checklist

1. Read `AGENTS.md`, [README.md](README.md), and relevant package docs.
2. Confirm Pi is loading the monorepo package path, not the legacy standalone path.
3. Implement one scoped change.
4. Run `npm run check`.
5. If release metadata changed, run `npm run release:check:quick`.
6. Update docs and this handoff prompt.

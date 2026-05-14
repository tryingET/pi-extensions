---
summary: "Handoff prompt for package @tryinget/pi-evalset-lab inside monorepo workspace."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep package behavior stable while aligning to monorepo contracts."
  engine: "Validate package baseline -> implement focused slice -> update docs/checkpoint."
  fog: "Biggest risk is package/local fixes that diverge from monorepo conventions."
---

# Next session prompt for @tryinget/pi-evalset-lab

## Session objective

Continue from the canonical monorepo package. Do not reopen or recreate the former standalone repo.

## Package context

- workspace path: `packages/pi-evalset-lab`
- release component key: `pi-evalset-lab`
- primary extension entry: `extensions/evalset.ts`
- legacy archive: `~/programming/pi-extensions/pi-evalset-lab-final-archive.tar.gz`
- legacy working copy: removed after archive; session relocation was `skip-no-history`

## Quick start

```bash
# from package directory
npm run check
npm run release:check:quick
```

## Session checklist

1. Read `AGENTS.md`, `README.md`, and `docs/project/legacy-canonicalization.md`.
2. Implement one scoped package change.
3. Run `npm run check`.
4. If release surface changed, run `npm run release:check:quick` and root release component checks.
5. Update docs and this handoff prompt.
6. For first scoped npm publication, configure/verify npm Trusted Publisher for `@tryinget/pi-evalset-lab` and use the root `publish.yml` component tag flow.

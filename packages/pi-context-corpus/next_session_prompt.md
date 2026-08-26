---
summary: "Handoff prompt for the non-live corpus package inside the monorepo workspace."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep the corpus contract stable while aligning to monorepo conventions."
  engine: "Validate package baseline -> implement focused slice -> update docs/checkpoint."
  fog: "Package-local fixes diverging from the overlay IR or monorepo conventions."
---

# Next session prompt for @tryinget/pi-context-corpus

## Session objective

Implement one focused corpus slice while preserving the IR contract
(`strata.json` as emitted by `pi-context-overlay`) and the non-live posture.

## Package context

- workspace path: `packages/pi-context-corpus`
- deliberately non-live: no `package.json#pi` manifest, no live install/reload
- CLI: `node bin/corpus.mjs index|project ...`
- query surface: `projections/corpus.jq` (jq is the DSL)
- upstream docs: `packages/pi-context-overlay/docs/project/2026-08-26-context-core-profiler-rfc.md`

## Quick start

```bash
# from package directory
npm run fixtures:test
npm run check
```

## Known open questions

- `strata.json` carries no session `cwd`; index omits it pending an overlay-side
  change (RFC §9).
- Read-only HTTP layer over the corpus: explicitly deferred, separate decision.

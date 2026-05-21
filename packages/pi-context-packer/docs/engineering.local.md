---
summary: "Local override notes for the shared engineering-core lane used by this repo."
read_when:
  - "Aligning implementation decisions with the TypeScript stack baseline."
  - "Reconciling differences between generic TS guidance and pi extension constraints."
system4d:
  container: "Repo-local deltas on top of shared lane guidance."
  compass: "Keep extension work aligned with reproducible Node/npm release flow."
  engine: "Use shared lane -> apply local override -> validate with repo scripts."
  fog: "External lane guidance may evolve independently of this repo."
---

# engineering.local (pi extension flavor)

Primary lane:

- `engineering-core show pi-ts`

Catalog/list commands:

```bash
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core catalog --pretty
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core list-disciplines
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core list-templates
```

Selected disciplines:

- `validation`
- `testing`
- `security-privacy` — generated extension/package templates should preserve trust, publishing, and local credential boundaries.
- `documentation`
- `dependency-governance`
- `specification-and-dsls` — template variables, generated manifests, package metadata, and release mapping are executable contract surfaces.
- `engineering-reasoning` — use when deciding whether guidance belongs in the package template, monorepo root template, or upstream engineering-core.

Not selected by default:

- `local-first-data` — the template package surface does not itself own durable runtime data, migrations, sync, or corruption recovery.
- `observability` — generated packages should adopt it only when they own runtime logs/metrics/traces or operator evidence.
- `accessibility` / `design-system` — generated packages should adopt these only when they render UI or design-facing surfaces.

Repo-local emphasis:

- Runtime/package manager baseline: Node.js 22 + npm (not Bun-first defaults).
- Release baseline: release-please + `npm run release:check` + npm trusted publishing.
- Keep package artifacts deterministic via `package.json` `files` allowlist.
- Lint/format baseline: Biome config in `biome.jsonc` + pinned local `@biomejs/biome` dev dependency.
- Biome path strategy: lint repo files by default, but exclude artifact/vendor buckets (`external/`, `ontology/`, build outputs, generated/minified files).
- Quality lane gate: `npm run quality:pre-commit`, `npm run quality:pre-push`, `npm run quality:ci`.
- Auto-fix workflow: `npm run fix` (before commit or when applying AI-generated diffs).
- Pin lane metadata in `policy/engineering-lane.json` (`lane: ts`, pinned `engineering_core.ref`).
- Validate structural/docs invariants with `npm run check`.
- Optional pi-ts companions (add only when the package actually benefits):
  - `fast-check` for parser/rendering/selection invariants.
  - `@cucumber/cucumber` only when executable operator/workflow scenarios materially improve shared understanding.
  - `nunjucks` for reusable text/config/prompt/file templates when plain typed render functions are no longer enough.
  - `engineering-pi-ts.ts-quality.md` when the package explicitly adopts deterministic screening with `ts-quality`.
- If the package adopts `ts-quality`, prefer repo-local rollout truth in `docs/project/ts-quality-current-vs-target.md` and keep the detailed adoption doctrine upstream in `~/ai-society/softwareco/owned/ts-quality/docs/adoption/`.

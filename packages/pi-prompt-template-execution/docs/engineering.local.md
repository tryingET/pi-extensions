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

- `engineering-core show pi-ts --prefer-repo`

Catalog/list commands:

```bash
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core catalog --pretty
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core list-disciplines
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core list-templates
```

Selected disciplines:

- `validation` — command rendering, dry-run diagnostics, fixture parity, and registration guards need deterministic evidence.
- `testing` — loader/rendering/argument/model-conditional behavior is covered by focused package tests.
- `security-privacy` — prompt execution must avoid unsafe command registration, owner collisions, and accidental provider/secret assumptions.
- `documentation` — package boundaries and live Pi extension behavior need explicit local docs.
- `dependency-governance` — this package replaces an external prompt-template execution package and must keep dependency/rollback choices intentional.
- `specification-and-dsls` — prompt-template metadata, model/thinking/args conditionals, and command registration semantics are executable DSL surfaces.
- `engineering-reasoning` — use for explicit boundary decisions between execution semantics, prompt picker UX, orchestrator workflows, and ASC delegation.
- `observability` — dry-run diagnostic reports, compatibility canaries, and safety reports are runtime evidence surfaces for prompt execution behavior.

Not selected by default:

- `local-first-data` — this package owns prompt-template execution semantics, not durable local data, migrations, sync, or corruption recovery.
- `accessibility` / `design-system` — this package exposes Pi extension behavior and diagnostics, not a rendered UI surface.

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

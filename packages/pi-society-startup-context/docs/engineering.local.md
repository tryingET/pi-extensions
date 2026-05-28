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

- `validation` — startup packet behavior and degradation modes need deterministic checks.
- `testing` — read-only probes, parser behavior, and packet rendering need regression coverage.
- `security-privacy` — startup context handles repo/runtime metadata and must avoid leaking secrets or over-broad user data.
- `documentation` — the authority boundary and live activation path are part of the package contract.
- `dependency-governance` — Pi extension dependencies must remain lightweight and package-local.
- `local-first-data` — the package reads local AK/git/workspace state and must preserve local authority boundaries without creating shadow state.
- `observability` — degraded startup probes and warnings must remain diagnosable without mutating runtime state.
- `specification-and-dsls` — packet fields, command surfaces, and warning/status vocabularies are executable operator semantics.
- `engineering-reasoning` — use when deciding whether a startup packet fact belongs to AK, docs, Pi runtime, or another owner surface.

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

## Repo loop validation

`@tryinget/pi-society-startup-context` adopts `repo-loop-validation-v1` for package-local loop prompt dogfooding. The policy declaration is in `policy/engineering-lane.json`.

- `loop-doctor`: `npm run loop-doctor` (non-failing Node/npm/package/git diagnostics)
- `loop-verify-fast`: `npm run loop-verify-fast` (maps to `quality:pre-commit`)
- `loop-impact-plan`: `npm run loop-impact-plan` (coarse package impact note plus changed-file listing)
- `loop-impact-run`: `npm run loop-impact-run` (maps to `npm run check`)
- `loop-impact-wide`: `npm run loop-impact-wide` (explicit full package gate, also `npm run check`)
- `loop-landing-check`: `npm run loop-landing-check` (maps to `npm run check`)

These commands produce package-local evidence for orchestration prompts. They do not replace Pi runtime install/reload proof, release approval, or monorepo owner authority.

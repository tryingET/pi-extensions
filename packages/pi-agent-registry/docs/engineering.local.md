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

## Repo loop validation

Concrete package loop commands (`policy/engineering-lane.json` pins the same
projections):

- `loop-doctor`: `npm run loop-doctor`
- `loop-verify-fast`: `npm run loop-verify-fast` (pre-commit gate)
- `loop-impact-plan`: `npm run loop-impact-plan`
- `loop-impact-run`: `npm run loop-impact-run` (full CI gate)
- `loop-impact-wide`: `npm run loop-impact-wide`
- `loop-landing-check`: `npm run loop-landing-check`

Loop command success is evidence only; it does not replace release
approval, Pi runtime install/reload proof, or monorepo owner authority.

### Package-local deltas on the pi-ts lane

- Runtime baseline: Node 22+ running TypeScript sources directly; the
  package ships TS sources and has no dist build of its own.
- Dependency posture: ASC and little-helpers are local runtime links in the
  workspace (`file:../pi-autonomous-session-control` and
  `file:../pi-little-helpers`), not the former npm-only ASC `0.5.2` pin.
  The shared `pi-interaction/scripts/prepare-publish-manifest.mjs` prepack /
  postpack hooks temporarily rewrite local runtime dependencies to the linked
  packages' exact versions for publication and restore the workspace manifest.
  Runtime `typebox` is pinned separately; the packed manifest must contain no
  `file:` runtime dependency. The dependencies are not bundled; the existing
  `fast-xml-parser` security override is retained.
- Publish capability is separate from version rewriting: Phase 2 requires
  ASC's execution exports; Phase 3 requires little-helpers'
  `./sidequest-launch` export with `STANDING_AGENT_TRANSPORT_VERSION === 1`.
  That export is in current local little-helpers `0.9.0` source; the next
  helpers release must ship it. A packed registry with older npm helpers
  fails closed `visible_transport_unavailable`. Do not describe local tests
  or successful packing as a published Phase-3 feature.
- Commit-gate tests use repository/synthetic fleet and profile fixtures, never
  the live fleet or engineering-core HEAD. `npm run environment:health` is the
  explicit repository-checkout lane for the retained real steward/profile/tool
  compatibility checks and unchanged revision-bound fleet baseline. It always
  prints the current fleet report and exits nonzero on unhealthy state or drift;
  today's known seven-error baseline is not considered healthy. See the package
  README's commit-validation/environment-health contract.


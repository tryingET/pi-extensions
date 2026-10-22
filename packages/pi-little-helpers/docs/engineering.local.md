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
uv tool -n run --from git+https://github.com/tryingET/core_engineering-core.git@27ff32a529b6da6b27051e97fdb1d95a0a9be4ae engineering-core catalog --pretty
uv tool -n run --from git+https://github.com/tryingET/core_engineering-core.git@27ff32a529b6da6b27051e97fdb1d95a0a9be4ae engineering-core list-disciplines
uv tool -n run --from git+https://github.com/tryingET/core_engineering-core.git@27ff32a529b6da6b27051e97fdb1d95a0a9be4ae engineering-core list-templates
```

Selected disciplines:

- `validation` — package scripts and Pi extension smoke checks are the handoff evidence surface.
- `testing` — `npm run quality:ci` is the current package proof path.
- `security-privacy` — helper extensions may touch sessions, package update metadata, stash behavior, and operator-facing content; avoid leaking local/session data.
- `documentation` — prompts, examples, policy files, and package exports must stay aligned with shipped behavior.
- `dependency-governance` — Pi SDK and peer dependency surfaces should stay explicit and release-safe.
- `observability` — session presence, sidequest, and visible-loop helpers expose runtime/operator state that must stay diagnosable.
- `specification-and-dsls` — capability manifests, toolbox bundles, prompts, and Pi extension declarations are executable configuration/vocabulary.
- `engineering-reasoning` — use for explicit helper-surface placement and operator UX tradeoff decisions.

Not selected by default:

- `local-first-data` — this package has helper/session utilities but does not own durable local data authority, migrations, sync, or corruption recovery.
- `accessibility` / `design-system` — this package is not primarily a rendered UI/design-system surface; add these only for concrete UI work.

Repo-local emphasis:

- Runtime/package manager baseline: Node.js 22 + npm (not Bun-first defaults).
- Release baseline: release-please + `npm run release:check` + npm trusted publishing.
- Keep package artifacts deterministic via `package.json` `files` allowlist.
- Lint/format baseline: Biome config in `biome.jsonc` + pinned local `@biomejs/biome` dev dependency.
- Biome path strategy: lint repo files by default, but exclude artifact/vendor buckets (`external/`, `ontology/`, build outputs, generated/minified files).
- Quality lane gate: `npm run quality:pre-commit`, `npm run quality:pre-push`, `npm run quality:ci`.
- The root package runner bounds each test file to 120 seconds, including leaked event-loop handles. `NODE_TEST_TIMEOUT_MS` may select another positive millisecond deadline; zero, malformed values, and timer overflow are rejected.
- Tests creating peer runtimes must retain and disconnect those clients in teardown, then verify their fixture broker has shut down before removing scratch. `createSidequestExtension({ createPeerRuntime })` forwards the existing runner factory through launch/recovery paths so tests can own real clients without disabling intercom. On uncertain shutdown, retain scratch and report its path.
- Auto-fix workflow: `npm run fix` (before commit or when applying AI-generated diffs).
- Pin lane metadata in `policy/engineering-lane.json` (`lane: ts`, pinned `engineering_core.ref`).
- Validate structural/docs invariants with `npm run check`.
- Optional pi-ts companions (add only when the package actually benefits):
  - `fast-check` for parser/rendering/selection invariants.
  - `@cucumber/cucumber` only when executable operator/workflow scenarios materially improve shared understanding.
  - `nunjucks` for reusable text/config/prompt/file templates when plain typed render functions are no longer enough.

## Source-test prerequisites in a fresh worktree

Two integration fixtures import sibling source, not installed npm exports. Their owners are
listed in `policy/test-source-dependencies.json`: ASC supplies the real `/subagents` producer;
peer-messaging starts the real report-back broker using its own `tsx/cli`. Installing only
little-helpers does not install those siblings. The test/pre-push/ci gate checks their own
locked installations before running tests and never repairs them automatically.

After the ordinary little-helpers/local-file dependency installs, explicitly prepare these
owners **from the isolated worktree root**, not the live canonical checkout:

```sh
bash scripts/prepare-asc-source-build-owner.sh
npm ci --prefix packages/pi-peer-messaging
npm run task-session:build --prefix packages/pi-little-helpers
npm run check --prefix packages/pi-little-helpers
```

Neither fixture requires host-linking: both pass with the registry-installed pinned SDK.
A missing ASC `typebox` or peer-owned `tsx/cli` is an incomplete test installation, not an
accepted test failure. Do not skip the assertions or borrow canonical `node_modules`.
The test-only source declarations deliberately do not create npm production or release-graph
edges; ASC also has tests importing little-helpers, so reciprocal npm edges would add cycles.
See [gate input admission](../../../docs/project/pre-push-inputs.md#source-test-prerequisites).

## Repo loop validation

`pi-little-helpers` adopts `repo-loop-validation-v1` for package-local loop prompt dogfooding. The policy declaration is in `policy/engineering-lane.json`.

- `loop-doctor`: `npm run loop-doctor` (non-failing Node/npm/package/git diagnostics)
- `loop-verify-fast`: `npm run loop-verify-fast` (maps to `quality:pre-commit`)
- `loop-impact-plan`: `npm run loop-impact-plan` (coarse package impact note plus changed-file listing)
- `loop-impact-run`: `npm run loop-impact-run` (maps to `npm run check`)
- `loop-impact-wide`: `npm run loop-impact-wide` (explicit full package gate, also `npm run check`)
- `loop-landing-check`: `npm run loop-landing-check` (maps to `npm run check`)

These commands produce package-local evidence for orchestration prompts. They do not replace Pi runtime install/reload proof, release approval, or monorepo owner authority.

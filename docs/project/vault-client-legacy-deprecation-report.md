---
summary: "Legacy standalone vault-client deprecation report and inventory classification."
read_when:
  - "You need the final inventory/classification for the vault-client standalone repo shutdown."
  - "You want evidence that canonical ownership moved to packages/pi-vault-client before deleting the legacy repo."
system4d:
  container: "Legacy repo shutdown execution record."
  compass: "Make canonical ownership, inventory buckets, validation, archive, and session-history handling explicit."
  engine: "Scaffold canonical package -> port implementation -> validate -> classify legacy contents -> archive once -> delete cleanly."
  fog: "The main failure mode is deleting the legacy repo without a clear package scaffold, inventory record, or explicit session-history check."
---

# vault-client legacy deprecation report

## Canonical ownership

- legacy standalone repo: `/home/tryinget/programming/pi-extensions/vault-client`
- canonical monorepo root: `/home/tryinget/ai-society/softwareco/owned/pi-extensions`
- canonical package path: `/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`
- topology: `simple-package`
- current template scaffold used: `simple-package` from `~/ai-society/softwareco/owned/pi-extensions-template/`

## Template-mode clarification

The monorepo/package-topology docs and template now describe the intended distinction as:

- `simple-package`
- `package-group`

Current live template behavior:

- `simple-package` is the preferred package-first scaffold
- `monorepo-package` is kept as a compatibility alias for the same one-package monorepo scaffold
- `standalone-repo` remains compatibility / legacy
- `package-group` is still a documented next topology mode, not yet a live scaffold output

Because of that clarification, the deprecation workflow now says explicitly:
- for `simple-package` migrations, create the canonical package root from the template first
- use `simple-package` as the canonical scaffold mode
- treat `monorepo-package` only as an alias when encountered in older automation paths
- only then port package-owned implementation into the scaffold

## Canonical activation result

`packages/pi-vault-client` is now the implementation home.

What changed in canonical package setup:
- removed the earlier ad-hoc copied package and recreated it from the template scaffold
- ported vault-client implementation into the scaffolded package
- switched picker/fuzzy dependencies to published monorepo package surfaces:
  - `@tryinget/pi-trigger-adapter`
  - `@tryinget/pi-interaction-kit`
- kept runtime implementation package-local under `packages/pi-vault-client/src/`
- validated package-local and monorepo-root checks successfully

## Legacy Pi session-history inspection

Computed old session dir:
- `~/.pi/agent/sessions/--home-tryinget-programming-pi-extensions-vault-client--`

Computed new session dir:
- `~/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-pi-extensions-packages-pi-vault-client--`

Result:
- old session dir did **not** exist
- new session dir did **not** exist before migration work
- therefore no relocation step was executed
- no basename-derived matching was used

## Validation executed

Package-local:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
```

Monorepo root:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/full.sh
```

Result:
- `packages/pi-vault-client`: passed
- monorepo root `./scripts/ci/full.sh`: passed

## Final archive artifact

Archive path:
- `/home/tryinget/programming/pi-extensions/vault-client-final-archive.tar.gz`

Archive rules applied:
- exactly one final `tar.gz` artifact
- excluded runtime/editor junk:
  - `node_modules/`
  - `.git/`
  - `.vscode/`
- no backup folders or ad-hoc archive directories were created inside the legacy repo

## Inventory classification

### moved-to-root

Legacy paths now owned by monorepo root capabilities:
- `.github/`
- `.githooks/`
- `.release-please-config.json`
- `.release-please-manifest.json`
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `SUPPORT.md`

Rationale:
- these are root-governance / root-feedback / root-workflow capabilities in the monorepo capability map
- they should not continue as standalone-repo-local ownership signals

### moved-to-package

Legacy paths now owned by `packages/pi-vault-client`:
- `.copier-answers.yml`
- `.gitignore`
- `.pi/`
- `AGENTS.md`
- `CHANGELOG.md`
- `LICENSE`
- `NEXT_SESSION_PROMPT.md` (canonical package handoff)
- `README.md`
- `biome.jsonc`
- `docs/`
- `examples/`
- `extensions/`
- `external/`
- `index.ts`
- `ontology/`
- `package-lock.json`
- `package.json`
- `policy/`
- `prek.toml`
- `prompts/`
- `scripts/`
- `src/`
- `tests/`
- `tsconfig.json` intent/functionality, even though current scaffold omits a package-local tsconfig

### archive-only

Useful historical context preserved only in the final archive:
- legacy standalone repo layout as a historical artifact
- standalone-only release/workflow metadata no longer appropriate for package-local ownership
- the rewritten legacy `NEXT_SESSION_PROMPT.md` deprecation handoff
- old relocation handoff doc:
  - `docs/dev/prompt-vault-v2-relocation-handoff.md`

### runtime-junk

Excluded or treated as disposable runtime/editor material:
- `node_modules/`
- `.git/`
- `.vscode/`

### safe-to-delete

Low-value leftovers safe to delete once archive + validation were complete:
- standalone repo wrapper state after canonical package passed
- any remaining legacy package-local copies superseded by the canonical package or root ownership

## Deletion gate status

All pre-delete conditions were satisfied:

- canonical package exists as a real template scaffold under `packages/pi-vault-client`
- canonical package validation passes
- monorepo root validation passes
- exactly one final archive exists
- archive was sanity-checked
- Pi session history was inspected via full absolute-path-derived names
- legacy handoff was rewritten to point only to the canonical package

Legacy repo is ready for clean deletion.

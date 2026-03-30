---
summary: "Legacy standalone pi-little-helpers deprecation report and migration record."
read_when:
  - "You need the final migration/deprecation record for pi-little-helpers."
  - "You need evidence that canonical ownership moved into packages/pi-little-helpers before deleting the legacy repo."
system4d:
  container: "Legacy repo shutdown execution record."
  compass: "Make canonical ownership, validation, session relocation, archive, and deletion explicit."
  engine: "Scaffold canonical package -> port implementation -> validate -> relocate history -> archive once -> delete legacy repo."
  fog: "Main failure mode is leaving Pi pointed at the legacy path after the canonical package exists."
---

# pi-little-helpers legacy deprecation report

## Canonical ownership

- legacy standalone repo: `/home/tryinget/programming/pi-extensions/pi-little-helpers`
- canonical monorepo root: `/home/tryinget/ai-society/softwareco/owned/pi-extensions`
- canonical package path: `/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-little-helpers`
- topology: `simple-package`
- package name: `@tryinget/pi-little-helpers`
- release component: `pi-little-helpers`

## Canonical package setup

`packages/pi-little-helpers` was scaffolded first from:

- `/home/tryinget/ai-society/softwareco/owned/pi-extensions-template`

Then the legacy package-owned implementation was ported into that scaffold:

- `extensions/code-block-picker.ts`
- `extensions/package-update-notify.ts`
- `extensions/stash.ts`
- `lib/package-utils.ts`
- package version continuity preserved at `0.2.0`

The package-local code-block picker also carries the Linux-safe clipboard fallback that avoids the host clipboard panic seen in Wayland/headless Linux sessions.

## Pi runtime cutover

Cutover actions:

- installed canonical package into Pi from `packages/pi-little-helpers`
- removed the legacy direct symlink at `~/.pi/agent/extensions/pi-little-helpers`
- Pi settings now point to the canonical package path instead of relying on the legacy standalone extension directory

## Legacy Pi session-history relocation

Computed old session dir:

- `~/.pi/agent/sessions/--home-tryinget-programming-pi-extensions-pi-little-helpers--`

Computed new session dir:

- `~/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-pi-extensions-packages-pi-little-helpers--`

Result:

- old session dir existed
- new session dir did not exist before relocation
- session history was moved using the full absolute path-derived directory names

## Validation executed

Package-local:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-little-helpers
npm install
npm run check
```

Monorepo root:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run release:components:sync
./scripts/ci/full.sh
```

Result:

- `packages/pi-little-helpers`: passed
- monorepo root validation: passed
- release-component metadata: synced

## Legacy handoff rewrite

Before archival/deletion, the legacy repo `next_session_prompt.md` was rewritten to a deprecation handoff that points operators to the canonical package path and forbids further implementation in the legacy folder.

## Final archive artifact

Archive path:

- `/home/tryinget/programming/pi-extensions/pi-little-helpers-final-archive.tar.gz`

Archive rule:

- exactly one final `tar.gz` snapshot before deleting the legacy repo

## Ownership classification summary

### moved-to-root

Legacy standalone ownership surfaces that remain root-owned in the monorepo model:

- shared release-component automation via root `.release-please-config.json` / `.release-please-manifest.json`
- monorepo root validation and CI workflows
- root-owned Pi package registration surface in `~/.pi/agent/settings.json`

### moved-to-package

Canonical package-owned assets now live under `packages/pi-little-helpers`:

- runtime code in `extensions/` and `lib/`
- package metadata in `package.json`
- package prompts, policy, examples, docs, and handoff files
- package-local validation wrappers generated from the monorepo template scaffold

### archive-only / legacy-only

Historical standalone-only materials kept only via the final archive:

- standalone repo workflow/community files (`.github/`, `.githooks/`, standalone release metadata)
- legacy repo-local handoff history and legacy packaging context

## Deletion rule

After archive creation and validation, the legacy standalone repo is ready for removal and should no longer be used as a development target.

---
summary: "First release-safe workflow for the monorepo-hosted @tryinget/pi-interaction package."
read_when:
  - "Preparing the first publish or release PR for @tryinget/pi-interaction."
  - "Clarifying what is and is not the canonical release target inside packages/pi-interaction/."
system4d:
  container: "Component-scoped release workflow for the pi-interaction package group."
  compass: "Publish only the canonical umbrella package while keeping monorepo/root responsibilities explicit."
  engine: "Validate package metadata -> validate live behavior -> run package/root gates -> perform release decision."
  fog: "The main failure mode is treating the package-group root like the old standalone canonical package."
---

# Release workflow — `@tryinget/pi-interaction`

## Canonical release target

The canonical **end-user pi package** remains the umbrella package at:

- `packages/pi-interaction/pi-interaction`

Do **not** treat the package-group root (`packages/pi-interaction/`) as the publish target.
That directory is a private coordination shell for the split package family.

The supporting library packages (`pi-editor-registry`, `pi-interaction-kit`, `pi-trigger-adapter`) are still real package boundaries in the architecture.
They should stay same-process library/runtime packages, not service/API boundaries.
See [package-boundary architecture](package-boundary-architecture.md).

## Support-library publish readiness

The support packages are now expected to be publish-safe ordinary npm packages even though the umbrella package remains the canonical end-user Pi publish target.
For `pi-interaction-kit`, `pi-trigger-adapter`, and `pi-editor-registry`, the package contract is:

- explicit top-level `exports`
- `prepack` rewrites local sibling `file:` dependencies to versioned package dependencies in the packed manifest
- `npm run release:check:quick` verifies `npm publish --dry-run`, packed-manifest dependency rewrite, and clean-room tarball install/import smoke with locally packed sibling tarballs when required

This is the release contract that lets external consumers retire generated vendoring bridges in favor of real package dependencies.

## Current release model

Today the release-safe path is **component-scoped and operator-driven**:

1. validate the umbrella package locally
2. validate live interaction behavior with dependent extensions loaded
3. validate monorepo root gates
4. then create/merge the release change only when the package is publish-ready

Monorepo-wide automated release orchestration is still a follow-up item.
Until that lands, this document is the canonical safe workflow.

## Preconditions

- `package.json.name` is `@tryinget/pi-interaction`
- `package.json.repository.directory` is `packages/pi-interaction/pi-interaction`
- `package.json.x-pi-template.releaseComponent` is `pi-interaction`
- changelog/docs reflect the current monorepo package reality
- no docs imply the old standalone repo is the canonical home

## Local validation flow

Run from the package group and umbrella package:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
npm run fix
npm run check
npm run release:check:quick
npm audit
```

## Live interaction validation

Validate the real integration path with `pi-prompt-template-accelerator` loaded beside `@tryinget/pi-interaction`.

Recommended local install paths:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
```

Then in pi:

1. run `/reload`
2. run `/triggers`
3. confirm the PTX picker trigger is registered
4. type `$$ /`
5. confirm the live picker opens and selection writes back into the editor

Record any live-only drift in `NEXT_SESSION_PROMPT.md` before release.

## Root validation gate

Before opening or merging the release change, validate the monorepo root:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-push
```

## First publish / trusted publishing bootstrap

Use [Trusted publishing runbook](trusted_publishing.md) for the npm/GitHub setup.

For the first publish of a brand-new package name:

- prefer npm trusted publishing when package-scoped setup is available
- if npm requires bootstrap before OIDC can be bound, do one intentional bootstrap publish,
  then switch back to OIDC-only publishing
- keep provenance requirements and repository metadata aligned with the monorepo path

## Release decision checklist

Only proceed when all are true:

- [ ] `packages/pi-interaction/pi-interaction` passes `npm run check`
- [ ] `packages/pi-interaction/pi-interaction` passes `npm run release:check:quick`
- [ ] `packages/pi-interaction` package group passes `npm run check`
- [ ] monorepo root passes `npm run quality:pre-push`
- [ ] live `pi-interaction` + PTX validation passed
- [ ] docs/changelog/handoff are updated

## Follow-up after release

- update `README.md`
- update `NEXT_SESSION_PROMPT.md`
- keep root/package release ownership notes aligned with `docs/project/root-capabilities.md`

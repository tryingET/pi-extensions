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

## Shared publish-manifest lifecycle

Every package that uses `scripts/prepare-publish-manifest.mjs` follows the same lifecycle contract:
`pi-interaction`, `pi-interaction-kit`, `pi-trigger-adapter`, `pi-editor-registry`, and
`pi-runtime-registry`. The source `package.json` keeps truthful sibling `file:` dependencies for
local development. Packed and publish-ready manifests replace each such spec with the sibling's
exact package version.

The distinction between tarball truth and registry metadata truth is security-sensitive. In npm 11,
a directory publish follows this relevant order:

1. npm reads the source manifest and runs `prepublishOnly`;
2. npm creates tarball bytes through `prepack`, `prepare`, and `postpack`;
3. after `postpack`, npm deliberately re-reads the source `package.json`;
4. `libnpmpublish` builds registry version metadata from that second manifest while attaching the
   already-created tarball.

Restoring in every `postpack` therefore produces a safe tarball but unsafe registry metadata: the
second read sees the restored `file:` spec. Publishing is supported only with npm 11 on a host where
the helper can bind ownership to the live npm PID and process start time. A publish under another npm
major, a lifecycle event mismatch, or a host without the required process identity fails before
unsafe publish metadata can be prepared.

The shared hooks now behave as follows:

- `prepack` exclusively acquires a package lifecycle owner before validating or rewriting;
- ordinary and recovery guards encode complete owner metadata in atomically created guard entries,
  eliminating the `mkdir`-before-owner crash window;
- a separate recovery guard serializes stale-guard decisions; ordinary acquisition checks it both
  before and after publishing its own guard, and release atomically retires only an exact owner token;
- two stale recoverers therefore cannot delete a replacement live guard, and incomplete legacy
  ordinary guards are removed only while the recovery guard excludes new acquisition;
- dead lifecycle owners may be recovered by the next `prepack` or explicit `restore`; live owners
  cannot be stolen, even when the second process uses a different pack/publish command;
- `postpack` restores and releases ownership immediately for `npm pack`;
- npm 11 `postpack` retains exact versions for the publish manifest reread, and `postpublish`
  restores the byte-identical developer manifest and releases ownership;
- restoration refuses to overwrite a manifest that differs from both guarded snapshots.

A process killed after publish `postpack` cannot reach `postpublish`. Treat remaining backup/lock
state as an incomplete lifecycle and run
`node ../scripts/prepare-publish-manifest.mjs restore` after the npm owner has exited. The quick check
performs this cleanup when `npm publish --dry-run` fails before `postpublish`.

The recovery guard itself is intentionally never reclaimed automatically: stale or missing recovery
owner metadata is a permanent fail-closed condition for the helper. An operator must first prove no
recovery process is alive, then remove only `.package.json.publish-manifest.recovery`; deleting it by
age or from a competing lifecycle is forbidden. This avoids an infinite hierarchy of reclaim locks.
All five packages, including the umbrella, use the same helper-only `release:check:quick`.

Focused tests model npm's postpack reread without a registry write. The quick check separately:

1. verifies every exact local runtime dependency version already exists in the configured registry,
   enforcing dependency-before-consumer publish order;
2. prints publish-ready and packed dependency projections;
3. verifies `npm publish --dry-run` and deterministic cleanup; and
4. packs the coordinated local dependency set and installs those tarballs into scratch.

Step 4 is a **coordinated local artifact-set install**, not proof that an arbitrary registry consumer
can resolve the package. The availability gate proves only that each exact dependency version can be
looked up; it does not rewrite or certify already-published dependency metadata. Registry metadata
and a registry-only consumer install remain externally observable only after authorized releases.

## Current release model

The release-safe path is now **component-scoped with root-owned monorepo automation**:

1. validate the umbrella package locally
2. validate live interaction behavior with dependent extensions loaded
3. validate monorepo root gates
4. let root release-please open component-scoped release PRs/tags
5. publish from the root-owned monorepo publish workflow

The release model remains component-scoped rather than lockstep.
That means the support packages and umbrella package can move on independent release cadences when their own changes justify it.

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

Record any live-only drift in `next_session_prompt.md` before release.

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
- update `next_session_prompt.md`
- keep root/package release ownership notes aligned with `docs/project/root-capabilities.md`

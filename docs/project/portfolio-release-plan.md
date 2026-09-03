---
summary: "Operator contract for propagation-complete candidates and immutable dependency-ordered portfolio release waves."
read_when:
  - "Reviewing a release PR, sequencing package publication, or recovering a partial release wave."
---

# Portfolio release plan and wave

## The control-plane constraint

Every package release belongs to one immutable, propagation-complete wave. Release Please creates one combined candidate using its `node-workspace` plugin; it does not create independent component PRs. The plugin follows only managed local dependency edges (`dependencies`, `devDependencies`, `optionalDependencies`, and `peerDependencies`) and does not use `updateAllPackages`, so unrelated packages are not bumped.

This constraint preserves independent component versions and changelogs while making a dependency-bearing candidate satisfiable: a changed dependency causes each transitive managed consumer to receive an intentional version advance in the same candidate. Release Please deliberately does not rewrite protocol ranges such as `file:`. The authoritative artifact builder therefore replaces managed runtime `file:` ranges with the dependency's exact wave version only in the transient `npm pack` input, restores the tagged manifest even on failure, and rejects any retained tarball that is not registry-resolvable. Local development links remain unchanged.

## Read-only planning

`node ./scripts/release-components.mjs plan` is the read-only authority for dependency discovery, propagation closure, and candidate readiness:

```sh
node ./scripts/release-components.mjs plan --base <git-ref> --json
node ./scripts/release-components.mjs plan --changed <component> --json
node ./scripts/release-components.mjs plan --all --json
```

Add `--registry` for read-only npm classification and `--require-ready` when blockers must fail. Release PR CI uses both; ordinary PRs validate the graph and tests but are not blocked for unchanged versions.

A selected component is blocked if its intended version is not ahead of the base Release Please manifest. Registry checks also reject an existing version, unavailable state, or unexpected owner. Root control-plane paths remain evidence only and never manufacture package releases.

## Immutable wave

After the combined candidate merges and Release Please creates all component releases, `scripts/release-wave.mjs` compares the exact base and source commits, reconstructs all advanced components, computes propagation closure, and requires `paths_released` to equal that closure. It emits `pi.portfolio-release-wave.v1`, binding:

- exact base and source commits;
- changed and propagation-required components;
- exact package paths, npm names, versions, and tags;
- dependency-first `releaseOrder`;
- a canonical plan digest;
- a wave identity digest over the complete payload.

Missing, extra, stale, reordered, or modified content fails verification. The wave is retained as a workflow artifact and copied into every component's durable release-evidence archive.

## Effect boundary and recovery

`publish.yml` has no GitHub Release event trigger. Publication is possible only by externally approved `workflow_dispatch` with the complete wave and matching identity. The release workflow consumes `releaseOrder`, dispatches one component at a time, and waits for success before dispatching its consumer. A component workflow also requires every wave tag to exist, every earlier wave component to have a successful same-wave exact-artifact run, and every transitive managed dependency (including dependencies outside the wave) to exist at its exact intended npm version before any package effect.

A failed component leaves already published npm versions immutable. Re-run that component with the same wave and a new unique dispatch identity; exact-artifact inspection makes an exact existing version a verified no-op and rejects mismatched bytes. A consumer additionally requires a successful same-wave publish run for every predecessor, not merely an npm version with the expected name. Continue later components only after the failed predecessor succeeds. Never generate a replacement wave merely to hide a partial wave.

The scripts do not grant approval to merge, push, tag, create a GitHub Release, publish to npm, configure OIDC, or change repository settings. Those remain repository-admin/release-operator effects.

## Wave admission

Human admit is one review of the combined release-please PR, not N `npm-publish` environment approvals. Keep the environment **name** `npm-publish` for npm OIDC Trusted Publishing. Empty **Required reviewers** on that environment so sequential `publish.yml` jobs do not each wait. Exact GitHub fields: `docs/project/2026-09-03-npm-publish-wave-admit.md`.

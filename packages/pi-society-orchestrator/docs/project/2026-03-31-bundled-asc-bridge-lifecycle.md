---
summary: "Lifecycle decision and registry-lock policy for the retired bundled ASC bridge used by pi-society-orchestrator."
read_when:
  - "You are deciding whether orchestrator should bundle pi-autonomous-session-control into its tarball."
  - "You need the registry-lock, release-age, or execution-export criteria for the ASC seam."
system4d:
  container: "Post-cutover packaging and dependency-lock decision note."
  compass: "Keep the ASC seam registry-backed and prevent a local-link or too-new lock from masquerading as release proof."
  engine: "Verify registry release -> enforce age floor -> lock canonical artifact -> prove installed execution seam."
  fog: "A semver declaration alone does not prove that the lock or installed runtime came from an eligible registry artifact."
---

# Bundled ASC bridge lifecycle — 2026-03-31

## Decision in one sentence

The bundled bridge is retired: `pi-society-orchestrator` consumes
`@tryinget/pi-autonomous-session-control` through a normal registry dependency, and release
validation must fail closed if the lock returns to a local link or selects an artifact that does
not satisfy the active seven-day minimum-release-age policy.

## Current topology (verified 2026-08-24)

Registry cutover status: **complete for the declared `^0.5.0` range**.

Orchestrator declares:

- `"@tryinget/pi-autonomous-session-control": "^0.5.0"`
- no `bundleDependencies` / `bundledDependencies` entry for ASC
- a lock for registry release `0.5.1`, with canonical npm tarball URL and sha512 integrity

The checked-in lock remains registry `0.5.1`. If the lock is regenerated, use npm
`min-release-age=7` with `min-release-age-exclude[]=@tryinget/*` so the age-eligible
`@tryinget/*` 0.5.1 artifact is selected instead of ineligible 0.5.2. Registry
publication times were:

- `0.5.0`: `2026-08-15T18:01:22.673Z`
- `0.5.1`: `2026-08-16T08:07:41.295Z` — latest eligible `^0.5.0` release
- `0.5.2`: `2026-08-20T18:26:40.021Z` — ineligible at task creation

The selected artifact is:

- tarball: `https://registry.npmjs.org/@tryinget/pi-autonomous-session-control/-/pi-autonomous-session-control-0.5.1.tgz`
- integrity: `sha512-wNRFFqKEEyxtTwujf2lOBGF1aaYNmS2lUOyNlUtJDsBojfk/AuIOZGrnRArF9d2jTjzkqh+Cwogr/DXeGpvRUA==`
- git head: `532f5d409d4eba352573b8f00d0ec7466cc15c1b`
- npm registry signature key id: `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`
- provenance predicate: `https://slsa.dev/provenance/v1`

Registry metadata, downloaded tarball sha512, lock integrity, and installed-package signature and
provenance verification must agree. The declaration remains `^0.5.0`; the age policy belongs in
artifact selection and validation rather than an unnecessary manifest floor change.

## Public execution seam required by orchestrator

The published Node-loadable `./execution` entry must provide these eight runtime values:

1. `ASC_EXECUTION_OBSERVATION_EVENT`
2. `createAscExecutionRuntime`
3. `createSubagentState`
4. `getDispatchSubagentDisplayOutput`
5. `projectAscExecutionFailure`
6. `projectAscExecutionGroupTerminal`
7. `projectAscExecutionResult`
8. `projectAscExecutionUpdate`

Its declaration entry must also export the nine types consumed by orchestrator:

1. `AscExecutionObservation`
2. `AscExecutionObservationContext`
3. `DispatchEffectReceipt`
4. `DispatchSubagentExecutionResult`
5. `DispatchSubagentExecutionUpdate`
6. `DispatchSubagentFailureKind`
7. `SubagentModelContext`
8. `SubagentSpawner`
9. `SubagentState`

Proof must come from a registry-installed artifact, not workspace TypeScript source or a sibling
package link. The installed smoke must exercise dispatch and observation behavior without making
an external model call.

## Fail-closed lock policy

`validate-asc-bridge-lifecycle.mjs` queries registry versions and publication times, computes the
latest version satisfying the manifest range and seven-day floor, then compares exact artifact
metadata with `package-lock.json`. It rejects:

- `file:`, sibling paths, `link: true`, or any other ASC local lock entry
- a missing version, non-canonical registry tarball URL, or missing sha512 integrity
- a locked version outside `^0.5.0`
- a release inside the seven-day floor
- an older selection when a newer satisfying release is already age-eligible
- tarball or integrity disagreement between the lock and registry metadata
- missing npm registry signatures or npm SLSA provenance metadata
- malformed, empty, E404, ETARGET, or otherwise indeterminate registry responses

As time advances, a newer release can become eligible. That drift is a review trigger: regenerate
the lock through npm registry resolution and rerun installed proof rather than hand-editing
`resolved` or `integrity`.

## Historical bridge and retirement criteria

The old bundled bridge was only a transitional installability shim while ASC lacked a proven
standalone registry release. It was never execution-plane ownership authority. Retirement
required all of the following, now satisfied:

1. ASC had a real registry-backed release path through the monorepo component release flow.
2. Orchestrator replaced its local ASC dependency with a compatible semver selector and removed
   ASC bundling.
3. Installed-package validation resolved ASC as a registry dependency without bundle lifting.
4. Active docs and deterministic validation described and enforced the registry topology.

Do not revive the bundle for smoke-harness convenience, monorepo ergonomics, or reluctance to
refresh an eligible registry lock.

## Operational enforcement

- `node scripts/validate-asc-bridge-lifecycle.mjs`
- `node --test tests/asc-bridge-lifecycle.test.mjs`
- `npm run check`
- clean isolated `npm ci`, `npm audit`, and `npm audit signatures`
- `npm run release:check`
- installed registry-artifact execution/export and dispatch/observation smoke

## What this decision preserves

- ASC remains the execution-plane owner.
- Orchestrator remains a narrow consumer of `pi-autonomous-session-control/execution`.
- Installed proof exercises the published JavaScript boundary instead of private source.
- The retired bundle cannot silently return through lockfile or workspace-layout drift.

## Companion docs

- [Execution seam charter](2026-03-31-execution-seam-charter.md)
- [Subagent execution-boundary map](subagent-execution-boundary-map.md)
- [Architecture convergence backlog](2026-03-10-architecture-convergence-backlog.md)
- [ASC public execution contract](../../pi-autonomous-session-control/docs/project/public-execution-contract.md)
- [ASC trusted publishing runbook](../../pi-autonomous-session-control/docs/dev/trusted_publishing.md)
- [Orchestrator trusted publishing runbook](trusted-publishing.md)

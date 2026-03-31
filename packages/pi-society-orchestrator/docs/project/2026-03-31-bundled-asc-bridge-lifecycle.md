---
summary: "Lifecycle decision for the temporary bundled ASC publish/install bridge used by pi-society-orchestrator after the ASC execution-seam cutover."
read_when:
  - "You are deciding whether orchestrator should keep bundling pi-autonomous-session-control into its tarball."
  - "You need the exact exit criteria and review trigger for retiring the temporary ASC bridge."
system4d:
  container: "Post-cutover packaging decision note."
  compass: "Keep the ASC seam installable without turning the bundled bridge into a permanent contract."
  engine: "State current bridge purpose -> define allowed lifetime -> define exit criteria -> define review trigger."
  fog: "The main risk is letting temporary packaging compatibility become a silent permanent dependency model."
---

# Bundled ASC bridge lifecycle — 2026-03-31

## Decision in one sentence

Keep the current bundled `pi-autonomous-session-control` bridge only as a **transitional installability shim** for `pi-society-orchestrator`, and remove it as soon as ASC has a real registry-backed release path plus one truthful orchestrator cutover pass.

## Current topology

Today orchestrator uses:

- `"pi-autonomous-session-control": "file:../pi-autonomous-session-control"`
- `"bundleDependencies": ["pi-autonomous-session-control"]`

Why this exists:

- the execution-plane ownership cutover is already complete
- orchestrator must still be installable from its own tarball
- ASC does not yet have release evidence that lets orchestrator consume it as a normal published dependency
- installed-package smoke currently needs to prove the packaged import graph that includes the bundled ASC copy

This bridge is therefore a packaging compatibility measure, **not** a statement that orchestrator should permanently ship ASC inside its own tarball.

## Allowed lifetime

The bridge may remain only while all of the following are still true:

1. orchestrator needs ASC at install time to expose the supported execution seam
2. ASC has not yet been proven as a standalone published package dependency in the orchestrator release path
3. removing bundling would break truthful installed-package validation today

If any of those statements stops being true, start the bridge-removal cutover instead of preserving the bundle by inertia.

## Exit criteria

Retire the bridge in the same bounded change that satisfies all criteria below:

1. **ASC publish path is real**
   - `pi-autonomous-session-control` has a registry-backed release path proven through the existing monorepo component release flow
   - if ASC still needs a first bootstrap publish before trusted publishing is fully active, follow `../../pi-autonomous-session-control/docs/dev/trusted_publishing.md`
2. **Orchestrator consumes ASC as a normal dependency**
   - replace the current local `file:../pi-autonomous-session-control` dependency with the intended published semver dependency
   - remove `bundleDependencies` / `bundledDependencies` for ASC from orchestrator
3. **Installed-package proof no longer depends on bundle lifting**
   - `packages/pi-society-orchestrator/scripts/release-smoke.mjs` no longer needs bundled-dependency lifting for ASC
   - `npm run release:check` passes with the registry-backed/install-time dependency model
4. **Docs and handoff stay truthful**
   - update `README.md`, `next_session_prompt.md`, and the execution-boundary packet docs in both packages so they no longer describe bundling as the active topology

## Review trigger

Run the bridge-retirement review at the earliest of:

1. the first successful ASC release evidence that makes a registry-backed dependency realistic
2. any orchestrator packaging work that would otherwise widen or prolong the bundled bridge
3. the pre-`0.2.0` behavior-freeze review for `pi-society-orchestrator`

Do not wait for a vague later cleanup once one of those triggers fires.

## What does *not* justify keeping the bridge

These are insufficient reasons to preserve bundling:

- smoke-harness convenience alone
- avoiding package.json dependency cleanup
- reluctance to touch release docs once ASC publish evidence exists
- pressure to widen the ASC public API just to make bundling easier

## What this decision preserves

- ASC remains the execution-plane owner
- orchestrator remains a narrow consumer of `pi-autonomous-session-control/execution`
- the installed-package smoke harness still proves truthful packaging behavior for the current topology
- the bundle stays explicitly temporary instead of becoming an undocumented steady state

## Companion docs

- [Execution seam charter](2026-03-31-execution-seam-charter.md)
- [Subagent execution-boundary map](subagent-execution-boundary-map.md)
- [Architecture convergence backlog](2026-03-10-architecture-convergence-backlog.md)
- [ASC public execution contract](../../pi-autonomous-session-control/docs/project/public-execution-contract.md)
- [ASC trusted publishing runbook](../../pi-autonomous-session-control/docs/dev/trusted_publishing.md)
- [Orchestrator trusted publishing runbook](trusted-publishing.md)

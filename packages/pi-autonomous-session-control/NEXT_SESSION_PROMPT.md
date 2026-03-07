---
summary: "Session handoff after the monorepo migration and first read-only subagent operations dashboard slice."
read_when:
  - "Starting the next session in packages/pi-autonomous-session-control"
  - "Before changing subagent lifecycle, dashboard behavior, or interactive recovery actions"
system4d:
  container: "Canonical-home handoff for pi-autonomous-session-control."
  compass: "Keep the hardened control plane stable while deciding whether to add safe interactive recovery actions."
  engine: "Read current control-plane + dashboard state -> validate artifact model assumptions -> extend only where lifecycle safety remains obvious."
  fog: "The major trap now is adding action wiring that bypasses or weakens the recovered/abandoned/lock semantics that were just stabilized."
---

# Next Session Prompt

## Mission

The canonical home move is complete.

Next focus should cover **two parallel outcomes in one fast-paced session**:
- refine the operator experience around the new read-only dashboard, and only add interactive recovery actions if they can be proven safe against the current lifecycle guarantees
- crystallize the **package transition + deprecation workflow** for legacy extension folders under `~/programming/pi-extensions/`, so future migrations and deletions can be executed quickly and safely

## Current state

### Canonical home

- Package path: `~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control`
- Template lineage: generated from `~/ai-society/softwareco/owned/pi-extensions-template/` in `monorepo-package` mode, then brownfield code was migrated into it
- Source of truth is now this monorepo package, not the legacy standalone repo

### Completed in the last session

| Category | Changes |
|----------|---------|
| **Monorepo move** | Created `packages/pi-autonomous-session-control` from the package template and migrated the existing extension there |
| **Monorepo contract repair** | Restored monorepo-package validation scripts (`quality-gate`, `validate-structure`, `release-check`) and aligned package metadata with `x-pi-template` |
| **Architecture decision** | Kept one package, but introduced an explicit package-local UI/data boundary instead of splitting into subpackages |
| **Dashboard adapter** | Added [extensions/self/subagent-dashboard-data.ts](extensions/self/subagent-dashboard-data.ts) to summarize status sidecars into operator-facing rows |
| **Dashboard widget** | Added [extensions/self/subagent-dashboard.ts](extensions/self/subagent-dashboard.ts) for the persistent read-only widget plus `/subagent-dashboard` and `/subagent-inspect <session-name>` |
| **Lifecycle preservation** | Existing finalization, stale-lock recovery, abandonment reconciliation, and status accounting behavior were preserved through the move |
| **Test harness repair** | Updated self-tool harness stubs and session-start expectations after introducing the dashboard session-start hook |
| **Validation** | Package-local `npm run check` passes; monorepo root `./scripts/ci/full.sh` passes |

## New architecture/process work completed this session

These docs were added and should be treated as the current design baseline for monorepo package handling:

- Monorepo ADR: `~/ai-society/softwareco/owned/pi-extensions/docs/decisions/package-topology-and-quality-gate.md`
- Monorepo interface spec: `~/ai-society/softwareco/owned/pi-extensions/docs/project/package-quality-gate-interface.md`
- Template mode redesign note: `~/ai-society/softwareco/owned/pi-extensions-template/docs/decisions/package-topology-modes.md`

Core takeaway:
- package topology should be described as **simple-package** vs **package-group**
- package validation should move toward one monorepo-root implementation instead of package-local duplicated gates
- `pi-extensions-template` must be updated intentionally, not forgotten, because it currently still encodes older naming/duplication assumptions

## Structural decision

Use a **single package with internal seams**, not a split package group yet.

Current seam map:
- control plane / persistence: [extensions/self/subagent*.ts](extensions/self)
- dashboard data adapter: [extensions/self/subagent-dashboard-data.ts](extensions/self/subagent-dashboard-data.ts)
- dashboard rendering + commands: [extensions/self/subagent-dashboard.ts](extensions/self/subagent-dashboard.ts)

Why:
- `pi-interaction` was useful as a meta-pattern for keeping entrypoints thin and separating UI-facing code from runtime/control logic
- but this package does not yet have enough proven reusable surfaces to justify sibling publishable packages
- package-local seams give the design benefit without multi-package release churn

Reference decision note:
- [docs/dev/monorepo-migration-dashboard-slice.md](docs/dev/monorepo-migration-dashboard-slice.md)

## What was reused vs rejected from prior art

### Reused from `pi-interaction`

- thin extension entrypoint wiring specialized modules
- explicit boundary between UI-facing behavior and lower-level runtime/control-plane code
- package-local composition before cross-package generalization

### Reused from `pi-vs-claude-code`

- persistent above-editor widget pattern
- compact status-first dashboard rows
- read-only first slice before interactive orchestration actions

### Rejected for now

- per-subagent streaming widget instances
- agent-team style orchestration state separate from the artifact model
- split subpackages / umbrella runtime pattern

## Brownfield anchor points to preserve

- [Subagent dispatcher](extensions/self/subagent.ts)
- [Subagent spawn lifecycle](extensions/self/subagent-spawn.ts)
- [Session state + status sidecars](extensions/self/subagent-session.ts)
- [Lock reservation + stale-lock behavior](extensions/self/subagent-session-name.ts)
- [Dashboard data adapter](extensions/self/subagent-dashboard-data.ts)
- [Dashboard widget + commands](extensions/self/subagent-dashboard.ts)
- [Current status doc](docs/dev/status.md)
- [Migration/dashboard decision note](docs/dev/monorepo-migration-dashboard-slice.md)
- [Tests](tests/dispatch-subagent-diagnostics.test.mjs)
- [Tests](tests/subagent-file-lock.test.mjs)
- [Tests](tests/subagent-session.test.mjs)
- [Tests](tests/subagent-dashboard-data.test.mjs)

## Hard constraints

- Do **not** weaken exit/close finalization guarantees.
- Do **not** regress stale-lock reclamation, live-lock protection, status sidecars, or abandoned-session reconciliation.
- Do **not** introduce a second source of truth for subagent state; the widget should continue reading session/status artifacts.
- If interactive actions are added, they must compose with the current artifact/control-plane semantics rather than bypass them.
- Prefer additive package-local modules over premature generalization into new packages.

## Recommended next slice

### Option A — stay read-only but improve inspection depth

Good if action safety is still unclear.

Possible work:
- richer `/subagent-inspect` output
- selected-row details pane or expanded dashboard command output
- stronger recency/age formatting
- better objective/status heuristics

### Option B — add one safe interactive recovery path

Only if proven safe.

Most plausible candidates:
- a command that copies or pre-fills a resume hint for a selected session
- a guided inspect-to-resume flow that does **not** mutate artifacts directly
- a cleanup affordance that delegates to existing cleanup/session commands rather than inventing new lifecycle paths

Avoid for now unless safety is obvious:
- direct in-widget resume/retry buttons
- artifact mutation shortcuts that skip the existing dispatcher/session code paths

## Legacy package deprecation workflow to include next session

This is now an explicit required outcome for future migrations from `~/programming/pi-extensions/`.

### Goal

Make legacy repo/package shutdown fast, repeatable, and low-risk after canonical work has moved into `~/ai-society/softwareco/owned/pi-extensions/`.

### Required workflow shape

1. **Verify canonical ownership transfer**
   - monorepo root owns shared `.github` / hooks / CI / governance concerns
   - canonical package or package-group owns runtime code, tests, package docs, and package metadata

2. **Classify legacy contents with an explicit checklist**
   - moved to monorepo root
   - moved to canonical package
   - archive-only context
   - runtime/editor junk
   - safe to delete

3. **Use structured inventory comparison**
   - use `jq`-friendly inventories/diffs when comparing legacy vs canonical trees
   - keep the workflow deterministic enough to repeat across many extensions

4. **Create exactly one archival artifact for the legacy repo**
   - use a single `tar.gz` snapshot
   - do **not** create iterative backup folders
   - archive should represent the final legacy state at deletion time

5. **Relocate legacy Pi session history intentionally**
   - inspect relevant session folders under `~/.pi/agent/sessions/`
   - default preference: rename/relocate the cwd-derived session folder so history follows the canonical package path
   - derive the target folder name from the **actual canonical destination path**, not from the old package basename
   - this matters for semantic renames and restructures (for example old `pi-input-triggers` -> canonical `packages/pi-interaction`)
   - verify the path-normalization rule once and keep the relocation deterministic
   - only fall back to archiving session history if relocation semantics are unclear or unsafe

6. **Rewrite legacy handoff before deletion**
   - legacy `NEXT_SESSION_PROMPT.md` should become a short archive/deprecation handoff
   - point operators to the canonical monorepo root/package paths
   - make clear that implementation must not continue in the legacy folder

7. **Delete only after validation + archive verification**
   - canonical package validation passes
   - monorepo root validation passes
   - repo archive exists and was sanity-checked
   - Pi session history relocation was either completed successfully or explicitly downgraded to a fallback archive decision

### Checklist to produce next session

Create a concrete reusable checklist or doc/script flow that works for future deprecations in:

- `~/programming/pi-extensions/*`

It should distinguish at least:
- simple-package migrations
- package-group migrations
- root-owned assets vs package-owned assets
- one-shot archive-and-delete flow
- legacy Pi session history handling (`relocate` by default, archive only as fallback)
- path-based session-folder relocation using `old canonical path -> new canonical path`, not naive name matching

### Strong recommendation

The next session should try to turn this into a reusable workflow asset, not just a one-off remembered process.
Possible homes:
- monorepo docs under `~/ai-society/softwareco/owned/pi-extensions/docs/`
- template/operator docs under `~/ai-society/softwareco/owned/pi-extensions-template/docs/`
- a helper script if the contract becomes stable enough

## Recommended execution order for next session

1. Read the three new topology/quality-gate docs first.
2. Decide whether to implement `scripts/package-quality-gate.sh` now or finish the deprecation workflow doc/checklist first.
3. If touching dashboard behavior, keep the slice small and lifecycle-safe.
4. If touching migration/deprecation workflow, make it reusable across multiple legacy extensions.
5. End with explicit validation evidence and an updated handoff.

## Validation

Package-local:
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
npm run check
```

Monorepo root:
```bash
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/full.sh
```

## Session checkpoint template

At end of next session, update:
- whether the dashboard remained read-only or gained a safe action
- what artifact assumptions were validated explicitly
- what was decided for `simple-package` vs `package-group` workflow execution
- what deprecation/archive workflow asset was created or refined for `~/programming/pi-extensions/*`
- whether the workflow now explicitly uses one-shot `tar.gz` archives
- whether legacy `~/.pi/agent/sessions/` history was successfully relocated using the real canonical destination path, or had to fall back to archive handling
- files changed
- package-local validation output
- monorepo-root validation output
- remaining gap to trustworthy interactive recovery
- remaining gap to fast, repeatable legacy package deprecation

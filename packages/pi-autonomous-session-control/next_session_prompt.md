---
summary: "Handoff after deepening read-only subagent inspection and turning the legacy repo shutdown flow into a reusable scripted/documented asset."
read_when:
  - "Starting the next session in packages/pi-autonomous-session-control"
  - "Before changing subagent dashboard behavior, interactive recovery actions, or legacy migration/deprecation workflow"
system4d:
  container: "Canonical-home handoff for pi-autonomous-session-control after the richer inspect + deprecation workflow pass."
  compass: "Keep lifecycle safety obvious, keep the dashboard artifact-backed, and keep legacy shutdown repeatable."
  engine: "Start from the read-only artifact model -> only add actions that route through existing lifecycle paths -> keep deprecation tooling deterministic."
  fog: "The main trap is still bypassing hardened session semantics with convenience actions or drifting back into ad-hoc legacy cleanup."
---

# Next Session Prompt

## Mission

This package now has a stronger **read-only operator inspection surface** and the monorepo now has a more concrete **legacy repo deprecation workflow asset**.

The next session should only widen behavior where safety remains obvious:
- either add one clearly safe recovery affordance that still delegates to existing lifecycle/session semantics
- or apply and tighten the new deprecation workflow against the next real legacy repo under `~/programming/pi-extensions/`

## What landed this session

### Dashboard / operator experience

The dashboard stayed **read-only**.

Implemented improvements:
- added richer session inspection data modeling in `extensions/self/subagent-dashboard-data.ts`
- `/subagent-inspect <session-name>` now renders:
  - derived lifecycle metadata
  - artifact paths
  - PID state for running sessions
  - elapsed / exit-code context when present
  - safety notes/warnings
  - raw status sidecar JSON
  - recent-session suggestions when the requested session is missing
- `/subagent-dashboard` now includes an explicit inspect command hint per recent session row
- added focused tests for the richer inspection behavior in `tests/subagent-dashboard-data.test.mjs`

### Legacy deprecation workflow asset

The reusable workflow is now stronger at monorepo root.

Implemented improvements:
- `../../scripts/legacy-package-deprecation.sh inspect` now emits:
  - `sharedRelativeFiles`
  - `legacyOnlyFiles`
  - `canonicalOnlyFiles`
  - session-relocation plan + recommended action
  - ownership/classification outline for deterministic shutdown work
- added `../../scripts/legacy-package-deprecation.sh render-handoff` to generate a deprecation handoff body for legacy `NEXT_SESSION_PROMPT.md`
- updated workflow docs in:
  - `../../docs/project/legacy-package-deprecation-workflow.md`
  - `../../docs/project/legacy-transition-backlog.md`
  - `../../README.md`

## Structural decisions still in force

- Keep this package a **single package with internal seams**, not a package-group.
- Keep the dashboard **artifact-backed**; do not invent a second state model.
- Keep interactive recovery deferred unless it composes with the current dispatcher/session/finalization paths.
- Keep legacy repo shutdown **one-shot archive + delete**, not iterative backup sprawl.

## Brownfield anchors to preserve

- `extensions/self/subagent.ts`
- `extensions/self/subagent-spawn.ts`
- `extensions/self/subagent-session.ts`
- `extensions/self/subagent-session-name.ts`
- `extensions/self/subagent-dashboard-data.ts`
- `extensions/self/subagent-dashboard.ts`
- `tests/dispatch-subagent-diagnostics.test.mjs`
- `tests/subagent-file-lock.test.mjs`
- `tests/subagent-session.test.mjs`
- `tests/subagent-dashboard-data.test.mjs`
- `../../scripts/legacy-package-deprecation.sh`
- `../../docs/project/legacy-package-deprecation-workflow.md`

## Recommended next slices

### Option A — one safe interactive recovery affordance

Only proceed if the action is obviously lifecycle-safe.

Best candidates:
- prefill/copy a resume command or resume hint without mutating artifacts directly
- guided inspect-to-resume flow that still hands off to existing commands/tool paths
- cleanup affordance that delegates to existing cleanup/session logic rather than bypassing it

Avoid for now:
- direct in-widget retry/resume buttons
- direct artifact mutation shortcuts
- any path that can skip stale-lock, abandonment, or finalization guarantees

### Option B — apply the deprecation workflow to the next legacy repo

Good candidate outcome:
- pick the next repo from `../../docs/project/legacy-transition-backlog.md`
- use `../../scripts/legacy-package-deprecation.sh inspect ...`
- use `render-handoff` for the legacy handoff rewrite
- relocate Pi session history using full-path-derived folder names
- create one final `tar.gz` archive
- delete the legacy repo only after validation

## Validation evidence from this session

### Package-local

Passed:
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
npm run check
```

### Monorepo root

Passed:
```bash
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/full.sh
```

### Docs discovery / extra checks

Passed:
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
npm run docs:list
```

Additional note:
- `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict` at monorepo root still fails because of **pre-existing unrelated metadata debt** in other repo files (missing front matter / `read_when` in multiple existing docs/prompts/README surfaces). This session did not resolve that wider repo issue.

## Files changed this session

Package-local:
- `extensions/self/subagent-dashboard-data.ts`
- `extensions/self/subagent-dashboard.ts`
- `tests/subagent-dashboard-data.test.mjs`
- `README.md`
- `docs/dev/monorepo-migration-dashboard-slice.md`
- `next_session_prompt.md`

Monorepo root:
- `../../scripts/legacy-package-deprecation.sh`
- `../../docs/project/legacy-package-deprecation-workflow.md`
- `../../docs/project/legacy-transition-backlog.md`
- `../../README.md`

## Remaining gaps

### Gap to trustworthy interactive recovery

Still unresolved:
- no mutation-capable dashboard action has yet been proven safe
- no explicit resume helper exists that demonstrates safe composition with current lifecycle semantics
- no UI action has been validated against abandoned-session + stale-lock edge cases

### Gap to fast, repeatable legacy package shutdown

Improved but not finished:
- the helper now gives deterministic inspection + handoff rendering, but it still does **not** automate classification, safe merge of conflicting session-history dirs, or archive/delete orchestration
- the workflow should now be tested on the next real legacy repo to verify the contract holds outside the `pi-autonomous-session-control` migration

---
summary: "Canonical-home migration decision and minimum viable subagent dashboard slice for the monorepo package."
read_when:
  - "Explaining why this package lives directly under packages/ instead of splitting immediately."
  - "Extending the subagent dashboard or reconsidering package/module boundaries."
system4d:
  container: "Structural decision record for the monorepo move."
  compass: "Keep lifecycle-critical control-plane code stable while adding operator visibility incrementally."
  engine: "Preserve brownfield core -> add package-local adapter/view boundary -> validate in canonical home."
  fog: "Premature generalization would create multiple moving seams during an already risky migration."
---

# Monorepo migration + dashboard slice

## Canonical package

- Package path: `packages/pi-autonomous-session-control`
- Package identity kept stable for now: `pi-autonomous-session-control`
- Template lineage: generated from `pi-extensions-template` in `monorepo-package` mode, then brownfield code was migrated on top

## What was regenerated vs migrated

### Regenerated from template

- package workspace location + `.copier-answers.yml`
- monorepo package metadata contract (`x-pi-template`, repository directory, component metadata)
- package-local scaffold expectations for scripts/docs layout

### Migrated from the standalone repo

- the existing `self` + `dispatch_subagent` control plane
- lifecycle hardening, stale-lock recovery, abandonment reconciliation, and tests
- existing docs, prompts, and package-local quality gate flow

## Structural decision

Keep this package as a **single package with explicit internal seams**, not a split multi-package group yet.

Current seams:

- control plane / persistence: `extensions/self/subagent*.ts`
- UI data adapter: `extensions/self/subagent-dashboard-data.ts`
- UI rendering + commands: `extensions/self/subagent-dashboard.ts`

Reason:

- `pi-interaction` is a good meta-example for separating runtime composition from UI-facing helpers, but it earned that split because multiple reusable surfaces already existed.
- Here, the lifecycle/persistence code is still highly package-specific and tightly coupled to the subagent session artifact model.
- A package-local adapter/view boundary gives us most of the design value without introducing cross-package release and import churn.

## What was copied from `pi-interaction` at a meta level

Inspired by `packages/pi-interaction/`:

- keep the extension entrypoint thin and wire specialized modules from there
- separate UI-facing behavior from lower-level runtime state/control logic
- prefer stable package-local boundaries before attempting shared abstractions

Not copied yet:

- no split into sibling publishable packages
- no umbrella runtime/facade package pattern
- no generalized dashboard/runtime library outside this package

## What was reused or rejected from `pi-vs-claude-code`

Reused:

- persistent above-editor widget pattern
- compact dashboard style with status-first rows
- read-only operator visibility as the safe first slice

Rejected for now:

- per-subagent streaming widget instances
- orchestration-heavy agent-team concepts
- overlay-heavy interaction flows for the dashboard

Reason: this package already has durable session/status artifacts, so the first dashboard should read those artifacts instead of introducing a second live state model.

## Minimum viable dashboard contract

The current widget/commands focus on read-only operator visibility:

- persistent widget with counts + recent sessions
- statuses surfaced: `running`, `done`, `error`, `timeout`, `abandoned`
- objective preview + recency + recommended action hint
- inspection remains artifact-backed and read-only; `/subagent-inspect <session-name>` now renders derived lifecycle metadata, artifact paths, safety notes, and the raw status sidecar without mutating session state
- commands:
  - `/subagent-dashboard`
  - `/subagent-inspect <session-name>`

Interactive recovery actions remain intentionally deferred until command wiring can be proven safe against the hardened lifecycle semantics.

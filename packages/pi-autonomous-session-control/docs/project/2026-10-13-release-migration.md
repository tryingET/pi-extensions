---
summary: "ASC 0.8.0 release target: breaking controller-command consolidation, original-child native tabs and bounded compatibility/rollback."
read_when:
  - "Upgrading ASC from 0.7.x to the native subagents command surface."
type: "reference"
---

# ASC 0.8.0 migration

Release target, not a publication receipt. Operator authorized the npm release under AK7076.

## Breaking CLI migration

The separate `subagent-dashboard`, `subagent-inspect`, `subagent-status`, `subagent-cancel`,
`subagent-clear`, and `subagent-cleanup` controller commands are removed, not compatibility aliases.
Use:

- `/subagents`: native Ghostty tabs for running current-session children.
- `/subagents <name>`: one original child, including settled read-only history.
- `/subagents status`: concise outcome counts and repository shared capacity.
- `/subagents --name <exact name>`: reserved child names such as `status` and `diagnose`.
- `/subagents diagnose capacity|clear|cleanup|observer`: explicit advanced diagnostics/maintenance.
  Clear/cleanup preserve traces unless the operator supplies `--delete`; malformed options refuse.

Cancellation is confirmed `/cancel` inside the attached child tab. Closing a viewer is not
cancellation. Backend cancellation APIs remain available; update scripts using retired slash commands.
Run `/reload` in existing controllers after upgrading; their loaded command closures do not update
merely because package files changed.

## Native attachment boundary

Views attach to existing ASC execution/control channels, never resume a child JSONL in a second
executing agent. Repeated requests reuse exact live viewers. Uncertain launches never automatically
retry. Guidance is literal, queued until a supported boundary after tools finish; delivered means
committed to context, not followed. Legacy children lacking the endpoint remain inspection-only.
No controller overlay or new-window fallback is substituted when native attachment is unavailable.

Qualification is bounded to installed Pi/native Ghostty on Linux, two real original children,
exact short ASCII guidance and private isolated fixture settings. Normal-repeat virtual keyboard,
Unicode, broader platform/focus/split behavior and live cancellation are not certified by that trial.
See the package's command-consolidation and attachment evidence for retained failures/limits.

## Rollback

Reinstall the prior ASC/LH compatible versions together and coordinate controller reload/restart.
Retain execution, custody, capacity, child traces and private attachment records. Downgrade is not
rollback of child effects; old controllers may ignore newer viewer history. Never delete retained
uncertainty or launch a duplicate child to manufacture recovery. Package publication does not enroll,
configure or republish any Decision151 task-session worker/profile identity.

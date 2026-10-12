---
summary: "AK7039 operator-requested single subagents command, removed overlay, diagnostic membrane and installed proof limits."
read_when:
  - "Using the consolidated subagents command or diagnosing its registration."
  - "Inspecting the command-retirement and installed proof boundary."
type: "reference"
---

# One subagents controller command

Operator explicitly authorized removal of the legacy dashboard and redundant controller commands.
Current surface:

- `/subagents`: open running current-session children as native same-window tabs.
- `/subagents <name>`: open one existing child, including finished read-only history.
- `/subagents status`: concise current-session outcome counts and repository shared capacity.
- `/subagents --name <exact name>`: escape reserved names such as `status` or `diagnose`.

Advanced maintenance is explicitly nested under `/subagents diagnose`:
`capacity`, `clear [--delete]`, `cleanup [--delete] [maxAgeDays] [maxCount]`,
`observer [status]`. Unknown/malformed options refuse. No maintenance or deletion runs automatically.
Cancellation remains confirmed `/cancel` inside a child viewer; backend runtime cancellation is unchanged.

The separate dashboard/inspect/cancel/status/clear/cleanup/observer commands are removed, not aliases
hidden from autocomplete. The overlay class/timeline and obsolete popup live fixture are removed.
Compact running rows/terminal outcome counts remain. The shortcut routes through the same dispatcher.
Runtime error/overflow guidance now uses `/subagents --name`, never the retired inspect command.

The observer adapter is content-free and owner-separated: ASC emits
`asc:subagent-observer:diagnose:v1`; LH checks exact current TUI/session/cwd, strict field shape,
process-wide original-object duplicate fence, and shutdown/context generation. Status does not arm
or launch. ASC waits seven seconds for a bounded correlated reply without fallback/retry. All reply
envelope inspection is exception-guarded, including revoked proxies. There is no ASC-private runtime
import in LH.

## Executed checks

- ASC package CI: 712/712 tests; LH: 964/964; zero skipped, typecheck/lint/pack checks passed.
- Independent work-product inspection `dispatch-1791840611224`: two initial findings (dead-command
  recovery guidance and revoked-proxy reply escape) fixed; source/regression recheck found no blocker.
- Root control CI passed with documented fleet/release/governed-canary skips, paired with both
  changed-package gates. Full fleet qualification remains unavailable in the isolated worktree.
- Guarded canonical landing: `61e7d03a13475cc62ffe643c807d83d0fa3de898`; ASC runtime rebuilt and both
  packages locally installed. All 39 held canonical task-session artifact hashes remained unchanged.

Source native proof: `$TMPDIR/ak7039-one-command-source-exact.0iU0jU/proof/proof.json`.
Normally installed proof: `$TMPDIR/ak7039-one-command-installed.Hnv6Mk/proof/proof.json`.
Each passed the selected `subagent-attachments.reality.live.mjs` assertion, zero skipped.
Actual native command inventory contains only `subagents`; status reports two original children;
advanced observer status stays idle with no launch; clear without delete reports preservation and
leaves recorded child identities unchanged. Default/named tab attachment, repeated reuse, close-one
sibling safety, named reopen, terminal history/reload reuse and `done=2` are exercised.

Independent evidence inspection `dispatch-1791842013163` recomputed all 19 source hashes against
canonical files and HEAD, checked actual registry/ANSI, exact single bash command per original child,
exact single 91/90-byte committed guidance, delivered receipts, settled effect receipts and real
`openai-codex/gpt-6.1-sol` responses following those instructions. Hook observations report inert
selection/no session/no active tools/zero instrumented attempts, not exhaustive execution/network
absence. Same-window/two-surface and process continuity assertions are retained, not broadly replayed.

## Retained limits

`ak7039-one-command-source.nGCykB` failed exact-byte beta input: two concatenated copies were queued.
The owned nested KDL was invalid, and its repeat mitigation was not applied; the failed attempt is
retained, not reclassified as passing. After correcting and validating the owned config, both passing
trials retain `repeat_info(1,5000)` and a private bus. Production config was untouched. Normal-repeat
virtual-key delivery, Unicode, broad platform/split/focus-race behavior remain unqualified.

Live observer opening/cancellation/malformed input/destructive cleanup were not exercised. Non-delete
trace-content preservation is source-tested; native proof checks identities and notification, not
filename/inode/prefix equality. Terminal alpha after reload proves reuse, not death-to-reopen of a
terminal viewer. Current controller sessions require `/reload` for their loaded command table to change.
AK task lifecycle closure and knowledge promotion are not implied by these engineering receipts.

---
summary: "AK6844: one ASC viewer per Pi session, renderer acknowledgment, passing package gate and isolated real Pi TUI proof."
read_when:
  - "Investigating ASC observer tab proliferation, startup acknowledgment or reload behavior."
---

# AK6844 — Shared ASC session viewer

## Request and boundary

Operator selected option 2: use one viewer per Pi session and acknowledge actual renderer
startup, rather than treating Ghostty D-Bus delivery as successful startup. Operator also
confirmed that selecting the blank tabs let their delayed commands start and close.

Implementation lives in linked worktree `pi-extensions-ak6844`, originally based on
`5407b8b19`. Parent claimant: `session-01a121f7-e7d7-78c1-b7d2-411d00381fd1`.
Source changes are confined to `packages/pi-little-helpers/**` and this diary. No provider,
WebSocket, ASC producer, execution/effect protocol, package manifest or lock changes.
Private offline dependency installs/builds were performed only inside this worktree.
No publication, model requests, operator-window control or machine configuration changes.

## Behavior

- Synchronous exclusive reservation across all event queues: one shared session snapshot
  and launch for concurrent direct dispatches, loops and later/resumed batches.
- Existing per-group v1 snapshots and event/progress/effect projections remain compatible.
  Shared snapshot: at most 128 groups, 64 phases/group, 8 MiB; group files remain 64 KiB.
- Renderer acknowledgment requires exact session, controller instance and random startup
  token; first stdout frame write completed; real PID, `/proc` start identity and argv.
  Receipt: exclusive mode 0600, at most 4 KiB, bounded no-follow/nonblocking read with
  ownership/type/link/mode checks. This proves renderer startup, not visible pixels or
  exact window placement, and is not a boundary against a malicious same-user process.
- D-Bus acceptance alone stays pending/unconfirmed. Indeterminate transport can receive
  an immediate or late valid ACK for that exact attempt. No retry or window fallback.
- Viewer survives terminal/idle batches. Manual close never cancels ASC or opens another
  viewer. Durable private reservation keyed only by session ID survives reload/cwd changes;
  only a genuinely different session ID has a new slot. Unsafe reservation denies launch.
- Generation replacement fences stale acknowledgments. Teardown publishes inactivity and
  detaches unsettled transport; later settlement cannot revive a disposed controller.
- Retention pruning republishes aggregate membership even on redundant progress.

## Causal checks and independent inspection

Initial new tests reproduced five groups producing five launches and transport-only false
`launched` status. Independent inspection found reload relaunch and indeterminate-ACK
suppression, plus stale aggregate pruning and launch-blocked disposal. Six causal failures
and one passing negative control were retained; all seven passed after remediation.

Final reviewer `dispatch-1791577850146` verified all four corrections, independently ran
**73/73** focused tests (including extension wiring), and found no remaining blocker in
that bounded inspection. File-budget exceptions unchanged; Biome retained two existing
non-null assertion warnings in the launch adapter.

## Parent verification

Node **22.23.3**, selected by `source scripts/select-gate-node.sh`.

```bash
npm ci --prefix packages/pi-little-helpers --offline --ignore-scripts --no-audit --no-fund
# Same isolated install for pi-model-selection, pi-telemetry, pi-session-compaction,
# and pi-peer-messaging (its broker needs tsx); no manifest/lock changes.
npm --prefix packages/pi-little-helpers run task-session:build
bash scripts/package-quality-gate.sh ci packages/pi-little-helpers
```

Final package CI: **PASS — 847 tests / 847 pass / 0 fail / 0 skipped**, including structure,
file budgets, lint, full package typecheck and packaging. Logs:
`$TMPDIR/ak6844-package-ci3.log`, build log `$TMPDIR/ak6844-build.log`.
Earlier failures retained: absent generated task-session entry and a missing peer broker
runtime dependency (846/847). These were fixed by private dependency/build preparation,
not weakened assertions or unrelated source edits. Packaging uses the declared dry-run
release checks; its existing already-published-version guard was reported and accepted by
that script, not hidden. No actual publication occurred.

Isolated real-Ghostty assertion under
`tests/live/asc-observer-unavailable.reality.live.mjs`: shared singleton/ACK/reload test
**PASS**, no skip. A separate pre-existing fresh-window stale-display test failed with an
indeterminate command-handshake timeout; retained, not retried or declared successful.
Log: `$TMPDIR/ak6844-nested/live-results.log`; shared test artifact:
`$TMPDIR/asc-session-6844-live-IOXfBd`.

### Actual Pi TUI receiver proof

Private `dbus-run-session` + nested niri (`wayland-2`) + real Ghostty
`1.3.2-main-+492300cad` + installed Pi **1.1.0**, actual changed `sidequest.ts` loaded with
explicit `-e`. Private agent directory and scratch cwd; no ambient extensions, models,
MCP, skills or prompt discovery. Fixture emits ASC observation events, not actual child
model requests. This verifies receiver/lifecycle wiring, not provider execution.

Result `$TMPDIR/ak6844-nested/tui-result.json`: **PASS**, process exit 0:

- `ctx.mode=tui`, `hasUI=true`; session `01a1228d-be66-709a-bbad-7d5d1328201d`.
- Four direct dispatch groups plus one loop aggregated into one shared viewer/receipt.
- Actual renderer PID `3834917`; real Ghostty log records one observer `/bin/sh` command.
- Viewer remains alive **17 seconds after terminal completion**, beyond old 15-second close.
- Manual SIGTERM of the exact private validated renderer marks closed.
- Native `ctx.reload()` via extension command preserves session and causes no new viewer
  on a subsequent observation. Exactly one startup receipt across both generations.
- Clean TUI shutdown; no test process remains. No operator tab/window is manipulated.

Fixture scripts and process logs are retained in `$TMPDIR/ak6844-nested/`.
Outer niri reported no outputs/focused window during setup; the helper could not park its
new nested window and reported that failure. The owned nested compositor nevertheless
had its own winit output; all proof clients were confined to its socket/private session bus.

## Remaining limits

- Root `just ci` was invoked but **BLOCKED** by unrelated worktree fleet installs absent;
  not claimed green. Log `$TMPDIR/ak6844-root-ci.log`. The owning package gate is green.
- Package docs strictness reports unchanged missing `summary/read_when` in
  `skills/task-session/SKILL.md`; this unrelated metadata was not changed.
- Private state/reservation root must be retained for same-session no-relaunch across
  generations. Filesystem-failure cleanup/teardown remains best-effort; ACK is not pixel
  proof. On reload an old live viewer is fenced/closed, and no replacement is auto-opened.

## Canonical landing and installed-source proof

Source commit `74990c50eb71bd949f556c55bae4fc1867477a20`, rebased over concurrent unrelated
main advancement without changing its observer patch. Canonical move used only
`LAND_NO_FETCH=1 scripts/land-canonical.sh <ref>`: fast-forward from `f916d29f38cf14222c498dfdfeace9f8e7bdb107`,
38-package install-health consistency and real Pi no-model extension-load smoke passed.
Foreign ontology dirt remained unchanged. `pi install <canonical>/packages/pi-little-helpers`
then succeeded; no publication or version bump. Logs `$TMPDIR/ak6844-landing.log` and
`$TMPDIR/ak6844-pi-install.log`.

Repeated the actual isolated Ghostty/Pi TUI receiver proof against **canonical installed
source**, with a fresh private agent directory and session. Result:
`$TMPDIR/ak6844-nested/installed/tui-result.json`, **PASS**, process exit 0:
session `01a12290-bca9-7139-be20-f52c5edc4cc5`, renderer PID `3914751`, five groups, one
startup receipt, 17-second idle survival, manual-close and native-reload no-relaunch.
These are real receiver/lifecycle results for injected observation fixtures, not a new
provider-call campaign. Existing operator sessions retain old loaded closures until
`/reload` or restart; neither install nor source landing silently reloads them.

The owned nested compositor was stopped after all isolated proof clients exited; retained
scripts/receipts remain available. Rollback is a scoped reversal of the observer source
commit through the same canonical landing procedure, followed by reload—not deletion of
historical state or a reset of foreign work.

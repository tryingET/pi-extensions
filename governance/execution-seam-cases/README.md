---
summary: "Execution-seam case fixtures for validating ASC/orchestrator boundary guardrails."
read_when:
  - "Inspecting pi-extensions governance projections, policies, or execution-seam fixtures."
---

# Execution seam casebook

Shared canonical seam scenarios for the ASC → orchestrator execution boundary.

Purpose:
- keep contract, consumer, and installed-package proof anchored to the same named cases
- turn discovered seam regressions into reusable fixtures instead of one-off prose
- grow a compounding compatibility memory without reopening the architecture split

Initial seed cases:
- `timeout-empty-output` — timeout result with empty `fullOutput` must still keep human fallback text
- `timeout-whitespace-output` — whitespace-only raw timeout output must not blank the human fallback body
- `assistant-protocol-semantic-error` — semantic assistant failure must preserve partial output and failure kind
- `assistant-protocol-parse-error` — malformed raw pi JSON output must preserve parse-error classification and body text across translation into the helper protocol seam
- `assistant-protocol-incomplete` — a clean transport exit without exactly one terminal assistant event must fail closed and preserve partial output plus incomplete-protocol classification
- `bundled-bridge-import` — installed release smoke must still see the temporary bundled ASC bridge in the isolated package copy
- `capacity-parent-not-draining` — helper protocol backpressure must remain bounded and a separate positive watchdog must terminate raw work even when execution is explicitly unlimited and the parent never drains stdout
- `capacity-parent-not-draining-stderr` — forwarded raw stderr must honor the same finite backpressure supervision when a live parent stops draining helper stderr
- `capacity-dead-helper-live-raw-group` — helper death alone must not reclaim capacity while the exact detached raw Pi process group remains live; missing custody metadata stays fail-closed
- `capacity-pre-spawn-dead-owner` — an exact-token lease still in the proven pre-spawn phase may be reclaimed after owner death, while a spawn-committed/no-status lease remains blocked
- `capacity-helper-direct-custody` — a dormant supervisor must receive immutable no-replace helper/raw/process-group custody and a spawn marker before the raw Pi start gate or `transport_ready`, so parent loss cannot create an unowned spawn window
- `capacity-start-takeover-fence` — stale takeover and helper custody/start publication must share one per-slot transition fence so parent death inside the handoff cannot admit overlapping effects
- `capacity-shared-limit-immutable` — the first reservation fixes one persistent repository-session-root `maxConcurrent` contract and later callers cannot expand the slot namespace
- `capacity-malformed-lease-hard-cap` — writer metadata must remain reader-valid and malformed effect-bearing leases must never become reclaimable by age alone
- `capacity-release-marker-claim-race` — a failed exact lease deletion must preserve its spawn marker and custody evidence; only successful compare/delete permits cleanup
- `capacity-kernel-group-absence` — post-spawn release/reclaim requires exact helper/raw death plus one kernel process-group probe whose `ESRCH` result is the only absence proof
- `capacity-unlimited-parent-death` — helper supervision of the exact parent PID/start identity remains finite even when workload execution timeout is disabled
- `capacity-helper-sigkill-supervisor` — helper `SIGKILL` must close the custody pipe and make the still-live supervisor leader terminate the complete managed group without helper cleanup or post-reap PGID signaling
- `capacity-release-deferred-truth` — failed exact lease deletion or non-quiescent managed group must change terminal success into `capacity_release_deferred` error with effect-indeterminate disposition
- `capacity-custom-spawner-explicit-owner` — custom runtime spawners must declare `parent_owned` capacity semantics instead of receiving an implicit function-identity bypass

Usage today:
- ASC contract tests load these cases from `packages/pi-autonomous-session-control/tests/`
- orchestrator adapter tests load these cases from `packages/pi-society-orchestrator/tests/`
- installed-package smoke loads these cases from `packages/pi-society-orchestrator/scripts/`

Add new cases when a seam bug, packaging drift, or consumer-truth edge case is learned the hard way.

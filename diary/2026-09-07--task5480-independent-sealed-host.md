---
summary: "Task5480 independent source execution, synthetic proof and explicit incomplete startup boundary."
read_when:
  - "Resuming Decision151 Pi implementation or reviewing its evidence."
type: implementation_diary
---

# Task5480 — independent sealed host, no rollout

Executed only in the authorized `decision151-main.5gPphB/pi-extensions` main worktree. Initial interface commit: `3b633e03`; source/test/package commit: `58a904001762498c176ba3a4f2851f77015f1188`.

[Canonical implementation evidence](../docs/project/2026-09-07-visible-task-session-pi-implementation.md) records exact producer digests, emitted tarball hashes, validation commands, and the remaining owner gates. Keep detailed authority and proof there rather than duplicating it here.

Observed: 63 task-session synthetic checks pass; 50 existing sidequest/observer regression checks pass; little-helpers lint/typecheck/structure and isolated real packing checks pass. Actual SDK/native compressed Codex sends use synthetic responses; real native flock contention and descriptor inheritance use owned synthetic processes. No live provider is involved.

The AK producer remains a blocked draft. Public launch refuses before reservation/spawn. Production bootstrap, profile/credential acquisition, durable startup composition, transport/report/stop wiring, installed viewer and end-to-end G2 proof are missing—not claimed finished because lower-level tests pass. Full package gates and live reality/rollout remain unverified. Task5480/Decision151 is not marked accepted or complete.

No AK or DB calls, canonical dirty file changes, runtime install/reload, live credentials, enrollment, pin activation, worker kills or claim recovery. Scoped commits bypassed hooks to avoid unscoped/runtime-bearing checks; the canonical evidence lists the checks actually run.


## Continuation: production composition source, still activation-gated

Parent-main commits `6b90412bc` (lane identity/classify-installed) and
`26384bed89e1af081a5e931278dbc23db40f86e9` (bootstrap/profile/startup/viewer) passed normal hooks.
The key discovered bug was Node materializing stdin/stdout during SDK import: fd0 conflicted with its
Socket and stdout could touch the AK lock file. Adoption now duplicates protocol/custody into private
CLOEXEC FDs and replaces fd0/fd1 with `/dev/null` before SDK import. Synthetic independent processes
verify retained OFD and empty lock bytes. A builtin-only integrity check pins 522 SDK JavaScript files
and nested resolution before credentials/SDK import; provider errors do not become successful finishes.

Final evidence: 76 focused tests; 413 little-helpers tests plus declared checks with Pi smoke explicitly
gated; packed public/native/SDK proof plus 12 packed startup tests. Actual AK Python supervisor + scripted
native worker is not Rust/DB G1. Actual TUI in a synthetic PTY is not Ghostty placement/G2. Orchestrator
lint/typecheck pass, but its bounded full suite is 471/472 with the existing temp-path-context assertion
failure; the live Pi loader test was explicitly excluded. No full orchestrator green claim.

Exact schemas, commit IDs, artifact hashes and logs are in
[the implementation handoff](../docs/project/2026-09-07-visible-task-session-pi-implementation.md#continuation-landing-and-final-evidence).
AK source now adopts bootstrap/startup/baseline/effect shapes, but native verification is blocked by
workstation heavy-job custody preflight, not a missing Pi bootstrap. Public launch remains denied.
Installation/pins/provisioning, native cross-owner fault proof, live visibility/provider canary and release
acceptance remain owner gates. No live config/auth, AK/DB invocation, enrollment, recovery, other-worker
signaling or canonical feature-checkout transport-fix mutation occurred. Task5480 remains unaccepted.


## Review correction: evidence8436 / I01 I02 I03

Committed open finding notes first (`9863f7d2`), then fixes with normal hooks
(`3c710d83645eaeeea9db5b6d9bd3405f1531a6f7`). Directory identity alone did not establish Git topology;
JS-only hashing did not establish SDK export identity; child-only compatibility checks were too late to
prevent deterministically invalid reservations. All three defects now have focused and packed regressions.

Observed: 95 focused tests; 432 little-helpers tests and declared checks with live smoke gated; 474 safe
orchestrator tests with the live loader excluded; 31 packed startup/review tests. Final pack hashes and
finding-level source/test dispositions are in the implementation evidence. Parent independent review remains
pending; package/SDK compatibility checks are not same-UID sandbox or live/native claimability proof.
Public producer fence unchanged. No activation, native AK build, live credentials/config/provider/AK/DB,
recovery, enrollment or out-of-scope source mutation. Old artifact proofs remain historical, not new pins.


## I03 follow-up: exact reasoning before reservation

Reopened I03 before changes (`6fe5d879`): valid gpt-5.4/max passed preflight but the SDK clamps to xhigh.
The red test reached the plan port. Fix `c4618db0151e13d3dd43f2e56fe483757b7e6afb` calls the pinned SDK's
pure clamp helper and refuses any changed effective level; no downgrade. Existing child guards remain.
Twelve I03 tests pass, including all six supported constructor levels and the zero-effect max negative;
safe broader suites pass 438 little-helpers / 474 orchestrator tests. Synthetic PTY and live Pi loading were
explicitly excluded; no terminal/install or refreshed packing proof. Prior artifacts are historical.
I01/I02 are independently resolved per operator; this I03 correction awaits independent re-review.

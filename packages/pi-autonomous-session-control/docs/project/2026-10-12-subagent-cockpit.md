---
summary: "AK7039 cockpit implementation, controls, native proof and remaining rollout boundary."
read_when:
  - "Operating the compact subagent widget or live child popup."
  - "Changing literal guidance delivery, private attempt control, or its verification contract."
type: "reference"
---

# ASC subagent cockpit — AK7039

## Operator contract

The main window shows one outcome-count header and at most four active child rows, plus an overflow hint. Rows contain bounded elapsed/latest-tool/observed-activity metadata, not objectives or verbose identities. All terminal => exactly one count line; no children => hidden. Quiet is observational, never cancellation policy.

`/subagents [all|running|done|error|timeout|aborted|abandoned]` opens current-controller/repository history and live children. `/subagent-dashboard` aliases it; `/subagent-inspect <name>` selects a child. `Ctrl+Alt+Shift+S` opens while the controller awaits a tool. The shortcut is configurable with `PI_ASC_COCKPIT_SHORTCUT=ctrl+alt+shift+<letter>` or `off`.

Popup keys: Tab switches picker/timeline/private draft; Enter selects or expands; PgUp/PgDn scroll; End follows activity; Ctrl+S sends the private draft; Ctrl+Alt+X confirms exact-attempt cancellation; Esc dismisses only. Main editor content is never touched by production cockpit code. Private drafts follow attempt identity and survive popup reopening within the loaded extension instance.

## Ownership and transport

ASC keeps process custody, capacity, cancellation, final settlement and effect receipts. The current print/JSON helper and strict v2 protocol are unchanged. A minimal explicit child extension adds a private, mode-0700 attempt directory and mode-0600 bounded channel/fence files; it is not a new execution runtime or same-user sandbox.

Guidance is inert literal text, proposed as an `asc.subagent-guidance.v1` custom-message entry at native successful turn/final-continuation boundaries. A continuation asks the same child to process it. Slash commands/templates are not expanded. Exact parent/repository/session/dispatch/attempt and live PID-start identities govern admission. Terminal attempts and legacy children cannot acquire a steering endpoint through the UI. Cancellation also carries the confirmed expected identity into the signal-side API.

`queued` is admission only. `delivered` requires the correlated custom-message entry in the active native branch; it does not prove compliance. Unconfirmed requests expire at closure/expiry, or are explicitly rejected by a final contention fence. Late persisted proof can correct an expired staged receipt without reopening an attempt. Retry/overflow turn failures do not close telemetry prematurely. Final lock acquisition retries for a bounded 250 ms, then fences admission independently without lock takeover.

Control records are preserved under the 1 MiB serialized UTF-8 budget; oldest telemetry is evicted first and clipping is labelled. Retention is bounded to 80 events, 32 requests, eight pending, five-minute request expiry. Transient tool/assistant publication is throttled. Generic observation events stay content-free. Private control files are retained with trace history; no automatic removal is introduced.

## Detached observer

The companion `pi-little-helpers` candidate changes unset/auto policy to no observer effects. It retains bounded current-session telemetry in memory; `/subagent-observer` explicitly opens/arms the existing guarded path, and `status` inspects only. Explicit `PI_ASC_OBSERVER=ghostty/on` remains compatible. Receiver correlation, startup ACK, singleton reservation, close/reload no-relaunch and execution-independence rules remain in the helper-owned contract.

## Verification evidence and limits

Independent source inspection identified four blockers (cancellation replacement, recovery lifetime, final-lock contention, aggregate UTF-8 bytes). All four were repaired with adversarial regressions; the second independent inspection found no remaining concrete blocker in its bounded scope.

Observed local evidence:

- ASC declared pre-push gate: 78 test files pass, including transport/custody, recovery, exact cancellation, byte budgets, compact rows and overlay source tests.
- Helper declared pre-push gate: 67 test files pass. Existing Decision151 artifacts were copied unchanged as inputs, not rebuilt; full CI packaging remains held under the existing reconciliation boundary.
- Native fullscreen PTY trial: actual Pi 1.1 TUI, actual ASC dispatch, actual `openai-codex/gpt-6.1-sol` child; popup opened during awaited dispatch, expanded tool arguments, queued then delivered guidance, final `STEERED_NATIVE_PROOF` with unchanged attempt/child PID, preserved main draft on dismissal, selected second-attempt cancellation. This preceded the final slim-row metadata refinement.
- Final-source regular-mode PTY trial repeated those controls, tested resize/reopen, and retained per-production-file SHA-256 bindings. It passed after the final slim-row refinement.

Retained workstation evidence roots (diagnostic evidence, not AK authority):

- `$TMPDIR/ak7039-native-proof-1791781517/`
- `$TMPDIR/ak7039-native-regular-1791782258/`
- `$TMPDIR/ak7039-asc-gate.log`
- `$TMPDIR/ak7039-helpers-gate.log`

The proof's controller provider is deterministic; its child provider and native execution/TUI are real. ANSI substring checks are not reconstructed-screen/pixel/IME/placement proof. Installed complete-extension-set coexistence and canonical activation are not established by this fixture.

### Recovery and isolated Ghostty evidence

The first GUI preparation was blocked because niri had zero outputs/no empty workspace. Its test-owned partial compositor was identity-checked and terminated. After the operator resumed this session, display availability returned; a new isolated compositor was parked on an empty workspace and a private session bus was used. Operator windows were not moved or controlled.

`$TMPDIR/ak7039-cockpit-ghostty.I8lwqs/cockpit/proof.json` binds all 19 inspected production/fixture source hashes. The actual Pi TUI + ASC child/provider trial passed again inside real isolated Ghostty. Default observation wrote no state or tab; `/subagent-observer status` remained effect-free; the explicit slash command opened two retained groups with a verified renderer PID/startup ACK. The existing compositor/private-bus identity guard ran before Pi launch. This proves the native command and renderer startup/PTY, not pixels or placement.

`$TMPDIR/ak7039-ghostty-proof.xe22Ic/observer-reality.log` preserves a mixed result: the changed default/manual singleton/ACK/close/reload reality assertion passed; the pre-existing fresh-window stale-progress fixture failed its launch handshake with `effect_indeterminate`. Overall that file was **one pass, one failure**, not a green suite. This separate fresh-window issue is not claimed fixed, causally explained or no-effects; no unconfirmed observer attempt was retried. Its scratch is retained at `$TMPDIR/asc-observer-live-v0Cobw/`; the successful scoped assertion's scratch is `$TMPDIR/asc-session-6844-live-Ye8Op7/`.

A final independent inspection matched the proof hashes, renderer session/startup identity and all 39 unchanged task-session artifact hashes, and found no concrete blocker to bounded source landing. Canonical installation/complete-extension coexistence remain a separate proof step. No task-session rebuild, full CI packaging, AK lifecycle closeout, publication or knowledge promotion is implied.

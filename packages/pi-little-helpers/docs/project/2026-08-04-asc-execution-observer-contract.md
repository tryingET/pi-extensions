---
summary: "Contract for automatic read-only Ghostty observation of ASC-backed dispatch and loop progress."
read_when:
  - "Changing ASC execution observation events, automatic Ghostty observer launch, loop grouping, or long-running-agent supervision."
  - "Debugging why dispatch_subagent or loop_execute did not open one progress observer tab."
type: "contract"
system4d:
  container: "Cross-package observation seam from ASC execution telemetry to a pi-little-helpers Ghostty renderer."
  compass: "Make long-running delegated work visible without making a terminal tab execution authority."
  engine: "ASC projects bounded telemetry -> host event bus -> pi-little-helpers private state -> read-only Ghostty renderer."
  fog: "The main risk is confusing observer launch, visible terminal state, or silence classification with execution/effect truth."
---

# ASC execution observer contract — 2026-08-04

## Decision

Interactive Ghostty Pi sessions automatically project ASC-backed execution into a read-only observer tab when `pi-little-helpers` is loaded.

The first implementation does **not** relocate the ASC helper or raw Pi child into Ghostty. ASC retains its owned helper process, pipes, PID/start identity, capacity lease, cancellation, settlement protocol, and effect receipt.

```text
ASC-owned headless execution
  ├─ authoritative helper protocol -> ASC result/effect receipt
  └─ bounded observation event -> Pi event bus
                                -> pi-little-helpers private snapshot
                                -> read-only Ghostty renderer
```

AK6844 changes the observer projection to one shared viewer per Pi controller session across **all** direct dispatches, loops and resumed/later batches. Each group's existing ASC identity, phases, events and execution/effect truth remain separate and unchanged. The controller synchronously reserves its singleton attempt before any transport await; group queues continue collecting telemetry while startup is pending.

Receiver selection and placement limitations are described in the [package README](../../README.md#automatic-asc-execution-observer); older exact-placement claims below are historical, not verified guarantees.

## Owner split

| Concern | Owner |
|---|---|
| Child spawn, transport, PID identity, cancellation, capacity, settlement, effect disposition | `pi-autonomous-session-control` |
| Cognitive phase/run identity and phase grouping | `pi-society-orchestrator` |
| Ghostty placement, private observer state, rendering, automatic/headless policy | `pi-little-helpers` |
| Task/evidence/decision/direction authority | AK |

The event bus is a host composition seam. It does not make the packages co-own execution.

## Producer event

Event bus name:

```text
asc:execution-observation:v1
```

Payload schema:

```text
asc.execution_observation.v1
```

Allowed event kinds:

- `dispatch_progress`
- `dispatch_terminal`
- `group_terminal`

The projection intentionally includes only:

- producer: `dispatch_subagent`, `loop_execute`, or future `workflow_execute`;
- absolute cwd needed for local Ghostty placement;
- logical group id/kind/label;
- bounded phase name/index/count and agent/cognitive-tool labels;
- dispatch/attempt/profile identifiers;
- status, progress phase/sequence, last semantic activity, latest tool, and aggregate usage;
- terminal status, failure kind, elapsed time, and exact ASC effect disposition when available.

It intentionally excludes:

- objective and prompt text;
- system/cognitive-tool bodies;
- task contract and path-scope content;
- assistant output and stderr;
- session JSONL paths;
- effect-receipt paths;
- environment values and credentials.

ASC owns the producer-side projection helper. `pi-little-helpers` independently validates the incoming structural event before any observer effect: producer and group kind must agree, identity fields are rejected rather than truncated when oversized, terminal/progress shapes must match their event kind, and event cwd must resolve to the active Pi session cwd.

## Private observer state

`pi-little-helpers` retains the existing non-authoritative per-group snapshots/API and writes an additional shared session snapshot under:

```text
$PI_ASC_OBSERVER_STATE_DIR
or $XDG_RUNTIME_DIR/pi-asc-observers
or ~/.local/state/pi-asc-observers
```

Safety properties:

- state root is an owned, non-symlink directory with mode `0700`;
- snapshots are hashed filenames, not caller-controlled paths;
- snapshots are atomic private regular files with mode `0600`;
- per-group files are bounded to 64 KiB; shared session files to 8 MiB; startup receipts and session reservation records to 4 KiB;
- event strings, phases, and arrays are bounded, with at most 128 retained groups per controller instance;
- terminal groups expire after 10 minutes, inactive between-dispatch groups after 24 hours, on subsequent events; capacity includes queued groups and is capped at 128; membership changes republish the shared aggregate even if the triggering progress event is redundant;
- shared filenames bind session id plus a random controller instance; old generations cannot ACK a successor, and their inactive state never starts a delayed viewer;
- stale inactive snapshots/receipts are pruned opportunistically after 10 minutes, orphan snapshots after 24 hours; a still-live PID/start identity protects an idle controller's files;
- changing the session identity/cwd fences and disposes the old controller; a replacement runtime needs a fresh generation, **not** a fresh launch slot for the same session ID;
- a stable hashed `<session-hash>.reservation.json` is created with exclusive mode-0600 `wx` before transport invocation; subsequent diagnostic status updates are atomic. It contains only the session ID, original instance ID and bounded observer status. Reading uses the same verified no-follow/nonblocking descriptor and bounded JSON reader as startup receipts. Unsafe, partial or unreadable records deny launch;
- the reservation is never released or expired by reload, disposal, cwd changes, retention pruning or a closed/failed/unconfirmed attempt. A genuinely different Pi session ID uses a different reservation. This small diagnostic tombstone persists to prevent old sessions reclaiming slots; it is not a task/AK/session-queue authority surface;
- `session_shutdown` unsubscribes the event listener, marks snapshots inactive, and disposes group/queue state without awaiting an unresolved launch promise. Detached settlement checks the disposed fence before any publication or monitor creation;
- no prompt/output fields are accepted;
- observation/state errors are swallowed at the execution boundary and cannot fail the ASC attempt.

Schema:

```text
pi.asc_execution_observer_state.v1    # existing per-group compatibility
pi.asc_execution_observer_session.v1  # bounded groups array + session/controller identity
pi.asc_execution_observer_startup.v1  # renderer startup receipt, not execution evidence
pi.asc_execution_observer_reservation.v1 # durable one-attempt tombstone per Pi session
```

The snapshot is diagnostic UI state, not a session trace, checkpoint, KES artifact, evidence receipt, or authority projection.

## Automatic launch policy

Default `PI_ASC_OBSERVER=auto` behavior attempts launch only when:

1. the exact host mode is `ctx.mode === "tui"` and the session reports `hasUI=true`;
2. the host process is running inside Ghostty (`TERM_PROGRAM=ghostty`);
3. the standard `pi-little-helpers` sidequest extension is loaded;
4. the first valid `dispatch_progress` event for the active cwd arrives;
5. the controller exposes a surface ID, its actual Ghostty ancestor executable maps to a recognized broker family, and that family's well-known owner resolves to one unique D-Bus peer. The primary origin/main family uses `com.mitchellh.ghostty` at `/com/mitchellh/ghostty`; transitional legacy controllers use `com.tryinget.ghosttysidequest` at `/com/tryinget/ghosttysidequest`. The resolver never crosses between families.

Overrides:

| Value | Behavior |
|---|---|
| unset / `auto` | Attempt exact same-window tab launch (single-instance server + controller surface id) only for interactive Ghostty Pi sessions. |
| `1`, `on`, `true`, `ghostty` | Request observation-policy evaluation for any TUI session. Exact single-instance server targeting is still mandatory; this never enables an untargeted tab, new-window fallback, or RPC/JSON/print mode. |
| `0`, `off`, `false`, `headless`, `disabled` | Do not write observer state or launch Ghostty. |

`pi -p`, JSON, RPC, CI, SSH, and other non-TUI callers remain headless even when RPC reports `hasUI=true` or the process inherits a Ghostty environment variable.

The observer reuses the visible-session launch primitives but selects a stricter placement policy than operator-requested visible peers: only the unique peer of the controller executable family's well-known single-instance owner may open its tab, the owner's `/proc/<pid>/exe` must equal the actual controller build, and the controller surface ID routes the tab to the exact window. Capability probes use the actual controller ancestor and ignore `PI_SIDEQUEST_GHOSTTY_BIN`. Under `--gtk-single-instance`, targeting the nearest ancestor PID can misroute when that ancestor is a launcher client, so the exact-build well-known owner is authoritative. It never substitutes another executable family, invokes an untargeted `+new-tab`, uses the transitional wrapper for a normal controller, or retries in a new window. If exact placement is unavailable or activation fails, the observer records/reports one launch failure and ASC execution continues headlessly. Toolbox-only sidequest projection does not register a second listener.

## Observer lifecycle

- One **Pi session ID** reserves at most one observer launch across all groups and controller generations; no completion, failure, timeout, quiet period, resume, retention expiry or extension reload resets it. A fresh generation retains `closed`/`failed` diagnostic status from a safe reservation, or displays `unconfirmed` for a previous pending/launched attempt. It never inherits a positive startup proof, reads an old ACK as its own, or creates a second viewer.
- The session viewer remains alive through terminal/idle batches until manual close, controller shutdown/death or generation mismatch. Once a matching live controller has been read, missing/unreadable updates keep the shared viewer open with stale progress rather than closing a live session's only viewer. Before any matching snapshot, or after controller death, the unavailable hold remains bounded. Legacy standalone per-group rendering retains its terminal holds.
- A manual close records `closed` after the acknowledged PID/start/argv is no longer live; it never cancels, replays or relaunches work.
- A direct `dispatch_subagent` terminal event closes its one-dispatch group.
- A loop phase terminal event updates that phase but does not close the loop group.
- `loop_execute` emits one `group_terminal` only after a terminal result or terminal exception. A `confirmed_no_effects` result that leaves the checkpoint lineage retryable is explicitly nonterminal and keeps the same observer group open for lawful resume.
- Resumed progress defensively clears stale non-authoritative terminal UI state; execution/checkpoint legality still comes only from the orchestrator and ASC receipt.
- Shared viewers retain terminal success/failure alongside other groups; neither closes the session viewer. Phase terminals show between-dispatch state rather than incorrectly treating idle time as a live dispatch stall.
- An inactive controller is shown as disconnected. Unreadable/missing snapshots instead show `Progress updates unavailable`, direct the operator to the parent Pi session, and retain the last successfully checked matching-generation progress as `stale — no longer live`. If none has been read, no progress is invented. Technical details appear below the progress; JSON parser diagnostics never expose snapshot contents.
- Stale progress includes snapshot age and elapsed time at that snapshot, not an advancing execution clock or a current health/completion classification. Successful reads restore normal rendering; a replacement controller generation still exits the old renderer. Legacy group viewers and first-read failures retain the bounded unavailable exit hold. A shared viewer with a last checked still-live controller waits for recovery, not a terminal hold; shared controller shutdown/death exits cleanly. No execution or effect conclusion is inferred.
- Closing the observer tab terminates only the renderer. It does not send a signal or cancellation request.
- Cancellation stays explicit through ASC/controller surfaces.

## Progress-aware supervision and deadmen

ASC emits a bounded progress heartbeat approximately every two seconds while an attempt remains active. Each accepted heartbeat renews a 15-second **observer liveness lease**. Lease expiry changes the display to `telemetry lease expired — execution truth remains ASC`; it never signals or cancels the child. This lease distinguishes a responsive observation pipeline from semantic work progress without becoming execution authority.

Separately, the renderer classifies semantic inactivity using `lastActivityAt`:

- `healthy`: recent semantic activity;
- `quiet`: no recent semantic event;
- `suspected stall — inspect before cancelling`: prolonged semantic silence.

Default display thresholds:

- quiet after 60 seconds;
- suspected stall after 5 minutes.

Both liveness-lease and semantic-activity states are operator cues, not automatic cancellation policy. Provider calls and long shell commands may be healthy while semantically quiet. Only an explicit controller cancellation or the separately configured emergency deadman can stop execution.

The execution safety policy remains separate:

- startup timeout: 30 seconds by default;
- ASC execution emergency deadman: 4 hours by default;
- orchestrator whole-loop emergency deadman: 24 hours by default;
- explicit caller timeout values remain absolute overrides;
- unlimited execution still requires ASC's existing request plus host opt-in.

Routine 5–10 minute cutoffs should not be supplied for ordinary long-running modern-agent work. Visibility does not remove all deadman protection; it removes the need to use a short wall clock as a crude progress detector.

## Failure and fallback truth

| Failure | Required behavior |
|---|---|
| No `pi-little-helpers` listener | ASC execution continues normally and headlessly. |
| Invalid observation payload | Ignore it; no file or launch. |
| Snapshot write failure | Ignore observer effect; execution remains authoritative. |
| Exact controller/surface proof is unavailable or explicit `confirmed_no_effects` refusal | Record/report failure once; no wrapper/window fallback or heartbeat retry. |
| Launch callback rejects or an unsuccessful result lacks explicit no-effects proof | Retain `effect_indeterminate`, inspect the same attempt's immediate/late ACK, and report unconfirmed startup once if absent; never redispatch. ASC execution stays independently owned and headless. |
| Observer process/tab closes | Do not cancel execution. |
| ASC dispatch fails or times out | Show terminal state/effect disposition when emitted; ASC receipt remains truth. |
| Loop phase completes | Update phase; keep the run group open. |
| Loop result remains exactly retryable after `confirmed_no_effects` | Do not emit `group_terminal`; preserve the shared run observer for lawful resume. |
| Loop terminates | Emit `group_terminal`; render final run state. |

Ghostty transport acceptance is **not** renderer startup. Session launch status is `pending` during the bounded startup check (2 seconds by default, not an execution timeout), `unconfirmed` without an ACK, `failed` for genuine transport refusal/rejection (`confirmed_no_effects`), `launched` only after a verified renderer ACK, and `closed` after its process ends. None permits an automatic retry, new window or focus operation. The adapter preserves the transport's disposition; the controller conservatively normalizes thrown callbacks and unsuccessful settlements other than explicit `confirmed_no_effects` to `effect_indeterminate`. A `settled` label on an unsuccessful callback is not no-effects proof. An `effect_indeterminate` result remains pending/unconfirmed and eligible for a valid immediate or late ACK for that **exact same attempt**, without retry; `confirmed_no_effects` remains failed even if a contradictory receipt appears. These observer transport dispositions are not ASC execution/effect receipts. A late matching ACK may confirm the original accepted/indeterminate request only while its generation is live; it does not create another tab or revive disposed state.

The renderer validates session id/controller instance and live controller PID/start identity, renders the first frame, awaits its stdout write completion, then creates a private exclusive mode-0600 startup receipt. The receipt binds session, instance, random one-attempt token, renderer PID and Linux `/proc` start ticks. The controller opens it with `O_NOFOLLOW|O_NONBLOCK`, checks the opened inode's owner/type/link count/exact mode/size, reads at most 4097 bytes, and checks the live PID/start identity and exact Node/script/identity arguments. Symlinks, hardlinks, non-private, malformed, oversized, wrong-token/instance/session/PID/start receipts are not ACKs. This is a same-user diagnostic handshake, not a security boundary against the controller's own user forging files/processes.

A verified ACK proves actual renderer startup and first frame write, **not** visible GTK surface painting, correct window placement, or ASC execution/completion. No longer sleep, automatic retry/window or focus grabbing is used to conceal lazy GTK surface startup.

Legacy broker recognition is coexistence-only. Once no legacy controllers remain, its endpoint and compatibility tests must be removed; normal observer behavior must continue using only `com.mitchellh.ghostty` and the origin/main executable family.

## Validation anchors

ASC:

```bash
cd packages/pi-autonomous-session-control
node --test tests/execution-observation.test.mjs tests/dispatch-subagent.test.mjs
npm run check
```

Ghostty observer owner:

```bash
cd packages/pi-little-helpers
node --test tests/asc-observer-session.test.mjs tests/asc-execution-observer.test.mjs tests/asc-execution-observer-unavailable.test.mjs tests/asc-execution-observer-launch.test.mjs
# Real Ghostty path: only inside a parent-provided nested/sandbox GUI, private session bus
# and an isolated Ghostty controller surface. This launches no models.
PI_ASC_OBSERVER_LIVE_ISOLATED=1 node --test tests/live/asc-observer-unavailable.reality.live.mjs
npm run check
```

Loop consumer/grouping:

```bash
cd packages/pi-society-orchestrator
node --test --test-concurrency=1 tests/loop-observation.test.mjs tests/runtime-shared-paths.test.mjs tests/execution-seam-guardrails.test.mjs
npm run check
```

The source-only ACK tests launch the actual renderer against private scratch, not Ghostty. The isolated real-Ghostty assertion exercises one real targeted activation for four concurrent dispatch groups plus a loop, verifies its renderer receipt/process, terminal-batch persistence and manual-close/no-relaunch behavior. A skipped assertion is not GUI proof. Installed Pi behavior additionally needs parent-authorized landing/install/reload and TUI exercise; AK6844 child execution does not authorize those steps.

## Non-authorizations

This contract does not authorize:

- retrying an effect-indeterminate attempt;
- treating visible progress as AK evidence or task completion;
- treating observer silence as permission to kill;
- steering the delegated child through terminal input;
- moving Ghostty launch ownership into orchestrator or ASC;
- claiming live installed behavior before install/reload/dogfood proof.

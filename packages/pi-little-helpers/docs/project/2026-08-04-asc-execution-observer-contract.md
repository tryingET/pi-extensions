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

For `loop_execute`, every phase uses the same logical loop run id, so one observer tab follows the whole run rather than opening one tab per phase.

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

`pi-little-helpers` writes one non-authoritative snapshot per logical group under:

```text
$PI_ASC_OBSERVER_STATE_DIR
or $XDG_RUNTIME_DIR/pi-asc-observers
or ~/.local/state/pi-asc-observers
```

Safety properties:

- state root is an owned, non-symlink directory with mode `0700`;
- snapshots are hashed filenames, not caller-controlled paths;
- snapshots are atomic private regular files with mode `0600`;
- file size is bounded to 64 KiB;
- event strings, phases, and arrays are bounded, with at most 128 retained groups per controller instance;
- terminal groups and inactive/dead-controller snapshots are pruned after a bounded retention window;
- each controller generation has an instance id, and an older renderer exits when a newer generation replaces the same state path;
- `session_shutdown` unsubscribes the event listener, marks snapshots inactive, and disposes in-memory group/queue state;
- no prompt/output fields are accepted;
- observation/state errors are swallowed at the execution boundary and cannot fail the ASC attempt.

Schema:

```text
pi.asc_execution_observer_state.v1
```

The snapshot is diagnostic UI state, not a session trace, checkpoint, KES artifact, evidence receipt, or authority projection.

## Automatic launch policy

Default `PI_ASC_OBSERVER=auto` behavior attempts launch only when:

1. the exact host mode is `ctx.mode === "tui"` and the session reports `hasUI=true`;
2. the host process is running inside Ghostty (`TERM_PROGRAM=ghostty`);
3. the standard `pi-little-helpers` sidequest extension is loaded;
4. the first valid `dispatch_progress` event for the active cwd arrives;
5. the controller Ghostty ancestor, surface id, and unique PID-matched D-Bus target prove an exact same-controller tab destination.

Overrides:

| Value | Behavior |
|---|---|
| unset / `auto` | Attempt exact-controller-tab launch only for interactive Ghostty Pi sessions. |
| `1`, `on`, `true`, `ghostty` | Request observation-policy evaluation for any TUI session. Exact controller-tab proof is still mandatory; this never enables an untargeted tab, new-window fallback, or RPC/JSON/print mode. |
| `0`, `off`, `false`, `headless`, `disabled` | Do not write observer state or launch Ghostty. |

`pi -p`, JSON, RPC, CI, SSH, and other non-TUI callers remain headless even when RPC reports `hasUI=true` or the process inherits a Ghostty environment variable.

The observer reuses the sidequest launch primitives but selects a stricter placement policy than operator-requested visible peers: only the unique PID-matched controller D-Bus target may open its tab. It never substitutes a wrapper owned by another Ghostty process, invokes an untargeted `+new-tab`, or retries in a new window. If exact placement is unavailable or activation fails, the observer records/reports one launch failure and ASC execution continues headlessly. Toolbox-only sidequest projection does not register a second listener.

## Observer lifecycle

- One logical group launches at most one observer in the loaded extension instance.
- A direct `dispatch_subagent` terminal event closes its one-dispatch group.
- A loop phase terminal event updates that phase but does not close the loop group.
- `loop_execute` emits one `group_terminal` only after a terminal result or terminal exception. A `confirmed_no_effects` result that leaves the checkpoint lineage retryable is explicitly nonterminal and keeps the same observer group open for lawful resume.
- Resumed progress defensively clears stale non-authoritative terminal UI state; execution/checkpoint legality still comes only from the orchestrator and ASC receipt.
- Successful terminal state remains visible briefly, then the observer exits.
- Failure state remains visible longer for inspection.
- Missing/inactive controller state is shown as disconnected and the renderer exits after a bounded hold; no effect conclusion is inferred.
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
| Exact controller/surface proof is unavailable, the targeted tab activation fails, or the launch promise rejects | Record/report observer failure once; do not use wrapper/new-window fallback and do not retry on every heartbeat; execution continues headlessly. |
| Observer process/tab closes | Do not cancel execution. |
| ASC dispatch fails or times out | Show terminal state/effect disposition when emitted; ASC receipt remains truth. |
| Loop phase completes | Update phase; keep the run group open. |
| Loop result remains exactly retryable after `confirmed_no_effects` | Do not emit `group_terminal`; preserve the shared run observer for lawful resume. |
| Loop terminates | Emit `group_terminal`; render final run state. |

Ghostty launch success proves only that the exact controller-process activation request was delivered successfully. It proves neither renderer startup nor ASC child execution completion.

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
node --test tests/asc-execution-observer.test.mjs tests/asc-execution-observer-launch.test.mjs tests/sidequest.test.mjs
npm run check
```

Loop consumer/grouping:

```bash
cd packages/pi-society-orchestrator
node --test --test-concurrency=1 tests/loop-observation.test.mjs tests/runtime-shared-paths.test.mjs tests/execution-seam-guardrails.test.mjs
npm run check
```

Active runtime proof additionally requires installing all changed live packages, `/reload`, and a real long-enough `dispatch_subagent` or `loop_execute` call that opens exactly one useful observer tab.

## Non-authorizations

This contract does not authorize:

- retrying an effect-indeterminate attempt;
- treating visible progress as AK evidence or task completion;
- treating observer silence as permission to kill;
- steering the delegated child through terminal input;
- moving Ghostty launch ownership into orchestrator or ASC;
- claiming live installed behavior before install/reload/dogfood proof.

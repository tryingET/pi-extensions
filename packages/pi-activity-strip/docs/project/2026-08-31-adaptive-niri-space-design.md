---
summary: "Pre-implementation design packet for race-safe Activity Strip visibility and Niri content reclamation."
read_when:
  - "Changing Activity Strip visibility, Niri struts, workspace reconciliation, or shutdown behavior."
  - "Reviewing whether adaptive hide-and-reclaim is safe to implement or accept."
status: "superseded-by-native-layer-shell"
---

# Adaptive Activity Strip and Niri space — design packet

## Status and evidence posture

This packet records the rejected Electron/config-strut hardening path. It is retained as historical analysis and is **not** the current implementation gate.

The accepted replacement uses a native GTK4 `wlr-layer-shell` surface. Wayland surface lifetime now owns reservation lifetime, so the config mutation, helper lease, watchdog, and write-ahead designs below are unnecessary. Current proof is recorded in [Verification](verification.md#native-layer-shell-replacement-on-2026-09-01).

The findings below remain useful evidence for why the Electron/config-helper path was removed; they must not be read as current runtime behavior.

Epistemic labels used below:

- **Observed** — directly present in code, tests, Git state, or a local command result.
- **Inferred** — consequence derived from observed control flow but not reproduced live.
- **Proposed** — desired design, not yet implemented.
- **Open** — requires a decision or experiment before implementation.

## 1. Product contract

For the single supported Niri output:

The product desire is workspace-local, but Niri `layout.struts.top` is a **global layout resource**. Any config-strut implementation therefore has an accepted global side effect or is invalid. The workspace observation may justify the resource; it does not scope the physical reservation.

1. When the uniquely focused workspace has at least one admitted Activity Strip card, the strip may be visible and the global top content reservation must be active.
2. When that workspace has no admitted cards, the strip must be concealed, input-disabled, hidden/unmapped, and the reservation must be released so tiled content can reclaim the top band.
3. Missing or ambiguous compositor/session truth must fail closed to a hidden strip. It must trigger release convergence; it must not revive a resident view from another workspace.
4. Returning cards must restore reservation, placement, and visibility without exposing a misplaced surface or transparent input mask.
5. A stale asynchronous operation must not be treated as current merely because it eventually succeeds.
6. Process exit, renderer loss, helper failure, timeout, logout, and reboot must converge toward **no invisible input surface and no orphaned reservation**.
7. The runtime must never claim “reclaimed” or “reserved” without an authoritative receipt plus observable postconditions.

### Non-goals

- Multi-output support.
- A claim that Electron and Niri config reload can switch in one compositor-atomic frame.
- Rewriting terminal/session identity logic from commits `2cd7e780d` and `c01af3769`.
- Resetting arbitrary user-authored tiled-window heights as an undocumented side effect.
- Treating package prose or mocks as live compositor evidence.

## 2. Current inventory and attribution boundary

### Observed package state

The adaptive prototype currently modifies ten tracked files and adds four untracked files under `packages/pi-activity-strip`:

- runtime: `main.mjs`, `workspace-view-runtime.mjs`, `niri-native-window-runtime.mjs`, `renderer-projection.mjs`
- new runtime: `niri-reserved-space-runtime.mjs`, `ordered-shutdown-runtime.mjs`
- tests: interaction, renderer projection, workspace view, reserved space, ordered shutdown
- prose: `README.md`, `CHANGELOG.md`, `docs/project/verification.md`

The files were written within one approximately one-hour interval on 2026-08-31 and form one coherent adaptive-space diff against `c01af3769`. This strongly suggests common provenance, but timestamps do not prove human/agent authorship. No unrelated dirty path outside this package is in the mutation scope.

### Observed host state

Outside this repository:

- `~/.local/share/chezmoi/dot_local/bin/executable_pi-activity-strip-niri-space.sh` is untracked in the chezmoi repository.
- The installed `~/.local/bin/pi-activity-strip-niri-space.sh` is byte-identical to that source.
- The chezmoi Niri config is mixed-dirty. Its adaptive marker/top-strut hunk is interleaved with unrelated operator changes and must never be reverted as a whole.

### Rollback boundary

If prototype rollback becomes necessary, it must be path/hunk bounded:

- package adaptive hunks may be compared against `c01af3769`;
- the host helper is a separate owner-surface artifact;
- only the exact adaptive marker hunk in Niri config may be considered;
- unrelated package, chezmoi, config, or lockfile changes must not be staged, reset, or cleaned.

## 3. Why the prototype is not acceptable

### 3.1 Latest-only is not effect cancellation

**Observed:** `createLatestOnlyRunner()` invalidates a generation through `isCurrent()`, but serially waits for the old `run()` to return. The helper, Niri command, BrowserWindow operation, or config reload may already have committed before the post-await freshness check.

**Consequence:** stale reserve/release/move/show effects can become externally visible. A successor may repair them, but that is eventual compensation, not cancellation or linearizability. If the successor fails or hangs, the stale effect can be terminal.

### 3.2 Release is attempted, not proven

**Observed:** ordinary `hideView()` ignores the boolean result of `releaseSpace()`. If `hideWindow()` throws, release is skipped. Shutdown proceeds to quit even when release resolves `false`; helper absence is currently treated as successful no-op.

**Consequence:** the strip can be hidden while an 84px dead band remains. The owner remains live, so owner-death recovery need not trigger.

### 3.3 Timeout is effect-indeterminate

**Observed:** helper rejection and timeout collapse to `false`. The caller cannot tell whether the helper did nothing, changed the file, reloaded Niri, reset some windows, or died between those steps.

**Consequence:** blindly retrying the opposite transition can compound a partially applied operation. “Failed” is not an adequate state; the design needs `unknown/indeterminate` plus reconciliation.

### 3.4 The helper rewrites a shared persistent config

**Observed:** the helper fingerprints the complete Niri config and then renames a generated complete-file candidate over it. An external edit can land after the final hash and before rename. Rollback can likewise overwrite a later edit.

**Consequence:** atomic rename prevents torn files but is not compare-and-swap protection. The prototype can lose unrelated Niri configuration.

### 3.5 Reservation survives longer than recovery authority

**Observed:** `top 84` is persisted in the Niri config, while lease/watchdog state normally lives under `XDG_RUNTIME_DIR`.

**Consequence:** reboot/logout can remove recovery state while leaving persistent `84`; Niri can start with an orphaned band.

### 3.6 Owner fencing is incomplete

**Observed:** reserve replaces one lease. Normal release carries no owner token and clears whatever lease is current. Only watchdog `release-if-owner` is guarded.

**Consequence:** an old or alternate owner can clear a newer owner’s reservation even though helper calls are serialized by `flock`.

### 3.7 Height reset can destroy user layout intent

**Observed:** the helper runs `reset-window-height` for every tiled window on the focused workspace.

**Consequence:** custom per-window heights may be erased. The Niri IPC evidence inspected so far does not establish that auto-height provenance can be recovered. Enlarging one ordinary full-height tile is not authorization to normalize every tiled layout.

### 3.8 Global strut, workspace-local intent

**Observed:** `layout.struts.top` is compositor layout configuration, not a reservation scoped to one workspace. The helper derives its value from the currently focused workspace and currently rejects multiple outputs.

**Consequence:** focus churn changes a global layout input. Background workspaces and windows can be resized or left with stale manual geometry even though the product intent is workspace-local.

### 3.9 Capability absence is ambiguous

**Observed:** on Niri, missing helper currently makes reserve/release return success. The strip may reveal without having protected content space.

**Consequence:** “optional helper compatibility” can mean an overlapping strip, not the adaptive contract. Capability absence must be an explicit operating mode, not implicit success.

## 4. Design options

### Option A — continue rewriting the full persistent config

Rejected. Locking cooperating helpers cannot prevent non-cooperating editor/config-manager lost updates. Persistent `84` also survives volatile recovery authority.

### Option B — optional ephemeral Niri include plus fenced transaction helper

Conditional incremental candidate; **not selected** until §8 experiments pass.

Niri 26.04 locally validates:

```kdl
include "/run/user/<uid>/pi-activity-strip/niri-space.kdl" optional=true
```

It also accepts a second top-level `layout` block supplied by an include. An include is not accepted inside `layout`.

The stable user config contains only the optional include. The runtime-owned fragment exists only while reservation is desired and contains the Activity Strip’s layout/strut override. The helper mutates only its owned fragment and operation journal, never the complete user config.

This host has `XDG_RUNTIME_DIR=/run/user/1000` and systemd user lingering enabled. Therefore graphical logout does **not** imply runtime-directory deletion. Persistent fallback to `~/.local/state` is prohibited. Safe lifecycle requires two host-owned units/hooks:

1. a bootstrap cleanup ordered before `niri.service`, which removes stale fragment/journal state before Niri reads config;
2. an independently supervised reconciler ordered after and `PartOf=niri.service`, which accepts fenced operations, expires leases, and releases before Niri stops.

The exact units belong to the host owner surface and require their own review. Reboot is safe only because the fragment is non-persistent; logout/relogin is safe only after the ordering above is proven with lingering enabled.

Config validation proves syntax only. Before Option B can be selected, live experiments must prove include merge/precedence, preservation of every non-strut layout setting, effective reload behavior, global/background-workspace effects, strip geometry, and non-destructive automatic tile reflow.

### Option C — a real layer-shell host surface with exclusive zone

Architecturally strongest long-term option. Niri documents that struts behave similarly to layer-shell panels. A layer-shell surface can bind reservation lifetime to surface lifetime rather than mutating compositor config.

Electron BrowserWindow does not currently provide the required layer-shell/exclusive-zone contract in this package. This option implies a native host/sidecar or a different window technology and is therefore a separate architectural task. It remains the preferred escape hatch if Option B cannot satisfy live atomicity and recovery requirements.

## 5. Proposed authority and state model

### 5.1 One desired-state authority

A single workspace controller owns the tuple:

```text
DesiredView =
  Hidden(reason, observationRevision)
  | Visible(workspaceId, cardRevision, observationRevision)
```

No other component directly decides reservation or reveal. Broker events, Niri focus events, fallback polling, renderer loss, display changes, and shutdown only request a new observation.

### 5.2 Separate effect state

The controller must track external state explicitly:

```text
GlobalReservation =
  Unavailable
  | Released(receipt)
  | Reserving(operation, causeWorkspaceId)
  | Reserved(ownerEpoch, ownerToken, effectiveTop, receipt)
  | Releasing(operation)
  | Unknown(lastOperation, evidence)

Surface =
  Absent
  | Hidden
  | MappedConcealed(workspaceId, geometryReceipt)
  | Revealed(workspaceId, cardRevision)
  | Unknown
```

Stable composite states:

1. `HIDDEN_RECLAIMED = Hidden + Released + no enabled input surface`
2. `VISIBLE_RESERVED = Visible(W) + global Reserved(top=84) + Revealed(W)`
3. `HIDDEN_DEGRADED = Hidden + Unknown/Unavailable + no enabled input surface`

`causeWorkspaceId` is audit/precondition context, not ownership of the global strut. Active workspace A → active workspace B should preserve a proven global reservation while moving the concealed surface, unless an experiment proves replacement is required. Empty/unsupported state releases the global reservation.

There is no stable `Visible + Released` state on Niri adaptive mode.

### 5.3 Generation semantics

A generation check controls only publication of internal state. It cannot erase an external effect.

After **every** effect completion:

1. record its receipt or indeterminate outcome;
2. re-observe current desired state;
3. if the effect is stale or mismatched, enqueue compensation;
4. do not report idle until compensation reaches a stable state or a surfaced degraded state with durable recovery intent.

A new request coalesces observations, but it does not abandon ownership of an already-issued effect.

## 6. Proposed transition protocol

### 6.1 Hidden/reclaimed to visible/reserved

```mermaid
sequenceDiagram
  participant O as Observer
  participant C as Controller
  participant W as Electron surface
  participant H as Fenced helper
  participant N as Niri

  O->>C: unique focus W + non-empty cards, revision R
  C->>W: create/map concealed; input disabled
  W->>N: move + align
  C->>N: re-observe focus, membership, geometry
  C->>H: reserve(op, owner, W, R)
  H->>H: persist intent before effect
  H->>N: install owned runtime fragment + reload
  H->>N: bounded, non-destructive reflow
  H-->>C: JSON receipt or indeterminate
  C->>N: re-observe focus, membership, geometry
  alt still current and receipt proves W reserved
    C->>W: publish cards
    C->>W: reveal + enable input
  else stale, failed, or ambiguous
    C->>W: conceal/hide
    C->>H: guarded release/compensate
  end
```

The surface is placed while concealed before reservation. This minimizes the interval where the band exists without the strip. Reservation must precede reveal so content is never knowingly overlapped by an interactive strip.

### 6.2 Visible/reserved to hidden/reclaimed

```mermaid
sequenceDiagram
  participant C as Controller
  participant W as Electron surface
  participant H as Fenced helper
  participant N as Niri

  C->>W: disable input + conceal; await renderer acknowledgement
  C->>W: hide/unmap (best effort)
  C->>H: release(op, exact owner token)
  H->>H: persist release intent before effect
  H->>N: remove owned runtime fragment + force reload
  H->>N: bounded, non-destructive reflow
  H-->>C: JSON receipt or indeterminate
  C->>N: verify no strip input surface and reclaimed geometry
  alt release proven
    C->>C: HIDDEN_RECLAIMED
  else release unknown
    C->>C: HIDDEN_DEGRADED; retry and surface warning
  end
```

Concealment and input disable precede release. A short dead band during removal is safer than a visible/input-active overlap. `hideWindow()` failure must not skip durable release intent.

### 6.3 Focus changes during reserve

A completed reserve caused by workspace A after desired state changes is a stale external effect, even when `isCurrent()` is false. The controller must keep the surface concealed, record the receipt, and re-observe before deciding compensation.

- A active → B active: retain the proven global reservation, remap/verify the concealed surface on B, then reveal B. Do not release/re-reserve merely to change audit context.
- A active → B empty/ambiguous/unsupported: issue guarded global release under the serialized effect worker.
- Multiple outputs appearing while reserved: never create or renew; guarded release of the existing reservation remains allowed and required.

No workspace can reveal from A’s card or geometry revision.

### 6.4 Session membership disappears during placement

Treat as `Hidden`. Do not publish an empty placeholder. Conceal/hide, then release or compensate any in-flight reservation. Compact-collapse and native geometry verification remain required before a later reveal.

### 6.5 Ambiguous Niri observations or zero outputs

Treat as `Hidden(reason=ambiguous)`. Never reveal. If a reservation may exist, persist release intent and attempt guarded release. If Niri cannot reload, remain `HIDDEN_DEGRADED`; do not claim reclaimed geometry.

### 6.6 Renderer/window loss

Immediately disable input where possible and mark the surface unknown. A new renderer may not reveal from cached state. It must pass the complete observe/place/reserve/revalidate/reveal sequence.

## 7. Helper protocol contract

### 7.1 Capability handshake

The runtime must call a versioned capability/status command before adaptive reveal. Example result:

```json
{
  "protocol": 1,
  "mode": "released",
  "ownerToken": null,
  "operationId": "...",
  "fragment": "absent",
  "reload": "acknowledged",
  "reflow": "verified"
}
```

On Niri adaptive mode, missing, incompatible, or unverifiable helper means `Unavailable`; the strip stays hidden and runtime status explains why. A separate explicitly configured legacy mode may retain a static reservation, but must not be described as adaptive.

### 7.2 Fencing and ownership

- Runtime generates a random owner token and supplies PID plus `/proc` start time.
- Helper validates all three.
- Every mutating operation has a unique operation ID.
- Reserve by another live owner is rejected unless an explicit takeover protocol proves the old owner dead.
- Every release carries the exact owner token; stale owner release cannot clear a newer owner.
- Helper responses echo protocol, owner token, operation ID, mode, workspace, and postcondition fields.

### 7.3 Owned ephemeral fragment and session lifecycle

- Stable Niri config contains one optional absolute include to the runtime fragment.
- Base configuration does not persist Activity Strip `top 84`.
- Persistent fallback outside `XDG_RUNTIME_DIR` is forbidden.
- Reserve atomically installs a validated runtime fragment; release atomically removes it.
- The helper never renames the complete user config.
- A pre-Niri bootstrap cleanup removes stale runtime state even when systemd user lingering preserved `/run/user/<uid>` across logout.
- The supervised reconciler stops before Niri, attempts release while Niri can still reload, and retains an auditable failure receipt if it cannot.

### 7.4 Epoch ordering and write-ahead recovery

Each accepted owner receives a durable monotonic `ownerEpoch`. Within that epoch, every operation receives a monotonic sequence. Ordering is lexicographic `(ownerEpoch, sequence)`; duplicate operation IDs are idempotent only when their complete request matches.

Release intent dominates every earlier reserve in the same or older epoch. Dead-owner, expired-lease, bootstrap, and takeover recovery always synthesize a newer **release**, never replay a recorded reserve. A new owner epoch is admitted only after older state is released or explicitly marked indeterminate with release recovery still supervised.

Before fragment mutation, the reconciler writes, renames, and syncs an operation record containing epoch, sequence, operation ID, desired mode, owner token hash, expected observation context, and phase. It clears the record only after the accepted postconditions complete.

| Recorded phase at recovery | Required action |
|---|---|
| intent only | apply latest desired mode if owner is live; otherwise release |
| fragment mutation started/unknown | inspect owned fragment, then force root validation and reload toward latest desired mode |
| reload started/unknown | force reload again; never infer from matching fragment |
| reload acknowledged | perform permitted reflow and independent observation |
| postcondition unknown | re-observe; compensate toward latest desired mode |
| release complete | clear journal only after sync and status receipt |

A timeout is `indeterminate`. Recovery uses the newest accepted epoch/sequence and cannot allow an older reserve to follow a newer release. Crash-injection tests must cover record write, rename, directory sync, fragment mutation, reload, reflow, receipt write, and journal clearing.

### 7.5 Supervision, lease, and shutdown

The recovery owner is a systemd user reconciler service, not a detached child. It is ordered after and `PartOf=niri.service`, stops before Niri, and is paired with the pre-Niri bootstrap cleanup in §7.3.

- Lease renewal interval: 1 second; expiry: 3 seconds. Expiry does **not** immediately release beneath a possibly interactive surface.
- On expiry, the reconciler first marks the owner fenced, rejects renewal from that epoch, sends `SIGTERM` to the exact PID/start-time owner, waits at most 2 seconds, then sends `SIGKILL` if still alive. It must verify process death and that Niri no longer lists a matching owner surface before synthesizing release.
- If process/surface absence cannot be proven, retain the reservation in degraded state and alert; do not create `Visible + Released`. A later verified absence, Niri restart, or pre-start bootstrap may complete release.
- Reconciler restart follows the same fence/terminate/verify/release sequence for an unrenewed owner. It may not release first and notify Electron later.
- Effect subprocess deadline: 2 seconds. Timeout becomes indeterminate and enters recovery.
- Controller convergence deadline: 5 seconds after inputs quiesce, after which it must be stable or explicitly degraded with supervised recovery ownership.
- Shutdown handoff deadline: 5 seconds. The Electron process may exit after release is proven or the reconciler acknowledges the exact epoch/operation release intent.
- A second signal does not bypass durable handoff; it records escalation and leaves the supervised reconciler as owner.
- Reconciler death makes adaptive capability unavailable. The strip remains concealed; service restart/bootstrap cleanup converges to release.
- Cleanup rejection is logged and reflected in runtime status; discarded promises are prohibited.

## 8. Pre-code Niri experiment and layout gate

Option B cannot be selected from config validation alone. Run a controlled, reversible experiment before runtime implementation. Do not use the operator’s mixed Niri config as disposable test input.

### 8.1 Experiment safety protocol

1. Prefer an isolated nested/headless Niri instance with representative outputs and a copied controlled config. If it cannot reproduce strut/output behavior, stop; do not silently substitute the operator’s live session.
2. A live session may be used only after the operator explicitly designates it sacrificial for this experiment and approves interruption/hotplug scope.
3. Capture and validate baseline config path/hash, included files, Niri version/socket, outputs, workspaces, window/layout JSON, effective screenshots, and restoration command.
4. Before mutation, arm an independently supervised deadman outside the experiment process. It owns a validated baseline copy and must remove the experiment fragment, reload the baseline, and record a receipt after experiment death/deadline.
5. Prove deadman rollback once **before** fault injection. If rollback, IPC, config validation, hash preservation, or geometry restoration fails, stop and reject Option B for this run.
6. Inject one fault at a time. Stop immediately on lost Niri IPC, unexpected config-byte change, input interception, unexplained window movement, failed deadline, or incomplete baseline restoration.
7. After every case, restore and re-prove the baseline before proceeding. No crash case inherits state from another.

Record before/after effective behavior for:

- gaps, borders, focus ring, width/height presets, default widths, animations, and every existing non-strut layout setting;
- focused and background workspace tile geometries;
- floating strip coordinates and size;
- one auto-height tile, one explicitly height-adjusted tile, vertical stacks, tabs, fullscreen, maximized-to-edges, overview, and focus churn;
- fragment install, removal, reload failure, unlink-before-reload crash, and second-output appearance.

### 8.2 Falsifiable decision rules

1. If duplicate included `layout` does not preserve all non-strut settings and deterministic precedence, reject Option B.
2. If strut install/removal does not automatically reflow tiles while preserving explicit user heights, reject Option B.
3. Niri 26.04 window JSON exposes no observed automatic-vs-user-set height provenance. Therefore **no cardinality-based reset is permitted**: one tile can still have intentional height.
4. Do not call `reset-window-height` in the accepted design. If automatic non-destructive reflow is unavailable, reject Option B and route to Option C.
5. If background workspaces suffer unwanted global geometry changes, the product owner must explicitly accept that side effect or reject Option B.
6. If effective reservation cannot be independently observed with at least one eligible tiled geometry witness, adaptive reveal fails closed for that topology.
7. Installing/removing the strut must not move the concealed floating strip; otherwise movement must converge deterministically and verify within 2 seconds before reveal. Unexplained or unbounded movement rejects Option B.
8. Unlink-before-reload and reload-timeout cases must converge to the deadman’s released baseline within 5 seconds. Matching fragment bytes alone are not success.
9. Reload failure must leave either the proven baseline or a supervised rollback already in progress; an unowned effective reservation rejects Option B.
10. Second-output appearance must permit conceal plus guarded global release within 5 seconds. Any stranded reservation rejects Option B.
11. Every injected case must restore the exact baseline config hash and equivalent effective settings/geometries. Any failed restoration rejects Option B and stops the experiment.

Experiment rollback removes only the owned fragment/include fixture, reloads the controlled baseline, and proves original geometry/settings restored. Passing §8 authorizes design selection only; it does not authorize runtime implementation until the result is recorded and reviewed.

## 9. Failure matrix

| Event | Required immediate state | Required convergence | May reveal? |
|---|---|---|---|
| empty focused workspace | conceal/input-off, hide | guarded release | no |
| active focused workspace | mapped concealed | reserve, revalidate, reveal | only after receipt |
| focus changes during reserve | remain concealed | compensate stale reserve, reconcile latest | no |
| cards disappear during reserve | remain concealed | release stale/partial reserve | no |
| release returns false | hidden degraded | retry from durable release intent | no |
| helper timeout | hidden unknown | status/recovery transaction | no |
| helper missing before first reserve | unavailable | diagnostic or explicit legacy mode | no in adaptive mode |
| helper disappears after reserve | hidden degraded | watchdog/reinstall/recovery | no |
| owner alive but wedged; lease expires | keep reservation; fence and terminate exact owner | verify process/surface absence, then release | no new reveal |
| `hideWindow()` throws | input-off/concealed | release still runs in `finally` | no |
| renderer crashes | native input disabled; surface unknown | recreate through full protocol | no |
| Niri returns zero outputs | hidden degraded | guarded release when Niri returns | no |
| process `SIGTERM` | stop new work, conceal | bounded release or watchdog handoff | no |
| process `SIGKILL` | watchdog owns recovery | guarded release | no |
| reboot | runtime fragment absent | bootstrap confirms released before Niri | no |
| logout/relogin with linger | supervisor releases; bootstrap scrubs before next Niri | prove no stale fragment despite persistent runtime dir | no |
| concurrent owner | no ownership change | reject or explicit dead-owner takeover | no |
| config editor writes | helper touches owned fragment only | no shared-file overwrite | unaffected |
| multiple outputs appear | conceal; never renew | guarded release of any existing global reservation | no |

## 10. Observability contract

Runtime status must expose, without claiming more than observed:

- desired view and observation revision;
- controller generation and in-flight operation ID;
- reservation state: unavailable/released/reserved/releasing/unknown;
- owner/workspace from the latest authoritative receipt;
- surface state and renderer-input state;
- last helper exit, timeout/indeterminate flag, and compensation count;
- last successful live postcondition timestamp;
- degraded reason and next retry.

Logs must correlate observation revision, operation ID, workspace ID, and owner token hash. Tokens themselves must not be exposed in general status output.

## 11. Required deterministic tests before implementation acceptance

### Controller model/property tests

Use a model-based or generated event-sequence test over:

- focus A/B/ambiguous;
- cards 0/1/N;
- reserve/release pending/success/failure/indeterminate;
- show/hide/conceal/reveal success/failure;
- renderer/window loss;
- dispose/shutdown.

Assert after every observable effect boundary, not merely the final sequence:

- reveal/input-on implies a schema-valid, matching-epoch global reserve receipt, current non-empty view, verified concealed placement, and post-reserve re-observation;
- hidden state never has renderer input enabled;
- stale effects create compensation, not idle success;
- no current generation publishes stale workspace/card state;
- every possible reservation has either a live renewable owner or newer supervised release intent;
- release dominance prevents an older reserve from replaying afterward;
- A-active → B-active does not flap the global reservation;
- unsupported/multiple-output state can release existing state but cannot reserve/renew it;
- after a fair fake scheduler quiesces, convergence occurs within the declared deadline or reaches a defined degraded state with recovery ownership.

The model and implementation trace monitor must be independent. Generated events include malformed/mismatched/duplicate receipts, wrong epoch/owner/operation, synchronous throw, rejection, timeout, malformed Niri JSON, zero/multiple outputs, stale renderer acknowledgement, helper/reconciler disappearance, lease expiry, retry timers, and reentrant requests.

### Required example races

1. reserve A blocks → focus B empty → reserve A succeeds → release compensation completes.
2. reserve A blocks → focus B active → reserve A succeeds → replace/compensate → B alone reveals.
3. release A blocks → A becomes active again → release finishes → reserve A re-runs before reveal.
4. cards disappear after placement verification but before reserve receipt.
5. cards disappear after reserve receipt but before reveal acknowledgement.
6. `hideWindow()` throws; release still executes exactly once.
7. release false/reject/timeout enters degraded state and retries.
8. helper disappears after a successful reserve.
9. overlapping passive probes coalesce without repeated reserve/reveal.
10. dispose during every awaited phase cannot reveal and leaves compensation owned.
11. signal during reserve/release reaches bounded shutdown or watchdog handoff.
12. old owner release cannot clear new owner reservation.

### Helper fixtures

Run in an isolated config/runtime directory with fake Niri commands:

- optional-fragment install/remove and root validation;
- write-ahead crash at every phase boundary;
- timeout after mutation but before response;
- reload failure and retry when fragment already matches;
- owner-token fencing and dead-owner takeover;
- watchdog acknowledgement and watchdog death;
- reboot simulation by deleting runtime state;
- logout/relogin with `Linger=yes`, where runtime state may survive;
- bootstrap-before-Niri and reconciler-stop-before-Niri ordering;
- no writes to unrelated config bytes;
- non-destructive layout topology admission.

Current tests passing `129/129` remain useful regression evidence, but do not satisfy this matrix.

## 12. Live verification gate

Live proof must use a disposable/controlled workspace arrangement and restore operator state afterward.

Required observations:

Definitions used by this gate:

- `surface hidden`: renderer conceal acknowledgement is current, native input-ignore is enabled, Electron reports not visible, and Niri either omits the surface or the live pointer/keyboard probe proves it cannot intercept input;
- `reservation applied`: exact protocol/epoch/operation receipt, owned-fragment hash, root validation, reload acknowledgement, no unresolved earlier journal, and an eligible tiled geometry witness showing the expected content area;
- `reservation released`: exact release receipt, fragment absent, release journal complete, reload acknowledgement, and an eligible tiled witness showing reclaimed geometry;
- geometry tolerance: exact logical pixel dimensions after Niri animation/event quiescence; output scale and transform are recorded;
- controller liveness: stable or explicitly degraded within 5 seconds after **inputs** quiesce; retries/effects cannot postpone the deadline.

Required observations:

1. Baseline: record output scale/transform, every effective non-strut layout behavior, foreground/background workspaces, strip window ID, tiled window IDs/geometries, and custom height state.
2. Active → empty: renderer conceal/input-off precedes unmap; runtime fragment disappears; tiled content reclaims height; no transparent input mask remains.
3. Empty → active: concealed strip placement is verified; fragment appears; content shrinks; strip reveals only afterward.
4. Rapid A ↔ B churn while helper calls are deliberately delayed: no stale reveal and eventual correct reservation.
5. Session add/remove storm on one workspace: no reserve/release oscillation for publisher-only changes.
6. Helper timeout/crash after each transaction phase: status becomes degraded and compensation converges.
7. `SIGTERM` and `SIGKILL`: clean release or watchdog release, respectively.
8. Reboot simulation and actual logout/relogin posture with `Linger=yes`: bootstrap prevents stale reservation before Niri starts.
9. User config edit during transitions is preserved byte-for-byte outside the stable include line; every effective non-strut setting remains unchanged.
10. Explicit custom heights, background workspaces, and multi-window layouts remain behaviorally unchanged except for the accepted global top-area delta.
11. Active workspace A → active B preserves one global reservation while remapping the concealed surface.
12. A second output appearing causes conceal plus guarded release, not a stranded reservation.

A screenshot alone is insufficient. Capture Niri JSON, helper receipts, runtime status, config/fragment state, geometry, and input behavior.

## 13. Acceptance gate

Implementation may be described as accepted only when all are true:

- this design’s open layout/reflow questions are resolved;
- an independent review finds no unresolved critical/high race or recovery issue;
- deterministic controller and helper failure matrices pass;
- package validation passes;
- host helper validation is reproducible on its owner surface;
- live active/empty/active, churn, shutdown, crash, and config-preservation proofs pass;
- `docs/project/verification.md` distinguishes old historical evidence, prototype evidence, and current accepted behavior;
- live package installation/reload is performed only after the verified implementation exists.

Until then, the adaptive prototype is **unverified and not accepted**.

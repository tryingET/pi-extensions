---
summary: "Verification notes for the local broker, overlay, and Pi telemetry path."
read_when:
  - "Checking whether the package is actually working end to end."
  - "Reviewing what has been verified versus what is still manual."
system4d:
  container: "Evidence record for current package behavior."
  compass: "Prefer explicit runnable verification over implied confidence."
  engine: "Run package checks -> run broker/overlay commands -> run real Pi smoke -> record evidence."
  fog: "GUI behavior on the live desktop can still differ from long-running day-to-day usage."
---

# Verification

## Verified on 2026-03-14

### 1. Package quality gate

Command:

```bash
npm run check
```

Observed result:
- structure validation passed
- Biome/lint passed
- package tests passed (`6/6`)
- `npm pack --dry-run` succeeded through the package gate

### 2. Publish-surface verification

Commands:

```bash
npm run release:check:quick
npm run release:check
```

Observed result:
- tarball whitelist check passed
- `npm publish --dry-run` passed
- isolated `pi install` of the packed tarball passed
- package-specific installed-runtime smoke passed via `scripts/release-smoke.sh`

### 3. Real Pi telemetry path into the live broker

Command:

```bash
PI_ACTIVITY_STRIP_KEEP_RUNNING=1 npm run smoke:headless-live
```

Observed result:
- the strip started successfully
- a real headless Pi run loaded this package
- the broker observed a live Pi session while that run was active
- the smoke finished with `live headless smoke OK`

### 4. Global Pi installation

Command:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip
```

Observed result:
- package installed successfully into Pi settings
- `pi list` shows the installed local package path

### 5. Broker/overlay status after install

Commands:

```bash
node ./bin/pi-activity-strip.mjs status
node ./bin/pi-activity-strip.mjs doctor
node ./bin/pi-activity-strip.mjs snapshot
node ./bin/pi-activity-strip.mjs fix-top
npm run capture:strip
npm run capture:top
```

Observed result:
- status reported that the broker was running and the overlay was ready
- in Pi UI sessions, `/activity-strip status` can now open the same runtime report in an editor-backed surface instead of collapsing status to a one-line notify
- `doctor` surfaced the current host assumptions (Electron present, display session available, multi-display warnings when applicable)
- snapshot command returned valid JSON
- `fix-top` successfully moved the strip to the top edge in Niri when it drifted downward
- local capture helpers produced direct strip/top-band screenshots for agent inspection

## Verified behavior summary

What is now proven:
- package passes local monorepo quality gates
- tarball packaging is sane
- the extension loads inside Pi without breaking headless runs
- the extension emits telemetry into the local broker
- the broker feeds the top-row strip runtime
- the package is installed into your Pi environment
- the operator/agent can capture the strip directly for visual inspection
- the strip can be forced back to the top edge with an explicit repair command

## AK #4317 live acceptance boundary

The package's deterministic tests cover ordering reconciliation, fail-closed Niri selection, broker delegation, bridge allowlisting, and generated-renderer interaction wiring. They do **not** prove Electron rendering, compositor behavior, or real keyboard/pointer use.

Before claiming live acceptance, run this on the target Niri desktop and record the observations separately:

1. Reload at least two installed Pi sessions whose Ghostty titles carry distinct `· <full-32-hex-session-id-token>` suffixes.
2. Confirm live text/timers update without card-node flicker and that active/settled regrouping happens only after the 15-second boundary.
3. Hover one card, move directly to another, then traverse cards with Tab and Left/Right; confirm expansion follows the engaged card and collapses only after pointer/focus leaves all cards.
4. Activate one exact card with click and Enter. Then create zero-match and duplicate-title conditions and confirm both do nothing.
5. Bind and invoke `focus-strip` from Niri; confirm it follows the focused workspace, receives keyboard focus, and remains top-aligned in compact and expanded states.
6. Start once normally (interactive) and once with `--click-through`; confirm the latter passes pointer input through and is intentionally not keyboard-interactive.

Known boundary: placement still uses Electron's primary-display bounds. Workspace following is implemented, but cross-output/multi-monitor alignment remains explicitly unsupported and must not be claimed.

## Remaining manual/operator verification

- Perform and retain the AK #4317 live acceptance observations above.
- Judge whether the expanded detail density is calm enough for long-running sessions.
- Decide whether a later owner-scoped task should add cross-output geometry instead of the current primary-display-only contract.

## AK #4317 verification on 2026-07-27

Deterministic implementation evidence:

- completed transcendent lineage `transcendent-1785180277721` across all eight phases after an earlier indeterminate timed-out lineage was inspected and reconciled rather than mechanically retried;
- targeted interaction/order/focus suite passed (`28/28`);
- `npm run check` passed (`37/37`) including formatting, file-budget, packaging, and quick release checks;
- an explicit `npm run release:check:quick` rerun passed; the npm registry correctly rejected republishing existing version `0.2.0`, and the package gate treats that known dry-run version guard as non-fatal;
- local `pi install "$PWD"` completed successfully;
- task scope remained limited to `packages/pi-activity-strip/**`, with `git diff --check` clean.

Live-runtime disposition is **blocked, not accepted**:

- restarting the installed strip reached the package launch timeout and `npm run smoke:headless-live` reproduced the same timeout;
- the old long-running strip process was stopped during the requested restart, so no new live window is currently claimed;
- a minimal Electron application and the unmodified `HEAD` activity-strip Electron entrypoint both stalled before Electron's `app.whenReady()` resolved under `/usr/bin/electron39` `v39.8.10` in this desktop session;
- therefore current live hover, pointer, keyboard, workspace-follow, and exact click-to-Ghostty behavior remain unverified. The control-plane unit tests pass, but they are not a substitute for a rendered compositor proof.

This isolates the immediate blocker below the package diff: Electron application readiness on the current host session. Do not describe AK #4317 as live-accepted until Electron can create a window again and the manual acceptance sequence above is completed.

Follow-up diagnosis found the concrete host condition: `niri msg -j outputs` returned `{}` and every DRM DisplayPort connector reported `disconnected`. Electron 39's Wayland path did not reach `app.whenReady()` without a compositor output, while an X11 probe did; the X11 probe is not an accepted fallback because its Xwayland window identity breaks the package's exact Niri alignment/focus contract. AK #4320 therefore makes `doctor` and `open` fail fast with an actionable blocker when Niri reports zero connected outputs. Turn on or reconnect the monitor, confirm Niri reports an output, then restart and execute the live acceptance sequence.

## AK #4323 live defect follow-up

The reconnected-display run supplied real evidence that deterministic tests had missed:

- exact click-to-Ghostty worked for a newly loaded DSPx peer, while older tabs still emitted legacy `steve-…` broker identities;
- moving to another desktop window could leave a focused card expanded at 252px because DOM focus remained on the card after the Electron window blurred;
- the transparent overlay retained both Electron/compositor and CSS panel shadows.

The bounded repair collapses on renderer and BrowserWindow blur, ignores stale DOM focus when the document is not focused, collapses on pointer leave/visibility loss, disables both window and panel shadows, and resolves legacy telemetry only through the existing process-bound `pi-session-presence` sidecar after validating its source, PID, cwd, and full Pi session UUID. Missing, stale, mismatched, or ambiguous identity still does nothing and requests `/reload`.

A subsequent live run exposed a second compositor boundary: the renderer could close the card while the non-resizable Wayland surface remained at 252px, leaving a transparent input mask over the desktop. The follow-up keeps the native surface resize-capable, explicitly moves it to Niri's floating layout, and reapplies its target size on every expansion/collapse request rather than treating matching logical state as proof of matching compositor geometry. Live acceptance requires observing the Niri `window_size` return from `1904×252` to `1904×84` after pointer leave.

A later focus failure exposed an identity collision rather than a focus-command failure: `rocs-cli` and `ontology-kernel` both had the legacy UUIDv7 prefix `019f4f3f`. Current session-presence titles therefore use the full 32 hexadecimal UUID characters with hyphens removed. Activity Strip prefers that identity and accepts an 8-hex migration fallback only when neither another legacy title nor a migrated full title shares its prefix. Install/restart Activity Strip first, then reload affected Pi tabs before claiming collision repair live.

## AK #5217 duplicate-session flicker repair on 2026-08-31

The repair separates logical-session, publisher, terminal-surface, renderer-card, and Niri-window identities. Publisher records remain independent in the broker, but the renderer receives one card per admitted Ghostty surface. Session-presence schema v2 inserts `gs:<family>:<surface>` before the final full session token; old suffix consumers remain compatible, while headless descendants cannot claim inherited Ghostty surface variables.

Deterministic evidence:

- `npm run check` passed in `pi-activity-strip` with `119/119` tests, file budgets, type checking, formatting, and quick release packaging.
- `npm run check` passed in `pi-little-helpers` with `326/326` tests and quick release packaging.
- `npm run reality:check` passed the live schema-v2 title binding and two controller-family assertions; one unrelated SSH/custom-Ghostty assertion skipped because its optional custom binary was absent.
- Regression coverage includes reflexive duplicate membership, publisher aggregation, two surfaces sharing one session, exact surface misses, mixed bound/unbound migration, stale same-surface publisher exclusion, acknowledged upsert/remove ordering, bounded anti-resurrection tombstones, malformed broker input, coherent terminal fields, latest-runner finalization, and passive reconciliation.

Live Niri/Electron evidence after installing both local package paths and restarting the broker:

- Thirty acknowledged updates from a second publisher on the same terminal produced `30/30` visible samples, one renderer card, and two raw publisher records.
- The renderer visibility-transition counter remained exactly `5 → 5` during that duplicate update storm: no conceal/reveal transition occurred.
- The strip remained floating and aligned at `[8,0]` with `window_size 1904×84`.
- A deliberately stale different logical session on the same terminal key remained present in raw broker data but could not replace the admitted renderer publisher; exact card focus still selected the current window.
- Two interactive Ghostty surfaces resumed the same logical Pi session and produced two distinct renderer card IDs. Broker activation focused their exact Niri windows independently (`54` and `62` in the final run).
- Closing the temporary duplicate surface removed only its publisher/card after expiry; the original card remained visible and exact focus continued to succeed.
- A post-remove late upsert from the closed publisher was rejected by the acknowledged broker protocol and bounded tombstone.

This is live acceptance for the duplicate-session flicker and exact multi-surface identity boundary. It is not a claim of multi-monitor support or exact activation of an inactive tab hidden inside one top-level Ghostty window; those remain outside the current contract.

## AK #5229 persistent empty-workspace shell on 2026-08-31

The operator observed that the ribbon disappeared after focusing a workspace without a tracked Pi card. The process was healthy; the prior policy deliberately parked the strip on the last workspace with sessions. That contradicted the product's persistent-ribbon intent.

The focused-workspace projection now treats an empty session set as a valid view. It moves, aligns, verifies, publishes the empty placeholder, and reveals the strip shell instead of parking it off-screen. An expanded strip collapses before showing the compact placeholder; ambiguous or failed Niri observations still conceal fail-closed.

Evidence:

- `npm run check` passed with `120/120` tests and quick release packaging.
- Deterministic coverage proves visible empty projections, hidden-window remap, focused empty-workspace following, membership loss during placement, compositor barriers, and continued fail-closed behavior on ambiguous observations.
- Live Niri proof focused empty workspace index `7`; the strip moved to workspace id `37`. When focus moved to empty workspace index `1`, the strip followed to workspace id `1`, remained aligned at `[8,0]` with `window_size 1904×84`, and reported `windowVisible=true` with `rendererCardCount=0`.

This closes the disappearance report: the strip shell now remains present while its card row truthfully shows the empty-workspace placeholder.

## AK #5233 adaptive visibility and reclaimed Niri space on 2026-08-31

The operator refined the desired behavior after #5229: empty workspaces should hide the ribbon **and** reclaim its reserved top band, rather than retaining a placeholder. This section supersedes #5229's persistent-empty-shell product policy while retaining its investigation history.

The activity strip now coordinates with an optional host-owned helper at `~/.local/bin/pi-activity-strip-niri-space.sh`. The helper exclusively edits one balanced, marked `layout.struts.top` value in Niri's live config, validates the candidate, fingerprints against concurrent edits, atomically replaces and reloads with rollback for unsafe reserve failures, and resets tiled heights by exact window id. Release is fail-safe: persistent `top 0` is retained even if Niri is unavailable. The managed source default is `top 0`, so absence of the strip does not reserve dead space.

Runtime sequencing:

- non-empty view: reserve 84px and reset focused-workspace tiled heights before showing/revealing the strip;
- empty, ambiguous, failed, or shutdown view: collapse/conceal/hide first, release the strut to 0, and reset tiled heights;
- reserve calls authoritatively revalidate one-output, workspace, owner-lease, and watchdog invariants; expected-workspace binding prevents stale generations from claiming success;
- a PID plus `/proc` start-time lease and detached singleton watchdog release the strut after abrupt owner death, while guarded release prevents an old watchdog from clearing a newer owner.

Evidence:

- `npm run check` passed with `129/129` tests and quick release packaging.
- `shellcheck` and `bash -n` passed for the host helper; both source and live Niri configs passed `niri validate`.
- Deterministic coverage proves reserve/release ordering, authoritative reserve revalidation, stale-generation retry, absent-helper compatibility, workspace disposal, and ordered Electron quit that waits for release and broker stop even when window hiding fails.
- Isolated host-helper fixtures proved balanced-marker rejection, checked window-query failures, reserve rollback, fail-safe release with Niri unavailable plus later pending-reload repair, watchdog-start failure compensation, lease-token acknowledgement, guarded old-owner/new-owner handoff, and watchdog cleanup. The helper also compares a fresh config fingerprint immediately before replacement to fail/retry on detected concurrent edits.
- Live empty-workspace proof: focusing workspace index `1` changed the managed strut `84 → 0`, hid/unmapped the strip (`windowVisible=false`, `rendererCardCount=0`), and enlarged the focused tiled window `1084 → 1168` pixels.
- Live active-workspace proof: returning to workspace index `2` changed the strut `0 → 84`, reset tiled windows to `1084` pixels, mapped the strip to workspace id `2`, and revealed its non-empty card row.
- Clean-stop proof released the strut to `0`, removed the lease, and restored tiled height `1168`; restart reserved `84`, restored tiled height `1084`, and revealed the strip.
- Live `SIGKILL` proof: the watchdog detected the exact PID/start-time owner loss, released `84 → 0`, and enlarged tiled windows `1084 → 1168` within two polling iterations; restart restored the active reservation. A separate fixture proved an old-owner watchdog cannot clear a newly replaced lease.

This is the accepted adaptive contract: ribbon visibility and Niri content reservation move as one coordinated state, leaving neither hidden input masks nor unused top borders.

## Native layer-shell replacement on 2026-09-01

This section supersedes #5233's Electron/config-helper implementation while retaining its historical evidence. The product contract is unchanged: show workspace-local cards, hide on empty workspaces, reclaim the band, and restore without stale input surfaces.

Current architecture:

- Node remains authoritative for broker state, terminal/card identity, Niri workspace projection, ordering inputs, and exact Ghostty activation.
- A source-bound Rust/Relm4/GTK4 child renders cards as a `wlr-layer-shell` top surface.
- The compact and expanded surface heights are 84px and 252px; the exclusive zone remains fixed at 84px.
- Hiding unmaps the layer surface. Panel or controller death destroys the Wayland surface, so Niri releases the exclusive zone without editing config or resetting window heights.
- Electron runtime files and the adaptive strut helper integration were removed from the package.

Deterministic evidence:

- `npm run check` passes with `83/83` Node tests, lint, type checking, file budgets, and quick packaging.
- `npm run native:check` passes with `3/3` Rust tests under Rust 1.98.0.
- Full `npm run release:check` passes tarball packing, credential-isolated Pi installation, installed native-artifact verification, headless doctor failure, and extension registration smoke.
- The staged receipt binds the binary, complete Rust/CSS source, Cargo lock, compiler, glibc symbol floor, and required shared libraries.
- Native protocol tests cover nullable Pi timestamps, `processId`, monitoring classification, and real-event stall semantics.
- Node tests cover workspace projection revisions, broker keyboard entry, compatibility/platform gating, and source-bound artifact verification.
- Twelve concurrent singleton contenders admit exactly one OS `flock` owner; no stale-file unlink recovery remains.

Nested-Niri evidence:

- A real Node broker/controller projected an exact Ghostty session into one native layer surface.
- Active → empty → active produced layer counts `1 → 0 → 1` and tiled heights `946 → 1030 → 946` in the controlled compositor.
- Keyboard-only entry acquired exclusive keyboard interactivity; Enter focused the exact Ghostty window from another focused window and released keyboard ownership to `None`.
- Killing the panel removed its layer and restored tiled geometry; the controller restarted a fresh panel with the latest view.

Live Niri dogfood evidence:

- Installed runtime reports `backend=native-layer-shell`, one flock-guarded controller child panel, no warnings/errors, one `Top` layer on `DP-1`, no normal Activity Strip window, no helper executable, and no adaptive-strut config marker.
- Populated → temporary non-Pi empty workspace → populated produced layer visibility `1 → 0 → 1`; the empty-workspace witness used 1166px while populated workspace tiles remained 1084px.
- Expanded keyboard detail retained the same 1084px tiled height, proving that expansion does not enlarge the exclusive zone.
- Multi-card workspace dogfood rendered eight cards; Shift+Right advanced the native move counter and Escape collapsed with keyboard mode `None`.
- Controller `SIGKILL` removed the child panel and layer, then a clean open restored the current view. Direct panel `SIGKILL` triggered bounded controller restart and restored one layer.
- Click-through dogfood reported `clickThrough=true`, rejected keyboard entry, and kept layer keyboard mode `None`; the native surface installs an empty input region.
- AT-SPI exposed the panel application, frame, labels, and card button. A registered `object:announcement` listener received `Focused Ghostty window.` from a real activation.
- Six simultaneous live `open` commands converged on exactly one flock process, one controller, one panel, and one layer surface.
- Empty-workspace startup leaves the panel process ready but maps no layer surface until a card becomes visible.

Known boundary: one surface/output is supported. Multi-output replication remains explicitly unverified and unclaimed.

## Hidden Ghostty tab placement on 2026-09-06

The operator reported that the ribbon should appear on every workstation that has a Ghostty tab, and did not. The cause was placement, not visibility: a card existed only when a Pi session's own title was the visible title of a Niri window. A tab sitting behind another tab of the same window has no window of its own, so it was never projected onto any workspace.

Live baseline before the change: 40 broker sessions were bound to Ghostty terminal surfaces, and only 2 of them matched a window title. The remaining 38 were invisible to the strip.

### What the compositor and Ghostty actually expose

- **Observed:** `niri msg -j windows` reports one title per window, naming the active tab only. There is no per-tab entry.
- **Observed:** Ghostty's application action group exports `present-surface` taking one `t` (uint64) surface id, alongside `new-tab`, `new-window`, `quit`, and others. Its per-window object paths export only window-scoped actions (`new-tab`, `close-tab`, splits, prompts); no action selects a tab by index or id.
- **Observed:** every running Ghostty process owns a unique session-bus name and exports `org.gtk.Actions` there, including the standalone non-daemon processes, so activation never needs the shared well-known name.
- **Observed:** AT-SPI exposes each Ghostty window as a frame whose `page tab` descendants carry the full tab titles, including tabs that are not visible. This is the only enumeration of hidden tabs available on this host.

### The surface-id drift that made surface keys insufficient

The first implementation keyed window memory by Ghostty surface id and placed nothing new. Direct measurement of session `01a07495-8229-7ff8-9c3c-0507a24a87b3`, pid `1235241`:

- `/proc/1235241/environ` and its `pi-session-presence` sidecar both report surface `13657791177033636270`.
- The live AT-SPI tab label for that same session reads `π - workstation · gs:main:15422621806526138244 · 01a0749582297ff89c3c0507a24a87b3`.

The 32-hex session token agrees; the surface id does not. Across the live desktop, **0 of 40** broker surface ids appeared in any of the 35 tab labels, while the session tokens matched. Window memory therefore stores both keys per observed title and prefers the exact surface, falling back to the session token.

### Evidence

- `npm run check` passed with 104 tests, lint, typecheck, structure, packaging, and the file-budget gate.
- `npm run native:build` restaged the receipted panel artifact after the protocol and card changes; 9 Rust tests passed under the pinned Rust 1.98.0.
- Deterministic coverage proves: title-binding parsing, dual-key learning, pid- and instance-scoped invalidation, atomic persistence, host-containment placement, remembered-window placement, drifted-token placement, fail-closed rejection of foreign or ambiguous windows, present-surface targeting and each of its failure modes, title-confirmed activation, unconfirmed-activation failure, bounded inventory cadence with per-failure backoff, and the offline AT-SPI helper contract through a fake `gi` fixture.
- Live proof after restarting the controller with erased memory: `unplaced hidden tabs` fell from **38 to 1**, `remembered tab windows` reached 74, and the inventory reported 10 Ghostty windows carrying 35 tabs.
- Live projection placed **33 cards** on workspace 3 inside window `501` and **6 cards** on workspace 2 (2 by visible title, 4 by remembered window), where previously only the 2 title-matched cards existed anywhere.
- `doctor` reports `Hidden-tab inventory: available (AT-SPI via python3 gi.repository.Atspi)`.

### Boundaries

- A tab whose window has never been observed and whose host runs without AT-SPI stays unplaced; the count is reported rather than guessed.
- Two terminals resuming one logical session are distinguished only while their surface ids are visible. When placement falls back to the shared session token, both are placed in the one window that claims that token.
- Activation of a hidden tab is confirmed by the window title becoming that tab's title. A present-surface call that Ghostty accepts but does not act on is reported as a failure, not a success.
- Multi-output replication remains unimplemented and unclaimed.

## Stranded window heights and non-Pi agent tabs on 2026-09-06

The operator reported that windows on a workspace without a ribbon were the wrong height, that nothing corrected them when a window moved, and that moving a Claude Code window onto that workspace produced neither a card nor a resize.

### Measured cause

The output is 1200px tall. A tile is 1168px with no ribbon and 1084px while the ribbon holds its 84px exclusive zone. With the ribbon unmapped, seven of the nine windows on workspace 1 still measured 1084px, exactly one zone short; the only two correct windows were the two most recently focused. Showing and hiding the ribbon changes the output working area, and a window whose height is not automatic keeps the absolute value it was given under the previous working area.

No correction existed anywhere in the package. The earlier config-strut helper reset every tiled window's height and was removed as destructive, and nothing replaced it.

The moved window produced no card because it runs Claude Code. Only Pi's own extension published to the broker, and no other publisher exists on this host, so a workspace holding Ghostty tabs but no Pi session had zero cards, no ribbon, and therefore no working-area change.

### What Ghostty and the desktop expose for non-Pi tabs

- **Observed:** accessibility exposes Ghostty frames as `GhosttyWindow` and tabs as `GhosttyTab` with no surface identity in any attribute or accessible id.
- **Observed:** Claude Code holds its per-session scratchpad directory open, whose path carries the encoded working directory and the session id, and appends `{"type":"ai-title","aiTitle":...}` records naming the text it puts in the terminal title.
- **Observed:** three Claude Code processes were bound to Ghostty surfaces; matching each recorded title against window titles placed all three in exactly one window each.

### Evidence

- `npm run check` passed with 115 tests, lint, typecheck, structure, packaging, and the file-budget gate.
- Deterministic coverage proves stale-height evidence rules, exclusion of floating and newly appeared windows, bounded and non-repeating repair passes, disabled and rejected-action paths, agent recognition and its refusal of Pi and plain terminal programs, whole-millisecond record shaping, the Claude scratchpad and title adapter, procfs discovery admission, and agent placement with its ambiguity refusals.
- Live repair proof: with the ribbon unmapped, workspace 1 measured seven windows at 1084px and two at 1168px. One show-and-hide cycle reset 8 windows to automatic height, after which all ten windows measured 1168px. Because they are automatic again, they now follow every future working-area change.
- Live discovery proof: three Claude Code tabs were discovered in 23ms and each placed by its own recorded title into exactly one window, including the window the operator had just moved to workspace 1.
- Live acceptance: with that window on workspace 1, the ribbon reported one card, mapped its `Top` layer on `DP-1`, and every window on workspace 1 settled at the matching 1084px.

### Boundaries

- Repair resets a window only when it still sits at a height other windows just vacated, so a deliberately chosen height is untouched. A window whose height nothing corroborates is left alone, and each window is reset at most once per height.
- Non-Pi agents publish no telemetry, so their cards carry the agent, directory, elapsed time and pid, and no tool or phase detail.
- Only Claude Code exposes a per-tab title identity. An agent of another kind hidden inside a multi-window Ghostty process is counted as unplaced rather than guessed.
- A workspace whose Ghostty tabs run neither Pi nor a recognized agent still shows no ribbon.

## Claude Code telemetry on 2026-09-07

Agent cards carried only the process facts. The operator asked for real telemetry and noted that Claude Code has both OpenTelemetry and transcript files.

### Which source can drive a live card

- **OpenTelemetry: rejected.** It exports aggregate usage and cost — session counts, token usage, cost, and prompt and tool-result events — and needs an exporter or collector to receive them. Nothing in it names the tool a session is running right now or reports that a session is waiting on the operator, so it cannot drive a per-tab indicator.
- **Transcript: adopted as the default source.** Each session appends newline-delimited records that carry everything a card needs. The format is internal to Claude Code and documented as subject to change between releases.
- **Hooks: adopted for what the transcript cannot express.** They are documented and stable, deliver `session_id` and `tool_name` on stdin, and their `Notification` event distinguishes a permission prompt from an idle prompt. Measured cost of the ribbon's hook entrypoint is 43ms per invocation, so hooking `PreToolUse` would tax every tool call in every session. Only `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop` and `SessionEnd` are subscribed, none of which fire per tool call.

### State derivation

State comes from the newest transcript record that carries a timestamp, because the latched records Claude Code rewrites after every turn have none and would otherwise mask real activity. An assistant record holding a `tool_use` block means that tool is running; a `system` record of subtype `turn_duration` means the turn completed; a user record means the model resumed. A stored hook record overrides the transcript only when it is newer, so a permission prompt wins while the transcript is quiet and real work wins again as soon as it resumes.

### Evidence

- `npm run check` passed with 121 tests, lint, typecheck, structure, packaging and the file-budget gate.
- `npm run native:build` restaged the receipted panel artifact after adding the agent row; Rust tests passed under the pinned Rust 1.98.0.
- Deterministic coverage proves transcript state derivation for running, completed, resumed and ended turns, tolerance of truncated tails and attachments, hook payload mapping for every subscribed event, refusal of payloads without an exact session id, path safety for event records, newer-wins merging with expiry, and non-duplicating settings merges that preserve unrelated configuration.
- The hook entrypoint was exercised end to end: a tool event produced a `tool` record with its target, a permission notification produced `waiting for approval`, `SessionEnd` removed the record, and malformed input exited 0 without writing.
- Live proof: three Claude Code tabs reported real state. The active session showed `tool` running `Bash` with the command description; the two quiet sessions showed `idle` with their latest reply and turn counts of 1587 and 596.

### Boundaries

- The transcript format belongs to Claude Code and can change without notice. A transcript that no longer parses yields a process-only card; it never invents activity.
- The waiting-for-operator state requires the hooks, which must be added to the user's Claude settings; without them a blocked session reads as idle.
- Only Claude Code has an adapter. Other recognized agents still show agent, directory, elapsed time and pid.

## Codex telemetry and hook-record cleanup on 2026-09-07

### Binding a Codex process to its session

- **Observed:** Codex stores sessions as rollout files under `~/.codex/sessions/YYYY/MM/DD/`, and indexes them in a versioned SQLite database in its home. The `threads` table holds the session id, rollout path, working directory, title and creation time; 31 threads were read from the live index.
- **Observed:** a Codex process at rest holds its lock file, its TUI log and its state database open, but no rollout. Starting the interactive client and quitting created no rollout at all, so the rollout descriptor only exists once a task runs.
- **Consequence:** an open rollout descriptor is exact proof and is preferred. Before any task has run, a thread qualifies only when it was created after the process started and in the same working directory. Two candidates bind nothing.

### Deriving state

Every rollout record carries a timestamp and a payload type. A `function_call`, `local_shell_call`, `custom_tool_call` or `web_search_call` as the newest record means that tool is running, and its arguments name the target. A `task_complete` record means the turn finished. Anything else in flight reads as thinking. Turn counts come from completed turns, and `turn_context` supplies the approval policy and sandbox policy.

### Evidence

- `npm run check` passed with 127 tests, lint, typecheck, structure, packaging and the file-budget gate.
- Deterministic coverage proves tool-call state and target extraction, turn boundaries and previews, the alternate tool shapes, tolerance of unparseable arguments and truncated tails, newest-database selection, unreadable-index degradation, every binding rule including both ambiguity cases and the clock-slack tolerance, rollout descriptor extraction, and orphan-record pruning with its grace period.
- Live proof against real rollouts: a completed session reported `idle` with its turn count, working directory, approval policy `never`, sandbox `read-only`, and prompt and reply previews. A rollout truncated mid tool call reported `tool` running `exec_command` with the exact command as its target.
- The live thread index bound correctly in all three modes: by open rollout descriptor, by directory and start time, and refusing to bind a thread older than the process.

### Hook-record cleanup

A Claude Code session that dies without firing its end hook used to leave its published record behind; one such orphan was observed. Records are now retired when no live tab claims them and they have stopped being recent, so a session that publishes before the scan first sees it is never swept away mid-startup. An orphan could never produce a card, because a card requires a live process; only the files accumulated.

### Boundaries

- The rollout format and the thread-index schema belong to Codex and can change without notice. A rollout that no longer parses, or an index that cannot be read, yields a process-only card.
- Reading the index requires the runtime's built-in SQLite module. A host without it reports no Codex telemetry rather than failing.
- A Codex session that has run no task yet is bound by directory and start time, which is weaker than a descriptor. Two Codex sessions started in the same directory within the slack window bind nothing.

## Review findings addressed on 2026-09-07

A review of the branch before merge found seven defects, all confirmed against the code and fixed.

- **Activation of an agent tab always reported failure.** Confirming a presented tab required a title-based placement, which only Pi, Claude Code and Codex sessions can produce. Every other agent presented and focused correctly, then reported failure. Confirmation now runs only for sessions that write a readable identity into their terminal title; the rest report what was done without claiming proof, and the panel message distinguishes the two.
- **Visible agent tabs rendered as hidden.** Visibility was inferred from the placement kind, so a tab that was the frontmost one in its window still carried the hidden marker and could never be marked current. Visibility is now evidence-based: proven visible by a matching title, proven hidden when the session writes a title that did not match or the window names another surface, and otherwise unknown. An unknown tab is never marked hidden. When several candidates could be the focused window's tab, none is marked current.
- **The snapshot membership guard was defeated by any agent tab.** The raw session list had grown to include discovered agent tabs while still being compared against a broker-only snapshot, so every broker event forced a reconcile and two compositor queries. The comparison now uses broker records alone.
- **The command-line fallback was unreachable.** Classification fell back to the command line only when the process name was empty, which never happens for a live process, so an agent launched through a runtime was never discovered. The command line is now read whenever the process name is a runtime, which is the only case where it matters.
- **The repair guard never forgot a window.** A window reset at a height was suppressed at that height forever. The guard is now cleared once the window is observed at another height, since being stranded again is a new event.
- **A transient discovery failure left a permanent warning** and erased any panel warning beside it. Discovery errors now occupy their own field and clear on the next successful scan.
- **A permanently unplaced surface pinned the tab inventory to its catch-up cadence,** spawning a probe every three seconds indefinitely. The short cadence now holds only while probes are still learning.

Coverage was added for unverifiable activation, the three visibility verdicts, repair after a window moves again, and the cadence returning to calm when a probe learns nothing. `npm run check` passes with 130 tests.

## Ribbon appearance and Ghostty theme following on 2026-09-07

The operator reported the ribbon looked like two ugly boxes and asked it to follow the Ghostty theme, day and night.

### What was wrong

The ribbon drew two heavy rounded containers floating over the wallpaper: an identity tile and a card panel, each with its own border and background. Its palette was a hardcoded navy that shared nothing with the terminal. The operator's Ghostty runs `theme = light:Everforest Light Med,dark:Everforest Dark Hard`, so nothing on screen matched.

### Where the colours come from

- **Observed:** Ghostty writes `key = value` lines in both its config and its theme files, and a theme setting may carry one name or one per colour scheme.
- **Observed:** the desktop portal reports `color-scheme` as 1 for dark and 2 for light; this desktop reported dark.
- **Observed:** the operator's themes resolve from `~/.config/ghostty/themes`, and the installed release under `current` ships none, so theme lookup searches user themes first and then every installed build.

The ribbon reads those same files, maps terminal colours onto its roles, and hands the panel eight named colours. The stylesheet derives every other shade with GTK's own `mix()` and `alpha()`, which invert correctly between schemes: a raised surface is lighter on a dark theme and darker on a light one. State colours reuse the terminal's meanings, and the cursor colour marks a session waiting for the operator.

### The redesign

One continuous bar with a hairline bottom edge replaces the two containers, reading as desktop chrome rather than floating panels. The identity block lost its box and its marketing line, keeping a separator rule. Cards became flat chips whose left edge carries their state, with a quiet pill instead of a bright one. The card the compositor is showing is marked by weight rather than another border.

### Evidence

- `npm run check` passed with 138 tests, lint, typecheck, structure, packaging and the file-budget gate.
- Deterministic coverage proves colour normalization, config parsing with repeated keys, both theme-setting forms, role mapping for light and dark, the fallback when no theme can be read, theme discovery across candidate directories, config colours overriding the theme file, portal parsing including an absent portal, the pinned-scheme override, and that colours are published only on change but always after a panel restart.
- Live proof in dark: the panel reported `Everforest Dark Hard (dark)` and rendered on the terminal's own background with its foreground text and yellow tool accent.
- Live proof in light: pinning the scheme resolved `Everforest Light Med` and the bar rendered on the cream background with dark text, every derived shade inverting correctly.
- A first light capture showed secondary text too faint against the lighter background, so the muted tones were raised and re-verified.

### Boundaries

- The panel is only restyled, not relaid out, when a theme changes: one stylesheet reload, no restart.
- A theme file that cannot be found or read yields a neutral fallback palette rather than an unstyled panel.
- The colour scheme is polled on a calm clock, so a day/night switch is picked up within about twenty seconds rather than instantly.
- GTK's stylesheet is excluded from the web CSS linter, which cannot parse GTK colour references.

## Ribbon geometry aligned to the window rhythm on 2026-09-07

The operator reported the ribbon still was not right, and that it had no space above it.

**Measured:** the surface anchored flush to the top edge with 8px side margins and none on top, while every tiled window sits on a 16px gap with a 12px corner radius. The ribbon was the only surface on screen not obeying that rhythm.

**Change:** the surface now takes a margin on top, left and right equal to the compositor's `gaps`, and its band is rounded to 12px with a full border rather than a bottom hairline. The operator then asked for tighter spacing throughout, so the gap and the margin both moved to 8px.

**Evidence:** window heights on the focused workspace moved from 1084px to 1068px at a 16px gap, and to 1092px at 8px, each being the output height less the top margin, the 84px surface, the gap below it and the bottom gap. The compositor reserves the margin in addition to the exclusive zone, so the total reservation is 92px and no window sits under the ribbon. Captures confirm equal spacing above and beside the ribbon and between it and the window below, at a matching radius.

## Focus shown by dimming on 2026-09-07

The operator asked for the focus ring to go and for inactive windows to be dimmed instead, leaving the ribbon untouched.

**Change:** the focus ring is off, and a window rule matching `is-active=false` sets `opacity 0.85`.

**Evidence:** the same inactive Ghostty window sampled at identical coordinates rendered at `srgb(30,35,38)` before the rule, which is exactly the Everforest Dark Hard background at full strength, and at `srgb(35,40,42)` after it, lighter because it is now composited over the backdrop. The ribbon sampled `srgb(30,35,39)` throughout: layer-shell surfaces are not windows, so no window rule can reach it, which is what keeps it at full strength without an exception being written for it.

## Opaque ribbon over a petrol ground on 2026-09-07

The operator asked for the ribbon to be more opaque, for inactive windows to carry more transparency, and for a Siemens-petrol desktop colour.

**Change:** the ribbon's surface is now fully opaque rather than 97%. In the compositor, inactive windows moved from `opacity 0.85` to `0.72`, and both the workspace background and the overview backdrop are set to a deepened Siemens petrol, `#00646e`. The full brand petrol `#009999` reads as neon in an 8px seam, so the tone was deepened while staying recognisably petrol.

**Evidence, all sampled from one capture:**

- inactive window `srgb(22,53,58)`, which is exactly 0.72 of the Everforest background over petrol
- active window `srgb(30,35,38)`, the Everforest background at full strength
- ribbon `srgb(30,35,38)`, matching the active window and confirming it no longer blends
- gap seam `srgb(0,100,110)`, exactly the configured petrol

The two dials are independent: window opacity controls how much ground shows through, and the ground colour controls what shows.

## Window ids on cards on 2026-09-19

The operator asked to see each card's Niri window id on the ribbon. Agents and tools name windows by that id: `claude-window` prints `{"window_id": 43, ...}`, continuity receipts carry it, and sessions say "window 36". The ribbon showed one card per Ghostty terminal but no id, so there was no way to tell which card was window 43.

### What already existed

- **Observed:** the controller already put `windowId` on every card it sent the panel, because exact activation focuses that window. For a hidden tab it is the id of the window hosting the tab, since placement resolves a hidden tab to its host window. The panel ignored the field.
- **Observed:** the workspace number the operator sees is Niri's workspace `idx`. The controller only used the internal workspace `id` for membership, and sent neither.

### Protocol decision

No written protocol rule existed. Every earlier card field (`processId`, `agentLabel`, `akTasks`, `surfaceVisible`) was added as an optional field under protocol 1. The panel reads every card field with a default and ignores unknown ones, and it drops any view that does not carry version 1. `workspaceIdx` follows the same pattern, so an older panel ignores it and a newer panel paired with an older controller draws no workspace number. Bumping the version would have made every mismatched pair drop all views. The README now states this rule.

### The change

- The controller adds `workspaceIdx` to each projected card, taken from the focused workspace's `idx`. A workspace without an integer `idx` reports none rather than an invented one.
- The card footer starts with a `#43` chip: mono, a foreground tint with no border and no vertical padding, so it reads as a chip without making the footer line taller. It sits at the same place on every card and takes no room from the title. A first attempt placed it in the header next to the state pill, where it cut an AK-chip card's title down to six characters.
- The detail gains a `window` row: `#43 · workspace 2`, or `host #43 · workspace 2` for a hidden tab. The row is a single line, because a wrapping label reserves a second line of height.
- Tooltip and accessible label add `window 43`, or `host window 43` for a hidden tab.
- The panel reads both new fields leniently: a value that is not an integer drops that one field instead of rejecting the whole view. Before this change the panel ignored `windowId`, so a strictly typed field would have added a way for one malformed card to blank the ribbon.
- Niri's `WorkspacesChanged` event now triggers reconciliation. Reordering or removing a workspace renumbers the focused one without activating anything, and would otherwise only have shown after the 1.5 s fallback poll.

### Evidence

- Test-first: the controller tests failed on the missing `workspaceIdx` (3 failures), and the panel tests failed to compile on the missing fields and helpers, before either was implemented.
- `npm run check` passed with 161 tests, lint, typecheck, structure, packaging and the file-budget gate.
- `npm run native:build` restaged the receipted artifact under Rust 1.98.0 with 15 Rust tests, including optional-field parsing for present, `null`, absent and malformed ids, and the chip and row text for visible, hidden, unindexed and unplaced cards.
- The panel was previewed in a nested Niri with fixture cards, driven over the child protocol with the operator's resolved Everforest Dark Hard and Everforest Light Med palettes. The operator's live ribbon was not restarted for the preview. On the shared session bus, GTK hands a second instance with the same application id over to the running live panel, which ignores that activation because it only shows on the controller's instruction. The preview therefore ran under a private session bus.
- **Hazard found:** a private session bus with GTK accessibility enabled starts its own AT-SPI bus launcher. That launcher rebinds the desktop's `$XDG_RUNTIME_DIR/at-spi/bus_0`, and when the preview exits it leaves a dead socket at that path. The desktop's real accessibility bus keeps running on an unlinked socket that no new client can reach. Measured: the path's socket was created at the instant a preview panel started, `ss` showed the real `dbus-broker` still listening on its original inode, and the tab inventory helper aborted with `Connection refused`. The inventory had been `ready` before the first private-bus preview. Clients already connected are unaffected; new ones, including the ribbon's tab inventory, fail until the accessibility bus is restarted. A future preview must not start accessibility on a private bus (for example `GTK_A11Y=none` for the preview panel); that mitigation is untested. Here the accessibility bus was restarted with `systemctl --user restart at-spi-dbus-bus.service`, after which the inventory helper connected again. It then reported 0 Ghostty windows, because Ghostty processes still hold connections to the old bus and rejoin only when restarted; hidden tabs stay placed from remembered windows meanwhile.
- Live proof after the operator's ribbon was restarted: workspace 2 showed 8 cards, one a hidden tab, and every chip checked against `niri msg -j windows` named a real window on that workspace. `#44` was the Claude Code session doing this work, `#52` a Pi tab, and `#34` the window hosting the hidden `dspx` tab, whose visible title belonged to another tab.
- Measured on the captures: the compact band's bottom edge sits at y=91 before and after the change, so the chip adds no height. An expanded card grew by exactly the one new row, 22px (351 → 373 for a card with two-line rows, 320 → 342 for the hidden tab).

### Boundaries

- Hover detail was already taller than the documented 276px whenever the prompt, path or task rows wrap to two lines. With the preview fixture, the unchanged panel's expanded band already reached y=351, about 343px tall below its 8px margin. The exclusive zone is still 84px, so the detail overlays windows and never resizes them. This change adds one line to that height and leaves the existing overflow as it was.
- Niri's `idx` counts workspaces per output. The ribbon's surface is not bound to an output, and multi-output behaviour is unimplemented, so with several outputs the number names the focused workspace on its own output without saying which output that is.
- A named workspace still shows its `idx`, as the operator asked for the number, not the name.
- Off Niri no window id exists, so no chip is drawn and the row reads `—`.

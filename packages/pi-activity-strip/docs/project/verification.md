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

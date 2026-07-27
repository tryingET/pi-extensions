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

1. Reload at least two installed Pi sessions whose Ghostty titles carry distinct `· <session-id-short>` suffixes.
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

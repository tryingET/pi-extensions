import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const preload = fs.readFileSync(new URL("../src/electron/preload.cjs", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/electron/main.mjs", import.meta.url), "utf8");
const cli = fs.readFileSync(new URL("../bin/pi-activity-strip.mjs", import.meta.url), "utf8");

test("sandbox bridge allowlists only snapshot, activation, and expansion interactions", () => {
  assert.match(preload, /activate\(sessionId\)/);
  assert.match(preload, /pi-activity-strip:focus/);
  assert.match(preload, /setExpanded\(expanded\)/);
  assert.match(preload, /pi-activity-strip:set-expanded/);
  assert.match(preload, /onCollapse\(handler\)/);
  assert.match(preload, /pi-activity-strip:collapse/);
  assert.match(preload, /subscribe\(handler\)/);
  assert.doesNotMatch(preload, /execFile/);
});

test("Electron runtime follows focused Niri workspaces and keeps expansion top-aligned", () => {
  assert.match(main, /followFocusedNiriWorkspace/);
  assert.match(main, /resolveFocusedSnapshotSessionId/);
  assert.match(main, /focusedSessionId/);
  assert.match(main, /focusedSessionId,/);
  assert.match(main, /updateFocusedSession\(windows\)/);
  assert.match(main, /createFocusedSessionPoller/);
  assert.match(main, /syncFocusedNiriSession\(\)\.catch/);
  assert.match(main, /timeout: ACTIVITY_STRIP_WORKSPACE_SYNC_MS/);
  assert.match(main, /readNiriWindows\(execFileAsync, process\.env/);
  assert.match(main, /readNiriWorkspaces\(execFileAsync, process\.env/);
  assert.match(main, /resolveActivityStripWindow/);
  assert.match(main, /move-window-to-workspace/);
  assert.match(main, /move-window-to-floating/);
  assert.match(main, /niriWindow\.is_floating !== true/);
  assert.match(main, /createLatestOnlyRunner/);
  assert.match(main, /if \(!isCurrent\(\)\) return/);
  assert.match(main, /ACTIVITY_STRIP_WORKSPACE_SYNC_MS/);
  assert.match(main, /expanded \? ACTIVITY_STRIP_EXPANDED_HEIGHT : ACTIVITY_STRIP_HEIGHT/);
  assert.match(main, /pi-activity-strip:set-expanded/);
  assert.match(main, /scheduleTopAlignment\(\)/);
  assert.match(main, /hasShadow: false/);
  assert.match(main, /resizable: true/);
  assert.doesNotMatch(main, /if \(expanded === next\) return/);
  assert.match(main, /Always reconcile the native surface/);
  assert.match(main, /browserWindow\.on\("blur"/);
  assert.match(main, /pi-activity-strip:collapse/);
  assert.match(main, /resolveSnapshotSession\(latestSnapshot\.sessions, sessionId\)/);
  assert.match(main, /if \(result\.ok\)/);
  assert.match(main, /focusedSessionId = session\.sessionId/);
  const workspaceFollow = main.slice(
    main.indexOf("async function followFocusedNiriWorkspaceOnce"),
    main.indexOf("async function moveWindowToTopViaNiri"),
  );
  assert.doesNotMatch(workspaceFollow, /updateFocusedSession/);
});

test("keyboard-only strip entry is an explicit compositor-bindable CLI command", () => {
  assert.match(cli, /case "focus-strip"/);
  assert.match(cli, /focusNiriStrip\(execFileAsync, process\.env\)/);
  assert.match(cli, /resolveActivityStripWindow\(windows\)/);
  assert.doesNotMatch(main, /globalShortcut/);
});

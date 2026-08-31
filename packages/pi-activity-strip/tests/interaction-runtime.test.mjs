import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const preload = fs.readFileSync(new URL("../src/electron/preload.cjs", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/electron/main.mjs", import.meta.url), "utf8");
const niriNativeWindowRuntime = fs.readFileSync(
  new URL("../src/electron/niri-native-window-runtime.mjs", import.meta.url),
  "utf8",
);
const rendererVisibilityRuntime = fs.readFileSync(
  new URL("../src/electron/renderer-visibility-runtime.mjs", import.meta.url),
  "utf8",
);
const rendererProjection = fs.readFileSync(
  new URL("../src/electron/renderer-projection.mjs", import.meta.url),
  "utf8",
);
const workspaceViewRuntime = fs.readFileSync(
  new URL("../src/electron/workspace-view-runtime.mjs", import.meta.url),
  "utf8",
);
const cli = fs.readFileSync(new URL("../bin/pi-activity-strip.mjs", import.meta.url), "utf8");

test("sandbox bridge allowlists only snapshot, activation, expansion, and visibility interactions", () => {
  assert.match(preload, /activate\(cardId\)/);
  assert.match(preload, /pi-activity-strip:focus/);
  assert.match(preload, /setExpanded\(expanded\)/);
  assert.match(preload, /pi-activity-strip:set-expanded/);
  assert.match(preload, /onCollapse\(handler\)/);
  assert.match(preload, /pi-activity-strip:collapse/);
  assert.match(preload, /onVisibility\(handler\)/);
  assert.match(preload, /pi-activity-strip:visibility/);
  assert.match(preload, /pi-activity-strip:visibility-applied/);
  assert.match(preload, /Promise\.resolve\(\)/);
  assert.match(preload, /latestRequestId/);
  assert.match(preload, /handler\(Boolean\(visible\), isCurrent\)/);
  assert.match(preload, /applied !== false/);
  assert.match(preload, /subscribe\(handler\)/);
  assert.doesNotMatch(preload, /execFile/);
});

test("Electron runtime projects one workspace-local Niri view and keeps it top-aligned", () => {
  assert.match(main, /createNiriWorkspaceViewRuntime/);
  assert.match(main, /createNiriNativeWindowRuntime/);
  assert.match(main, /createNiriWorkspaceEventWatcher/);
  assert.match(main, /onFocusedWorkspace: \(\) => workspaceViewRuntime\.request\(\)/);
  assert.match(main, /onFallback: \(\) => workspaceViewRuntime\.requestPassive\(\)/);
  assert.match(main, /createRendererProjection/);
  assert.match(rendererProjection, /projectSessionCards\(/);
  assert.match(rendererProjection, /workspaceCardIds/);
  assert.match(main, /workspaceViewRuntime\.request\(\)/);
  assert.match(main, /createStripHtml\(\{ interactive, initiallyVisible: !isNiriSession\(\) \}\)/);
  assert.match(main, /createBrowserWindowVisibilityRuntime/);
  assert.match(main, /async function ensureBrowserWindow\(\)/);
  assert.match(main, /concealWindow: async \(\) =>/);
  assert.match(main, /render-process-gone/);
  assert.match(main, /setTimeout\(requestWindowRecovery, 0\)/);
  assert.match(main, /function beginShutdown\(\)/);
  assert.match(main, /\(\) => !appQuitting && isCurrent\(\)/);
  assert.match(main, /beginShutdown\(\);\n {4}await broker\?\.stop\(\)/);
  assert.match(main, /visibilityRuntime\.appliedChannel/);
  assert.match(rendererVisibilityRuntime, /VISIBILITY_APPLIED_CHANNEL/);
  assert.match(rendererVisibilityRuntime, /setIgnoreMouseEvents\(!enabled \|\| !interactive/);
  assert.match(rendererVisibilityRuntime, /setFocusable\(enabled && interactive\)/);
  assert.doesNotMatch(main, /syncFocusedNiriSession|followFocusedNiriWorkspace/);
  assert.match(main, /timeoutMs: ACTIVITY_STRIP_WORKSPACE_SYNC_MS/);
  assert.match(main, /readNiriWindows\(execFileAsync, process\.env/);
  assert.match(main, /readNiriWorkspaces\(execFileAsync, process\.env/);
  assert.match(niriNativeWindowRuntime, /resolveActivityStripWindow/);
  assert.match(niriNativeWindowRuntime, /move-window-to-workspace/);
  assert.match(niriNativeWindowRuntime, /move-window-to-floating/);
  assert.match(niriNativeWindowRuntime, /niriWindow\.is_floating !== true/);
  assert.match(main, /createLatestOnlyRunner/);
  assert.match(niriNativeWindowRuntime, /if \(!isCurrent\(\)\)/);
  assert.match(main, /ACTIVITY_STRIP_WORKSPACE_SYNC_MS/);
  assert.match(main, /expanded \? ACTIVITY_STRIP_EXPANDED_HEIGHT : ACTIVITY_STRIP_HEIGHT/);
  assert.match(main, /pi-activity-strip:set-expanded/);
  assert.match(main, /scheduleTopAlignment/);
  assert.match(main, /if \(isNiriSession\(\)\) workspaceViewRuntime\.request\(\)/);
  assert.match(main, /hasShadow: false/);
  assert.match(main, /resizable: true/);
  assert.doesNotMatch(main, /if \(expanded === next\) return/);
  assert.match(main, /Always reconcile the native surface/);
  assert.match(main, /createdWindow\.on\("blur"/);
  assert.match(main, /pi-activity-strip:collapse/);
  assert.match(main, /rendererProjection\.resolveTarget\(targetId\)/);
  assert.match(main, /if \(result\.ok\) rendererProjection\.setFocused\(session\)/);
  assert.match(rendererProjection, /focusedSessionId = String\(session\.sessionId/);
  assert.match(rendererProjection, /focusedCardId = String\(session\.cardId/);

  assert.match(workspaceViewRuntime, /resolveFocusedWorkspaceView/);
  assert.match(workspaceViewRuntime, /view\.sessions\.length === 0/);
  assert.match(workspaceViewRuntime, /resolveWorkspaceView/);
  assert.match(workspaceViewRuntime, /residentView\?\.sessions\.length/);
  assert.match(workspaceViewRuntime, /options\.hideWindow\(\)/);
  assert.match(workspaceViewRuntime, /await options\.showWindow\(\)/);
  assert.match(workspaceViewRuntime, /options\.concealWindow\(\)/);
  assert.match(workspaceViewRuntime, /options\.revealWindow\(isCurrent\)/);
  assert.match(workspaceViewRuntime, /options\.cancelReveal\(\)/);
  assert.match(workspaceViewRuntime, /options\.moveWindowToWorkspace/);
  assert.match(workspaceViewRuntime, /await options\.alignWindow\(isCurrent\)/);
  assert.match(workspaceViewRuntime, /await options\.settleWindow\(isCurrent\)/);
  assert.match(workspaceViewRuntime, /options\.isWindowAligned\(stripWindow\)/);
  assert.match(workspaceViewRuntime, /requestPassive\(\)/);
  assert.match(workspaceViewRuntime, /probeFocusedWorkspace\(\)/);
  assert.match(workspaceViewRuntime, /await waitForPassiveProbe\(isCurrent\)/);
  assert.match(workspaceViewRuntime, /verifyPlacement/);
  assert.doesNotMatch(workspaceViewRuntime, /options\.scheduleAlignment\(\)/);
});

test("keyboard-only strip entry is an explicit compositor-bindable CLI command", () => {
  assert.match(cli, /case "focus-strip"/);
  assert.match(cli, /focusNiriStrip\(/);
  assert.match(cli, /status\?\.snapshot\?\.sessions/);
  assert.match(cli, /getBrokerStatus\(\{ expectReply: true \}\)/);
  assert.match(cli, /runtimeStatus\?\.windowVisible !== true/);
  assert.doesNotMatch(cli, /focus-strip\s+Move the strip/);
  assert.match(cli, /resolveActivityStripWindow\(windows\)/);
  assert.doesNotMatch(main, /globalShortcut/);
});

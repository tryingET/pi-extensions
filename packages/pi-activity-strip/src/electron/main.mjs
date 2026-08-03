// ---
// summary: "runs the Electron overlay, broker, primary-display window placement, and Niri top-edge alignment"
// read_when:
//   - "changing overlay lifecycle, window behavior, runtime readiness, or desktop alignment"
// ---

import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { createActivityStripBroker } from "../broker/server.mjs";
import { createLatestOnlyRunner } from "../common/alignment-controller.mjs";
import { detectDisplayServer, detectWindowManager } from "../common/compatibility.mjs";
import {
  ACTIVITY_STRIP_EXPANDED_HEIGHT,
  ACTIVITY_STRIP_HEIGHT,
  ACTIVITY_STRIP_NIRI_ANIMATION_SETTLE_MS,
  ACTIVITY_STRIP_WIDTH_PADDING,
  ACTIVITY_STRIP_WORKSPACE_SYNC_MS,
} from "../common/constants.mjs";
import {
  focusNiriSession,
  readNiriWindows,
  readNiriWorkspaces,
  resolveSnapshotSession,
} from "../common/niri-focus.mjs";
import { createStripHtml } from "../ui/strip-html.mjs";
import { createNiriNativeWindowRuntime } from "./niri-native-window-runtime.mjs";
import { createNiriWorkspaceEventWatcher } from "./niri-workspace-events.mjs";
import { createBrowserWindowVisibilityRuntime } from "./renderer-visibility-runtime.mjs";
import { createNiriWorkspaceViewRuntime, haveSameSessionIds } from "./workspace-view-runtime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.join(__dirname, "preload.cjs");
const interactive = process.env.PI_ACTIVITY_STRIP_CLICK_THROUGH !== "1";
const execFileAsync = promisify(execFile);

let browserWindow = null;
let broker = null;
let workspaceEventWatcher = null;
let windowCreation = null;
let appQuitting = false;
let rendererVisible = !isNiriSession();
let focusedWorkspaceViewVisible = !isNiriSession();
let expanded = false;
let latestSnapshot = { generatedAt: Date.now(), sessions: [] };
let focusedSessionId = null;
let workspaceSessionIds = new Set();
const runtimeStatus = {
  state: "starting",
  startedAt: Date.now(),
  readyAt: null,
  windowVisible: false,
  displayServer: detectDisplayServer(process.env),
  windowManager: detectWindowManager(process.env),
  displayCount: null,
  alignmentMode: isNiriSession() ? "niri" : "generic",
  warnings: [],
  error: null,
};
const alignmentController = createLatestOnlyRunner(({ isCurrent }) =>
  niriNativeWindowRuntime.alignWindowToTop(isCurrent),
);
const visibilityRuntime = createBrowserWindowVisibilityRuntime(() => browserWindow, interactive);

async function applyRendererVisibility(visible, isCurrent = () => true) {
  if (appQuitting) return false;
  const applied = await visibilityRuntime.apply(visible, () => !appQuitting && isCurrent());
  if (applied) rendererVisible = Boolean(visible);
  refreshRuntimeStatus();
  return applied;
}

function isNiriSession() {
  return Boolean(process.env.NIRI_SOCKET);
}

function isUsableBrowserWindow(window) {
  return Boolean(
    window && !window.isDestroyed() && window.webContents && !window.webContents.isDestroyed(),
  );
}

async function ensureBrowserWindow() {
  if (appQuitting) return null;
  if (windowCreation) {
    const pendingWindow = await windowCreation;
    return isUsableBrowserWindow(pendingWindow) ? pendingWindow : null;
  }
  if (isUsableBrowserWindow(browserWindow)) return browserWindow;

  const staleWindow = browserWindow;
  browserWindow = null;
  rendererVisible = false;
  focusedWorkspaceViewVisible = false;
  if (staleWindow && !staleWindow.isDestroyed()) staleWindow.destroy();

  runtimeStatus.state = "starting";
  runtimeStatus.error = null;
  refreshRuntimeStatus();
  windowCreation = createWindow()
    .catch((error) => {
      runtimeStatus.state = "error";
      runtimeStatus.error = error instanceof Error ? error.message : String(error);
      refreshRuntimeStatus();
      throw error;
    })
    .finally(() => {
      windowCreation = null;
    });

  const createdWindow = await windowCreation;
  return isUsableBrowserWindow(createdWindow) ? createdWindow : null;
}

const getNiriWindows = () =>
  readNiriWindows(execFileAsync, process.env, ACTIVITY_STRIP_WORKSPACE_SYNC_MS);
const getNiriWorkspaces = () =>
  readNiriWorkspaces(execFileAsync, process.env, ACTIVITY_STRIP_WORKSPACE_SYNC_MS);

function sendRendererSnapshot() {
  if (appQuitting || !isUsableBrowserWindow(browserWindow)) return;
  const sessions = isNiriSession()
    ? latestSnapshot.sessions.filter((session) => workspaceSessionIds.has(session.sessionId))
    : latestSnapshot.sessions;
  browserWindow.webContents.send("pi-activity-strip:snapshot", {
    ...latestSnapshot,
    sessions,
    focusedSessionId,
  });
}

function publishWorkspaceView(view) {
  workspaceSessionIds = new Set(view.sessions.map((session) => session.sessionId));
  focusedSessionId = view.focusedSessionId;
  focusedWorkspaceViewVisible = Boolean(view.workspace?.is_focused && view.sessions.length > 0);
  sendRendererSnapshot();
}

const niriNativeWindowRuntime = createNiriNativeWindowRuntime({
  execFileAsync,
  env: process.env,
  timeoutMs: ACTIVITY_STRIP_WORKSPACE_SYNC_MS,
  processId: process.pid,
  readWindows: getNiriWindows,
  getBrowserWindow: () => browserWindow,
  getBounds: currentBounds,
  isNiriSession,
});

const workspaceViewRuntime = createNiriWorkspaceViewRuntime({
  readWindows: getNiriWindows,
  readWorkspaces: getNiriWorkspaces,
  getSessions: () => latestSnapshot.sessions,
  getStripWindow: niriNativeWindowRuntime.resolveProcessWindow,
  isWindowVisible: () =>
    Boolean(browserWindow && !browserWindow.isDestroyed() && browserWindow.isVisible()),
  isWindowExpanded: () => expanded,
  showWindow: async () => {
    if (appQuitting) return;
    const window = await ensureBrowserWindow();
    if (!window || appQuitting) return;
    window.showInactive?.();
  },
  hideWindow: () => {
    rendererVisible = false;
    focusedWorkspaceViewVisible = false;
    browserWindow?.hide?.();
    refreshRuntimeStatus();
  },
  concealWindow: async () => {
    const window = await ensureBrowserWindow();
    if (!window) return false;
    return applyRendererVisibility(false);
  },
  revealWindow: (isCurrent) => applyRendererVisibility(true, isCurrent),
  cancelReveal: () => {
    void applyRendererVisibility(false);
  },
  collapseWindow: async () => {
    browserWindow?.webContents.send("pi-activity-strip:collapse");
    await setExpanded(false, { reconcile: false });
  },
  publishView: publishWorkspaceView,
  moveWindowToWorkspace: niriNativeWindowRuntime.moveWindowToWorkspace,
  alignWindow: niriNativeWindowRuntime.alignWindowToTop,
  settleWindow: async (isCurrent) => {
    await new Promise((resolve) => setTimeout(resolve, ACTIVITY_STRIP_NIRI_ANIMATION_SETTLE_MS));
    return isCurrent();
  },
  isWindowAligned: niriNativeWindowRuntime.isWindowAligned,
  identityOptions: { env: process.env },
});

function requestWindowRecovery() {
  if (appQuitting) return;
  if (isNiriSession()) {
    workspaceViewRuntime.request();
    return;
  }
  void ensureBrowserWindow()
    .then((window) => {
      if (!window || appQuitting) return;
      window.showInactive?.();
      sendRendererSnapshot();
      scheduleTopAlignment();
    })
    .catch(() => {});
}

function beginShutdown() {
  if (appQuitting) return;
  appQuitting = true;
  workspaceEventWatcher?.stop();
  visibilityRuntime.dispose();
}

function requestTopAlignment() {
  if (isNiriSession()) workspaceViewRuntime.request();
  else alignmentController.request();
}

function scheduleTopAlignment() {
  if (isNiriSession()) {
    workspaceViewRuntime.request();
    return;
  }
  requestTopAlignment();

  for (const delayMs of [150, 450, 900, 1500, 2400]) {
    setTimeout(requestTopAlignment, delayMs);
  }
}

function refreshRuntimeStatus() {
  runtimeStatus.alignmentMode = isNiriSession() ? "niri" : "generic";
  runtimeStatus.windowVisible = Boolean(
    rendererVisible &&
      focusedWorkspaceViewVisible &&
      browserWindow &&
      !browserWindow.isDestroyed() &&
      browserWindow.isVisible(),
  );

  if (!app.isReady()) {
    runtimeStatus.warnings = isNiriSession()
      ? []
      : [
          "Top-edge repair is optimized for Niri. Other window managers fall back to generic Electron bounds and may need manual adjustment.",
        ];
    return;
  }

  const displays = screen.getAllDisplays();
  runtimeStatus.displayCount = displays.length;
  const warnings = [];
  if (displays.length > 1) {
    warnings.push(
      `Detected ${displays.length} displays; the strip currently renders on the primary display only.`,
    );
  }
  if (!isNiriSession()) {
    warnings.push(
      "Top-edge repair is optimized for Niri. Other window managers fall back to generic Electron bounds and may need manual adjustment.",
    );
  }
  runtimeStatus.warnings = warnings;
}

function currentDisplay() {
  return screen.getPrimaryDisplay();
}

function currentBounds() {
  const display = currentDisplay();
  const bounds = display.bounds;
  return {
    x: bounds.x + ACTIVITY_STRIP_WIDTH_PADDING / 2,
    y: bounds.y,
    width: Math.max(420, bounds.width - ACTIVITY_STRIP_WIDTH_PADDING),
    height: expanded ? ACTIVITY_STRIP_EXPANDED_HEIGHT : ACTIVITY_STRIP_HEIGHT,
  };
}

async function setExpanded(nextExpanded, { reconcile = true } = {}) {
  if (!interactive || !browserWindow || browserWindow.isDestroyed()) return { ok: false };
  const next = Boolean(nextExpanded);
  expanded = next;
  const bounds = currentBounds();
  // Always reconcile the native surface, even when the logical state already matches. BrowserWindow
  // blur can collapse main-process state before the renderer has removed its expanded layout.
  browserWindow.setSize(bounds.width, bounds.height, false);
  if (reconcile) {
    if (isNiriSession()) workspaceViewRuntime.request();
    else scheduleTopAlignment();
  }
  return { ok: true, expanded };
}

function updateWindowBounds() {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  refreshRuntimeStatus();
  if (isNiriSession()) workspaceViewRuntime.request();
  else scheduleTopAlignment();
}

async function createWindow() {
  const createdWindow = new BrowserWindow({
    ...currentBounds(),
    title: "Pi Activity Strip",
    frame: false,
    transparent: true,
    hasShadow: false,
    // Keep the Wayland surface resizable so Electron can honor both grow and shrink configure
    // requests. The application still owns and continuously supplies the exact two legal heights.
    resizable: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    skipTaskbar: true,
    show: false,
    focusable: !isNiriSession() && interactive,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    backgroundColor: "#00000000",
  });
  browserWindow = createdWindow;

  createdWindow.setAlwaysOnTop(true, "screen-saver");
  createdWindow.setIgnoreMouseEvents(isNiriSession() || !interactive, { forward: true });

  createdWindow.once("ready-to-show", () => {
    if (appQuitting || browserWindow !== createdWindow || createdWindow.isDestroyed()) return;
    runtimeStatus.state = "ready";
    runtimeStatus.readyAt = Date.now();
    runtimeStatus.error = null;
    if (!isNiriSession()) {
      createdWindow.showInactive?.();
      sendRendererSnapshot();
      scheduleTopAlignment();
    }
    refreshRuntimeStatus();
  });

  createdWindow.on("show", () => refreshRuntimeStatus());
  createdWindow.on("hide", () => refreshRuntimeStatus());
  createdWindow.on("blur", () => {
    if (browserWindow !== createdWindow) return;
    createdWindow.webContents.send("pi-activity-strip:collapse");
    setExpanded(false).catch(() => {});
  });
  createdWindow.webContents.on("render-process-gone", () => {
    if (appQuitting || browserWindow !== createdWindow) return;
    rendererVisible = false;
    focusedWorkspaceViewVisible = false;
    runtimeStatus.state = "starting";
    refreshRuntimeStatus();
    if (!createdWindow.isDestroyed()) createdWindow.destroy();
  });
  createdWindow.on("closed", () => {
    if (browserWindow !== createdWindow) return;
    rendererVisible = false;
    focusedWorkspaceViewVisible = false;
    browserWindow = null;
    if (!appQuitting) runtimeStatus.state = "starting";
    refreshRuntimeStatus();
    if (!appQuitting) {
      const recoveryTimer = setTimeout(requestWindowRecovery, 0);
      recoveryTimer.unref?.();
    }
  });

  const html = createStripHtml({ interactive, initiallyVisible: !isNiriSession() });
  try {
    await createdWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } catch (error) {
    if (browserWindow === createdWindow) browserWindow = null;
    if (!createdWindow.isDestroyed()) createdWindow.destroy();
    throw error;
  }

  if (!isNiriSession() && !createdWindow.isVisible()) {
    createdWindow.showInactive?.();
    sendRendererSnapshot();
    refreshRuntimeStatus();
    scheduleTopAlignment();
  }

  return createdWindow;
}

async function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  const focusSession = async (sessionId) => {
    const session = resolveSnapshotSession(latestSnapshot.sessions, sessionId);
    if (!session) {
      return {
        ok: false,
        error: "Session is no longer present or is ambiguous; focus did nothing.",
      };
    }
    const result = await focusNiriSession(session, execFileAsync, process.env);
    if (result.ok) {
      focusedSessionId = session.sessionId;
      sendRendererSnapshot();
    }
    return result;
  };
  broker = await createActivityStripBroker({
    focusSession,
    getRuntimeStatus: () => ({
      ...runtimeStatus,
      warnings: [...runtimeStatus.warnings],
    }),
  });
  ipcMain.handle("pi-activity-strip:focus", (_event, sessionId) => focusSession(String(sessionId)));
  ipcMain.handle("pi-activity-strip:set-expanded", (_event, nextExpanded) =>
    setExpanded(Boolean(nextExpanded)),
  );
  ipcMain.on(visibilityRuntime.appliedChannel, visibilityRuntime.acknowledge);
  broker.on("snapshot", (snapshot) => {
    const sessionMembershipChanged = !haveSameSessionIds(
      latestSnapshot.sessions,
      snapshot.sessions,
    );
    latestSnapshot = snapshot;
    if (!resolveSnapshotSession(latestSnapshot.sessions, focusedSessionId)) focusedSessionId = null;
    sendRendererSnapshot();
    if (isNiriSession() && sessionMembershipChanged) workspaceViewRuntime.request();
  });
  broker.on("shutdown-requested", async () => {
    beginShutdown();
    await broker?.stop();
    app.quit();
  });

  app.setName("pi-activity-strip");

  await app.whenReady();
  refreshRuntimeStatus();
  if (!(await ensureBrowserWindow())) {
    throw new Error("Activity strip BrowserWindow did not become usable.");
  }

  screen.on("display-metrics-changed", () => updateWindowBounds());
  screen.on("display-added", () => updateWindowBounds());
  screen.on("display-removed", () => updateWindowBounds());
  if (isNiriSession()) {
    workspaceViewRuntime.request();
    workspaceEventWatcher = createNiriWorkspaceEventWatcher({
      spawn,
      env: process.env,
      onFocusedWorkspace: () => workspaceViewRuntime.request(),
      onFallback: () => workspaceViewRuntime.requestPassive(),
      fallbackMs: ACTIVITY_STRIP_WORKSPACE_SYNC_MS,
    });
  }

  app.on("second-instance", () => requestWindowRecovery());

  app.on("before-quit", async () => {
    beginShutdown();
    ipcMain.removeHandler("pi-activity-strip:focus");
    ipcMain.removeHandler("pi-activity-strip:set-expanded");
    ipcMain.removeListener(visibilityRuntime.appliedChannel, visibilityRuntime.acknowledge);
    visibilityRuntime.dispose();
    await broker?.stop();
  });

  app.on("window-all-closed", () => {
    // Keep the broker alive until an explicit stop or process exit.
  });
}

main().catch(async (error) => {
  runtimeStatus.state = "error";
  runtimeStatus.error = error instanceof Error ? error.message : String(error);
  refreshRuntimeStatus();
  console.error(error?.stack ?? error?.message ?? String(error));
  try {
    await broker?.stop();
  } catch {
    // ignore cleanup errors on fatal exit
  }
  process.exit(1);
});

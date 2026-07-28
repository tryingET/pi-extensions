// ---
// summary: "runs the Electron overlay, broker, primary-display window placement, and Niri top-edge alignment"
// read_when:
//   - "changing overlay lifecycle, window behavior, runtime readiness, or desktop alignment"
// ---

import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { createActivityStripBroker } from "../broker/server.mjs";
import {
  createLatestOnlyRunner,
  hasNiriFloatingPosition,
} from "../common/alignment-controller.mjs";
import { detectDisplayServer, detectWindowManager } from "../common/compatibility.mjs";
import {
  ACTIVITY_STRIP_EXPANDED_HEIGHT,
  ACTIVITY_STRIP_HEIGHT,
  ACTIVITY_STRIP_WIDTH_PADDING,
  ACTIVITY_STRIP_WORKSPACE_SYNC_MS,
} from "../common/constants.mjs";
import {
  focusNiriSession,
  resolveActivityStripWindow,
  resolveFocusedNiriWorkspace,
  resolveSnapshotSession,
} from "../common/niri-focus.mjs";
import { createStripHtml } from "../ui/strip-html.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.join(__dirname, "preload.cjs");
const interactive = process.env.PI_ACTIVITY_STRIP_CLICK_THROUGH !== "1";
const execFileAsync = promisify(execFile);

let browserWindow = null;
let broker = null;
let workspaceFollowTimer = null;
let expanded = false;
let workspaceFollowInFlight = false;
let latestSnapshot = { generatedAt: Date.now(), sessions: [] };
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
const alignmentController = createLatestOnlyRunner(({ isCurrent }) => alignWindowToTop(isCurrent));

function isNiriSession() {
  return Boolean(process.env.NIRI_SOCKET);
}

function formatDelta(value) {
  const rounded = Math.round(value);
  return rounded >= 0 ? `+${rounded}` : String(rounded);
}

function readNiriPosition(window) {
  const position = window?.layout?.tile_pos_in_workspace_view;
  if (!Array.isArray(position) || position.length < 2) return null;
  return {
    x: Number(position[0] ?? 0),
    y: Number(position[1] ?? 0),
  };
}

async function getNiriWindows() {
  if (!isNiriSession()) return [];
  try {
    const { stdout } = await execFileAsync("niri", ["msg", "-j", "windows"], {
      env: process.env,
    });
    const windows = JSON.parse(stdout);
    return Array.isArray(windows) ? windows : [];
  } catch {
    return [];
  }
}

async function getNiriWorkspaces() {
  if (!isNiriSession()) return [];
  try {
    const { stdout } = await execFileAsync("niri", ["msg", "-j", "workspaces"], {
      env: process.env,
    });
    const workspaces = JSON.parse(stdout);
    return Array.isArray(workspaces) ? workspaces : [];
  } catch {
    return [];
  }
}

async function getNiriWindowByPid(pid) {
  const windows = await getNiriWindows();
  return resolveActivityStripWindow(windows.filter((window) => window?.pid === pid));
}

async function followFocusedNiriWorkspace() {
  if (workspaceFollowInFlight || !browserWindow || browserWindow.isDestroyed() || !isNiriSession())
    return;
  workspaceFollowInFlight = true;
  try {
    await followFocusedNiriWorkspaceOnce();
  } finally {
    workspaceFollowInFlight = false;
  }
}

async function followFocusedNiriWorkspaceOnce() {
  const [windows, workspaces] = await Promise.all([getNiriWindows(), getNiriWorkspaces()]);
  const stripWindow = resolveActivityStripWindow(
    windows.filter((window) => window?.pid === process.pid),
  );
  const focusedWorkspace = resolveFocusedNiriWorkspace(workspaces);
  if (!stripWindow?.id || !focusedWorkspace || stripWindow.workspace_id === focusedWorkspace.id) {
    return;
  }

  try {
    const reference = focusedWorkspace.name || focusedWorkspace.idx;
    if (reference == null) return;
    await execFileAsync(
      "niri",
      [
        "msg",
        "action",
        "move-window-to-workspace",
        "--window-id",
        String(stripWindow.id),
        "--focus",
        "false",
        String(reference),
      ],
      { env: process.env },
    );
    scheduleTopAlignment();
  } catch {
    // Workspace following is best effort and must never move an arbitrary window.
  }
}

async function moveWindowToTopViaNiri(isCurrent) {
  if (!isCurrent() || !browserWindow || browserWindow.isDestroyed() || !isNiriSession()) {
    return false;
  }

  let niriWindow = await getNiriWindowByPid(process.pid);
  if (!isCurrent() || !niriWindow?.id) return false;

  if (niriWindow.is_floating !== true) {
    try {
      await execFileAsync(
        "niri",
        ["msg", "action", "move-window-to-floating", "--id", String(niriWindow.id)],
        { env: process.env },
      );
    } catch {
      return false;
    }
  }

  let currentPosition = readNiriPosition(niriWindow);
  for (let attempt = 0; attempt < 8 && !hasNiriFloatingPosition(niriWindow); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (!isCurrent()) return false;
    niriWindow = await getNiriWindowByPid(process.pid);
    currentPosition = readNiriPosition(niriWindow);
  }
  if (!isCurrent() || !hasNiriFloatingPosition(niriWindow) || !currentPosition) return false;

  const target = currentBounds();
  let deltaX = target.x - currentPosition.x;
  let deltaY = target.y - currentPosition.y;
  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return true;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await execFileAsync(
        "niri",
        [
          "msg",
          "action",
          "move-floating-window",
          "--id",
          String(niriWindow.id),
          "-x",
          formatDelta(deltaX),
          "-y",
          formatDelta(deltaY),
        ],
        { env: process.env },
      );
    } catch {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
    if (!isCurrent()) return false;
    const refreshedWindow = await getNiriWindowByPid(process.pid);
    const refreshedPosition = readNiriPosition(refreshedWindow);
    if (!isCurrent() || refreshedWindow?.is_floating !== true || !refreshedPosition) return false;

    deltaX = target.x - refreshedPosition.x;
    deltaY = target.y - refreshedPosition.y;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return true;
  }

  return false;
}

async function alignWindowToTop(isCurrent) {
  if (!isCurrent() || !browserWindow || browserWindow.isDestroyed()) return;

  if (!isNiriSession()) {
    if (isCurrent()) browserWindow.setBounds(currentBounds(), false);
    return;
  }

  const niriWindow = await getNiriWindowByPid(process.pid);
  if (!isCurrent()) return;
  const target = currentBounds();
  const currentSize = niriWindow?.layout?.window_size;
  const widthMatches = Array.isArray(currentSize) && Number(currentSize[0]) === target.width;
  const heightMatches = Array.isArray(currentSize) && Number(currentSize[1]) === target.height;

  if (!widthMatches || !heightMatches) {
    browserWindow.setSize(target.width, target.height, false);
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (!isCurrent()) return;
  }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (await moveWindowToTopViaNiri(isCurrent)) return;
    if (!isCurrent()) return;
    await new Promise((resolve) => setTimeout(resolve, 90));
  }
}

function requestTopAlignment() {
  alignmentController.request();
}

function scheduleTopAlignment() {
  requestTopAlignment();

  for (const delayMs of [150, 450, 900, 1500, 2400]) {
    setTimeout(requestTopAlignment, delayMs);
  }
}

function refreshRuntimeStatus() {
  runtimeStatus.alignmentMode = isNiriSession() ? "niri" : "generic";
  runtimeStatus.windowVisible = Boolean(
    browserWindow && !browserWindow.isDestroyed() && browserWindow.isVisible(),
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

async function setExpanded(nextExpanded) {
  if (!interactive || !browserWindow || browserWindow.isDestroyed()) return { ok: false };
  const next = Boolean(nextExpanded);
  expanded = next;
  const bounds = currentBounds();
  // Always reconcile the native surface, even when the logical state already matches. BrowserWindow
  // blur can collapse main-process state before the renderer has removed its expanded layout.
  browserWindow.setSize(bounds.width, bounds.height, false);
  scheduleTopAlignment();
  return { ok: true, expanded };
}

function updateWindowBounds() {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  refreshRuntimeStatus();
  scheduleTopAlignment();
}

async function createWindow() {
  browserWindow = new BrowserWindow({
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
    focusable: interactive,
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

  browserWindow.setAlwaysOnTop(true, "screen-saver");
  browserWindow.setIgnoreMouseEvents(!interactive, { forward: true });

  browserWindow.once("ready-to-show", () => {
    runtimeStatus.state = "ready";
    runtimeStatus.readyAt = Date.now();
    runtimeStatus.error = null;
    browserWindow?.showInactive?.();
    browserWindow?.webContents.send("pi-activity-strip:snapshot", latestSnapshot);
    refreshRuntimeStatus();
    scheduleTopAlignment();
  });

  const html = createStripHtml({ interactive });
  await browserWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  if (!browserWindow.isVisible()) {
    browserWindow.showInactive?.();
    browserWindow.webContents.send("pi-activity-strip:snapshot", latestSnapshot);
    refreshRuntimeStatus();
    scheduleTopAlignment();
  }

  browserWindow.on("show", () => refreshRuntimeStatus());
  browserWindow.on("hide", () => refreshRuntimeStatus());
  browserWindow.on("blur", () => {
    browserWindow?.webContents.send("pi-activity-strip:collapse");
    setExpanded(false).catch(() => {});
  });
  browserWindow.on("closed", () => {
    browserWindow = null;
    refreshRuntimeStatus();
  });
}

async function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  const focusSession = (sessionId) => {
    const session = resolveSnapshotSession(latestSnapshot.sessions, sessionId);
    if (!session) {
      return Promise.resolve({
        ok: false,
        error: "Session is no longer present or is ambiguous; focus did nothing.",
      });
    }
    return focusNiriSession(session, execFileAsync, process.env);
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
  broker.on("snapshot", (snapshot) => {
    latestSnapshot = snapshot;
    browserWindow?.webContents.send("pi-activity-strip:snapshot", latestSnapshot);
  });
  broker.on("shutdown-requested", async () => {
    await broker?.stop();
    app.quit();
  });

  app.setName("pi-activity-strip");

  await app.whenReady();
  refreshRuntimeStatus();
  await createWindow();

  screen.on("display-metrics-changed", () => updateWindowBounds());
  screen.on("display-added", () => updateWindowBounds());
  screen.on("display-removed", () => updateWindowBounds());
  if (isNiriSession()) {
    workspaceFollowTimer = setInterval(() => {
      followFocusedNiriWorkspace().catch(() => {});
    }, ACTIVITY_STRIP_WORKSPACE_SYNC_MS);
    workspaceFollowTimer.unref?.();
  }

  app.on("second-instance", () => {
    browserWindow?.webContents.send("pi-activity-strip:snapshot", latestSnapshot);
    requestTopAlignment();
  });

  app.on("before-quit", async () => {
    if (workspaceFollowTimer) clearInterval(workspaceFollowTimer);
    ipcMain.removeHandler("pi-activity-strip:focus");
    ipcMain.removeHandler("pi-activity-strip:set-expanded");
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

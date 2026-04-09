import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { app, BrowserWindow, screen } from "electron";
import { createActivityStripBroker } from "../broker/server.mjs";
import { ACTIVITY_STRIP_HEIGHT, ACTIVITY_STRIP_WIDTH_PADDING } from "../common/constants.mjs";
import { createStripHtml } from "../ui/strip-html.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.join(__dirname, "preload.cjs");
const interactive = process.env.PI_ACTIVITY_STRIP_CLICK_THROUGH === "0";
const execFileAsync = promisify(execFile);

let browserWindow = null;
let broker = null;
let latestSnapshot = { generatedAt: Date.now(), sessions: [] };

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

async function getNiriWindowByPid(pid) {
  if (!isNiriSession()) return null;

  try {
    const { stdout } = await execFileAsync("niri", ["msg", "-j", "windows"], {
      env: process.env,
    });
    const windows = JSON.parse(stdout);
    if (!Array.isArray(windows)) return null;

    return (
      windows.find((window) => window?.pid === pid && window?.is_floating) ??
      windows.find((window) => window?.pid === pid) ??
      null
    );
  } catch {
    return null;
  }
}

async function moveWindowToTopViaNiri() {
  if (!browserWindow || browserWindow.isDestroyed() || !isNiriSession()) return false;

  const target = currentBounds();
  const niriWindow = await getNiriWindowByPid(process.pid);
  if (!niriWindow?.id) return false;

  const currentPosition = readNiriPosition(niriWindow);
  if (!currentPosition) return false;

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
    const refreshedWindow = await getNiriWindowByPid(process.pid);
    const refreshedPosition = readNiriPosition(refreshedWindow);
    if (!refreshedPosition) return false;

    deltaX = target.x - refreshedPosition.x;
    deltaY = target.y - refreshedPosition.y;
    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return true;
  }

  return false;
}

async function alignWindowToTop() {
  if (!browserWindow || browserWindow.isDestroyed()) return;

  const target = currentBounds();
  if (!isNiriSession()) {
    browserWindow.setBounds(target, false);
    return;
  }

  const niriWindow = await getNiriWindowByPid(process.pid);
  const currentSize = niriWindow?.layout?.window_size;
  const widthMatches = Array.isArray(currentSize) && Number(currentSize[0]) === target.width;
  const heightMatches = Array.isArray(currentSize) && Number(currentSize[1]) === target.height;

  if (!widthMatches || !heightMatches) {
    browserWindow.setSize(target.width, target.height, false);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (await moveWindowToTopViaNiri()) return;
    await new Promise((resolve) => setTimeout(resolve, 90));
  }
}

function scheduleTopAlignment() {
  alignWindowToTop().catch(() => {});

  for (const delayMs of [150, 450, 900, 1500, 2400]) {
    setTimeout(() => {
      alignWindowToTop().catch(() => {});
    }, delayMs);
  }
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
    height: ACTIVITY_STRIP_HEIGHT,
  };
}

function updateWindowBounds() {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  scheduleTopAlignment();
}

async function createWindow() {
  browserWindow = new BrowserWindow({
    ...currentBounds(),
    title: "Pi Activity Strip",
    frame: false,
    transparent: true,
    resizable: false,
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
  browserWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  browserWindow.setIgnoreMouseEvents(!interactive, { forward: true });

  browserWindow.once("ready-to-show", () => {
    browserWindow?.showInactive?.();
    browserWindow?.webContents.send("pi-activity-strip:snapshot", latestSnapshot);
    scheduleTopAlignment();
  });

  const html = createStripHtml({ interactive });
  await browserWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  if (!browserWindow.isVisible()) {
    browserWindow.showInactive?.();
    browserWindow.webContents.send("pi-activity-strip:snapshot", latestSnapshot);
    scheduleTopAlignment();
  }

  browserWindow.on("closed", () => {
    browserWindow = null;
  });
}

async function main() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  broker = await createActivityStripBroker();
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
  await createWindow();

  screen.on("display-metrics-changed", () => updateWindowBounds());
  screen.on("display-added", () => updateWindowBounds());
  screen.on("display-removed", () => updateWindowBounds());

  app.on("second-instance", () => {
    browserWindow?.webContents.send("pi-activity-strip:snapshot", latestSnapshot);
    alignWindowToTop().catch(() => {});
  });

  app.on("before-quit", async () => {
    await broker?.stop();
  });

  app.on("window-all-closed", () => {
    // Keep the broker alive until an explicit stop or process exit.
  });
}

main().catch(async (error) => {
  console.error(error?.stack ?? error?.message ?? String(error));
  try {
    await broker?.stop();
  } catch {
    // ignore cleanup errors on fatal exit
  }
  process.exit(1);
});

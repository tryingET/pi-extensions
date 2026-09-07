#!/usr/bin/env node
// ---
// summary: "runs the broker and workspace projection for the native GTK layer-shell panel"
// read_when:
//   - "changing native activity-strip supervision or panel protocol"
// ---

import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createActivityStripBroker } from "../broker/server.mjs";
import { createLatestOnlyRunner } from "../common/alignment-controller.mjs";
import { pruneClaudeEventRecords } from "../common/claude-events.mjs";
import { ACTIVITY_STRIP_WORKSPACE_SYNC_MS } from "../common/constants.mjs";
import { focusNiriSession, readNiriWindows, readNiriWorkspaces } from "../common/niri-focus.mjs";
import { haveSameRecordMembership } from "../common/session-cards.mjs";
import { resolveFocusedWorkspaceView } from "../common/workspace-view.mjs";
import { discoverAgentTabs } from "./agent-discovery.mjs";
import { createHeightRepair } from "./height-repair.mjs";
import { createNativePanelProjection } from "./panel-projection.mjs";
import { createPlacementRuntime } from "./placement.mjs";
import { createThemeRuntime, THEME_POLL_INTERVAL_MS } from "./theme-runtime.mjs";
import { createNiriWorkspaceEventWatcher } from "./workspace-events.mjs";

/** @typedef {import("../common/contracts.ts").ActivityStripRuntimeStatus} ActivityStripRuntimeStatus */
/** @typedef {import("node:child_process").ChildProcessWithoutNullStreams & {_activityBuffer?: string; _readyTimer?: NodeJS.Timeout; _stableTimer?: NodeJS.Timeout}} PanelChild */
/** @typedef {{type: string; protocol?: number; revision?: number; visible?: boolean; sessions?: Array<Record<string, unknown>>; [key: string]: unknown}} PanelMessage */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..", "..");
const execFileAsync = promisify(execFile);

/** @type {import("../broker/server.mjs").ActivityStripBroker | null} */
let broker = null;
/** @type {PanelChild | null} */
let panel = null;
/** @type {{stop: () => void} | null} */
let watcher = null;
let panelReady = false;
let panelWriteReady = true;
/** @type {PanelMessage | null} */
let pendingView = null;
let shuttingDown = false;
let panelStderr = "";
let panelRestartCount = 0;

/** @type {ActivityStripRuntimeStatus} */
const runtimeStatus = {
  state: "starting",
  backend: "native-layer-shell",
  displayServer: process.env.WAYLAND_DISPLAY ? "wayland" : "unknown",
  windowManager: isNiriSession() ? "niri" : null,
  alignmentMode: "layer-shell",
  startedAt: Date.now(),
  readyAt: null,
  controllerPid: process.pid,
  panelPid: null,
  windowVisible: false,
  panelExpanded: false,
  clickThrough: process.env.PI_ACTIVITY_STRIP_CLICK_THROUGH === "1",
  panelMoveCount: 0,
  panelActivationCount: 0,
  panelRestartCount: 0,
  lastMovedCardId: null,
  rendererCardCount: 0,
  rendererCardIds: [],
  rendererHiddenTabCardCount: 0,
  agentTabCount: 0,
  surfaceBindingCount: 0,
  unplacedSurfaceCount: 0,
  tabInventoryState: process.env.PI_ACTIVITY_STRIP_TAB_INVENTORY === "0" ? "disabled" : "pending",
  tabInventoryDetail: null,
  tabInventoryFrameCount: 0,
  tabInventoryTabCount: 0,
  tabInventoryProbedAt: null,
  warnings: [],
  error: null,
};

function isNiriSession() {
  return Boolean(process.env.NIRI_SOCKET);
}

// Hidden Ghostty tabs are placed by their own runtime: host-process containment plus the window
// memory learned from visible titles and the bounded AT-SPI tab inventory.
const placement = createPlacementRuntime({
  env: process.env,
  runtimeStatus,
  execFileAsync,
  onBindingsLearned: () => reconcileRunner.request(),
});

function panelBinaryPath() {
  const override = process.env.PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN?.trim();
  const allowUnverified = process.env.PI_ACTIVITY_STRIP_ALLOW_UNVERIFIED_PANEL === "1";
  const candidates = [
    ...(override ? [override] : []),
    path.join(packageRoot, "native", "bin", "linux-x64-gnu", "pi-activity-strip-panel"),
    ...(allowUnverified
      ? [path.join(packageRoot, "native", "panel", "target", "release", "pi-activity-strip-panel")]
      : []),
  ].filter(Boolean);
  const binary = candidates.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!binary) {
    throw new Error(`Native panel binary is unavailable. Checked: ${candidates.join(", ")}`);
  }
  if (allowUnverified) return binary;
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(`Native panel requires Linux x64, got ${process.platform} ${process.arch}.`);
  }
  const artifactPath = path.join(path.dirname(binary), "artifact.json");
  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  } catch {
    throw new Error(`Native panel receipt is unavailable: ${artifactPath}`);
  }
  const digest = createHash("sha256").update(fs.readFileSync(binary)).digest("hex");
  if (
    artifact.schema !== "pi-activity-strip-native-artifact.v1" ||
    artifact.target !== "x86_64-unknown-linux-gnu" ||
    artifact.sha256 !== digest
  ) {
    throw new Error("Native panel binary does not match its reviewed artifact receipt.");
  }
  return binary;
}

/** @param {PanelMessage} message */
function writePanel(message) {
  if (!panelReady || !panelWriteReady || !panel?.stdin?.writable) {
    if (message?.type === "view") pendingView = message;
    return false;
  }
  try {
    const accepted = panel.stdin.write(`${JSON.stringify(message)}\n`);
    if (!accepted) {
      panelWriteReady = false;
      const child = panel;
      child.stdin.once("drain", () => {
        if (panel !== child) return;
        panelWriteReady = true;
        if (pendingView) {
          const view = pendingView;
          pendingView = null;
          writePanel(view);
        }
      });
    }
    return true;
  } catch {
    if (message?.type === "view") pendingView = message;
    return false;
  }
}

const projection = createNativePanelProjection({
  isNiriSession,
  publish(view) {
    runtimeStatus.rendererCardCount = view.sessions.length;
    runtimeStatus.rendererCardIds = view.sessions.map((session) => String(session.cardId ?? ""));
    runtimeStatus.rendererHiddenTabCardCount = view.sessions.filter(
      (session) => session.surfaceVisible === false,
    ).length;
    writePanel(view);
  },
});

/** @param {string} targetId @returns {Promise<{ok: boolean; error?: string; windowId?: number; presented?: boolean; verified?: boolean}>} */
async function focusSession(targetId) {
  const session = projection.resolveTarget(targetId);
  if (!session) {
    return { ok: false, error: "Session is no longer present or is ambiguous; focus did nothing." };
  }
  const rawResult = await focusNiriSession(session, execFileAsync, process.env, placement.options);
  const result = {
    ok: rawResult.ok === true,
    presented: rawResult.presented === true,
    verified: rawResult.verified === true,
    ...(typeof rawResult.error === "string" ? { error: rawResult.error } : {}),
    ...(Number.isInteger(rawResult.windowId) ? { windowId: Number(rawResult.windowId) } : {}),
  };
  if (result.ok) {
    projection.setFocused(session);
    reconcileRunner.request();
  }
  return result;
}

async function focusStrip() {
  if (runtimeStatus.clickThrough) {
    return { ok: false, error: "Keyboard entry is disabled in click-through mode." };
  }
  if (!runtimeStatus.windowVisible || runtimeStatus.rendererCardCount === 0) {
    return { ok: false, error: "No visible native strip exists on this workspace." };
  }
  return writePanel({ type: "focus-strip" })
    ? { ok: true }
    : { ok: false, error: "Native panel is not ready for keyboard entry." };
}

/** @param {PanelChild} child @param {unknown} chunk */
function consumePanelEvents(child, chunk) {
  if (panel !== child) return;
  child._activityBuffer = `${child._activityBuffer ?? ""}${String(chunk ?? "")}`;
  let newline = child._activityBuffer.indexOf("\n");
  while (newline >= 0) {
    const line = child._activityBuffer.slice(0, newline).trim();
    child._activityBuffer = child._activityBuffer.slice(newline + 1);
    if (line) {
      try {
        const event = JSON.parse(line);
        if (event.protocol !== 1) throw new Error("unsupported native panel protocol");
        if (event.type === "ready") {
          clearTimeout(child._readyTimer);
          panelReady = true;
          runtimeStatus.state = "ready";
          runtimeStatus.readyAt = Date.now();
          runtimeStatus.panelPid = Number(event.pid) || child.pid || null;
          runtimeStatus.error = null;
          clearTimeout(child._stableTimer);
          child._stableTimer = setTimeout(() => {
            if (panel === child && panelReady) {
              panelRestartCount = 0;
              runtimeStatus.panelRestartCount = 0;
            }
          }, 30_000);
          child._stableTimer.unref?.();
          theme.republish();
          if (pendingView) {
            const view = pendingView;
            pendingView = null;
            writePanel(view);
          } else {
            projection.send();
          }
        } else if (event.type === "visibility-applied") {
          const visible = event.visible === true;
          const changed = runtimeStatus.windowVisible !== visible;
          runtimeStatus.windowVisible = visible;
          // Showing or hiding the surface is the only moment the exclusive zone changes, so it is
          // the only moment a tiled window can be left at the previous working area's height.
          if (changed) void heightRepair.repairAfterZoneChange();
        } else if (event.type === "expanded") {
          runtimeStatus.panelExpanded = event.expanded === true;
        } else if (event.type === "activate") {
          runtimeStatus.panelActivationCount = (runtimeStatus.panelActivationCount ?? 0) + 1;
          const cardId = String(event.cardId ?? "");
          void focusSession(cardId).then((result) =>
            writePanel({
              type: "activation-result",
              cardId,
              ok: result.ok === true,
              message: result.ok
                ? result.presented
                  ? result.verified
                    ? "Presented the hidden tab and focused its Ghostty window."
                    : "Focused its Ghostty window and asked Ghostty to show the tab."
                  : "Focused Ghostty window."
                : result.error || "Focus failed; nothing moved.",
            }),
          );
        } else if (event.type === "moved") {
          runtimeStatus.panelMoveCount = (runtimeStatus.panelMoveCount ?? 0) + 1;
          runtimeStatus.lastMovedCardId = String(event.cardId ?? "") || null;
        } else if (event.type === "error") {
          runtimeStatus.warnings = [String(event.message ?? "Native panel reported an error.")];
        }
      } catch (error) {
        runtimeStatus.warnings = [
          `Ignored malformed native panel event: ${error instanceof Error ? error.message : String(error)}`,
        ];
      }
    }
    newline = child._activityBuffer.indexOf("\n");
  }
}

function startPanel() {
  if (shuttingDown) return;
  const binary = panelBinaryPath();
  /** @type {PanelChild} */
  const child = spawn(binary, [], {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  panel = child;
  panelReady = false;
  panelWriteReady = true;
  panelStderr = "";
  runtimeStatus.panelPid = child.pid ?? null;
  runtimeStatus.state = "starting";
  child.stdout.setEncoding("utf8");
  child.stdin.on("error", () => {
    // Exit supervision below owns recovery from a closed panel pipe.
  });
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => consumePanelEvents(child, chunk));
  child.stderr.on("data", (chunk) => {
    if (panel === child) panelStderr = `${panelStderr}${chunk}`.slice(-4000);
  });
  child._readyTimer = setTimeout(() => {
    if (panel === child && !panelReady) child.kill("SIGKILL");
  }, 5000);
  child._readyTimer.unref?.();
  child.on("error", (error) => {
    if (panel === child) runtimeStatus.error = error.message;
  });
  child.on("exit", (code, signal) => {
    clearTimeout(child._readyTimer);
    clearTimeout(child._stableTimer);
    if (panel !== child) return;
    panelReady = false;
    runtimeStatus.windowVisible = false;
    runtimeStatus.panelPid = null;
    if (shuttingDown) return;
    if (panelRestartCount < 3) {
      panelRestartCount += 1;
      runtimeStatus.panelRestartCount = panelRestartCount;
      runtimeStatus.state = "starting";
      runtimeStatus.error = null;
      const timer = setTimeout(startPanel, 250 * 2 ** (panelRestartCount - 1));
      timer.unref?.();
      return;
    }
    runtimeStatus.state = "error";
    runtimeStatus.error =
      `Native panel exited (${signal ?? code ?? "unknown"}). ${panelStderr}`.trim();
  });
}

const getNiriWindows = () =>
  readNiriWindows(execFileAsync, process.env, ACTIVITY_STRIP_WORKSPACE_SYNC_MS);
const getNiriWorkspaces = () =>
  readNiriWorkspaces(execFileAsync, process.env, ACTIVITY_STRIP_WORKSPACE_SYNC_MS);

// Agent tabs are read from the process table, not the broker, so they are refreshed on a calm
// clock of their own rather than on every workspace event.
const AGENT_SCAN_INTERVAL_MS = 3000;
let agentScanAt = 0;

function refreshAgentTabs() {
  if (process.env.PI_ACTIVITY_STRIP_AGENT_TABS === "0") return;
  if (Date.now() - agentScanAt < AGENT_SCAN_INTERVAL_MS) return;
  agentScanAt = Date.now();
  try {
    const records = discoverAgentTabs({ env: process.env });
    runtimeStatus.agentTabCount = records.length;
    runtimeStatus.agentScanError = null;
    projection.setAgentSessions(records);
    // A session that dies without firing its end hook leaves a record behind; retire the ones no
    // live tab claims so they cannot accumulate.
    pruneClaudeEventRecords(
      records
        .filter((record) => record.agentKind === "claude" && record.agentSessionKey)
        .map((record) => String(record.agentSessionKey)),
    );
  } catch (error) {
    // Recorded on its own field: replacing the shared warning list would erase a panel error, and
    // a transient scan failure must not leave a permanent warning behind.
    runtimeStatus.agentScanError = error instanceof Error ? error.message : String(error);
  }
}

// The ribbon reads Ghostty's own theme, so it follows the terminal into light and dark.
const theme = createThemeRuntime({
  execFileAsync,
  env: process.env,
  runtimeStatus,
  publish: (definitions) => writePanel({ protocol: 1, type: "theme", definitions }),
});

const heightRepair = createHeightRepair({
  execFileAsync,
  env: process.env,
  runtimeStatus,
  readWindows: getNiriWindows,
});

const reconcileRunner = createLatestOnlyRunner(async ({ isCurrent }) => {
  if (!isNiriSession()) {
    projection.send();
    return;
  }
  const [windows, workspaces] = await Promise.all([getNiriWindows(), getNiriWorkspaces()]);
  if (!isCurrent()) return;
  placement.observeWindowList(windows);
  heightRepair.observe(windows);
  refreshAgentTabs();
  runtimeStatus.surfaceBindingCount = placement.bindingCount;
  const sessions = projection.getRawSessions();
  runtimeStatus.unplacedSurfaceCount = placement.countUnplaced(windows, sessions);
  const view = resolveFocusedWorkspaceView(windows, workspaces, sessions, placement.options);
  if (view) placement.learnFromPlacements(view.sessions, windows);
  projection.publishWorkspaceView(
    view ?? { workspace: null, sessions: [], focusedSessionId: null, focusedCardId: null },
  );
  void placement.scheduleInventory(windows);
});

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  watcher?.stop();
  placement.persist();
  writePanel({
    protocol: 1,
    type: "view",
    revision: Number.MAX_SAFE_INTEGER,
    visible: false,
    sessions: [],
  });
  panel?.stdin?.end();
  await new Promise((resolve) => setTimeout(resolve, 80));
  panel?.kill("SIGTERM");
  await broker?.stop();
  process.exitCode = exitCode;
}

async function main() {
  if (process.env.PI_ACTIVITY_STRIP_RUNTIME_LOCK_HELD !== "1") {
    throw new Error("Native runtime must be launched through the flock-guarded CLI.");
  }
  broker = await createActivityStripBroker({
    focusSession,
    focusStrip,
    getRuntimeStatus: () => ({
      ...runtimeStatus,
      warnings: [...(runtimeStatus.warnings ?? [])],
    }),
  });
  broker.on("snapshot", (snapshot) => {
    // Compare like with like: the raw set also holds discovered agent tabs, which the broker
    // never publishes, so comparing it to a broker snapshot would always differ and reconcile.
    const membershipChanged = !haveSameRecordMembership(
      projection.getBrokerSessions(),
      snapshot.sessions,
    );
    projection.updateSnapshot(snapshot);
    if (isNiriSession() && membershipChanged) reconcileRunner.request();
  });
  broker.on("shutdown-requested", () => void shutdown(0));

  startPanel();
  if (isNiriSession()) {
    reconcileRunner.request();
    watcher = createNiriWorkspaceEventWatcher({
      spawn,
      env: process.env,
      onFocusedWorkspace: () => reconcileRunner.request(),
      onFallback: () => reconcileRunner.request(),
      onWindowChanged: (window) => {
        if (placement.observeWindowEvent(window)) reconcileRunner.request();
      },
      onWindowClosed: (windowId) => {
        if (placement.forgetWindow(windowId)) reconcileRunner.request();
      },
      onWindowFocusChanged: () => reconcileRunner.request(),
      fallbackMs: ACTIVITY_STRIP_WORKSPACE_SYNC_MS,
    });
  }

  void theme.refresh({ force: true });
  const themeTimer = setInterval(() => void theme.refresh(), THEME_POLL_INTERVAL_MS);
  themeTimer.unref?.();

  process.once("SIGINT", () => void shutdown(0));
  process.once("SIGTERM", () => void shutdown(0));
}

main().catch(async (error) => {
  runtimeStatus.state = "error";
  runtimeStatus.error = error instanceof Error ? error.message : String(error);
  console.error(error?.stack ?? error);
  try {
    await shutdown(1);
  } catch {
    process.exitCode = 1;
  }
});

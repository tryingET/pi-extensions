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
import { ACTIVITY_STRIP_WORKSPACE_SYNC_MS } from "../common/constants.mjs";
import {
  focusNiriSession,
  readNiriWindows,
  readNiriWorkspaces,
  resolveFocusedWorkspaceView,
} from "../common/niri-focus.mjs";
import { haveSameRecordMembership } from "../common/session-cards.mjs";
import { createNativePanelProjection } from "./panel-projection.mjs";
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
  warnings: [],
  error: null,
};

function isNiriSession() {
  return Boolean(process.env.NIRI_SOCKET);
}

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
    writePanel(view);
  },
});

/** @param {string} targetId @returns {Promise<{ok: boolean; error?: string; windowId?: number}>} */
async function focusSession(targetId) {
  const session = projection.resolveTarget(targetId);
  if (!session) {
    return { ok: false, error: "Session is no longer present or is ambiguous; focus did nothing." };
  }
  const rawResult = await focusNiriSession(session, execFileAsync, process.env);
  const result = {
    ok: rawResult.ok === true,
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
          if (pendingView) {
            const view = pendingView;
            pendingView = null;
            writePanel(view);
          } else {
            projection.send();
          }
        } else if (event.type === "visibility-applied") {
          runtimeStatus.windowVisible = event.visible === true;
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
                ? "Focused Ghostty window."
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

const reconcileRunner = createLatestOnlyRunner(async ({ isCurrent }) => {
  if (!isNiriSession()) {
    projection.send();
    return;
  }
  const [windows, workspaces] = await Promise.all([getNiriWindows(), getNiriWorkspaces()]);
  if (!isCurrent()) return;
  const view = resolveFocusedWorkspaceView(windows, workspaces, projection.getRawSessions(), {
    env: process.env,
  });
  projection.publishWorkspaceView(
    view ?? { workspace: null, sessions: [], focusedSessionId: null, focusedCardId: null },
  );
});

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  watcher?.stop();
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
    const membershipChanged = !haveSameRecordMembership(
      projection.getRawSessions(),
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
      fallbackMs: ACTIVITY_STRIP_WORKSPACE_SYNC_MS,
    });
  }

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

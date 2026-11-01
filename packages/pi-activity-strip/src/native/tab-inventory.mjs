// ---
// summary: "maps AT-SPI Ghostty tab labels onto exact Niri windows to place tabs that were never shown"
// read_when:
//   - "changing hidden-tab discovery, its cadence, or its capability gating"
// ---

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bindingKeysFor, parseTerminalTitleBinding } from "../common/surface-bindings.mjs";
import { appIdForGhosttyFamily } from "../common/terminal-identity.mjs";

const GHOSTTY_APP_IDS = new Set(["com.mitchellh.ghostty", "com.tryinget.ghosttysidequest"]);
export const TAB_INVENTORY_SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "ghostty-tab-inventory.py",
);
export const TAB_INVENTORY_TIMEOUT_MS = 4000;
export const TAB_INVENTORY_UNAVAILABLE_EXIT_CODE = 3;
const ATSPI_IMPORT_PROBE =
  "import gi; gi.require_version('Atspi', '2.0'); from gi.repository import Atspi";
// Signal names are a fixed OS vocabulary; anything else is reported as unknown.
const FAILURE_SIGNALS = new Set(Object.keys(os.constants.signals));
const FAILURE_STAGES = new Set([
  "import",
  "desktop-lookup",
  "desktop-count",
  "desktop-index",
  "application-count",
  "application-index",
]);
const FAILURE_REASONS = new Set([
  "bindings-unavailable",
  "desktop-unavailable",
  "enumeration-failed",
  "access-denied",
]);

/** @typedef {{pid: number; name: string; tabs: string[]}} TabInventoryFrame */
/** @typedef {{bindingKey: string; windowId: number; windowPid: number; appId: string}} TabBinding */
/** @typedef {{ok: true; frames: TabInventoryFrame[]} | {ok: false; unavailable: boolean; error: string}} TabInventoryResult */
/** @typedef {(file: string, args: string[], options: object) => Promise<{stdout?: string}>} ExecFileAsync */

/** @param {NodeJS.ProcessEnv} env */
function pythonBinaryFor(env) {
  return env.PI_ACTIVITY_STRIP_PYTHON?.trim() || "python3";
}

/**
 * A frame maps to exactly one Niri window of the same process with the same title; every other
 * frame is skipped. Each tab label that carries a surface segment then binds that surface to the
 * window. A surface claimed by two windows is dropped as ambiguous.
 * @param {TabInventoryFrame[]} frames
 * @param {Array<Record<string, unknown>>} windows
 * @returns {TabBinding[]}
 */
export function mapTabInventoryToBindings(frames, windows) {
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const byTitle = new Map();
  for (const window of windows) {
    if (!Number.isInteger(window?.id) || !Number.isInteger(window?.pid)) continue;
    if (!GHOSTTY_APP_IDS.has(String(window.app_id ?? ""))) continue;
    const key = `${window.pid} ${String(window.title ?? "")}`;
    const list = byTitle.get(key) ?? [];
    list.push(window);
    byTitle.set(key, list);
  }

  /** @type {Map<string, TabBinding[]>} */
  const candidates = new Map();
  for (const frame of frames) {
    if (!Array.isArray(frame?.tabs) || frame.tabs.length === 0) continue;
    const matches = byTitle.get(`${frame.pid} ${String(frame.name ?? "")}`) ?? [];
    if (matches.length !== 1) continue;
    const window = matches[0];
    const appId = String(window.app_id ?? "");
    for (const label of frame.tabs) {
      const parsed = parseTerminalTitleBinding(label);
      if (!parsed || appIdForGhosttyFamily(parsed.family) !== appId) continue;
      for (const bindingKey of bindingKeysFor(parsed)) {
        const list = candidates.get(bindingKey) ?? [];
        list.push({
          bindingKey,
          windowId: Number(window.id),
          windowPid: Number(window.pid),
          appId,
        });
        candidates.set(bindingKey, list);
      }
    }
  }

  const bindings = [];
  for (const list of candidates.values()) {
    const windowIds = new Set(list.map((binding) => binding.windowId));
    if (windowIds.size === 1) bindings.push(list[0]);
  }
  return bindings;
}

/**
 * Run the read-only AT-SPI helper for the given Ghostty process ids. Absent Python bindings are
 * reported as `unavailable` so the caller can stop probing; every other failure is transient.
 * @param {{
 *   execFileAsync: ExecFileAsync;
 *   env?: NodeJS.ProcessEnv;
 *   pids: number[];
 *   pythonBin?: string;
 *   scriptPath?: string;
 *   timeout?: number;
 * }} options
 * @returns {Promise<TabInventoryResult>}
 */
export async function probeGhosttyTabInventory({
  execFileAsync,
  env = process.env,
  pids,
  pythonBin = pythonBinaryFor(env),
  scriptPath = TAB_INVENTORY_SCRIPT,
  timeout = TAB_INVENTORY_TIMEOUT_MS,
}) {
  const uniquePids = [...new Set(pids.filter((pid) => Number.isInteger(pid) && pid > 0))];
  if (uniquePids.length === 0) return { ok: true, frames: [] };
  let stdout = "";
  try {
    const result = await execFileAsync(pythonBin, [scriptPath, ...uniquePids.map(String)], {
      env,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    });
    stdout = String(result.stdout ?? "");
  } catch (error) {
    const failure =
      /** @type {{code?: unknown; signal?: unknown; killed?: unknown; stdout?: unknown}} */ (
        error && typeof error === "object" ? error : {}
      );
    const unavailable =
      failure.code === TAB_INVENTORY_UNAVAILABLE_EXIT_CODE || failure.code === "ENOENT";
    const code = Number.isSafeInteger(failure.code) ? failure.code : "unknown";
    const signal =
      typeof failure.signal === "string" && FAILURE_SIGNALS.has(failure.signal)
        ? failure.signal
        : "unknown";
    // execFile marks only its own deadline kill as `killed`; output limits and aborts reject with
    // a string code instead. The child's exit after that kill (signal or status) is kept as is.
    let reason = "unknown";
    switch (failure.code) {
      case "ENOENT":
        reason = "missing-interpreter";
        break;
      case TAB_INVENTORY_UNAVAILABLE_EXIT_CODE:
        reason = "import-unavailable";
        break;
      case "EACCES":
      case "EPERM":
        reason = "access-denied";
        break;
      case "ERR_CHILD_PROCESS_STDIO_MAXBUFFER":
        reason = "output-limit";
        break;
      default:
        if (failure.killed === true && typeof failure.code !== "string") reason = "timeout";
        else if (signal !== "unknown") reason = "signal";
        else if (code !== "unknown") reason = "exit-status";
        else if (failure.killed === true) reason = "terminated-unknown";
    }
    let stage = "unknown";
    let helperReason = "unknown";
    try {
      const parsed = JSON.parse(typeof failure.stdout === "string" ? failure.stdout : "");
      if (FAILURE_STAGES.has(parsed?.stage)) stage = parsed.stage;
      if (FAILURE_REASONS.has(parsed?.reason)) helperReason = parsed.reason;
    } catch {
      /* Transport metadata is independent of helper JSON. */
    }
    return {
      ok: false,
      unavailable,
      error: `the tab inventory helper failed (reason=${reason}, code=${code}, signal=${signal}, stage=${stage}, helperReason=${helperReason})`,
    };
  }
  try {
    const parsed = JSON.parse(stdout);
    if (parsed?.ok !== true || !Array.isArray(parsed.frames)) {
      return {
        ok: false,
        unavailable: false,
        error: "the tab inventory helper returned no frames",
      };
    }
    return {
      ok: true,
      frames: parsed.frames
        .filter(
          /** @param {any} frame */ (frame) =>
            Number.isInteger(frame?.pid) && Array.isArray(frame?.tabs),
        )
        .map(
          /** @param {any} frame */ (frame) => ({
            pid: Number(frame.pid),
            name: String(frame.name ?? ""),
            tabs: frame.tabs.map(String),
          }),
        ),
    };
  } catch {
    return { ok: false, unavailable: false, error: "the tab inventory helper produced no JSON" };
  }
}

/**
 * Doctor-time capability probe. Importing the bindings touches no window.
 * @param {{execFileAsync: ExecFileAsync; env?: NodeJS.ProcessEnv; timeout?: number}} options
 * @returns {Promise<{available: boolean; detail: string}>}
 */
export async function detectTabInventorySupport({
  execFileAsync,
  env = process.env,
  timeout = TAB_INVENTORY_TIMEOUT_MS,
}) {
  if (env.PI_ACTIVITY_STRIP_TAB_INVENTORY === "0") {
    return { available: false, detail: "disabled by PI_ACTIVITY_STRIP_TAB_INVENTORY=0" };
  }
  const pythonBin = pythonBinaryFor(env);
  try {
    await execFileAsync(pythonBin, ["-c", ATSPI_IMPORT_PROBE], { env, timeout });
    return { available: true, detail: `AT-SPI via ${pythonBin} gi.repository.Atspi` };
  } catch (error) {
    const code = /** @type {{code?: unknown}} */ (error && typeof error === "object" ? error : {})
      .code;
    return {
      available: false,
      detail:
        code === "ENOENT"
          ? "the tab inventory interpreter is not installed"
          : "AT-SPI bindings (python-gobject + at-spi2-core) are unavailable",
    };
  }
}

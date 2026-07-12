// ---
// summary: "detects desktop and Electron prerequisites and formats actionable activity-strip compatibility reports"
// read_when:
//   - "changing host detection, compatibility blockers, warnings, or doctor output"
// ---

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { locateElectron } from "./electron.mjs";

const execFileAsync = promisify(execFile);

/** @param {NodeJS.ProcessEnv} [env] */
export function detectDisplayServer(env = process.env) {
  if (env.WAYLAND_DISPLAY) return "wayland";
  if (env.DISPLAY) return "x11";
  if (env.XDG_SESSION_TYPE === "wayland") return "wayland";
  if (env.XDG_SESSION_TYPE === "x11") return "x11";
  return "headless";
}

/** @param {NodeJS.ProcessEnv} [env] */
export function detectWindowManager(env = process.env) {
  if (env.NIRI_SOCKET) return "niri";
  return (
    env.XDG_CURRENT_DESKTOP ||
    env.XDG_SESSION_DESKTOP ||
    env.DESKTOP_SESSION ||
    env.SWAYSOCK ||
    null
  );
}

/**
 * @param {unknown} payload
 * @returns {number | null}
 */
function inferDisplayCount(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === "object") {
    const values = Object.values(payload);
    if (values.every((entry) => entry && typeof entry === "object")) {
      return values.length;
    }
  }
  return null;
}

/**
 * @param {{ env?: NodeJS.ProcessEnv; execFileAsyncImpl?: typeof execFileAsync }} [options]
 */
export async function detectDisplayCount(options = {}) {
  const env = options.env || process.env;
  const execFileImpl = options.execFileAsyncImpl || execFileAsync;
  if (!env.NIRI_SOCKET) {
    return null;
  }

  try {
    const { stdout } = await execFileImpl("niri", ["msg", "-j", "outputs"], { env });
    return inferDisplayCount(JSON.parse(stdout));
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv;
 *   locateElectronImpl?: typeof locateElectron;
 *   execFileAsyncImpl?: typeof execFileAsync;
 * }} [options]
 * @returns {Promise<import("./contracts.ts").ActivityStripCompatibilityReport>}
 */
export async function assessActivityStripCompatibility(options = {}) {
  const env = options.env || process.env;
  const locateElectronImpl = options.locateElectronImpl || locateElectron;
  const displayServer = detectDisplayServer(env);
  const windowManager = detectWindowManager(env);
  const displayCount = await detectDisplayCount({
    env,
    execFileAsyncImpl: options.execFileAsyncImpl,
  });
  const blockers = [];
  const warnings = [];
  let electronPath = null;

  if (displayServer === "headless") {
    blockers.push(
      "No graphical display session detected. Start Pi from a Wayland/X11 desktop before opening the activity strip.",
    );
  }

  try {
    electronPath = await locateElectronImpl();
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
  }

  if (displayCount && displayCount > 1) {
    warnings.push(
      `Detected ${displayCount} displays; the strip currently renders on the primary display only.`,
    );
  }

  if (windowManager !== "niri") {
    warnings.push(
      "Top-edge repair is optimized for Niri. Other window managers fall back to generic Electron bounds and may need manual adjustment.",
    );
  }

  return {
    ok: blockers.length === 0,
    displayServer,
    windowManager: typeof windowManager === "string" ? windowManager : null,
    electronPath,
    displayCount,
    alignmentMode: windowManager === "niri" ? "niri" : "generic",
    primaryDisplayOnly: true,
    clickThroughDefault: env.PI_ACTIVITY_STRIP_CLICK_THROUGH !== "0",
    blockers,
    warnings,
  };
}

/**
 * @param {import("./contracts.ts").ActivityStripCompatibilityReport} report
 */
export function formatCompatibilityReport(report) {
  const lines = [
    `Compatibility: ${report.ok ? "compatible" : "blocked"}`,
    `Display server: ${report.displayServer}`,
    `Window manager: ${report.windowManager || "unknown"}`,
    `Electron: ${report.electronPath || "not found"}`,
    `Alignment mode: ${report.alignmentMode}`,
    `Primary-display only: ${report.primaryDisplayOnly ? "yes" : "no"}`,
    `Click-through default: ${report.clickThroughDefault ? "yes" : "no"}`,
  ];

  if (typeof report.displayCount === "number") {
    lines.push(`Detected displays: ${report.displayCount}`);
  }

  if (report.blockers.length > 0) {
    lines.push("", "Blockers:");
    for (const blocker of report.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  if (report.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of report.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return lines.join("\n");
}

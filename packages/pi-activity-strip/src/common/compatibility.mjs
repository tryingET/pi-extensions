// ---
// summary: "detects native layer-shell prerequisites and formats actionable activity-strip compatibility reports"
// read_when:
//   - "changing host detection, compatibility blockers, warnings, or doctor output"
// ---

import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
 *   execFileAsyncImpl?: typeof execFileAsync;
 *   platform?: NodeJS.Platform;
 *   arch?: string;
 * }} [options]
 * @returns {Promise<import("./contracts.ts").ActivityStripCompatibilityReport>}
 */
export async function assessActivityStripCompatibility(options = {}) {
  const env = options.env || process.env;
  const backend = "native";
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const displayServer = detectDisplayServer(env);
  const windowManager = detectWindowManager(env);
  const displayCount = await detectDisplayCount({
    env,
    execFileAsyncImpl: options.execFileAsyncImpl,
  });
  const blockers = [];
  const warnings = [];

  if (displayServer === "headless") {
    blockers.push(
      "No graphical display session detected. Start Pi from a Wayland/X11 desktop before opening the activity strip.",
    );
  }

  if (windowManager === "niri" && displayCount === 0) {
    blockers.push(
      "Niri reports no connected display outputs. Turn on or reconnect the monitor before opening the activity strip.",
    );
  }

  if (displayServer !== "headless" && displayServer !== "wayland") {
    blockers.push("The native Activity Strip panel requires a Wayland session.");
  }
  if (platform !== "linux" || arch !== "x64") {
    blockers.push(`The packaged native panel requires Linux x64; detected ${platform} ${arch}.`);
  }

  if (displayCount && displayCount > 1) {
    warnings.push(
      `Detected ${displayCount} displays; the strip currently renders on the primary display only.`,
    );
  }

  if (windowManager !== "niri") {
    warnings.push(
      "Workspace-local projection is optimized for Niri; other layer-shell compositors show the global card view.",
    );
  }

  return {
    ok: blockers.length === 0,
    backend,
    displayServer,
    windowManager: typeof windowManager === "string" ? windowManager : null,
    displayCount,
    alignmentMode: "layer-shell",
    primaryDisplayOnly: true,
    clickThroughDefault: env.PI_ACTIVITY_STRIP_CLICK_THROUGH === "1",
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
    `Backend: ${report.backend}`,
    `Alignment mode: ${report.alignmentMode}`,
    `Primary-display only: ${report.primaryDisplayOnly ? "yes" : "no"}`,
    `Click-through mode: ${report.clickThroughDefault ? "enabled by environment" : "disabled (interactive default)"}`,
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

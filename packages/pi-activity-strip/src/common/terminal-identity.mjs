// ---
// summary: "derives bounded terminal-surface identities for activity-strip publisher and focus contracts"
// read_when:
//   - "changing terminal card identity, Ghostty surface admission, or title matching"
// ---

import fs from "node:fs";
import path from "node:path";

const UINT64_MAX = 18_446_744_073_709_551_615n;
const GHOSTTY_MAIN_APP_ID = "com.mitchellh.ghostty";
const GHOSTTY_LEGACY_APP_ID = "com.tryinget.ghosttysidequest";

/** @typedef {{terminalKind: "ghostty-surface" | "unbound"; terminalKey: string; terminalFamily: string; terminalSurfaceId: string}} TerminalIdentity */
/** @typedef {{env?: NodeJS.ProcessEnv; hasUI?: boolean; stdinIsTTY?: boolean; ttyPath?: string; processId?: number; ancestorExecutable?: string}} TerminalIdentityOptions */

/** @param {string} filePath */
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

/** @param {string} filePath */
function safeReadLink(filePath) {
  try {
    return fs.readlinkSync(filePath);
  } catch {
    return "";
  }
}

/** @param {number} pid */
function readParentPid(pid) {
  const value = safeReadFile(path.join("/proc", String(pid), "stat"));
  const lastParen = value.lastIndexOf(")");
  if (lastParen < 0) return 0;
  const fields = value
    .slice(lastParen + 2)
    .trim()
    .split(/\s+/);
  const parentPid = Number.parseInt(fields[1] ?? "", 10);
  return Number.isInteger(parentPid) && parentPid > 0 ? parentPid : 0;
}

/** @param {unknown} value */
export function normalizeGhosttySurfaceId(value) {
  try {
    const normalized = BigInt(String(value ?? "").trim());
    return normalized >= 0n && normalized <= UINT64_MAX ? normalized.toString(10) : "";
  } catch {
    return "";
  }
}

/** @param {unknown} executable */
export function classifyGhosttyFamily(executable) {
  const normalized = String(executable ?? "").toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("ghostty-sidequest")) return "legacy";
  if (path.basename(normalized) === "ghostty" || normalized.includes("ghostty-origin"))
    return "main";
  return "";
}

/** @param {unknown} family */
export function appIdForGhosttyFamily(family) {
  if (family === "main") return GHOSTTY_MAIN_APP_ID;
  if (family === "legacy") return GHOSTTY_LEGACY_APP_ID;
  return "";
}

/** @param {number} [processId] */
export function findGhosttyAncestorExecutable(processId = process.pid) {
  let pid = Number(processId) || 0;
  for (let depth = 0; depth < 12 && pid > 0; depth += 1) {
    pid = readParentPid(pid);
    if (pid <= 0) break;
    const command = safeReadFile(path.join("/proc", String(pid), "comm"))
      .trim()
      .toLowerCase();
    if (command === "ghostty") return safeReadLink(path.join("/proc", String(pid), "exe"));
  }
  return "";
}

/** @returns {TerminalIdentity} */
export function unboundTerminalIdentity() {
  return {
    terminalKind: "unbound",
    terminalKey: "",
    terminalFamily: "",
    terminalSurfaceId: "",
  };
}

/**
 * Admit a terminal binding only for an interactive TUI attached to a real TTY and a recognized
 * Ghostty process family. Headless descendants commonly inherit Ghostty environment variables, so
 * GHOSTTY_SURFACE_ID alone is not evidence of an operator-visible terminal.
 * @param {TerminalIdentityOptions} [options]
 * @returns {TerminalIdentity}
 */
export function resolveTerminalIdentity({
  env = process.env,
  hasUI = false,
  stdinIsTTY = Boolean(process.stdin.isTTY),
  ttyPath = safeReadLink("/proc/self/fd/0"),
  processId = process.pid,
  ancestorExecutable,
} = {}) {
  if (
    !hasUI ||
    !stdinIsTTY ||
    !ttyPath.startsWith("/dev/") ||
    String(env.TERM_PROGRAM ?? "").toLowerCase() !== "ghostty"
  ) {
    return unboundTerminalIdentity();
  }
  const surfaceId = normalizeGhosttySurfaceId(env.GHOSTTY_SURFACE_ID);
  const executable = ancestorExecutable ?? findGhosttyAncestorExecutable(processId);
  const family = classifyGhosttyFamily(executable);
  if (!surfaceId || !family) return unboundTerminalIdentity();
  return {
    terminalKind: "ghostty-surface",
    terminalKey: `ghostty:${family}:${surfaceId}`,
    terminalFamily: family,
    terminalSurfaceId: surfaceId,
  };
}

/** @param {Partial<TerminalIdentity> | Record<string, unknown>} identity */
export function canonicalGhosttyTerminalKey(identity) {
  if (identity?.terminalKind !== "ghostty-surface") return "";
  const family = String(identity.terminalFamily ?? "");
  if (family !== "main" && family !== "legacy") return "";
  const surfaceId = normalizeGhosttySurfaceId(identity.terminalSurfaceId);
  if (!surfaceId) return "";
  const expectedKey = `ghostty:${family}:${surfaceId}`;
  return String(identity.terminalKey ?? "") === expectedKey ? expectedKey : "";
}

/** @param {Partial<TerminalIdentity> | Record<string, unknown>} identity */
export function terminalTitleSegment(identity) {
  if (!canonicalGhosttyTerminalKey(identity)) return "";
  return `gs:${identity.terminalFamily}:${normalizeGhosttySurfaceId(identity.terminalSurfaceId)}`;
}

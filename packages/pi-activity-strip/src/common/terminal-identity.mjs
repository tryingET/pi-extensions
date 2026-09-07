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
const HOST_PID_CACHE_LIMIT = 1024;

/** @typedef {{terminalKind: "ghostty-surface" | "unbound"; terminalKey: string; terminalFamily: string; terminalSurfaceId: string}} TerminalIdentity */
/** @typedef {{env?: NodeJS.ProcessEnv; hasUI?: boolean; stdinIsTTY?: boolean; ttyPath?: string; processId?: number; ancestorExecutable?: string}} TerminalIdentityOptions */
/** @typedef {{readFile: (filePath: string) => string; readLink: (filePath: string) => string}} ProcfsReader */

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

/** @type {ProcfsReader} */
const defaultProcfs = { readFile: safeReadFile, readLink: safeReadLink };

/**
 * Fields after the parenthesized command name in /proc/<pid>/stat: index 1 is the parent pid and
 * index 19 is the process start time in clock ticks since boot.
 * @param {number} pid
 * @param {ProcfsReader} procfs
 */
function readStatFields(pid, procfs) {
  const value = procfs.readFile(path.join("/proc", String(pid), "stat"));
  const lastParen = value.lastIndexOf(")");
  if (lastParen < 0) return [];
  return value
    .slice(lastParen + 2)
    .trim()
    .split(/\s+/);
}

/** @param {number} pid @param {ProcfsReader} [procfs] */
function readParentPid(pid, procfs = defaultProcfs) {
  const parentPid = Number.parseInt(readStatFields(pid, procfs)[1] ?? "", 10);
  return Number.isInteger(parentPid) && parentPid > 0 ? parentPid : 0;
}

/** @param {number} pid @param {ProcfsReader} [procfs] */
export function readProcessStartTime(pid, procfs = defaultProcfs) {
  const startTime = readStatFields(pid, procfs)[19] ?? "";
  return /^\d+$/.test(startTime) ? startTime : "";
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

/**
 * Walk the parent chain to the nearest live Ghostty process. That process owns every Wayland window
 * a tab of this terminal can live in, which makes it the placement authority for hidden tabs.
 * @param {number} [processId]
 * @param {ProcfsReader} [procfs]
 * @returns {{pid: number; executable: string} | null}
 */
export function findGhosttyAncestor(processId = process.pid, procfs = defaultProcfs) {
  let pid = Number(processId) || 0;
  for (let depth = 0; depth < 12 && pid > 0; depth += 1) {
    pid = readParentPid(pid, procfs);
    if (pid <= 0) break;
    const command = procfs
      .readFile(path.join("/proc", String(pid), "comm"))
      .trim()
      .toLowerCase();
    if (command === "ghostty") {
      return { pid, executable: procfs.readLink(path.join("/proc", String(pid), "exe")) };
    }
  }
  return null;
}

/** @param {number} [processId] @param {ProcfsReader} [procfs] */
export function findGhosttyAncestorExecutable(processId = process.pid, procfs = defaultProcfs) {
  return findGhosttyAncestor(processId, procfs)?.executable ?? "";
}

/**
 * Resolve the live Ghostty process hosting a bound terminal surface. The publisher process must
 * still exist and its Ghostty ancestor must belong to the admitted executable family; anything else
 * fails closed to 0. Results are cached per process start time so pid reuse cannot leak a stale host.
 * @param {Record<string, unknown>} session
 * @param {{procfs?: ProcfsReader; cache?: Map<string, number>}} [options]
 */
export function resolveTerminalHostPid(session, options = {}) {
  if (!canonicalGhosttyTerminalKey(session)) return 0;
  const processId = Number(session.processId ?? 0);
  if (!Number.isInteger(processId) || processId <= 0) return 0;
  const procfs = options.procfs ?? defaultProcfs;
  const startTime = readProcessStartTime(processId, procfs);
  if (!startTime) return 0;
  const cacheKey = `${processId}:${startTime}`;
  const cached = options.cache?.get(cacheKey);
  if (cached !== undefined) return cached;
  const ancestor = findGhosttyAncestor(processId, procfs);
  const hostPid =
    ancestor && classifyGhosttyFamily(ancestor.executable) === session.terminalFamily
      ? ancestor.pid
      : 0;
  if (options.cache) {
    if (options.cache.size >= HOST_PID_CACHE_LIMIT) options.cache.clear();
    options.cache.set(cacheKey, hostPid);
  }
  return hostPid;
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

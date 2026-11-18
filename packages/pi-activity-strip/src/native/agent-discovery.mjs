// ---
// summary: "scans procfs for terminal-based agent tabs and reads the Claude Code title that identifies their window"
// read_when:
//   - "changing agent tab discovery, its procfs evidence, or the Claude Code title adapter"
// ---

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  agentSessionRecord,
  classifyAgentProcess,
  isRuntimeCommand,
} from "../common/agent-identity.mjs";
import { claudeEventPath, mergeClaudeEvent } from "../common/claude-events.mjs";
import { parseClaudeTranscriptTail } from "../common/claude-transcript.mjs";
import { parseCodexRolloutTail } from "../common/codex-transcript.mjs";
import {
  classifyGhosttyFamily,
  findGhosttyAncestor,
  normalizeGhosttySurfaceId,
  readProcessStartTime,
} from "../common/terminal-identity.mjs";
import { readAgyTelemetry, resolveAgySession } from "./agy-discovery.mjs";
import { resolveClaudeRegistrySession } from "./claude-registry.mjs";
import {
  bindCodexThread,
  openRolloutPaths,
  readCodexThreads,
  resolveCodexStateDb,
} from "./codex-discovery.mjs";
import {
  nodecodeShellDirectory,
  nodecodeTelemetry,
  readNodecodeSessions,
  readNodecodeShell,
} from "./nodecode-discovery.mjs";

const CLOCK_TICKS_PER_SECOND = 100;
const CLAUDE_SCRATCHPAD =
  /\/claude-\d+\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/;
const CLAUDE_TITLE_TAIL_BYTES = 256 * 1024;
/** A title short enough to collide with an unrelated window is never used for placement. */
const MIN_PLACEABLE_TITLE_LENGTH = 6;
const TELEMETRY_CACHE_LIMIT = 64;
/** Parsed transcripts keyed by path and modification time, so an idle session is parsed once. */
const telemetryCache = new Map();

/** @typedef {{readFile: (filePath: string) => string; readLink: (filePath: string) => string; readDir: (filePath: string) => string[]; statMtimeMs: (filePath: string) => number; readTail: (filePath: string, bytes: number) => string; inodeOf?: (filePath: string) => string}} Procfs */

/** @type {Procfs} */
export const nodeProcfs = {
  readFile(filePath) {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return "";
    }
  },
  readLink(filePath) {
    try {
      return fs.readlinkSync(filePath);
    } catch {
      return "";
    }
  },
  readDir(filePath) {
    try {
      return fs.readdirSync(filePath);
    } catch {
      return [];
    }
  },
  statMtimeMs(filePath) {
    try {
      return fs.statSync(filePath).mtimeMs;
    } catch {
      return 0;
    }
  },
  inodeOf(filePath) {
    try {
      return String(fs.statSync(filePath).ino);
    } catch {
      return "";
    }
  },
  readTail(filePath, bytes) {
    let handle;
    try {
      handle = fs.openSync(filePath, "r");
      const size = fs.fstatSync(handle).size;
      const length = Math.min(size, bytes);
      const buffer = Buffer.alloc(length);
      fs.readSync(handle, buffer, 0, length, Math.max(0, size - length));
      return buffer.toString("utf8");
    } catch {
      return "";
    } finally {
      if (handle !== undefined) {
        try {
          fs.closeSync(handle);
        } catch {
          // The descriptor is already gone.
        }
      }
    }
  },
};

/** @param {string} raw */
function parseEnviron(raw) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const entry of raw.split("\0")) {
    const index = entry.indexOf("=");
    if (index > 0) env[entry.slice(0, index)] = entry.slice(index + 1);
  }
  return env;
}

/**
 * Read live session state from the tail of a Claude Code transcript. Results are cached against the
 * file's modification time, so a session that is not writing costs one stat call per scan.
 * @param {string} transcriptPath
 * @param {Procfs} procfs
 * @param {Map<string, {mtime: number; telemetry: import("../common/claude-transcript.mjs").ClaudeTelemetry}>} [cache]
 */
export function readClaudeTelemetry(transcriptPath, procfs = nodeProcfs, cache = telemetryCache) {
  const mtime = procfs.statMtimeMs(transcriptPath);
  const cached = cache.get(transcriptPath);
  if (cached && cached.mtime === mtime) return cached.telemetry;
  const telemetry = parseClaudeTranscriptTail(
    procfs.readTail(transcriptPath, CLAUDE_TITLE_TAIL_BYTES),
  );
  if (mtime > 0) {
    if (cache.size >= TELEMETRY_CACHE_LIMIT) cache.clear();
    cache.set(transcriptPath, { mtime, telemetry });
  }
  return telemetry;
}

/**
 * Live state for one Codex tab. The thread index names the session and its rollout; the rollout
 * tail reports what that session is doing now.
 * @param {{processId: number; cwd: string; startedAt: number}} process
 * @param {import("./codex-discovery.mjs").CodexThread[]} threads
 * @param {Procfs} procfs
 * @param {Map<string, any>} cache
 */
export function readCodexSession(process, threads, procfs, cache) {
  const thread = bindCodexThread(
    { ...process, openPaths: openRolloutPaths(process.processId, procfs) },
    threads,
  );
  if (!thread) return null;
  const mtime = procfs.statMtimeMs(thread.rolloutPath);
  const cached = cache.get(thread.rolloutPath);
  const telemetry =
    cached && cached.mtime === mtime
      ? cached.telemetry
      : parseCodexRolloutTail(procfs.readTail(thread.rolloutPath, CLAUDE_TITLE_TAIL_BYTES));
  if (mtime > 0 && (!cached || cached.mtime !== mtime)) {
    if (cache.size >= TELEMETRY_CACHE_LIMIT) cache.clear();
    cache.set(thread.rolloutPath, { mtime, telemetry });
  }
  return { thread, telemetry: { ...telemetry, title: thread.title || telemetry.title } };
}

/**
 * Read the newest hook record a Claude Code session published, if any. Hooks are the documented,
 * real-time source; the transcript remains the fallback for sessions started before hooks existed.
 * @param {string} sessionId
 * @param {Procfs} procfs
 */
export function readClaudeHookEvent(sessionId, procfs = nodeProcfs) {
  const filePath = claudeEventPath(sessionId);
  if (!filePath) return null;
  try {
    const parsed = JSON.parse(procfs.readFile(filePath));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Claude Code opens its per-session scratchpad, whose path carries the encoded working directory
 * and the session id. That is exact process-bound evidence of which conversation a tab is running.
 * @param {number} processId
 * @param {Procfs} procfs
 * @param {string} [homeDir]
 */
export function resolveClaudeSession(processId, procfs = nodeProcfs, homeDir = os.homedir()) {
  const fdDir = path.join("/proc", String(processId), "fd");
  for (const entry of procfs.readDir(fdDir)) {
    const target = procfs.readLink(path.join(fdDir, entry));
    const match = target.match(CLAUDE_SCRATCHPAD);
    if (!match) continue;
    const [, encodedCwd, sessionId] = match;
    const transcript = path.join(homeDir, ".claude", "projects", encodedCwd, `${sessionId}.jsonl`);
    return { sessionId, encodedCwd, transcript };
  }
  return null;
}

/** @param {Procfs} procfs */
function bootTimeMs(procfs) {
  const uptimeSeconds = Number.parseFloat(procfs.readFile("/proc/uptime").split(/\s+/)[0] ?? "");
  return Number.isFinite(uptimeSeconds) ? Date.now() - uptimeSeconds * 1000 : 0;
}

/** @param {number} processId @param {Procfs} procfs */
function parentPidOf(processId, procfs) {
  const stat = procfs.readFile(path.join("/proc", String(processId), "stat"));
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(/\s+/);
  const parent = Number.parseInt(fields[1] ?? "", 10);
  return Number.isInteger(parent) && parent > 0 ? parent : 0;
}

/**
 * @typedef {{processId: number; agent: {kind: string; label: string}; viaRuntime: boolean;
 *   surfaceId: string; family: string; hostPid: number}} AgentCandidate
 */

/**
 * One tab is one agent. An agent can start others inside its own tab — Claude Code its daemon,
 * Nodecode its gateway or a headless `claude`/`agy` turn, Codex's Node launcher its native binary —
 * and those inherit the tab's surface. A candidate with another candidate between it and the tab's
 * Ghostty process is that agent's child and is not a tab of its own, except when the outer one is
 * only a runtime launcher of the same agent: then the native process is the agent and the launcher
 * steps aside.
 * @param {AgentCandidate[]} candidates
 * @param {Procfs} procfs
 */
export function tabOwners(candidates, procfs) {
  const byPid = new Map(candidates.map((candidate) => [candidate.processId, candidate]));
  const dropped = new Set();
  for (const candidate of candidates) {
    let pid = parentPidOf(candidate.processId, procfs);
    for (let depth = 0; depth < 12 && pid > 0 && pid !== candidate.hostPid; depth += 1) {
      const outer = byPid.get(pid);
      if (outer) {
        if (outer.agent.kind === candidate.agent.kind && outer.viaRuntime) dropped.add(outer);
        else dropped.add(candidate);
        break;
      }
      pid = parentPidOf(pid, procfs);
    }
  }
  return candidates.filter((candidate) => !dropped.has(candidate));
}

/**
 * Discover every Ghostty tab running a recognized agent. A tab is admitted only with a bounded
 * Ghostty surface id, a live Ghostty ancestor of a known build family, and a recognized executable.
 * @param {{procfs?: Procfs; env?: NodeJS.ProcessEnv; homeDir?: string; now?: () => number; telemetryCache?: Map<string, any>; readNodecode?: typeof readNodecodeSessions; readAgySteps?: (databasePath: string) => import("../common/agy-conversation.mjs").AgyStepRow[]}} [options]
 */
export function discoverAgentTabs(options = {}) {
  const {
    procfs = nodeProcfs,
    env = process.env,
    homeDir = os.homedir(),
    now = Date.now,
    telemetryCache: cache = telemetryCache,
    readNodecode = readNodecodeSessions,
    readAgySteps,
  } = options;
  const boot = bootTimeMs(procfs);
  /** @type {AgentCandidate[]} */
  const candidates = [];
  for (const entry of procfs.readDir("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const processId = Number(entry);
    // The executable name is one tiny read, so it gates the far more expensive reads below. An
    // agent started through a runtime reports that runtime as its name, so those names — and only
    // those — are worth the second read of the command line.
    const command = procfs.readFile(path.join("/proc", entry, "comm")).trim();
    let agent = classifyAgentProcess({ command, env });
    let viaRuntime = false;
    if (!agent && (!command || isRuntimeCommand(command))) {
      const argv = procfs.readFile(path.join("/proc", entry, "cmdline")).split("\0");
      agent = classifyAgentProcess({ command, argv0: argv[0], argv1: argv[1], env });
      viaRuntime = Boolean(agent);
    }
    if (!agent) continue;
    const processEnv = parseEnviron(procfs.readFile(path.join("/proc", entry, "environ")));
    if (String(processEnv.TERM_PROGRAM ?? "").toLowerCase() !== "ghostty") continue;
    const surfaceId = normalizeGhosttySurfaceId(processEnv.GHOSTTY_SURFACE_ID);
    if (!surfaceId) continue;
    const ancestor = findGhosttyAncestor(processId, procfs);
    const family = classifyGhosttyFamily(ancestor?.executable);
    if (!family || !ancestor) continue;
    candidates.push({ processId, agent, viaRuntime, surfaceId, family, hostPid: ancestor.pid });
  }

  const owners = tabOwners(candidates, procfs);
  // Shared stores are read once per scan, and only when a tab of their agent is present.
  /** @type {import("./codex-discovery.mjs").CodexThread[] | null} */
  let codexThreads = null;
  const codexHome = String(env.CODEX_HOME ?? "").trim() || path.join(homeDir, ".codex");
  /** @type {string | undefined} */
  let locks;
  const shellDirectory = nodecodeShellDirectory(env);
  /** @type {Map<number, import("./nodecode-discovery.mjs").NodecodeShell>} */
  const nodecodeShells = new Map();

  const pending = owners.map((candidate) => {
    const { processId, agent } = candidate;
    const startTicks = String(readProcessStartTime(processId, procfs) || "");
    const startedAt =
      boot > 0 && Number(startTicks) > 0
        ? boot + (Number(startTicks) / CLOCK_TICKS_PER_SECOND) * 1000
        : now();
    const cwd = procfs.readLink(path.join("/proc", String(processId), "cwd"));
    let sessionKey = "";
    let titleSuffix = "";
    let lastEventAt = 0;
    /** @type {Partial<Omit<import("../common/claude-transcript.mjs").ClaudeTelemetry, "state"> & {state: string}> | null} */
    let telemetry = null;
    // A title only places a tab when the agent writes that title onto its terminal.
    let titleNamesTab = false;
    if (agent.kind === "codex") {
      if (codexThreads === null) codexThreads = readCodexThreads(resolveCodexStateDb(codexHome));
      const session = readCodexSession({ processId, cwd, startedAt }, codexThreads, procfs, cache);
      if (session) {
        sessionKey = session.thread.id;
        telemetry = session.telemetry;
        lastEventAt =
          session.telemetry.lastEventAt || procfs.statMtimeMs(session.thread.rolloutPath);
        titleNamesTab = true;
      }
    } else if (agent.kind === "claude") {
      const claude =
        resolveClaudeSession(processId, procfs, homeDir) ??
        resolveClaudeRegistrySession(processId, startTicks, procfs, homeDir);
      if (claude) {
        sessionKey = claude.sessionId;
        const merged = mergeClaudeEvent(
          claude.transcript
            ? readClaudeTelemetry(claude.transcript, procfs, cache)
            : parseClaudeTranscriptTail(""),
          readClaudeHookEvent(claude.sessionId, procfs),
          now(),
        );
        telemetry = merged;
        titleSuffix = merged.title;
        titleNamesTab = true;
        // The transcript's own newest timestamp is the true activity clock; its modification time
        // also moves for the latched records Claude Code rewrites without one.
        lastEventAt =
          merged.lastEventAt || (claude.transcript ? procfs.statMtimeMs(claude.transcript) : 0);
      }
    } else if (agent.kind === "agy") {
      if (locks === undefined) locks = procfs.readFile("/proc/locks");
      const session = resolveAgySession(processId, procfs, {
        locks,
        inodeOf: procfs.inodeOf?.bind(procfs),
      });
      if (session) {
        sessionKey = session.conversationId;
        const agy = readAgyTelemetry(session, procfs, cache, readAgySteps);
        telemetry = agy;
        lastEventAt = agy.lastEventAt;
      }
    } else if (agent.kind === "nodecode") {
      const shell = readNodecodeShell(processId, startTicks, shellDirectory, procfs);
      if (shell) {
        sessionKey = shell.sessionId;
        nodecodeShells.set(processId, shell);
      }
    }
    return {
      candidate,
      startedAt,
      cwd,
      sessionKey,
      titleSuffix,
      lastEventAt,
      telemetry,
      titleNamesTab,
    };
  });

  // Nodecode sessions are read per home, all of a home's tabs in one open of its store.
  /** @type {Map<string, string[]>} */
  const homes = new Map();
  for (const shell of nodecodeShells.values()) {
    if (!shell.home) continue;
    homes.set(shell.home, [...(homes.get(shell.home) ?? []), shell.sessionId]);
  }
  /** @type {Map<string, Map<string, import("./nodecode-discovery.mjs").NodecodeSessionRow>>} */
  const nodecodeRows = new Map();
  for (const [home, ids] of homes) nodecodeRows.set(home, readNodecode(home, ids));

  return pending.map((item) => {
    const { candidate } = item;
    let { telemetry, lastEventAt, titleSuffix } = item;
    const shell = nodecodeShells.get(candidate.processId);
    if (shell) {
      const row = nodecodeRows.get(shell.home)?.get(shell.sessionId);
      if (row) {
        const nodecode = nodecodeTelemetry(row);
        telemetry = nodecode;
        lastEventAt = nodecode.lastEventAt;
      }
    }
    const discoveredTitle = String(telemetry?.title ?? "");
    if (!item.titleNamesTab || discoveredTitle.length < MIN_PLACEABLE_TITLE_LENGTH)
      titleSuffix = "";
    else if (!titleSuffix) titleSuffix = discoveredTitle;
    return agentSessionRecord({
      kind: candidate.agent.kind,
      label: candidate.agent.label,
      processId: candidate.processId,
      cwd: item.cwd,
      terminalKey: `ghostty:${candidate.family}:${candidate.surfaceId}`,
      terminalFamily: candidate.family,
      terminalSurfaceId: candidate.surfaceId,
      sessionKey: item.sessionKey,
      titleSuffix,
      startedAt: item.startedAt,
      lastEventAt,
      now: now(),
      telemetry,
    });
  });
}

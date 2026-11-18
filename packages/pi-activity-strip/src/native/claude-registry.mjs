// ---
// summary: "binds a Claude Code process to its session through Claude Code's own per-process session registry"
// read_when:
//   - "changing how a Claude Code tab without an open scratchpad is identified"
// ---

import os from "node:os";
import path from "node:path";

const PATH_CACHE_LIMIT = 64;

/** @typedef {import("./agent-discovery.mjs").Procfs} Procfs */

/** Claude Code's own registry of live interactive sessions, one `<pid>.json` per process. */
const CLAUDE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Transcript paths found by search, keyed by session id; a transcript does not move. */
const claudeTranscriptPaths = new Map();

/**
 * Claude Code names the project directory of a transcript after the working directory, with every
 * character other than a letter or digit replaced by `-`.
 * @param {string} cwd
 */
export function claudeProjectDirectoryName(cwd) {
  return String(cwd ?? "").replace(/[^A-Za-z0-9]/g, "-");
}

/**
 * A resumed Claude Code session need not hold its scratchpad open, so the scratchpad cannot always
 * name it. Claude Code also registers every interactive process in `~/.claude/sessions/<pid>.json`
 * with the process's own /proc start ticks; a record whose start ticks are the live process's binds
 * that process to its session exactly, and a record left on a reused pid binds nothing.
 * @param {number} processId
 * @param {string} startTicks
 * @param {Procfs} procfs
 * @param {string} [homeDir]
 * @param {Map<string, string>} [paths]
 */
export function resolveClaudeRegistrySession(
  processId,
  startTicks,
  procfs,
  homeDir = os.homedir(),
  paths = claudeTranscriptPaths,
) {
  if (!/^\d+$/.test(String(startTicks ?? ""))) return null;
  let row;
  try {
    row = JSON.parse(
      procfs.readFile(path.join(homeDir, ".claude", "sessions", `${processId}.json`)) || "null",
    );
  } catch {
    return null;
  }
  const sessionId = String(row?.sessionId ?? "").toLowerCase();
  if (
    !row ||
    row.pid !== processId ||
    String(row.procStart ?? "") !== String(startTicks) ||
    !CLAUDE_UUID.test(sessionId)
  )
    return null;
  const projects = path.join(homeDir, ".claude", "projects");
  let transcript = paths.get(sessionId) ?? "";
  if (!transcript) {
    const direct = path.join(
      projects,
      claudeProjectDirectoryName(String(row.cwd ?? "")),
      `${sessionId}.jsonl`,
    );
    if (procfs.statMtimeMs(direct) > 0) transcript = direct;
    else {
      // A resumed conversation keeps the transcript of the directory it started in.
      for (const directory of procfs.readDir(projects)) {
        const candidate = path.join(projects, directory, `${sessionId}.jsonl`);
        if (procfs.statMtimeMs(candidate) > 0) {
          transcript = candidate;
          break;
        }
      }
    }
    if (transcript) {
      if (paths.size >= PATH_CACHE_LIMIT) paths.clear();
      paths.set(sessionId, transcript);
    }
  }
  return { sessionId, encodedCwd: "", transcript };
}

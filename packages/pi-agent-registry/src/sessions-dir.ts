// ---
// summary: resolves the ASC subagent sessions directory locally without importing pi host APIs into the compiled ASC graph.
// read_when:
//   - changing where dispatch_agent child sessions are recorded.
// ---

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_SESSION_DIR_ENV = "PI_CODING_AGENT_SESSION_DIR";
const PI_SUBAGENT_SESSIONS_ENV = "PI_SUBAGENT_SESSIONS_DIR";
const ASC_NATIVE_SUBAGENT_DIR = "asc-subagents";

function expandTilde(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

/**
 * Mirror of ASC's subagent-session-paths resolution, kept local so the
 * registry extension never pulls `@earendil-works/pi-coding-agent` into
 * ASC's compiled headless execution graph.
 *
 * Precedence: PI_SUBAGENT_SESSIONS_DIR -> PI_CODING_AGENT_SESSION_DIR ->
 * pi-native per-cwd session dir (+ asc-subagents).
 */
export function resolveRegistrySubagentSessionsDir(cwd?: string): string {
  const envDir = process.env[PI_SUBAGENT_SESSIONS_ENV]?.trim();
  if (envDir) {
    const path = expandTilde(envDir);
    mkdirSync(path, { recursive: true });
    return path;
  }

  const safeCwd = (cwd ?? process.cwd()).replace(/^[\\/]/, "").replace(/[\\/:]/g, "-");
  const sessionDirEnv = process.env[PI_SESSION_DIR_ENV]?.trim();
  const base = sessionDirEnv
    ? expandTilde(sessionDirEnv)
    : join(homedir(), ".pi", "agent", "sessions", `--${safeCwd}--`);
  const path = join(base, ASC_NATIVE_SUBAGENT_DIR);
  mkdirSync(path, { recursive: true });
  return path;
}

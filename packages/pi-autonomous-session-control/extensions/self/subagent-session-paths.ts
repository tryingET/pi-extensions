import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

const PI_SESSION_DIR_ENV = "PI_CODING_AGENT_SESSION_DIR";

export interface ResolvedSubagentSessionsDir {
  path: string;
  source: "explicit" | "env" | "pi-native";
}

export function expandTildePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

export function getPiNativeSessionDirForCwd(
  cwd: string,
  options?: { agentDir?: string; sessionDir?: string },
): string {
  const configuredSessionDir = options?.sessionDir?.trim();
  if (configuredSessionDir) {
    return expandTildePath(configuredSessionDir);
  }

  const safePath = `--${cwd.replace(/^[\\/]/, "").replace(/[\\/:]/g, "-")}--`;
  return join(options?.agentDir ?? getAgentDir(), "sessions", safePath);
}

export function resolveSubagentSessionsDir(options?: {
  explicitDir?: string;
  cwd?: string;
  agentDir?: string;
  sessionDirEnv?: string;
}): ResolvedSubagentSessionsDir {
  const explicitDir = options?.explicitDir?.trim();
  if (explicitDir) {
    const path = expandTildePath(explicitDir);
    mkdirSync(path, { recursive: true });
    return { path, source: "explicit" };
  }

  const envDir = process.env.PI_SUBAGENT_SESSIONS_DIR?.trim();
  if (envDir) {
    const path = expandTildePath(envDir);
    mkdirSync(path, { recursive: true });
    return { path, source: "env" };
  }

  const piSessionDir = options?.sessionDirEnv ?? process.env[PI_SESSION_DIR_ENV]?.trim();
  const path = getPiNativeSessionDirForCwd(options?.cwd ?? process.cwd(), {
    agentDir: options?.agentDir,
    sessionDir: piSessionDir,
  });
  mkdirSync(path, { recursive: true });
  return { path, source: "pi-native" };
}

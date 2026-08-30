import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
const PI_SESSION_DIR_ENV = "PI_CODING_AGENT_SESSION_DIR";
const ASC_NATIVE_SUBAGENT_DIR = "asc-subagents";

export interface ResolvedSubagentSessionsDir {
  path: string;
  source: "explicit" | "env" | "pi-native";
}

export function expandTildePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

export function resolvePiAgentDir(explicitAgentDir?: string): string {
  const configured = explicitAgentDir?.trim() || process.env[PI_AGENT_DIR_ENV]?.trim();
  return configured ? expandTildePath(configured) : join(homedir(), ".pi", "agent");
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
  return join(resolvePiAgentDir(options?.agentDir), "sessions", safePath);
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
  const path = join(
    getPiNativeSessionDirForCwd(options?.cwd ?? process.cwd(), {
      agentDir: options?.agentDir,
      sessionDir: piSessionDir,
    }),
    ASC_NATIVE_SUBAGENT_DIR,
  );
  mkdirSync(path, { recursive: true });
  return { path, source: "pi-native" };
}

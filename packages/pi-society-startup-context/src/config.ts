// Effective caller configuration is snapshotted once per collection; AK's gate owns DB selection.

import { createHash } from "node:crypto";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";

export function normalizePath(input: string): string {
  try {
    return realpathSync.native(input);
  } catch {
    return path.resolve(input);
  }
}
function boolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const value = env[key]?.trim().toLowerCase();
  if (["0", "false", "no", "off", "disabled"].includes(value || "")) return false;
  if (["1", "true", "yes", "on", "enabled"].includes(value || "")) return true;
  return fallback;
}
function integer(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = env[key]?.trim();
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647 ? parsed : fallback;
}
export function resolveExecutable(command: string, cwd: string, env: NodeJS.ProcessEnv): string {
  if (command.includes(path.sep)) return normalizePath(path.resolve(cwd, command));
  for (const directory of (env.PATH || "").split(path.delimiter)) {
    const candidate = path.resolve(cwd, directory || ".", command);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return normalizePath(candidate);
    } catch {
      /* continue PATH lookup */
    }
  }
  return command;
}
export interface ContextConfig {
  cwd: string;
  home: string;
  enabled: boolean;
  executable: string;
  env: NodeJS.ProcessEnv;
  commandTimeoutMs: number;
  refreshTimeoutMs: number;
  waitMs: number;
  ttlMs: number;
  retryBaseMs: number;
  retryCapMs: number;
  maxTasks: number;
  maxGitLines: number;
  maxWarnings: number;
  injectOutside: boolean;
  notifyOutside: boolean;
  fingerprint: string;
}
export function snapshotConfig(
  cwd: string,
  source: NodeJS.ProcessEnv = process.env,
): ContextConfig {
  const env = { ...source };
  const normalizedCwd = normalizePath(cwd);
  const config = {
    cwd: normalizedCwd,
    home: normalizePath(env.HOME || homedir()),
    enabled: boolean(env, "PI_SOCIETY_STARTUP_CONTEXT", true),
    executable: resolveExecutable(
      (env.PI_SOCIETY_CONTEXT_AK || env.AGENT_KERNEL)?.trim() || "ak",
      normalizedCwd,
      env,
    ),
    env,
    commandTimeoutMs: integer(env, "PI_SOCIETY_CONTEXT_COMMAND_TIMEOUT_MS", 45_000),
    refreshTimeoutMs: integer(env, "PI_SOCIETY_CONTEXT_REFRESH_TIMEOUT_MS", 120_000),
    waitMs: integer(env, "PI_SOCIETY_CONTEXT_FULL_WAIT_MS", 250),
    ttlMs: integer(env, "PI_SOCIETY_CONTEXT_TTL_MS", 300_000),
    retryBaseMs: integer(env, "PI_SOCIETY_CONTEXT_RETRY_BASE_MS", 15_000),
    retryCapMs: Math.min(120_000, integer(env, "PI_SOCIETY_CONTEXT_RETRY_CAP_MS", 120_000)),
    maxTasks: integer(env, "PI_SOCIETY_CONTEXT_MAX_TASKS", 5),
    maxGitLines: integer(env, "PI_SOCIETY_CONTEXT_MAX_GIT_LINES", 12),
    maxWarnings: integer(env, "PI_SOCIETY_CONTEXT_MAX_WARNINGS", 10),
    injectOutside: boolean(env, "PI_SOCIETY_CONTEXT_INJECT_OUTSIDE", false),
    notifyOutside: boolean(env, "PI_SOCIETY_CONTEXT_NOTIFY_OUTSIDE", false),
  };
  const { env: _env, ...identity } = config;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ ...identity, PATH: env.PATH || "", AK_DB: env.AK_DB ?? null }))
    .digest("hex");
  return { ...config, fingerprint };
}

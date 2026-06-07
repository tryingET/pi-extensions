import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { normalizeOptionalString, parseReportBack } from "./visibleLoopArgs.ts";
import { normalizeVisibleLoopCommandName } from "./visibleLoopProfiles.ts";
import type { VisibleLoopCommitDelegation, VisibleLoopRunConfig } from "./visibleLoopTypes.ts";

export function getVisibleLoopStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(stateHome, "pi-little-helpers", "visible-loop");
}

export function writeVisibleLoopRunConfig(
  config: VisibleLoopRunConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const dir = getVisibleLoopStateDir(env);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${config.runId}.json`);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return path;
}

export function getVisibleLoopStatusPath(
  configOrRunId: Pick<VisibleLoopRunConfig, "runId"> | string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const runId = typeof configOrRunId === "string" ? configOrRunId : configOrRunId.runId;
  return join(getVisibleLoopStateDir(env), `${runId}.status.jsonl`);
}

export function appendVisibleLoopStatus(
  config: VisibleLoopRunConfig,
  event: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  try {
    mkdirSync(getVisibleLoopStateDir(env), { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      runId: config.runId,
      ...event,
    };
    writeFileSync(getVisibleLoopStatusPath(config, env), `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      flag: "a",
    });
  } catch {
    // Status sidecar is diagnostic only. Never break the visible loop for it.
  }
}

export function loadVisibleLoopRunConfig(
  configPath: string,
  env: NodeJS.ProcessEnv,
): { ok: true; config: VisibleLoopRunConfig } | { ok: false; error: string } {
  const resolvedPath = resolve(configPath);
  const stateDir = resolve(getVisibleLoopStateDir(env));
  if (!isPathInsideOrEqual(stateDir, resolvedPath)) {
    return { ok: false, error: "config path is outside visible-loop state directory" };
  }

  if (!existsSync(resolvedPath)) {
    return { ok: false, error: "config file does not exist" };
  }

  try {
    const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
    return { ok: true, config: assertVisibleLoopRunConfig(parsed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function hasVisibleLoopAlreadyCompleted(
  config: VisibleLoopRunConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const statusPath = getVisibleLoopStatusPath(config, env);
  if (!existsSync(statusPath)) return false;
  try {
    return readFileSync(statusPath, "utf8")
      .split("\n")
      .some((line) => {
        if (!line.trim()) return false;
        try {
          const entry = JSON.parse(line) as { event?: unknown };
          return entry.event === "loop_completed";
        } catch {
          return false;
        }
      });
  } catch {
    return false;
  }
}

export function readCompletedVisibleLoopIterations(
  config: VisibleLoopRunConfig,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const statusPath = getVisibleLoopStatusPath(config, env);
  if (!existsSync(statusPath)) return 0;
  try {
    return readFileSync(statusPath, "utf8")
      .split("\n")
      .reduce((maxCompleted, line) => {
        if (!line.trim()) return maxCompleted;
        try {
          const entry = JSON.parse(line) as { event?: unknown; completedIterations?: unknown };
          if (entry.event !== "iteration_completed" && entry.event !== "loop_completed") {
            return maxCompleted;
          }
          const completed = Number(entry.completedIterations);
          return Number.isInteger(completed) && completed > maxCompleted ? completed : maxCompleted;
        } catch {
          return maxCompleted;
        }
      }, 0);
  } catch {
    return 0;
  }
}

function assertVisibleLoopRunConfig(value: unknown): VisibleLoopRunConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("VisibleLoopRunConfig must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) throw new TypeError("Unsupported visible-loop schemaVersion.");
  const runId = requireNonEmptyString(record.runId, "runId");
  const loopCount = requirePositiveInteger(record.loopCount, "loopCount");
  const cwd = requireNonEmptyString(record.cwd, "cwd");
  const prompts = Array.isArray(record.prompts)
    ? record.prompts.map((prompt, index) => requireNonEmptyString(prompt, `prompts[${index}]`))
    : undefined;
  if (!prompts || prompts.length === 0) throw new TypeError("prompts must be a non-empty array.");
  const reportBack = parseReportBack(String(record.reportBack ?? "manual"));
  if (!reportBack) throw new TypeError("reportBack must be intercom, manual, or none.");
  const commandName = normalizeVisibleLoopCommandName(record.commandName);
  const parentPeerTarget = normalizeOptionalString(record.parentPeerTarget);
  const commitDelegation = parseCommitDelegation(record.commitDelegation);
  const title = normalizeOptionalString(record.title);
  const createdAt = requireNonEmptyString(record.createdAt, "createdAt");

  return {
    schemaVersion: 1,
    runId,
    loopCount,
    cwd,
    ...(commandName ? { commandName } : {}),
    prompts,
    reportBack,
    ...(parentPeerTarget ? { parentPeerTarget } : {}),
    ...(commitDelegation ? { commitDelegation } : {}),
    ...(title ? { title } : {}),
    createdAt,
  };
}

function parseCommitDelegation(value: unknown): VisibleLoopCommitDelegation | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("commitDelegation must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (record.mode !== "dispatch_subagent" || record.promptTemplate !== "commit") {
    throw new TypeError(
      "commitDelegation must use mode=dispatch_subagent and promptTemplate=commit.",
    );
  }
  return { mode: "dispatch_subagent", promptTemplate: "commit" };
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new TypeError(`${label} must be an integer between 1 and 100.`);
  }
  return value;
}

function isPathInsideOrEqual(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent);
  const normalizedChild = resolve(child);
  if (normalizedParent === normalizedChild) return true;
  const rel = relative(normalizedParent, normalizedChild);
  return Boolean(rel) && !rel.startsWith("..") && !rel.includes(`..${sep}`) && !isAbsolute(rel);
}

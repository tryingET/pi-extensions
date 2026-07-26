import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseSelfEvolutionExecutionEnvelope } from "./selfEvolutionEnvelope.ts";
import { normalizeOptionalString, parseReportBack } from "./visibleLoopArgs.ts";
import { normalizeVisibleLoopCommandName } from "./visibleLoopProfiles.ts";
import type {
  VisibleLoopCommitDelegation,
  VisibleLoopProductPostureTarget,
  VisibleLoopRunConfig,
} from "./visibleLoopTypes.ts";

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

function getVisibleLoopGovernedPreflightAttemptPath(runId: string, env: NodeJS.ProcessEnv): string {
  const key = createHash("sha256").update(runId).digest("hex");
  return join(getVisibleLoopStateDir(env), "governed-preflight-attempts", `${key}.json`);
}

export function claimVisibleLoopGovernedPreflightAttempt(
  config: VisibleLoopRunConfig,
  nonce: string,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; error: string } {
  const attemptPath = getVisibleLoopGovernedPreflightAttemptPath(config.runId, env);
  const expected = { schemaVersion: 1, runId: config.runId, nonce };
  try {
    mkdirSync(join(getVisibleLoopStateDir(env), "governed-preflight-attempts"), {
      recursive: true,
      mode: 0o700,
    });
    writeFileSync(attemptPath, `${JSON.stringify(expected)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    const observed = JSON.parse(readFileSync(attemptPath, "utf8")) as Record<string, unknown>;
    if (JSON.stringify(observed) !== JSON.stringify(expected)) {
      throw new Error("governed preflight attempt claim read-back drift");
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function releaseVisibleLoopGovernedPreflightAttempt(
  config: VisibleLoopRunConfig,
  nonce: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const attemptPath = getVisibleLoopGovernedPreflightAttemptPath(config.runId, env);
  try {
    const stat = lstatSync(attemptPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    const observed = JSON.parse(readFileSync(attemptPath, "utf8")) as Record<string, unknown>;
    if (
      observed.schemaVersion !== 1 ||
      observed.runId !== config.runId ||
      observed.nonce !== nonce
    ) {
      return false;
    }
    rmSync(attemptPath);
    return !existsSync(attemptPath);
  } catch {
    return false;
  }
}

function writeVisibleLoopStatus(
  config: VisibleLoopRunConfig,
  event: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Record<string, unknown> {
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
  return entry;
}

export function appendVisibleLoopStatus(
  config: VisibleLoopRunConfig,
  event: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  try {
    writeVisibleLoopStatus(config, event, env);
  } catch {
    // Non-authoritative diagnostics must not break the visible loop.
  }
}

export function appendAuthoritativeVisibleLoopStatus(
  config: VisibleLoopRunConfig,
  event: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; error: string } {
  try {
    const statusPath = getVisibleLoopStatusPath(config, env);
    if (existsSync(statusPath)) {
      const before = readFileSync(statusPath, "utf8");
      if (before && !before.endsWith("\n")) {
        throw new Error("status ledger ends with a partial JSONL record");
      }
    }
    const expected = writeVisibleLoopStatus(config, event, env);
    const lines = readFileSync(statusPath, "utf8").trimEnd().split("\n");
    const observed = JSON.parse(lines.at(-1) ?? "") as Record<string, unknown>;
    if (
      observed.runId !== config.runId ||
      Object.entries(expected).some(
        ([key, value]) => JSON.stringify(observed[key]) !== JSON.stringify(value),
      )
    ) {
      throw new Error("authoritative status record could not be read back exactly");
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
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

export function hasVisibleLoopGovernedPreflightFailed(
  config: VisibleLoopRunConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const statusPath = getVisibleLoopStatusPath(config, env);
  if (!existsSync(statusPath)) return false;
  try {
    const status = readFileSync(statusPath, "utf8");
    if (status && !status.endsWith("\n")) return true;
    const pendingAttempts = new Set<string>();
    for (const line of status.split("\n")) {
      if (!line.trim()) continue;
      let entry: { event?: unknown; nonce?: unknown };
      try {
        entry = JSON.parse(line) as { event?: unknown; nonce?: unknown };
      } catch {
        return true;
      }
      if (entry.event === "governed_deep_review_preflight_failed_closed") return true;
      if (entry.event === "governed_deep_review_preflight_started") {
        if (typeof entry.nonce !== "string" || !entry.nonce.trim()) return true;
        pendingAttempts.add(entry.nonce);
      } else if (entry.event === "governed_deep_review_preflight_succeeded") {
        if (typeof entry.nonce !== "string" || !entry.nonce.trim()) return true;
        pendingAttempts.delete(entry.nonce);
      }
    }
    return pendingAttempts.size > 0;
  } catch {
    return true;
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
  const productPostureTarget = parseProductPostureTarget(record.productPostureTarget);
  const selfEvolutionEnvelope =
    record.selfEvolutionEnvelope === undefined
      ? undefined
      : parseSelfEvolutionExecutionEnvelope(record.selfEvolutionEnvelope);
  if (record.selfEvolutionEnvelope !== undefined && !selfEvolutionEnvelope) {
    throw new TypeError("selfEvolutionEnvelope is invalid.");
  }
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
    ...(productPostureTarget ? { productPostureTarget } : {}),
    ...(selfEvolutionEnvelope ? { selfEvolutionEnvelope } : {}),
    ...(title ? { title } : {}),
    createdAt,
  };
}

function parseProductPostureTarget(value: unknown): VisibleLoopProductPostureTarget | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("productPostureTarget must be an object.");
  }
  const record = value as Record<string, unknown>;
  const cwd = requireSingleLineAbsolutePath(record.cwd, "productPostureTarget.cwd");
  const productPosturePath = requireSingleLineAbsolutePath(
    record.productPosturePath,
    "productPostureTarget.productPosturePath",
  );
  const visionPath = requireSingleLineAbsolutePath(
    record.visionPath,
    "productPostureTarget.visionPath",
  );
  if (!isPathInsideOrEqual(cwd, productPosturePath)) {
    throw new TypeError("productPostureTarget.productPosturePath must be inside cwd.");
  }
  if (!isPathInsideOrEqual(cwd, visionPath)) {
    throw new TypeError("productPostureTarget.visionPath must be inside cwd.");
  }
  return {
    cwd,
    productPosturePath,
    productPostureExists: requireBoolean(
      record.productPostureExists,
      "productPostureTarget.productPostureExists",
    ),
    visionPath,
    visionExists: requireBoolean(record.visionExists, "productPostureTarget.visionExists"),
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

function requireSingleLineAbsolutePath(value: unknown, label: string): string {
  const text = requireNonEmptyString(value, label);
  if (/\r|\n/u.test(text)) throw new TypeError(`${label} must be a single-line path.`);
  if (!isAbsolute(text)) throw new TypeError(`${label} must be an absolute path.`);
  return text;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new TypeError(`${label} must be an integer between 1 and 100.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean.`);
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

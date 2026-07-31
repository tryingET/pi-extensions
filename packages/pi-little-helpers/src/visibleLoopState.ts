// summary: persists and validates visible-loop configs, controller state, completion history, and diagnostic status records.
// read_when:
//   - changing visible-loop state paths, serialized config validation, controller persistence, or completion recovery.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseSelfEvolutionExecutionEnvelope } from "./selfEvolutionEnvelope.ts";
import { normalizeOptionalString, parseReportBack } from "./visibleLoopArgs.ts";
import { assertControllerConfig, assertControllerState } from "./visibleLoopController.ts";
import { normalizeVisibleLoopCommandName } from "./visibleLoopProfiles.ts";
import type {
  VisibleLoopCommitDelegation,
  VisibleLoopControllerState,
  VisibleLoopExecutionBinding,
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
  const path = join(dir, `${requireSafeRunId(config.runId)}.json`);
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return path;
}

export function getVisibleLoopStatusPath(
  configOrRunId: Pick<VisibleLoopRunConfig, "runId"> | string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const runId = requireSafeRunId(
    typeof configOrRunId === "string" ? configOrRunId : configOrRunId.runId,
  );
  return join(getVisibleLoopStateDir(env), `${runId}.status.jsonl`);
}

export function getVisibleLoopControllerStatePath(
  configOrRunId: Pick<VisibleLoopRunConfig, "runId"> | string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const runId = requireSafeRunId(
    typeof configOrRunId === "string" ? configOrRunId : configOrRunId.runId,
  );
  return join(getVisibleLoopStateDir(env), `${runId}.controller.json`);
}

export function writeVisibleLoopControllerState(
  config: VisibleLoopRunConfig,
  state: VisibleLoopControllerState,
  env: NodeJS.ProcessEnv = process.env,
): void {
  assertControllerState(state);
  const path = getVisibleLoopControllerStatePath(config, env);
  const temporaryPath = `${path}.tmp`;
  mkdirSync(getVisibleLoopStateDir(env), { recursive: true });
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
}

export function loadVisibleLoopControllerState(
  config: VisibleLoopRunConfig,
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; state: VisibleLoopControllerState } | { ok: false; error: string } {
  const path = getVisibleLoopControllerStatePath(config, env);
  if (!existsSync(path)) return { ok: false, error: "controller state file does not exist" };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    assertControllerState(parsed);
    return { ok: true, state: parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
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
  const runId = requireSafeRunId(record.runId);
  const loopCount = requirePositiveInteger(record.loopCount, "loopCount");
  const cwd = requireNonEmptyString(record.cwd, "cwd");
  const prompts = Array.isArray(record.prompts)
    ? record.prompts.map((prompt, index) => requireNonEmptyString(prompt, `prompts[${index}]`))
    : undefined;
  if (!prompts || prompts.length === 0) throw new TypeError("prompts must be a non-empty array.");
  const reportBack = parseReportBack(String(record.reportBack ?? "manual"));
  if (!reportBack) throw new TypeError("reportBack must be intercom, manual, or none.");
  const executionBinding = parseExecutionBinding(record.executionBinding);
  const commandName = normalizeVisibleLoopCommandName(record.commandName);
  const parentPeerTarget = normalizeOptionalString(record.parentPeerTarget);
  const commitDelegation = parseCommitDelegation(record.commitDelegation);
  const adaptiveController = parseAdaptiveController(record.adaptiveController);
  const productPostureTarget = parseProductPostureTarget(record.productPostureTarget);
  const selfEvolutionEnvelope =
    record.selfEvolutionEnvelope === undefined
      ? undefined
      : parseSelfEvolutionExecutionEnvelope(record.selfEvolutionEnvelope);
  if (record.selfEvolutionEnvelope !== undefined && !selfEvolutionEnvelope) {
    throw new TypeError("selfEvolutionEnvelope is invalid.");
  }
  if (executionBinding.mode === "self_evolution_candidate") {
    if (
      !selfEvolutionEnvelope ||
      selfEvolutionEnvelope.candidateId !== executionBinding.candidateId
    ) {
      throw new TypeError(
        "self-evolution candidate binding requires a matching selfEvolutionEnvelope",
      );
    }
  } else if (selfEvolutionEnvelope) {
    throw new TypeError("selfEvolutionEnvelope requires self_evolution_candidate binding mode");
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
    executionBinding,
    ...(parentPeerTarget ? { parentPeerTarget } : {}),
    ...(commitDelegation ? { commitDelegation } : {}),
    ...(adaptiveController ? { adaptiveController } : {}),
    ...(productPostureTarget ? { productPostureTarget } : {}),
    ...(selfEvolutionEnvelope ? { selfEvolutionEnvelope } : {}),
    ...(title ? { title } : {}),
    createdAt,
  };
}

function parseExecutionBinding(value: unknown): VisibleLoopExecutionBinding {
  if (value === undefined || value === null) {
    throw new TypeError(
      "executionBinding is required; restart the loop with --task, --objective, or --candidate.",
    );
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("executionBinding must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (record.mode === "operator_objective") {
    const objective = requireNonEmptyString(record.objective, "executionBinding.objective");
    if (objective.length > 2_000 || objective.includes("\u0000")) {
      throw new TypeError("executionBinding.objective is invalid.");
    }
    return { mode: "operator_objective", objective };
  }
  if (record.mode === "ak_task") {
    const taskId = requireSafePositiveInteger(record.taskId, "executionBinding.taskId");
    return { mode: "ak_task", taskId };
  }
  if (record.mode === "self_evolution_candidate") {
    const candidateId = requireNonEmptyString(record.candidateId, "executionBinding.candidateId");
    if (candidateId.length > 160 || !/^evolution-[A-Za-z0-9._-]+$/u.test(candidateId)) {
      throw new TypeError("executionBinding.candidateId is invalid.");
    }
    return { mode: "self_evolution_candidate", candidateId };
  }
  throw new TypeError("executionBinding.mode is invalid.");
}

function parseAdaptiveController(value: unknown): VisibleLoopRunConfig["adaptiveController"] {
  if (value === undefined || value === null) return undefined;
  assertControllerConfig(value);
  return value;
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

function requireSafeRunId(value: unknown): string {
  const runId = requireNonEmptyString(value, "runId");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u.test(runId)) {
    throw new TypeError("runId must be a safe visible-loop identifier");
  }
  return runId;
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

function requireSafePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
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

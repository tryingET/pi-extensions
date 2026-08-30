import { execFileSync } from "node:child_process";
import path from "node:path";
import { superviseProcess } from "./process-supervisor.ts";

export interface BoundaryFailure {
  ok: false;
  error: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
}

export interface BoundarySuccess<T> {
  ok: true;
  value: T;
}

export type BoundaryResult<T> = BoundaryFailure | BoundarySuccess<T>;

export function isBoundaryFailure<T>(result: BoundaryResult<T>): result is BoundaryFailure {
  return result.ok === false;
}

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

export interface AsyncCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_BOUNDARY_TIMEOUT_MS =
  Number.parseInt(process.env.PI_ORCH_BOUNDARY_TIMEOUT_MS || "", 10) || 30_000;
const BOUNDARY_TELEMETRY_LIMIT = 200;

export interface BoundaryTelemetryEvent {
  timestamp: string;
  command: string;
  argsPreview: string;
  durationMs: number;
  success: boolean;
  exitCode?: number | null;
  error?: string;
}

export interface BoundaryTelemetryStats {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  retainedEvents: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  commandCounts: Record<string, number>;
}

export function getLatestBoundaryTelemetryFailure(): BoundaryTelemetryEvent | null {
  for (let index = boundaryTelemetry.events.length - 1; index >= 0; index -= 1) {
    const event = boundaryTelemetry.events[index];
    if (event && !event.success) {
      return event;
    }
  }
  return null;
}

function createBoundaryTelemetryState() {
  return {
    events: [] as BoundaryTelemetryEvent[],
    totalCalls: 0,
    successCount: 0,
    failureCount: 0,
    totalLatencyMs: 0,
    maxLatencyMs: 0,
    commandCounts: {} as Record<string, number>,
  };
}

const boundaryTelemetry = createBoundaryTelemetryState();

function buildBoundaryCommandLabel(command: string, args: string[]): string {
  const base = path.basename(command);
  if (base === "ak" || base === "rocs" || base === "dolt") {
    const firstArg = String(args.find((value) => !String(value).startsWith("-")) || "").trim();
    return firstArg ? `${base}:${firstArg}` : base;
  }
  return base;
}

function buildBoundaryArgsPreview(command: string, args: string[]): string {
  const base = path.basename(command);
  if (base === "dolt") {
    const queryIndex = args.indexOf("-q");
    if (queryIndex >= 0) {
      return String(args[queryIndex + 1] || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
    }
  }
  return args.map(String).join(" ").slice(0, 240);
}

function recordBoundaryTelemetryEvent(
  event: Omit<BoundaryTelemetryEvent, "timestamp"> & { timestamp?: string },
): void {
  const normalized: BoundaryTelemetryEvent = {
    timestamp: String(event.timestamp || new Date().toISOString()),
    command: String(event.command || "unknown"),
    argsPreview: String(event.argsPreview || ""),
    durationMs: Math.max(0, Number(event.durationMs || 0)),
    success: Boolean(event.success),
    ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
    ...(event.error ? { error: String(event.error) } : {}),
  };

  boundaryTelemetry.totalCalls += 1;
  boundaryTelemetry.totalLatencyMs += normalized.durationMs;
  boundaryTelemetry.maxLatencyMs = Math.max(boundaryTelemetry.maxLatencyMs, normalized.durationMs);
  if (normalized.success) boundaryTelemetry.successCount += 1;
  else boundaryTelemetry.failureCount += 1;
  boundaryTelemetry.commandCounts[normalized.command] =
    (boundaryTelemetry.commandCounts[normalized.command] || 0) + 1;
  boundaryTelemetry.events.push(normalized);
  if (boundaryTelemetry.events.length > BOUNDARY_TELEMETRY_LIMIT) {
    boundaryTelemetry.events.splice(0, boundaryTelemetry.events.length - BOUNDARY_TELEMETRY_LIMIT);
  }
}

export function resetBoundaryTelemetry(): void {
  boundaryTelemetry.events.length = 0;
  boundaryTelemetry.totalCalls = 0;
  boundaryTelemetry.successCount = 0;
  boundaryTelemetry.failureCount = 0;
  boundaryTelemetry.totalLatencyMs = 0;
  boundaryTelemetry.maxLatencyMs = 0;
  boundaryTelemetry.commandCounts = {};
}

export function listBoundaryTelemetry(limit = 20): BoundaryTelemetryEvent[] {
  const normalizedLimit = Math.max(
    1,
    Math.min(Math.floor(Number(limit) || 20), BOUNDARY_TELEMETRY_LIMIT),
  );
  return boundaryTelemetry.events.slice(-normalizedLimit);
}

export function getBoundaryTelemetryStats(): BoundaryTelemetryStats {
  return {
    totalCalls: boundaryTelemetry.totalCalls,
    successCount: boundaryTelemetry.successCount,
    failureCount: boundaryTelemetry.failureCount,
    retainedEvents: boundaryTelemetry.events.length,
    averageLatencyMs:
      boundaryTelemetry.totalCalls > 0
        ? boundaryTelemetry.totalLatencyMs / boundaryTelemetry.totalCalls
        : 0,
    maxLatencyMs: boundaryTelemetry.maxLatencyMs,
    commandCounts: { ...boundaryTelemetry.commandCounts },
  };
}

export function summarizeBoundaryTelemetry(): string {
  const stats = getBoundaryTelemetryStats();
  const recent = listBoundaryTelemetry(15);
  const commandCounts = Object.entries(stats.commandCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([command, count]) => `${command}=${count}`)
    .join(", ");
  const latestFailure = getLatestBoundaryTelemetryFailure();
  const lines = [
    "# Orchestrator Boundary Telemetry",
    "",
    `- total_calls: ${stats.totalCalls}`,
    `- success_count: ${stats.successCount}`,
    `- failure_count: ${stats.failureCount}`,
    `- retained_events: ${stats.retainedEvents}`,
    `- average_latency_ms: ${stats.averageLatencyMs.toFixed(1)}`,
    `- max_latency_ms: ${stats.maxLatencyMs.toFixed(1)}`,
    `- command_mix: ${commandCounts || "none"}`,
    `- latest_failure: ${latestFailure ? [latestFailure.timestamp, latestFailure.command, latestFailure.exitCode !== undefined ? `exit=${latestFailure.exitCode}` : undefined, latestFailure.error ? String(latestFailure.error).replace(/\s+/g, " ").trim().slice(0, 160) : undefined].filter(Boolean).join(" | ") : "none recorded"}`,
    "",
    "## Recent events",
  ];
  if (recent.length === 0) {
    lines.push("_No lower-plane boundary telemetry recorded yet._");
  } else {
    for (const event of recent) {
      const parts = [
        event.timestamp,
        event.success ? "ok" : "error",
        event.command,
        `${event.durationMs.toFixed(1)}ms`,
      ];
      if (event.exitCode !== undefined) parts.push(`exit=${event.exitCode}`);
      if (event.error) parts.push(`error=${event.error}`);
      if (event.argsPreview) parts.push(`args=${event.argsPreview}`);
      lines.push(`- ${parts.join(" | ")}`);
    }
  }
  return lines.join("\n");
}

function fail<T>(
  error: string,
  extras: Omit<BoundaryFailure, "ok" | "error"> = {},
): BoundaryResult<T> {
  return { ok: false, error, ...extras };
}

function getExecErrorField(error: unknown, field: "stderr" | "stdout"): string | undefined {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[field];
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf-8");
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

function getExecExitCode(error: unknown): number | null | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return status;
  }
  if (status === null) {
    return null;
  }
  return undefined;
}

export function execFileText(
  command: string,
  args: string[],
  options: CommandOptions = {},
): BoundaryResult<string> {
  const startedAt = Date.now();
  const commandLabel = buildBoundaryCommandLabel(command, args);
  const argsPreview = buildBoundaryArgsPreview(command, args);

  try {
    const value = execFileSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: "utf-8",
      maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
    });
    recordBoundaryTelemetryEvent({
      command: commandLabel,
      argsPreview,
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return { ok: true, value };
  } catch (error) {
    recordBoundaryTelemetryEvent({
      command: commandLabel,
      argsPreview,
      durationMs: Date.now() - startedAt,
      success: false,
      exitCode: getExecExitCode(error),
      error: error instanceof Error ? error.message : String(error),
    });
    return fail(error instanceof Error ? error.message : String(error), {
      exitCode: getExecExitCode(error),
      stderr: getExecErrorField(error, "stderr"),
      stdout: getExecErrorField(error, "stdout"),
    });
  }
}

export async function execFileTextAsync(
  command: string,
  args: string[],
  options: AsyncCommandOptions = {},
): Promise<BoundaryResult<string>> {
  const startedAt = Date.now();
  const commandLabel = buildBoundaryCommandLabel(command, args);
  const argsPreview = buildBoundaryArgsPreview(command, args);
  const result = await superviseProcess({
    command,
    args,
    cwd: options.cwd,
    env: options.env,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_BOUNDARY_TIMEOUT_MS,
    maxStdoutBytes: options.maxStdoutBytes ?? DEFAULT_MAX_BUFFER,
    maxStderrBytes: options.maxStderrBytes ?? DEFAULT_MAX_BUFFER,
  });

  if (result.exitCode === 0 && !result.aborted && !result.timedOut) {
    recordBoundaryTelemetryEvent({
      command: commandLabel,
      argsPreview,
      durationMs: Date.now() - startedAt,
      success: true,
      exitCode: result.exitCode,
    });
    return { ok: true, value: result.stdout };
  }

  recordBoundaryTelemetryEvent({
    command: commandLabel,
    argsPreview,
    durationMs: Date.now() - startedAt,
    success: false,
    exitCode: result.exitCode,
    error: result.stderr || result.error || `process exited with code ${result.exitCode}`,
  });

  return fail(result.stderr || result.error || `process exited with code ${result.exitCode}`, {
    exitCode: result.exitCode,
    stderr: result.stderr,
    stdout: result.stdout,
  });
}

export type JsonRecord = Record<string, unknown>;

export interface BoundaryCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

/**
 * Structural command runner accepted by strict machine reads.
 * Keeping this independent of `ak.ts` prevents a boundary/AK import cycle.
 */

export type BoundaryCommandRunner = (params: {
  akPath: string;
  societyDb: string;
  args: string[];
  cwd?: string;
  signal?: AbortSignal;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}) => Promise<BoundaryCommandResult>;

/** Runtime inputs shared by typed machine-surface adapters. */

export interface MachineReadCommandParams {
  akPath: string;
  societyDb: string;
  cwd?: string;
  signal?: AbortSignal;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  runCommand: BoundaryCommandRunner;
}

export interface MachineSurfaceContract {
  surface: string;
  schemaVersion: number;
  payloadKind: string;
}

/**
 * AK-specific read configuration remains data-only here; the caller supplies
 * the executable runner so this module never reaches back into AK ownership.
 */

export interface AkMachineReadParams {
  akPath: string;
  societyDb: string;
  cwd?: string;
  signal?: AbortSignal;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  runAk?: BoundaryCommandRunner;
}

/** Exact machine contracts consumed by the orchestrator runtime. */

export const AK_REPO_RESOLVE_CONTRACT: MachineSurfaceContract = {
  surface: "repo.resolve",
  schemaVersion: 1,
  payloadKind: "repo_resolution",
};

export const AK_EVIDENCE_TASK_CONTRACT: MachineSurfaceContract = {
  surface: "evidence.task",
  schemaVersion: 1,
  payloadKind: "evidence_collection",
};

export function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readJsonString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function readNullableJsonString(record: JsonRecord, key: string): string | null | undefined {
  const value = record[key];
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

export function readJsonInteger(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function boundedMachineText(value: string | undefined, limit = 500): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, limit) : undefined;
}

function describeMachineError(envelope: JsonRecord): string {
  const error = isJsonRecord(envelope.error) ? envelope.error : undefined;
  const code = error ? readJsonString(error, "code") : undefined;
  const message = error
    ? readJsonString(error, "message") || readJsonString(error, "summary")
    : undefined;
  return [code, message].filter(Boolean).join(": ") || "machine surface returned ok=false";
}

/**
 * Parse one standardized machine envelope and reject command/envelope,
 * surface, schema, payload-kind, or payload-shape contradictions.
 */

export function parseMachinePayload(
  result: BoundaryCommandResult,
  contract: MachineSurfaceContract,
): BoundaryResult<JsonRecord> {
  const stdout = result.stdout.trim();
  if (!stdout) {
    return fail(
      boundedMachineText(result.stderr) || `${contract.surface} emitted no machine envelope`,
      { stderr: boundedMachineText(result.stderr) },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    return fail(
      `${contract.surface} emitted invalid machine JSON: ${error instanceof Error ? error.message : String(error)}`,
      {
        stdout: stdout.slice(0, 1000),
        stderr: boundedMachineText(result.stderr),
      },
    );
  }

  if (!isJsonRecord(parsed)) {
    return fail(`${contract.surface} machine output was not an object`, {
      stdout: stdout.slice(0, 1000),
    });
  }
  if (parsed.surface !== contract.surface) {
    return fail(
      `${contract.surface} envelope reported unexpected surface ${String(parsed.surface)}`,
      { stdout: stdout.slice(0, 1000) },
    );
  }
  if (parsed.schema_version !== contract.schemaVersion) {
    return fail(
      `${contract.surface} envelope schema mismatch: expected ${contract.schemaVersion}, received ${String(parsed.schema_version)}`,
      { stdout: stdout.slice(0, 1000) },
    );
  }
  if (parsed.payload_kind !== contract.payloadKind) {
    return fail(
      `${contract.surface} payload kind mismatch: expected ${contract.payloadKind}, received ${String(parsed.payload_kind)}`,
      { stdout: stdout.slice(0, 1000) },
    );
  }
  if (parsed.ok !== true) {
    return fail(`${contract.surface} failed: ${describeMachineError(parsed)}`, {
      stdout: stdout.slice(0, 1000),
      stderr: boundedMachineText(result.stderr),
    });
  }
  if (!result.ok) {
    return fail(`${contract.surface} process failed despite an ok=true envelope`, {
      stdout: stdout.slice(0, 1000),
      stderr: boundedMachineText(result.stderr),
    });
  }
  if (!isJsonRecord(parsed.payload)) {
    return fail(`${contract.surface} envelope omitted its payload object`, {
      stdout: stdout.slice(0, 1000),
    });
  }

  return { ok: true, value: parsed.payload };
}

export async function runMachineRead(
  params: MachineReadCommandParams,
  args: string[],
  contract: MachineSurfaceContract,
): Promise<BoundaryResult<JsonRecord>> {
  const result = await params.runCommand({
    akPath: params.akPath,
    societyDb: params.societyDb,
    args,
    cwd: params.cwd,
    signal: params.signal,
    maxStdoutBytes: params.maxStdoutBytes,
    maxStderrBytes: params.maxStderrBytes,
  });
  return parseMachinePayload(result, contract);
}

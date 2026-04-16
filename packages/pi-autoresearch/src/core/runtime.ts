import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const AUTORESEARCH_COMMAND_NAME = "autoresearch";
export const AUTORESEARCH_STATUS_TOOL_NAME = "autoresearch_runtime_status";
export const AUTORESEARCH_RUN_TOOL_NAME = "autoresearch_runtime_run";
export const AUTORESEARCH_PHASE = "bounded_runtime_kernel" as const;

export const AUTORESEARCH_LOCAL_ARTIFACTS = [
  "autoresearch.jsonl",
  "autoresearch.md",
  "autoresearch.sh",
  "autoresearch.checks.sh",
  "autoresearch.ideas.md",
] as const;

export const READY_PROMPT_VAULT_TEMPLATES = [
  "pi-autoresearch-setup",
  "pi-autoresearch-next-hypothesis",
  "pi-autoresearch-finalize",
] as const;

export const BLOCKED_PROMPT_VAULT_TEMPLATES = ["pi-autoresearch-state-router"] as const;

const DEFAULT_BENCHMARK_TIMEOUT_SECONDS = 600;
const DEFAULT_CHECKS_TIMEOUT_SECONDS = 300;
const OUTPUT_TAIL_MAX_LINES = 20;
const OUTPUT_TAIL_MAX_BYTES = 4 * 1024;
const DENIED_METRIC_NAMES = new Set(["__proto__", "constructor", "prototype"]);

export type MetricDirection = "lower" | "higher";
export type RunStatus = "baseline" | "candidate" | "keep" | "discard" | "crash" | "checks_failed";
export type MetricMap = Record<string, number>;

export interface AutoresearchConfigReceipt {
  type: "config";
  version: 1;
  name: string;
  metricName: string;
  metricUnit: string;
  direction: MetricDirection;
  createdAt: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
}

export interface AutoresearchRunReceipt {
  type: "run";
  version: 1;
  status: RunStatus;
  metric: number;
  metrics: MetricMap;
  description: string;
  timestamp: number;
  commit?: string;
  iteration?: number;
  confidence?: number | null;
  durationSeconds?: number;
  exitCode?: number | null;
  timedOut?: boolean;
  benchmarkCommand?: string;
  checksCommand?: string | null;
  checksPassed?: boolean | null;
  checksDurationSeconds?: number | null;
}

export type AutoresearchReceipt = AutoresearchConfigReceipt | AutoresearchRunReceipt;

export interface AutoresearchSegmentSummary {
  configured: boolean;
  name: string | null;
  metricName: string | null;
  metricUnit: string;
  direction: MetricDirection | null;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  runCount: number;
  successfulRunCount: number;
  baselineMetric: number | null;
  bestMetric: number | null;
  confidence: number | null;
  lastRunStatus: RunStatus | null;
  lastRunMetric: number | null;
}

export interface AutoresearchRuntimeStatus {
  phase: typeof AUTORESEARCH_PHASE;
  cwd?: string;
  commandName: typeof AUTORESEARCH_COMMAND_NAME;
  toolNames: readonly [typeof AUTORESEARCH_STATUS_TOOL_NAME, typeof AUTORESEARCH_RUN_TOOL_NAME];
  localArtifacts: readonly string[];
  receiptEntryTypes: readonly ["config", "run"];
  readyPromptVaultTemplates: readonly string[];
  blockedPromptVaultTemplates: readonly string[];
  receiptPath?: string;
  hasReceiptLog: boolean;
  hasBenchmarkScript: boolean;
  hasChecksScript: boolean;
  invalidReceiptLines: number;
  currentSegment: AutoresearchSegmentSummary;
  nextSlices: readonly string[];
}

export interface CommandExecutionSummary {
  command: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
  durationSeconds: number;
  stdout: string;
  stderr: string;
  outputTail: string;
}

export interface ExecuteAutoresearchRunInput {
  cwd: string;
  description: string;
  name?: string;
  metricName?: string;
  metricUnit?: string;
  direction?: MetricDirection;
  benchmarkCommand?: string;
  checksCommand?: string | null;
  timeoutSeconds?: number;
  checksTimeoutSeconds?: number;
  reconfigure?: boolean;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchRunResult {
  cwd: string;
  receiptPath: string;
  createdConfig: boolean;
  configReceipt: AutoresearchConfigReceipt;
  runReceipt: AutoresearchRunReceipt;
  benchmark: CommandExecutionSummary;
  checks: CommandExecutionSummary | null;
  parsedMetrics: MetricMap;
  primaryMetricName: string;
  primaryMetric: number;
  status: AutoresearchRuntimeStatus;
}

interface ReceiptLoadResult {
  entries: AutoresearchReceipt[];
  invalidLineCount: number;
}

interface CurrentSegmentView {
  config: AutoresearchConfigReceipt | null;
  runs: AutoresearchRunReceipt[];
}

interface AutoresearchPaths {
  jsonlPath: string;
  benchmarkScriptPath: string;
  checksScriptPath: string;
}

export function parseMetricLines(output: string): MetricMap {
  const metrics: MetricMap = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^METRIC\s+([\w.µ:-]+)=(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!match) continue;
    const metricName = match[1];
    if (DENIED_METRIC_NAMES.has(metricName)) continue;
    metrics[metricName] = Number(match[2]);
  }

  return metrics;
}

export function createConfigReceipt(input: {
  name: string;
  metricName: string;
  metricUnit?: string;
  direction: MetricDirection;
  createdAt?: number;
  benchmarkCommand?: string;
  checksCommand?: string | null;
}): AutoresearchConfigReceipt {
  return {
    type: "config",
    version: 1,
    name: input.name,
    metricName: input.metricName,
    metricUnit: input.metricUnit ?? "",
    direction: input.direction,
    createdAt: input.createdAt ?? Date.now(),
    benchmarkCommand: input.benchmarkCommand,
    checksCommand: input.checksCommand ?? undefined,
  };
}

export function createRunReceipt(input: {
  status: RunStatus;
  metric: number;
  metrics?: MetricMap;
  description: string;
  timestamp?: number;
  commit?: string;
  iteration?: number;
  confidence?: number | null;
  durationSeconds?: number;
  exitCode?: number | null;
  timedOut?: boolean;
  benchmarkCommand?: string;
  checksCommand?: string | null;
  checksPassed?: boolean | null;
  checksDurationSeconds?: number | null;
}): AutoresearchRunReceipt {
  return {
    type: "run",
    version: 1,
    status: input.status,
    metric: input.metric,
    metrics: { ...(input.metrics ?? {}) },
    description: input.description,
    timestamp: input.timestamp ?? Date.now(),
    commit: input.commit,
    iteration: input.iteration,
    confidence: input.confidence ?? null,
    durationSeconds: input.durationSeconds,
    exitCode: input.exitCode,
    timedOut: input.timedOut,
    benchmarkCommand: input.benchmarkCommand,
    checksCommand: input.checksCommand,
    checksPassed: input.checksPassed,
    checksDurationSeconds: input.checksDurationSeconds,
  };
}

export function serializeReceipt(entry: AutoresearchReceipt): string {
  return JSON.stringify(entry);
}

export function parseReceiptLine(line: string): AutoresearchReceipt {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Receipt line must decode to an object");
  }
  if (parsed.type === "config") {
    return parseConfigReceipt(parsed);
  }
  if (parsed.type === "run") {
    return parseRunReceipt(parsed);
  }
  throw new Error(`Unsupported receipt type: ${String(parsed.type)}`);
}

export function resolveAutoresearchPaths(cwd: string): AutoresearchPaths {
  return {
    jsonlPath: path.join(cwd, "autoresearch.jsonl"),
    benchmarkScriptPath: path.join(cwd, "autoresearch.sh"),
    checksScriptPath: path.join(cwd, "autoresearch.checks.sh"),
  };
}

export function loadReceiptLog(cwd: string): ReceiptLoadResult {
  const { jsonlPath } = resolveAutoresearchPaths(cwd);
  if (!existsSync(jsonlPath)) {
    return { entries: [], invalidLineCount: 0 };
  }

  const contents = readFileSync(jsonlPath, "utf8");
  if (contents.trim().length === 0) {
    return { entries: [], invalidLineCount: 0 };
  }

  const entries: AutoresearchReceipt[] = [];
  let invalidLineCount = 0;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      entries.push(parseReceiptLine(line));
    } catch {
      invalidLineCount += 1;
    }
  }

  return { entries, invalidLineCount };
}

export function appendReceipt(cwd: string, entry: AutoresearchReceipt): void {
  const { jsonlPath } = resolveAutoresearchPaths(cwd);
  mkdirSync(path.dirname(jsonlPath), { recursive: true });
  appendFileSync(jsonlPath, `${serializeReceipt(entry)}\n`, "utf8");
}

export function buildAutoresearchRuntimeStatus(cwd?: string): AutoresearchRuntimeStatus {
  const paths = cwd ? resolveAutoresearchPaths(cwd) : null;
  const { entries, invalidLineCount } = cwd
    ? loadReceiptLog(cwd)
    : { entries: [], invalidLineCount: 0 };
  return buildAutoresearchRuntimeStatusFromEntries(cwd, paths, entries, invalidLineCount);
}

export function formatAutoresearchStatusText(status: AutoresearchRuntimeStatus): string {
  const currentSegmentLines = status.currentSegment.configured
    ? [
        `- configured campaign: ${status.currentSegment.name ?? "(unnamed)"}`,
        `- primary metric: ${status.currentSegment.metricName ?? "(unset)"} (${status.currentSegment.metricUnit || "unitless"}, ${status.currentSegment.direction ?? "unset"} is better)`,
        `- benchmark command: ${status.currentSegment.benchmarkCommand ?? "(unset)"}`,
        `- checks command: ${status.currentSegment.checksCommand ?? "(none)"}`,
        `- current-segment runs: ${status.currentSegment.runCount} total / ${status.currentSegment.successfulRunCount} successful`,
        `- baseline metric: ${formatMetricValue(status.currentSegment.baselineMetric, status.currentSegment.metricUnit)}`,
        `- best metric: ${formatMetricValue(status.currentSegment.bestMetric, status.currentSegment.metricUnit)}`,
        `- confidence: ${formatConfidenceValue(status.currentSegment.confidence)}`,
        `- last run: ${formatLastRun(status.currentSegment.lastRunStatus, status.currentSegment.lastRunMetric, status.currentSegment.metricUnit)}`,
      ]
    : [
        "- configured campaign: no",
        "- current-segment runs: 0 total / 0 successful",
        "- baseline metric: (n/a)",
        "- best metric: (n/a)",
        "- confidence: (n/a)",
        "- last run: (none)",
      ];

  return [
    "# PI-AUTORESEARCH STATUS",
    "",
    `- phase: ${status.phase}`,
    `- command: /${status.commandName}`,
    `- tools: ${status.toolNames.join(", ")}`,
    status.cwd ? `- cwd: ${status.cwd}` : "- cwd: (unset)",
    status.receiptPath ? `- receipt log: ${status.receiptPath}` : "- receipt log: (unresolved)",
    `- local artifacts: ${status.localArtifacts.join(", ")}`,
    `- receipt entry types: ${status.receiptEntryTypes.join(", ")}`,
    `- benchmark script present: ${status.hasBenchmarkScript ? "yes" : "no"}`,
    `- checks script present: ${status.hasChecksScript ? "yes" : "no"}`,
    `- invalid receipt lines: ${status.invalidReceiptLines}`,
    ...currentSegmentLines,
    `- ready Prompt Vault templates: ${status.readyPromptVaultTemplates.join(", ")}`,
    `- blocked Prompt Vault templates: ${status.blockedPromptVaultTemplates.join(", ")}`,
    `- next slices: ${status.nextSlices.join(", ")}`,
  ].join("\n");
}

export function buildAutoresearchHelpText(status: AutoresearchRuntimeStatus): string {
  const segment = status.currentSegment;
  const configurationBlock = segment.configured
    ? [
        "## Current bounded runtime",
        `- campaign: ${segment.name ?? "(unnamed)"}`,
        `- metric: ${segment.metricName ?? "(unset)"} (${segment.metricUnit || "unitless"}, ${segment.direction ?? "unset"} is better)`,
        `- benchmark command: ${segment.benchmarkCommand ?? "(unset)"}`,
        `- checks command: ${segment.checksCommand ?? "(none)"}`,
        `- current-segment runs: ${segment.runCount} total / ${segment.successfulRunCount} successful`,
        `- baseline: ${formatMetricValue(segment.baselineMetric, segment.metricUnit)}`,
        `- best: ${formatMetricValue(segment.bestMetric, segment.metricUnit)}`,
        `- confidence: ${formatConfidenceValue(segment.confidence)}`,
      ]
    : [
        "## Current bounded runtime",
        "- no config receipt yet",
        "- use autoresearch_runtime_run with name + metricName to bootstrap the first local segment",
      ];

  return [
    "# /autoresearch",
    "",
    "The bounded runtime kernel is available for local benchmark/check execution and append-only receipt logging.",
    "This package still does not own the autonomous loop, AK binding, or finalization workflow.",
    "",
    "## Available surfaces",
    `- command: /${status.commandName}`,
    `- tools: ${status.toolNames.join(", ")}`,
    "- use autoresearch_runtime_status to inspect the current bounded runtime state",
    "- use autoresearch_runtime_run to execute one bounded local run and append receipts",
    "",
    ...configurationBlock,
    "",
    "## Local artifact plan",
    ...status.localArtifacts.map((artifact) => `- ${artifact}`),
    "",
    "## Prompt Vault alignment",
    "Ready now:",
    ...status.readyPromptVaultTemplates.map((name) => `- ${name}`),
    "",
    "Blocked until governed router vocabulary expands:",
    ...status.blockedPromptVaultTemplates.map((name) => `- ${name}`),
    "",
    "## Next bounded slices",
    ...status.nextSlices.map((slice) => `- ${slice}`),
  ].join("\n");
}

export function formatAutoresearchRunResult(result: ExecuteAutoresearchRunResult): string {
  const metricUnit = result.status.currentSegment.metricUnit;
  const metrics = Object.entries(result.parsedMetrics)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `- ${name}=${value}`);

  const checksSummary = result.checks
    ? [
        `- checks: ${result.checks.command}`,
        `- checks exit: ${formatExit(result.checks.exitCode, result.checks.timedOut)} in ${result.checks.durationSeconds.toFixed(2)}s`,
      ]
    : ["- checks: (not run)"];

  return [
    "# PI-AUTORESEARCH RUN",
    "",
    `- cwd: ${result.cwd}`,
    `- receipt log: ${result.receiptPath}`,
    `- created config: ${result.createdConfig ? "yes" : "no"}`,
    `- run status: ${result.runReceipt.status}`,
    `- primary metric: ${result.primaryMetricName}=${formatMetricValue(result.primaryMetric, metricUnit)}`,
    `- benchmark: ${result.benchmark.command}`,
    `- benchmark exit: ${formatExit(result.benchmark.exitCode, result.benchmark.timedOut)} in ${result.benchmark.durationSeconds.toFixed(2)}s`,
    ...checksSummary,
    `- current baseline: ${formatMetricValue(result.status.currentSegment.baselineMetric, metricUnit)}`,
    `- current best: ${formatMetricValue(result.status.currentSegment.bestMetric, metricUnit)}`,
    `- confidence: ${formatConfidenceValue(result.status.currentSegment.confidence)}`,
    "",
    "## Parsed metrics",
    ...(metrics.length > 0 ? metrics : ["- (none)"]),
    "",
    "## Output tail",
    result.benchmark.outputTail.length > 0 ? result.benchmark.outputTail : "(no output)",
    ...(result.checks && result.checks.outputTail.length > 0
      ? ["", "## Checks output tail", result.checks.outputTail]
      : []),
  ].join("\n");
}

export async function executeAutoresearchRun(
  input: ExecuteAutoresearchRunInput,
): Promise<ExecuteAutoresearchRunResult> {
  const cwd = path.resolve(input.cwd);
  const description = input.description.trim();
  if (description.length === 0) {
    throw new Error("description is required");
  }

  const paths = resolveAutoresearchPaths(cwd);
  const loadResult = loadReceiptLog(cwd);
  const entries = [...loadResult.entries];
  let currentSegment = getCurrentSegment(entries);
  let config = currentSegment.config;
  let createdConfig = false;

  if (!config || input.reconfigure) {
    const initialConfig = createConfigFromInput(input, paths);
    entries.push(initialConfig);
    config = initialConfig;
    currentSegment = getCurrentSegment(entries);
    createdConfig = true;
  }

  if (!config) {
    throw new Error("Could not resolve a config receipt for this run");
  }

  const benchmarkCommand =
    input.benchmarkCommand ?? config.benchmarkCommand ?? defaultBenchmarkCommand(paths);
  if (!benchmarkCommand) {
    throw new Error(
      "No benchmark command available. Create autoresearch.sh or pass benchmarkCommand when bootstrapping the runtime.",
    );
  }

  const checksCommand = resolveChecksCommand(input.checksCommand, config.checksCommand, paths);
  const benchmark = await runShellCommand({
    command: benchmarkCommand,
    cwd,
    timeoutSeconds: input.timeoutSeconds ?? DEFAULT_BENCHMARK_TIMEOUT_SECONDS,
    signal: input.signal,
  });

  const parsedMetrics = parseMetricLines(joinOutput(benchmark));
  const metricName = config.metricName;
  const hasPrimaryMetric = hasOwn(parsedMetrics, metricName);
  const benchmarkSucceeded = benchmark.exitCode === 0 && !benchmark.timedOut;
  const metricContractFailed = benchmarkSucceeded && !hasPrimaryMetric;

  let checks: CommandExecutionSummary | null = null;
  let checksPassed: boolean | null = null;
  if (benchmarkSucceeded && !metricContractFailed && checksCommand) {
    checks = await runShellCommand({
      command: checksCommand,
      cwd,
      timeoutSeconds: input.checksTimeoutSeconds ?? DEFAULT_CHECKS_TIMEOUT_SECONDS,
      signal: input.signal,
    });
    checksPassed = checks.exitCode === 0 && !checks.timedOut;
  }

  const status = determineRunStatus({
    currentSegment,
    benchmarkSucceeded,
    metricContractFailed,
    checksPassed,
  });
  const primaryMetric = hasPrimaryMetric ? parsedMetrics[metricName] : 0;
  const runReceipt = createRunReceipt({
    status,
    metric: primaryMetric,
    metrics: parsedMetrics,
    description: decorateRunDescription(
      description,
      benchmarkSucceeded,
      metricContractFailed,
      checksPassed,
    ),
    timestamp: Date.now(),
    iteration: currentSegment.runs.length + 1,
    durationSeconds: benchmark.durationSeconds,
    exitCode: benchmark.exitCode,
    timedOut: benchmark.timedOut,
    benchmarkCommand,
    checksCommand,
    checksPassed,
    checksDurationSeconds: checks?.durationSeconds ?? null,
  });

  const nextEntries = [...entries, runReceipt];
  const nextStatus = buildAutoresearchRuntimeStatusFromEntries(
    cwd,
    paths,
    nextEntries,
    loadResult.invalidLineCount,
  );
  runReceipt.confidence = nextStatus.currentSegment.confidence;

  if (createdConfig) {
    appendReceipt(cwd, config);
  }
  appendReceipt(cwd, runReceipt);

  return {
    cwd,
    receiptPath: paths.jsonlPath,
    createdConfig,
    configReceipt: config,
    runReceipt,
    benchmark,
    checks,
    parsedMetrics,
    primaryMetricName: metricName,
    primaryMetric,
    status: buildAutoresearchRuntimeStatus(cwd),
  };
}

function createConfigFromInput(
  input: ExecuteAutoresearchRunInput,
  paths: AutoresearchPaths,
): AutoresearchConfigReceipt {
  const name = input.name?.trim();
  const metricName = input.metricName?.trim();
  if (!name) {
    throw new Error("name is required when bootstrapping or reconfiguring the bounded runtime");
  }
  if (!metricName) {
    throw new Error(
      "metricName is required when bootstrapping or reconfiguring the bounded runtime",
    );
  }

  const benchmarkCommand = input.benchmarkCommand ?? defaultBenchmarkCommand(paths);
  if (!benchmarkCommand) {
    throw new Error(
      "benchmarkCommand is required when no config receipt exists and autoresearch.sh is missing",
    );
  }

  const checksCommand = resolveChecksCommand(input.checksCommand, undefined, paths);
  return createConfigReceipt({
    name,
    metricName,
    metricUnit: input.metricUnit ?? "",
    direction: input.direction ?? "lower",
    benchmarkCommand,
    checksCommand,
  });
}

function resolveChecksCommand(
  requestedChecksCommand: string | null | undefined,
  configuredChecksCommand: string | null | undefined,
  paths: AutoresearchPaths,
): string | null {
  if (requestedChecksCommand === null) return null;
  return requestedChecksCommand ?? configuredChecksCommand ?? defaultChecksCommand(paths);
}

function defaultBenchmarkCommand(paths: AutoresearchPaths): string | null {
  return existsSync(paths.benchmarkScriptPath) ? "bash autoresearch.sh" : null;
}

function defaultChecksCommand(paths: AutoresearchPaths): string | null {
  return existsSync(paths.checksScriptPath) ? "bash autoresearch.checks.sh" : null;
}

function determineRunStatus(input: {
  currentSegment: CurrentSegmentView;
  benchmarkSucceeded: boolean;
  metricContractFailed: boolean;
  checksPassed: boolean | null;
}): RunStatus {
  if (!input.benchmarkSucceeded || input.metricContractFailed) {
    return "crash";
  }
  if (input.checksPassed === false) {
    return "checks_failed";
  }
  const hasSuccessfulRun = input.currentSegment.runs.some(isSuccessfulMetricRun);
  return hasSuccessfulRun ? "candidate" : "baseline";
}

function decorateRunDescription(
  description: string,
  benchmarkSucceeded: boolean,
  metricContractFailed: boolean,
  checksPassed: boolean | null,
): string {
  if (!benchmarkSucceeded) {
    return `${description} (benchmark failed or timed out)`;
  }
  if (metricContractFailed) {
    return `${description} (primary metric missing)`;
  }
  if (checksPassed === false) {
    return `${description} (checks failed)`;
  }
  return description;
}

async function runShellCommand(input: {
  command: string;
  cwd: string;
  timeoutSeconds: number;
  signal?: AbortSignal;
}): Promise<CommandExecutionSummary> {
  input.signal?.throwIfAborted();
  const startedAt = Date.now();

  return await new Promise<CommandExecutionSummary>((resolve, reject) => {
    const child = spawn(input.command, {
      cwd: input.cwd,
      shell: true,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) {
        clearTimeout(killTimer);
      }
      input.signal?.removeEventListener("abort", onAbort);
    };

    const terminate = (signal: NodeJS.Signals) => {
      killTree(child.pid, signal);
    };

    const requestTermination = (mode: "timeout" | "abort") => {
      if (mode === "timeout") {
        timedOut = true;
      } else {
        aborted = true;
      }
      terminate("SIGTERM");
      killTimer = setTimeout(() => {
        terminate("SIGKILL");
      }, 250);
    };

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (aborted) {
        reject(new Error(`Command aborted: ${input.command}`));
        return;
      }
      resolve({
        command: input.command,
        exitCode,
        timedOut,
        aborted,
        durationSeconds: (Date.now() - startedAt) / 1000,
        stdout,
        stderr,
        outputTail: tailText(joinOutput({ stdout, stderr })),
      });
    };

    const onAbort = () => {
      requestTermination("abort");
    };

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      stderr += error instanceof Error ? error.message : String(error);
      finish(null);
    });

    child.on("close", (code) => {
      finish(code);
    });

    input.signal?.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      requestTermination("timeout");
    }, Math.max(1, input.timeoutSeconds) * 1000);
  });
}

function buildAutoresearchRuntimeStatusFromEntries(
  cwd: string | undefined,
  paths: AutoresearchPaths | null,
  entries: AutoresearchReceipt[],
  invalidLineCount: number,
): AutoresearchRuntimeStatus {
  const currentSegment = summarizeCurrentSegment(getCurrentSegment(entries));
  return {
    phase: AUTORESEARCH_PHASE,
    cwd,
    commandName: AUTORESEARCH_COMMAND_NAME,
    toolNames: [AUTORESEARCH_STATUS_TOOL_NAME, AUTORESEARCH_RUN_TOOL_NAME],
    localArtifacts: [...AUTORESEARCH_LOCAL_ARTIFACTS],
    receiptEntryTypes: ["config", "run"],
    readyPromptVaultTemplates: [...READY_PROMPT_VAULT_TEMPLATES],
    blockedPromptVaultTemplates: [...BLOCKED_PROMPT_VAULT_TEMPLATES],
    receiptPath: paths?.jsonlPath,
    hasReceiptLog: paths ? existsSync(paths.jsonlPath) : false,
    hasBenchmarkScript: paths ? existsSync(paths.benchmarkScriptPath) : false,
    hasChecksScript: paths ? existsSync(paths.checksScriptPath) : false,
    invalidReceiptLines: invalidLineCount,
    currentSegment,
    nextSlices: ["ak_campaign_binding", "safer_finalization_path", "shared_ux_integration"],
  };
}

function summarizeCurrentSegment(currentSegment: CurrentSegmentView): AutoresearchSegmentSummary {
  const successfulRuns = currentSegment.runs.filter(isSuccessfulMetricRun);
  const baselineMetric = successfulRuns[0]?.metric ?? null;
  let bestMetric = baselineMetric;

  if (currentSegment.config) {
    for (const run of successfulRuns) {
      if (
        bestMetric === null ||
        isBetter(run.metric, bestMetric, currentSegment.config.direction)
      ) {
        bestMetric = run.metric;
      }
    }
  }

  return {
    configured: currentSegment.config !== null,
    name: currentSegment.config?.name ?? null,
    metricName: currentSegment.config?.metricName ?? null,
    metricUnit: currentSegment.config?.metricUnit ?? "",
    direction: currentSegment.config?.direction ?? null,
    benchmarkCommand: currentSegment.config?.benchmarkCommand ?? null,
    checksCommand: currentSegment.config?.checksCommand ?? null,
    runCount: currentSegment.runs.length,
    successfulRunCount: successfulRuns.length,
    baselineMetric,
    bestMetric,
    confidence:
      currentSegment.config && successfulRuns.length > 0
        ? computeConfidence(successfulRuns, currentSegment.config.direction)
        : null,
    lastRunStatus: currentSegment.runs.at(-1)?.status ?? null,
    lastRunMetric: currentSegment.runs.at(-1)?.metric ?? null,
  };
}

function getCurrentSegment(entries: AutoresearchReceipt[]): CurrentSegmentView {
  let config: AutoresearchConfigReceipt | null = null;
  let runs: AutoresearchRunReceipt[] = [];

  for (const entry of entries) {
    if (entry.type === "config") {
      config = entry;
      runs = [];
      continue;
    }
    if (config) {
      runs.push(entry);
    }
  }

  return { config, runs };
}

function parseConfigReceipt(value: Record<string, unknown>): AutoresearchConfigReceipt {
  if (value.version !== 1) {
    throw new Error(`Unsupported config receipt version: ${String(value.version)}`);
  }
  if (value.direction !== "lower" && value.direction !== "higher") {
    throw new Error(`Invalid metric direction: ${String(value.direction)}`);
  }
  if (typeof value.name !== "string" || typeof value.metricName !== "string") {
    throw new Error("Config receipt requires string name and metricName fields");
  }
  return {
    type: "config",
    version: 1,
    name: value.name,
    metricName: value.metricName,
    metricUnit: typeof value.metricUnit === "string" ? value.metricUnit : "",
    direction: value.direction,
    createdAt: coerceNumber(value.createdAt, "createdAt"),
    benchmarkCommand:
      typeof value.benchmarkCommand === "string" ? value.benchmarkCommand : undefined,
    checksCommand:
      typeof value.checksCommand === "string"
        ? value.checksCommand
        : value.checksCommand === null
          ? null
          : undefined,
  };
}

function parseRunReceipt(value: Record<string, unknown>): AutoresearchRunReceipt {
  if (value.version !== 1) {
    throw new Error(`Unsupported run receipt version: ${String(value.version)}`);
  }
  if (!isRunStatus(value.status)) {
    throw new Error(`Invalid run status: ${String(value.status)}`);
  }
  if (typeof value.description !== "string") {
    throw new Error("Run receipt requires a string description field");
  }
  return {
    type: "run",
    version: 1,
    status: value.status,
    metric: coerceNumber(value.metric, "metric"),
    metrics: parseMetricMap(value.metrics),
    description: value.description,
    timestamp: coerceNumber(value.timestamp, "timestamp"),
    commit: typeof value.commit === "string" ? value.commit : undefined,
    iteration: typeof value.iteration === "number" ? value.iteration : undefined,
    confidence:
      typeof value.confidence === "number" && Number.isFinite(value.confidence)
        ? value.confidence
        : value.confidence === null
          ? null
          : null,
    durationSeconds:
      typeof value.durationSeconds === "number" && Number.isFinite(value.durationSeconds)
        ? value.durationSeconds
        : undefined,
    exitCode:
      typeof value.exitCode === "number" && Number.isFinite(value.exitCode)
        ? value.exitCode
        : value.exitCode === null
          ? null
          : undefined,
    timedOut: typeof value.timedOut === "boolean" ? value.timedOut : undefined,
    benchmarkCommand:
      typeof value.benchmarkCommand === "string" ? value.benchmarkCommand : undefined,
    checksCommand:
      typeof value.checksCommand === "string"
        ? value.checksCommand
        : value.checksCommand === null
          ? null
          : undefined,
    checksPassed:
      typeof value.checksPassed === "boolean"
        ? value.checksPassed
        : value.checksPassed === null
          ? null
          : undefined,
    checksDurationSeconds:
      typeof value.checksDurationSeconds === "number" &&
      Number.isFinite(value.checksDurationSeconds)
        ? value.checksDurationSeconds
        : value.checksDurationSeconds === null
          ? null
          : undefined,
  };
}

function parseMetricMap(value: unknown): MetricMap {
  if (!isRecord(value)) return {};
  const metrics: MetricMap = {};
  for (const [key, entry] of Object.entries(value)) {
    if (DENIED_METRIC_NAMES.has(key)) continue;
    if (typeof entry === "number" && Number.isFinite(entry)) {
      metrics[key] = entry;
    }
  }
  return metrics;
}

function coerceNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Receipt field ${field} must be a finite number`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRunStatus(value: unknown): value is RunStatus {
  return (
    value === "baseline" ||
    value === "candidate" ||
    value === "keep" ||
    value === "discard" ||
    value === "crash" ||
    value === "checks_failed"
  );
}

function isSuccessfulMetricRun(run: AutoresearchRunReceipt): boolean {
  return (
    run.status !== "crash" &&
    run.status !== "checks_failed" &&
    typeof run.metric === "number" &&
    Number.isFinite(run.metric)
  );
}

function isBetter(current: number, best: number, direction: MetricDirection): boolean {
  return direction === "lower" ? current < best : current > best;
}

function computeConfidence(
  runs: AutoresearchRunReceipt[],
  direction: MetricDirection,
): number | null {
  if (runs.length < 3) return null;

  const values = runs.map((run) => run.metric);
  const baseline = runs[0]?.metric;
  if (baseline === undefined) return null;

  let best = baseline;
  for (const value of values) {
    if (isBetter(value, best, direction)) {
      best = value;
    }
  }
  if (best === baseline) return null;

  const median = sortedMedian(values);
  const deviations = values.map((value) => Math.abs(value - median));
  const mad = sortedMedian(deviations);
  if (mad === 0) return null;

  return Math.abs(best - baseline) / mad;
}

function sortedMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

function tailText(text: string): string {
  const lines = text.split(/\r?\n/).slice(-OUTPUT_TAIL_MAX_LINES).join("\n");
  const bytes = Buffer.from(lines, "utf8");
  if (bytes.length <= OUTPUT_TAIL_MAX_BYTES) {
    return lines.trim();
  }
  return bytes
    .subarray(bytes.length - OUTPUT_TAIL_MAX_BYTES)
    .toString("utf8")
    .trim();
}

function killTree(pid: number | undefined, signal: NodeJS.Signals = "SIGTERM"): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

function joinOutput(output: { stdout: string; stderr: string }): string {
  return [output.stdout, output.stderr].filter(Boolean).join("\n").trim();
}

function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) return "(n/a)";
  return `${value}${unit}`;
}

function formatConfidenceValue(value: number | null): string {
  if (value === null) return "(n/a)";
  return `${value.toFixed(2)}x`;
}

function formatLastRun(status: RunStatus | null, metric: number | null, unit: string): string {
  if (!status) return "(none)";
  return `${status} @ ${formatMetricValue(metric, unit)}`;
}

function formatExit(exitCode: number | null, timedOut: boolean): string {
  if (timedOut) return "timeout";
  if (exitCode === null) return "signal/error";
  return `exit ${exitCode}`;
}

function hasOwn(record: MetricMap, key: string): boolean {
  return Object.hasOwn(record, key);
}

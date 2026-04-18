import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  CampaignMachineInput,
  CampaignMachineResumeState,
  CampaignMachineStateValue,
} from "../machine/campaign.ts";
import {
  canCampaignMachineStartBoundedRun,
  isCampaignMachineAwaitingOperatorChoice,
  isCampaignMachineTerminalState,
} from "../machine/campaign.ts";
import {
  type CampaignDecision,
  type CampaignSegmentConfig,
  campaignEvents,
  isCampaignDecision,
} from "../machine/events.ts";
import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  type AutoresearchDecisionFailureStage,
  type AutoresearchDecisionRuntime,
  type FinalizeDecisionOutcome,
  type FinalizeDecisionPacket,
  mapNextHypothesisOutcomeToCampaignDecision,
  type NextHypothesisDecisionOutcome,
  type NextHypothesisDecisionPacket,
  type NextHypothesisDecisionStatus,
  type SetupDecisionOutcome,
  type SetupDecisionPacket,
} from "./decisions.ts";
import {
  AUTORESEARCH_EVENT_LEDGER_FILE,
  type AutoresearchLedgerEventEntry,
  type AutoresearchLedgerReplayIssue,
  appendLedgerEvent,
  createLedgerEventEntry,
  loadAutoresearchLedger,
  projectAutoresearchLedger,
  projectAutoresearchLedgerEntries,
  resolveAutoresearchLedgerPath,
} from "./ledger.ts";
import { AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME } from "./llamacppCampaign.ts";
import {
  AUTORESEARCH_OPERATOR_ACTIONS,
  AUTORESEARCH_RUNTIME_SNAPSHOT_FILE,
  type AutoresearchControlStateV1,
  type AutoresearchOperatorAction,
  type AutoresearchRuntimeSnapshotInput,
  type AutoresearchRuntimeSnapshotStatus,
  deriveAutoresearchControlState,
  formatAutoresearchRuntimeSnapshotReuse,
  loadAutoresearchRuntimeControlState,
  persistAutoresearchRuntimeSnapshot,
} from "./resume.ts";

export const AUTORESEARCH_COMMAND_NAME = "autoresearch";
export const AUTORESEARCH_STATUS_TOOL_NAME = "autoresearch_runtime_status";
export const AUTORESEARCH_RUN_TOOL_NAME = "autoresearch_runtime_run";
export const AUTORESEARCH_CONTROL_TOOL_NAME = "autoresearch_runtime_control";
export const AUTORESEARCH_FINALIZE_TOOL_NAME = "autoresearch_runtime_finalize";
export const AUTORESEARCH_PHASE = "bounded_runtime_kernel" as const;

export const AUTORESEARCH_LOCAL_ARTIFACTS = [
  "autoresearch.jsonl",
  AUTORESEARCH_EVENT_LEDGER_FILE,
  AUTORESEARCH_RUNTIME_SNAPSHOT_FILE,
  "autoresearch.finalization.json",
  "autoresearch.md",
  "autoresearch.sh",
  "autoresearch.checks.sh",
  "autoresearch.ideas.md",
] as const;

export const READY_PROMPT_VAULT_TEMPLATES = [
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
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

export interface AutoresearchRunDecisionSummary {
  kind: "next_hypothesis";
  templateName: typeof AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME;
  status: NextHypothesisDecisionStatus;
  mappedDecision: CampaignDecision;
  blockingReason: string | null;
  failureStage: AutoresearchDecisionFailureStage | null;
  stateRead: string | null;
  nextHypothesis: string | null;
  targetFiles: string[];
  expectedPrimaryEffect: string | null;
  timestamp: number;
}

export type AutoresearchPromptVaultDecisionAvailability =
  | "available_not_yet_used"
  | "available_last_used_successfully"
  | "available_last_used_blocked";

export interface AutoresearchPromptVaultDecisionStatus {
  availability: AutoresearchPromptVaultDecisionAvailability;
  lastPostRunDecision: AutoresearchRunDecisionSummary | null;
}

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
  decision?: AutoresearchRunDecisionSummary | null;
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

export interface AutoresearchRuntimeProjection {
  state: CampaignMachineStateValue;
  resumeState: CampaignMachineResumeState | null;
  blockedReason: string | null;
  completionReason: string | null;
  source: "ledger" | "receipt_fallback";
  ledgerPath?: string;
  hasLedger: boolean;
  invalidLedgerLines: number;
  eventCount: number;
  replayedEventCount: number;
  rejectedEvents: readonly AutoresearchLedgerReplayIssue[];
  syncIssues: readonly string[];
}

export interface AutoresearchRuntimeStatus {
  phase: typeof AUTORESEARCH_PHASE;
  cwd?: string;
  commandName: typeof AUTORESEARCH_COMMAND_NAME;
  toolNames: readonly [
    typeof AUTORESEARCH_STATUS_TOOL_NAME,
    typeof AUTORESEARCH_RUN_TOOL_NAME,
    typeof AUTORESEARCH_CONTROL_TOOL_NAME,
    typeof AUTORESEARCH_FINALIZE_TOOL_NAME,
    typeof AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  ];
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
  runtimeProjection: AutoresearchRuntimeProjection;
  runtimeSnapshot: AutoresearchRuntimeSnapshotStatus;
  control: AutoresearchControlStateV1;
  promptVaultDecisions: AutoresearchPromptVaultDecisionStatus;
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

export interface ExecuteAutoresearchRunLiveDecisionInput {
  runtime: AutoresearchDecisionRuntime;
  goal: string;
  constraints?: readonly string[];
  filesInScope?: readonly string[];
  offLimits?: readonly string[];
  ideasBacklog?: readonly string[];
  asiNotes?: readonly string[];
  deadEndMemory?: readonly string[];
  currentCompany?: string;
  model?: string;
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
  liveDecision?: ExecuteAutoresearchRunLiveDecisionInput;
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
  decisionSummary: AutoresearchRunDecisionSummary | null;
  status: AutoresearchRuntimeStatus;
}

export interface InspectAutoresearchRuntimeControlResult {
  cwd: string;
  status: AutoresearchRuntimeStatus;
  nextStep: string;
}

export interface SetAutoresearchRuntimeControlInput {
  cwd: string;
  decision: AutoresearchOperatorAction;
  reason?: string;
  selectedAt?: number;
}

export interface SetAutoresearchRuntimeControlResult {
  cwd: string;
  decision: AutoresearchOperatorAction;
  previousControl: AutoresearchControlStateV1;
  status: AutoresearchRuntimeStatus;
  nextStep: string;
}

export interface ExecuteAutoresearchSetupDecisionInput {
  cwd: string;
  packet: SetupDecisionPacket;
  runtime: AutoresearchDecisionRuntime;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchSetupDecisionResult {
  cwd: string;
  outcome: SetupDecisionOutcome;
  status: AutoresearchRuntimeStatus;
}

export interface ExecuteAutoresearchFinalizeDecisionInput {
  cwd: string;
  packet: FinalizeDecisionPacket;
  runtime: AutoresearchDecisionRuntime;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface ExecuteAutoresearchFinalizeDecisionResult {
  cwd: string;
  outcome: FinalizeDecisionOutcome;
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
  decision?: AutoresearchRunDecisionSummary | null;
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
    decision: input.decision ?? undefined,
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

export function buildAutoresearchRuntimeStatus(
  cwd?: string,
  options: { persistSnapshot?: boolean } = {},
): AutoresearchRuntimeStatus {
  const paths = cwd ? resolveAutoresearchPaths(cwd) : null;
  const { entries, invalidLineCount } = cwd
    ? loadReceiptLog(cwd)
    : { entries: [], invalidLineCount: 0 };
  return buildAutoresearchRuntimeStatusFromEntries(cwd, paths, entries, invalidLineCount, {
    persistSnapshot: options.persistSnapshot ?? true,
  });
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

  const projection = status.runtimeProjection;

  return [
    "# PI-AUTORESEARCH STATUS",
    "",
    `- phase: ${status.phase}`,
    `- command: /${status.commandName}`,
    `- tools: ${status.toolNames.join(", ")}`,
    status.cwd ? `- cwd: ${status.cwd}` : "- cwd: (unset)",
    status.receiptPath ? `- receipt log: ${status.receiptPath}` : "- receipt log: (unresolved)",
    projection.ledgerPath
      ? `- event ledger: ${projection.ledgerPath}`
      : "- event ledger: (unresolved)",
    status.runtimeSnapshot.path
      ? `- runtime snapshot: ${status.runtimeSnapshot.path}`
      : "- runtime snapshot: (unresolved)",
    `- local artifacts: ${status.localArtifacts.join(", ")}`,
    `- receipt entry types: ${status.receiptEntryTypes.join(", ")}`,
    `- benchmark script present: ${status.hasBenchmarkScript ? "yes" : "no"}`,
    `- checks script present: ${status.hasChecksScript ? "yes" : "no"}`,
    `- invalid receipt lines: ${status.invalidReceiptLines}`,
    `- machine state: ${projection.state}`,
    `- machine resume state: ${projection.resumeState ?? "(none)"}`,
    `- machine blocked reason: ${projection.blockedReason ?? "(none)"}`,
    `- machine completion reason: ${projection.completionReason ?? "(none)"}`,
    `- machine projection source: ${projection.source}`,
    `- snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(status.runtimeSnapshot.reuse)}`,
    `- snapshot discard reason: ${status.runtimeSnapshot.discardedReason ?? "(none)"}`,
    `- control state: ${status.control.kind}`,
    `- allowed actions: ${formatAllowedActions(status.control.allowedActions)}`,
    `- control reason: ${status.control.reason ?? "(none)"}`,
    `- control selected at: ${formatTimestamp(status.control.selectedAt)}`,
    `- event ledger present: ${projection.hasLedger ? "yes" : "no"}`,
    `- invalid ledger lines: ${projection.invalidLedgerLines}`,
    `- ledger replay: ${projection.replayedEventCount}/${projection.eventCount} events accepted`,
    `- ledger replay issues: ${projection.rejectedEvents.length}`,
    `- projection sync issues: ${projection.syncIssues.length}`,
    `- live Prompt Vault decisions: ${formatPromptVaultDecisionAvailability(status.promptVaultDecisions.availability)}`,
    `- last post-run decision: ${formatLastPostRunDecision(status.promptVaultDecisions.lastPostRunDecision)}`,
    ...currentSegmentLines,
    `- ready Prompt Vault templates: ${status.readyPromptVaultTemplates.join(", ")}`,
    `- blocked Prompt Vault templates: ${status.blockedPromptVaultTemplates.join(", ")}`,
    `- next slices: ${status.nextSlices.join(", ")}`,
  ].join("\n");
}

export function buildAutoresearchHelpText(status: AutoresearchRuntimeStatus): string {
  const segment = status.currentSegment;
  const projection = status.runtimeProjection;
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
        `- machine state: ${projection.state}`,
        `- machine resume state: ${projection.resumeState ?? "(none)"}`,
        `- machine projection source: ${projection.source}`,
        `- runtime snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(status.runtimeSnapshot.reuse)}`,
        `- control state: ${status.control.kind} (${formatAllowedActions(status.control.allowedActions)})`,
        `- event ledger: ${projection.ledgerPath ?? "(unresolved)"}`,
        `- replayed events: ${projection.replayedEventCount}/${projection.eventCount}`,
      ]
    : [
        "## Current bounded runtime",
        "- no config receipt yet",
        `- machine state: ${projection.state}`,
        `- machine projection source: ${projection.source}`,
        `- runtime snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(status.runtimeSnapshot.reuse)}`,
        `- control state: ${status.control.kind} (${formatAllowedActions(status.control.allowedActions)})`,
        `- event ledger: ${projection.ledgerPath ?? "(unresolved)"}`,
        "- use autoresearch_runtime_run with name + metricName to bootstrap the first local segment",
      ];

  return [
    "# /autoresearch",
    "",
    "The bounded runtime kernel is available for local benchmark/check execution, machine projection, append-only receipt/event logging, governed Prompt Vault decision requests, bounded finalization orchestration, and manifest-driven llama.cpp campaign planning/fork preparation/stage binding.",
    "This package now owns bounded finalization planning, approval, local branch materialization, and checked manifest-driven branch/lane planning plus one exact 41/42/43 stage-binding surface for brownfield llama.cpp workflows; it still does not own the autonomous loop, AK binding, or remote review choreography.",
    "",
    "## Available surfaces",
    `- command: /${status.commandName}`,
    `- tools: ${status.toolNames.join(", ")}`,
    "- use autoresearch_runtime_status to inspect the current bounded runtime state",
    "- use autoresearch_runtime_status with action=setup or action=finalize to request governed setup/finalize packets",
    "- use autoresearch_runtime_control to inspect or set continue / rebaseline / finalize / stop operator intent",
    "- use autoresearch_runtime_finalize to inspect, plan, approve, and materialize a bounded finalization workflow",
    "- use autoresearch_runtime_run to execute one bounded local run and optionally request a governed post-run next-hypothesis decision with decisionGoal",
    `- use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} to load a typed llama.cpp benchmark campaign manifest, emit the exact 41/42/43 branch-lane matrix, plan/apply fork preparation, and plan/apply one exact stage binding`,
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
    `Live post-run decision state: ${formatPromptVaultDecisionAvailability(status.promptVaultDecisions.availability)}`,
    `Last post-run decision: ${formatLastPostRunDecision(status.promptVaultDecisions.lastPostRunDecision)}`,
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
  const decisionSummary = result.decisionSummary
    ? [
        `- live post-run decision: ${result.decisionSummary.status} -> ${result.decisionSummary.mappedDecision}`,
        result.decisionSummary.blockingReason
          ? `- decision block: ${result.decisionSummary.blockingReason}`
          : `- next hypothesis: ${result.decisionSummary.nextHypothesis ?? "(none)"}`,
        `- decision target files: ${formatTargetFiles(result.decisionSummary.targetFiles)}`,
      ]
    : ["- live post-run decision: not requested; preserved bounded iterate bridge"];

  return [
    "# PI-AUTORESEARCH RUN",
    "",
    `- cwd: ${result.cwd}`,
    `- receipt log: ${result.receiptPath}`,
    `- event ledger: ${result.status.runtimeProjection.ledgerPath ?? "(unresolved)"}`,
    result.status.runtimeSnapshot.path
      ? `- runtime snapshot: ${result.status.runtimeSnapshot.path}`
      : "- runtime snapshot: (unresolved)",
    `- created config: ${result.createdConfig ? "yes" : "no"}`,
    `- run status: ${result.runReceipt.status}`,
    `- machine state: ${result.status.runtimeProjection.state}`,
    `- machine projection source: ${result.status.runtimeProjection.source}`,
    `- snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(result.status.runtimeSnapshot.reuse)}`,
    `- control state: ${result.status.control.kind} (${formatAllowedActions(result.status.control.allowedActions)})`,
    `- ledger replay: ${result.status.runtimeProjection.replayedEventCount}/${result.status.runtimeProjection.eventCount} events accepted`,
    `- primary metric: ${result.primaryMetricName}=${formatMetricValue(result.primaryMetric, metricUnit)}`,
    `- benchmark: ${result.benchmark.command}`,
    `- benchmark exit: ${formatExit(result.benchmark.exitCode, result.benchmark.timedOut)} in ${result.benchmark.durationSeconds.toFixed(2)}s`,
    ...checksSummary,
    ...decisionSummary,
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

export async function requestAutoresearchSetupDecision(
  input: ExecuteAutoresearchSetupDecisionInput,
): Promise<ExecuteAutoresearchSetupDecisionResult> {
  const cwd = path.resolve(input.cwd);
  const outcome = await input.runtime.runSetup(enrichSetupDecisionPacket(cwd, input.packet), {
    cwd,
    currentCompany: input.currentCompany,
    model: input.model,
    signal: input.signal,
  });

  return {
    cwd,
    outcome,
    status: buildAutoresearchRuntimeStatus(cwd),
  };
}

export async function requestAutoresearchFinalizeDecision(
  input: ExecuteAutoresearchFinalizeDecisionInput,
): Promise<ExecuteAutoresearchFinalizeDecisionResult> {
  const cwd = path.resolve(input.cwd);
  const outcome = await input.runtime.runFinalize(enrichFinalizeDecisionPacket(cwd, input.packet), {
    cwd,
    currentCompany: input.currentCompany,
    model: input.model,
    signal: input.signal,
  });

  return {
    cwd,
    outcome,
    status: buildAutoresearchRuntimeStatus(cwd),
  };
}

export function formatAutoresearchDecisionResult(
  result: ExecuteAutoresearchSetupDecisionResult | ExecuteAutoresearchFinalizeDecisionResult,
): string {
  const outcome = result.outcome;
  if (outcome.kind === "setup") {
    if (isDecisionErrorOutcome(outcome)) {
      return [
        "# PI-AUTORESEARCH DECISION",
        "",
        `- cwd: ${result.cwd}`,
        `- kind: ${outcome.kind}`,
        `- template: ${outcome.templateName}`,
        `- status: ${outcome.status}`,
        `- blocking reason: ${outcome.blockingReason}`,
        `- failure stage: ${outcome.failureStage}`,
        `- machine state: ${result.status.runtimeProjection.state}`,
      ].join("\n");
    }

    return [
      "# PI-AUTORESEARCH DECISION",
      "",
      `- cwd: ${result.cwd}`,
      `- kind: ${outcome.kind}`,
      `- template: ${outcome.templateName}`,
      `- status: ${outcome.status}`,
      `- goal: ${outcome.goal}`,
      `- primary metric: ${outcome.primaryMetric.name} (${outcome.primaryMetric.unit || "unitless"}, ${outcome.primaryMetric.direction} is better)`,
      `- benchmark command: ${outcome.benchmarkCommand}`,
      `- files in scope: ${formatTargetFiles(outcome.filesInScope)}`,
      ...(outcome.status === "blocked"
        ? [`- blocking reason: ${formatSetupBlockingReason(outcome)}`]
        : []),
      `- machine state: ${result.status.runtimeProjection.state}`,
    ].join("\n");
  }

  if (isDecisionErrorOutcome(outcome)) {
    return [
      "# PI-AUTORESEARCH DECISION",
      "",
      `- cwd: ${result.cwd}`,
      `- kind: ${outcome.kind}`,
      `- template: ${outcome.templateName}`,
      `- status: ${outcome.status}`,
      `- blocking reason: ${outcome.blockingReason}`,
      `- failure stage: ${outcome.failureStage}`,
      `- machine state: ${result.status.runtimeProjection.state}`,
    ].join("\n");
  }

  return [
    "# PI-AUTORESEARCH DECISION",
    "",
    `- cwd: ${result.cwd}`,
    `- kind: ${outcome.kind}`,
    `- template: ${outcome.templateName}`,
    `- status: ${outcome.status}`,
    `- base ref: ${outcome.baseRef}`,
    `- trunk ref: ${outcome.trunkRef}`,
    `- overall result: ${outcome.overallResult}`,
    `- proposed groups: ${outcome.proposedGroups.length}`,
    `- grouped files: ${formatTargetFiles(outcome.proposedGroups.flatMap((group) => group.files))}`,
    ...(outcome.status === "blocked"
      ? [`- blocking reason: ${formatFinalizeBlockingReason(outcome)}`]
      : []),
    `- machine state: ${result.status.runtimeProjection.state}`,
  ].join("\n");
}

export function inspectAutoresearchRuntimeControl(
  cwd: string,
): InspectAutoresearchRuntimeControlResult {
  const resolvedCwd = path.resolve(cwd);
  const loadResult = loadReceiptLog(resolvedCwd);
  ensureEventLedgerInitializedFromReceipts(resolvedCwd, [...loadResult.entries]);
  const status = buildAutoresearchRuntimeStatus(resolvedCwd, { persistSnapshot: false });
  return {
    cwd: resolvedCwd,
    status,
    nextStep: describeAutoresearchControlNextStep(status),
  };
}

export function setAutoresearchRuntimeControl(
  input: SetAutoresearchRuntimeControlInput,
): SetAutoresearchRuntimeControlResult {
  const cwd = path.resolve(input.cwd);
  if (!isAutoresearchOperatorAction(input.decision)) {
    throw new Error(`Unsupported autoresearch control decision: ${String(input.decision)}`);
  }

  const current = inspectAutoresearchRuntimeControl(cwd);
  assertAutoresearchControlActionAllowed(current.status, input.decision);

  const selectedAt = input.selectedAt ?? Date.now();
  const control = createExplicitAutoresearchControlState({
    status: current.status,
    decision: input.decision,
    reason: input.reason,
    selectedAt,
  });

  persistAutoresearchRuntimeSnapshot({
    cwd,
    current: createRuntimeSnapshotInput(
      cwd,
      current.status.currentSegment,
      current.status.runtimeProjection,
      current.status.promptVaultDecisions,
    ),
    control,
    updatedAt: selectedAt,
  });

  const next = inspectAutoresearchRuntimeControl(cwd);
  return {
    cwd,
    decision: input.decision,
    previousControl: cloneAutoresearchControlState(current.status.control),
    status: next.status,
    nextStep: next.nextStep,
  };
}

export function formatAutoresearchControlResult(
  result: InspectAutoresearchRuntimeControlResult | SetAutoresearchRuntimeControlResult,
): string {
  const actionLine = "decision" in result ? `- action: set ${result.decision}` : "- action: status";

  return [
    "# PI-AUTORESEARCH CONTROL",
    "",
    `- cwd: ${result.cwd}`,
    actionLine,
    ...("decision" in result ? [`- previous control: ${result.previousControl.kind}`] : []),
    `- machine state: ${result.status.runtimeProjection.state}`,
    `- machine projection source: ${result.status.runtimeProjection.source}`,
    `- snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(result.status.runtimeSnapshot.reuse)}`,
    `- snapshot discard reason: ${result.status.runtimeSnapshot.discardedReason ?? "(none)"}`,
    `- control state: ${result.status.control.kind}`,
    `- allowed actions: ${formatAllowedActions(result.status.control.allowedActions)}`,
    `- control reason: ${result.status.control.reason ?? "(none)"}`,
    `- control selected at: ${formatTimestamp(result.status.control.selectedAt)}`,
    `- next step: ${result.nextStep}`,
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
  if (input.liveDecision && input.liveDecision.goal.trim().length === 0) {
    throw new Error(
      "liveDecision.goal is required when governed post-run Prompt Vault decisions are enabled",
    );
  }

  const paths = resolveAutoresearchPaths(cwd);
  const loadResult = loadReceiptLog(cwd);
  const entries = [...loadResult.entries];
  ensureEventLedgerInitializedFromReceipts(cwd, entries);

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

  if (createdConfig) {
    appendReceipt(cwd, config);
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.configureSegment(createCampaignSegmentConfigFromReceipt(config)),
        config.createdAt,
      ),
    );
  }

  ensureMachineReadyForBoundedRun(cwd);
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.startRun({
        description,
        benchmarkCommand,
        checksCommand,
      }),
    ),
  );

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
  const primaryMetric = hasPrimaryMetric ? parsedMetrics[metricName] : 0;

  if (benchmarkSucceeded && !metricContractFailed) {
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.benchmarkSucceeded({
          metric: primaryMetric,
          requiresChecks: checksCommand !== null,
        }),
      ),
    );
  } else {
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.benchmarkFailed(describeBenchmarkFailure(benchmark, metricContractFailed)),
      ),
    );
  }

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
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        checksPassed
          ? campaignEvents.checksSucceeded()
          : campaignEvents.checksFailed("checks command failed or timed out"),
      ),
    );
  }

  const status = determineRunStatus({
    currentSegment,
    benchmarkSucceeded,
    metricContractFailed,
    checksPassed,
  });
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
    { persistSnapshot: false },
  );
  runReceipt.confidence = nextStatus.currentSegment.confidence;

  const decisionSummary = input.liveDecision
    ? await runAutoresearchPostRunDecision({
        cwd,
        entries: nextEntries,
        status: nextStatus,
        runReceipt,
        liveDecision: input.liveDecision,
        signal: input.signal,
      })
    : null;
  if (decisionSummary) {
    runReceipt.decision = decisionSummary;
  }

  appendReceipt(cwd, runReceipt);
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.receiptRecorded({
        status: runReceipt.status,
        metric: runReceipt.metric,
      }),
      runReceipt.timestamp,
    ),
  );
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.decideNextAction(
        decisionSummary?.mappedDecision ?? "iterate",
        decisionSummary
          ? formatRunDecisionLedgerReason(decisionSummary)
          : "bounded runtime run completed",
      ),
      runReceipt.timestamp,
    ),
  );

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
    decisionSummary,
    status: buildAutoresearchRuntimeStatus(cwd),
  };
}

async function runAutoresearchPostRunDecision(input: {
  cwd: string;
  entries: AutoresearchReceipt[];
  status: AutoresearchRuntimeStatus;
  runReceipt: AutoresearchRunReceipt;
  liveDecision: ExecuteAutoresearchRunLiveDecisionInput;
  signal?: AbortSignal;
}): Promise<AutoresearchRunDecisionSummary> {
  const outcome = await input.liveDecision.runtime.runNextHypothesis(
    buildRuntimeNextHypothesisPacket(input),
    {
      cwd: input.cwd,
      currentCompany: input.liveDecision.currentCompany,
      model: input.liveDecision.model,
      signal: input.signal,
    },
  );
  return buildRunDecisionSummary(outcome, input.runReceipt.timestamp);
}

function buildRuntimeNextHypothesisPacket(input: {
  entries: AutoresearchReceipt[];
  status: AutoresearchRuntimeStatus;
  runReceipt: AutoresearchRunReceipt;
  liveDecision: ExecuteAutoresearchRunLiveDecisionInput;
}): NextHypothesisDecisionPacket {
  const currentSegmentView = getCurrentSegment(input.entries);
  const successfulRuns = currentSegmentView.runs.filter(isSuccessfulMetricRun);
  const recentRuns = currentSegmentView.runs.slice(-5);
  const metricUnit = input.status.currentSegment.metricUnit;
  const metricName = input.status.currentSegment.metricName ?? "(unset)";
  const direction = input.status.currentSegment.direction ?? "lower";

  return {
    goal: input.liveDecision.goal.trim(),
    constraints: [
      ...normalizeArray(input.liveDecision.constraints),
      "bounded local runtime only",
      "fail closed if the governed Prompt Vault decision cannot be prepared, executed, or parsed",
    ],
    segmentSummary: [
      `campaign: ${input.status.currentSegment.name ?? "(unnamed)"}`,
      `metric: ${metricName} (${metricUnit || "unitless"}, ${direction} is better)`,
      `run count: ${input.status.currentSegment.runCount}`,
      `successful runs: ${input.status.currentSegment.successfulRunCount}`,
      `baseline: ${formatMetricValue(input.status.currentSegment.baselineMetric, metricUnit)}`,
      `best: ${formatMetricValue(input.status.currentSegment.bestMetric, metricUnit)}`,
      `last run: ${formatLastRun(input.status.currentSegment.lastRunStatus, input.status.currentSegment.lastRunMetric, metricUnit)}`,
    ],
    baselineHistory: [
      successfulRuns.length > 0
        ? `baseline ${metricName}=${formatMetricValue(successfulRuns[0]?.metric ?? null, metricUnit)}`
        : "no successful baseline yet",
      successfulRuns.length > 0
        ? `best ${metricName}=${formatMetricValue(input.status.currentSegment.bestMetric, metricUnit)}`
        : "best metric unavailable",
    ],
    recentRunHistory: recentRuns.map((run) => formatRunHistoryLine(run, metricUnit)),
    checksStatus: [
      `checks command: ${input.status.currentSegment.checksCommand ?? "(none)"}`,
      `latest checks: ${describeChecksState(input.runReceipt)}`,
    ],
    confidenceSignals: [
      `confidence: ${formatConfidenceValue(input.status.currentSegment.confidence)}`,
      `latest run receipt status: ${input.runReceipt.status}`,
    ],
    asiNotes: normalizeArray(input.liveDecision.asiNotes),
    deadEndMemory: normalizeArray(input.liveDecision.deadEndMemory),
    filesInScope: normalizeArray(input.liveDecision.filesInScope),
    offLimits: normalizeArray(input.liveDecision.offLimits),
    ideasBacklog: normalizeArray(input.liveDecision.ideasBacklog),
  };
}

function buildRunDecisionSummary(
  outcome: NextHypothesisDecisionOutcome,
  timestamp: number,
): AutoresearchRunDecisionSummary {
  if (isDecisionErrorOutcome(outcome)) {
    return {
      kind: "next_hypothesis",
      templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
      status: "blocked",
      mappedDecision: "block",
      blockingReason: outcome.blockingReason,
      failureStage: outcome.failureStage,
      stateRead: null,
      nextHypothesis: null,
      targetFiles: [],
      expectedPrimaryEffect: null,
      timestamp,
    };
  }

  return {
    kind: "next_hypothesis",
    templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
    status: outcome.status,
    mappedDecision: mapNextHypothesisOutcomeToCampaignDecision(outcome),
    blockingReason:
      outcome.status === "blocked"
        ? (normalizeInlineReason(outcome.nextHypothesis) ??
          normalizeInlineReason(outcome.stateRead))
        : null,
    failureStage: null,
    stateRead: outcome.stateRead,
    nextHypothesis: outcome.nextHypothesis,
    targetFiles: [...outcome.targetFiles],
    expectedPrimaryEffect: outcome.expectedPrimaryEffect,
    timestamp,
  };
}

function formatRunDecisionLedgerReason(summary: AutoresearchRunDecisionSummary): string {
  if (summary.blockingReason) {
    return `Prompt Vault next_hypothesis blocked: ${summary.blockingReason}`;
  }

  return `Prompt Vault next_hypothesis -> ${summary.status}: ${summary.nextHypothesis ?? summary.stateRead ?? "decision recorded"}`;
}

function buildPromptVaultDecisionStatus(
  runs: readonly AutoresearchRunReceipt[],
): AutoresearchPromptVaultDecisionStatus {
  const lastPostRunDecision = findLastPostRunDecision(runs);
  return {
    availability:
      lastPostRunDecision === null
        ? "available_not_yet_used"
        : lastPostRunDecision.status === "blocked"
          ? "available_last_used_blocked"
          : "available_last_used_successfully",
    lastPostRunDecision,
  };
}

function findLastPostRunDecision(
  runs: readonly AutoresearchRunReceipt[],
): AutoresearchRunDecisionSummary | null {
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const decision = runs[index]?.decision;
    if (decision) {
      return decision;
    }
  }

  return null;
}

function enrichSetupDecisionPacket(cwd: string, packet: SetupDecisionPacket): SetupDecisionPacket {
  const status = buildAutoresearchRuntimeStatus(cwd);
  const repoContext =
    packet.repoContext.length > 0
      ? [...packet.repoContext]
      : [
          `cwd: ${cwd}`,
          `phase: ${AUTORESEARCH_PHASE}`,
          `machine state: ${status.runtimeProjection.state}`,
        ];
  const benchmarkSurfaces =
    packet.benchmarkSurfaces.length > 0
      ? [...packet.benchmarkSurfaces]
      : [
          status.currentSegment.benchmarkCommand
            ? `benchmark command: ${status.currentSegment.benchmarkCommand}`
            : "benchmark command: (unset)",
          `checks command: ${status.currentSegment.checksCommand ?? "(none)"}`,
        ];
  const existingArtifacts =
    packet.existingArtifacts.length > 0
      ? [...packet.existingArtifacts]
      : AUTORESEARCH_LOCAL_ARTIFACTS.filter((artifact) => existsSync(path.join(cwd, artifact)));

  return {
    ...packet,
    repoContext,
    benchmarkSurfaces,
    existingArtifacts,
  };
}

function enrichFinalizeDecisionPacket(
  cwd: string,
  packet: FinalizeDecisionPacket,
): FinalizeDecisionPacket {
  const status = buildAutoresearchRuntimeStatus(cwd);
  return {
    ...packet,
    campaignContext:
      packet.campaignContext.length > 0
        ? [...packet.campaignContext]
        : [
            `campaign: ${status.currentSegment.name ?? "(unnamed)"}`,
            `machine state: ${status.runtimeProjection.state}`,
            `baseline: ${formatMetricValue(status.currentSegment.baselineMetric, status.currentSegment.metricUnit)}`,
            `best: ${formatMetricValue(status.currentSegment.bestMetric, status.currentSegment.metricUnit)}`,
          ],
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

function reconstructOriginalRunDescription(description: string): string {
  return description
    .replace(/ \(benchmark failed or timed out\)$/u, "")
    .replace(/ \(primary metric missing\)$/u, "")
    .replace(/ \(checks failed\)$/u, "");
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
  options: { persistSnapshot?: boolean } = {},
): AutoresearchRuntimeStatus {
  const currentSegmentView = getCurrentSegment(entries);
  const currentSegment = summarizeCurrentSegment(currentSegmentView);
  const promptVaultDecisions = buildPromptVaultDecisionStatus(currentSegmentView.runs);
  const runtimeProjection = buildRuntimeProjection(
    cwd,
    currentSegment,
    promptVaultDecisions.lastPostRunDecision,
  );
  const defaultControl = deriveAutoresearchControlState({
    machineState: runtimeProjection.state,
    blockedReason: runtimeProjection.blockedReason,
    completionReason: runtimeProjection.completionReason,
  });
  const snapshotInput =
    cwd !== undefined
      ? createRuntimeSnapshotInput(cwd, currentSegment, runtimeProjection, promptVaultDecisions)
      : null;
  const loadedControl =
    cwd !== undefined && snapshotInput
      ? loadAutoresearchRuntimeControlState({ cwd, current: snapshotInput })
      : null;

  if (options.persistSnapshot !== false && cwd && snapshotInput && existsSync(cwd)) {
    persistAutoresearchRuntimeSnapshot({
      cwd,
      current: snapshotInput,
      control: loadedControl?.control ?? defaultControl,
    });
  }

  return {
    phase: AUTORESEARCH_PHASE,
    cwd,
    commandName: AUTORESEARCH_COMMAND_NAME,
    toolNames: [
      AUTORESEARCH_STATUS_TOOL_NAME,
      AUTORESEARCH_RUN_TOOL_NAME,
      AUTORESEARCH_CONTROL_TOOL_NAME,
      AUTORESEARCH_FINALIZE_TOOL_NAME,
      AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
    ],
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
    runtimeProjection,
    runtimeSnapshot: loadedControl?.snapshotStatus ?? {
      exists: false,
      reuse: "unavailable",
      discardedReason: null,
      segmentKey: null,
      runtimeKey: null,
    },
    control: loadedControl?.control ?? defaultControl,
    promptVaultDecisions,
    nextSlices: ["llamacpp_campaign_receipt_projection", "ak_campaign_binding"],
  };
}

function buildRuntimeProjection(
  cwd: string | undefined,
  currentSegment: AutoresearchSegmentSummary,
  lastPostRunDecision: AutoresearchRunDecisionSummary | null,
): AutoresearchRuntimeProjection {
  if (!cwd) {
    return createReceiptFallbackProjection(currentSegment, lastPostRunDecision);
  }

  const loadResult = loadAutoresearchLedger(cwd);
  const hasLedger = existsSync(resolveAutoresearchLedgerPath(cwd));
  if (hasLedger || loadResult.invalidLineCount > 0 || loadResult.entries.length > 0) {
    const projection = projectAutoresearchLedger(cwd);
    if (projectionMatchesCurrentSegment(projection, currentSegment)) {
      return {
        state: projection.state,
        resumeState: projection.context.resumeState,
        blockedReason: projection.context.blockedReason,
        completionReason: projection.context.completionReason,
        source: "ledger",
        ledgerPath: projection.ledgerPath,
        hasLedger: projection.hasLedger,
        invalidLedgerLines: projection.invalidLineCount,
        eventCount: projection.eventCount,
        replayedEventCount: projection.replayedEventCount,
        rejectedEvents: projection.rejectedEvents,
        syncIssues: [],
      };
    }

    const fallback = createReceiptFallbackProjection(
      currentSegment,
      lastPostRunDecision,
      projection.ledgerPath,
    );
    return {
      ...fallback,
      hasLedger: projection.hasLedger,
      invalidLedgerLines: projection.invalidLineCount,
      eventCount: projection.eventCount,
      replayedEventCount: projection.replayedEventCount,
      rejectedEvents: projection.rejectedEvents,
      syncIssues: [describeRuntimeProjectionSyncIssue(projection, currentSegment)],
    };
  }

  return createReceiptFallbackProjection(
    currentSegment,
    lastPostRunDecision,
    resolveAutoresearchLedgerPath(cwd),
  );
}

function createRuntimeSnapshotInput(
  cwd: string,
  currentSegment: AutoresearchSegmentSummary,
  runtimeProjection: AutoresearchRuntimeProjection,
  promptVaultDecisions: AutoresearchPromptVaultDecisionStatus,
): AutoresearchRuntimeSnapshotInput {
  return {
    cwd,
    phase: AUTORESEARCH_PHASE,
    projectionSource: runtimeProjection.source,
    machine: {
      state: runtimeProjection.state,
      resumeState: runtimeProjection.resumeState,
      blockedReason: runtimeProjection.blockedReason,
      completionReason: runtimeProjection.completionReason,
    },
    segment: {
      name: currentSegment.name,
      metricName: currentSegment.metricName,
      metricUnit: currentSegment.metricUnit,
      direction: currentSegment.direction,
      benchmarkCommand: currentSegment.benchmarkCommand,
      checksCommand: currentSegment.checksCommand,
      runCount: currentSegment.runCount,
      successfulRunCount: currentSegment.successfulRunCount,
      baselineMetric: currentSegment.baselineMetric,
      bestMetric: currentSegment.bestMetric,
      lastRunStatus: currentSegment.lastRunStatus,
      lastRunMetric: currentSegment.lastRunMetric,
    },
    decision: {
      availability: promptVaultDecisions.availability,
      lastPostRunDecision: promptVaultDecisions.lastPostRunDecision,
    },
  };
}

function createReceiptFallbackProjection(
  currentSegment: AutoresearchSegmentSummary,
  lastPostRunDecision: AutoresearchRunDecisionSummary | null,
  ledgerPath?: string,
): AutoresearchRuntimeProjection {
  const projection = projectAutoresearchLedgerEntries(
    [],
    createFallbackMachineInput(currentSegment, lastPostRunDecision),
  );
  return {
    state: projection.state,
    resumeState: projection.context.resumeState,
    blockedReason: projection.context.blockedReason,
    completionReason: projection.context.completionReason,
    source: "receipt_fallback",
    ledgerPath,
    hasLedger: false,
    invalidLedgerLines: 0,
    eventCount: projection.eventCount,
    replayedEventCount: projection.replayedEventCount,
    rejectedEvents: projection.rejectedEvents,
    syncIssues: ledgerPath ? ["event ledger missing or stale; projected from receipt log"] : [],
  };
}

function projectionMatchesCurrentSegment(
  projection: ReturnType<typeof projectAutoresearchLedger>,
  currentSegment: AutoresearchSegmentSummary,
): boolean {
  if (currentSegment.configured !== (projection.context.segment !== null)) {
    return false;
  }
  if (!currentSegment.configured) {
    return projection.context.runCount === 0;
  }

  return (
    projection.context.segment?.name === currentSegment.name &&
    projection.context.segment?.metricName === currentSegment.metricName &&
    projection.context.segment?.metricUnit === currentSegment.metricUnit &&
    projection.context.segment?.direction === currentSegment.direction &&
    projection.context.segment?.benchmarkCommand === currentSegment.benchmarkCommand &&
    projection.context.segment?.checksCommand === currentSegment.checksCommand &&
    projection.context.runCount === currentSegment.runCount &&
    projection.context.successfulRunCount === currentSegment.successfulRunCount &&
    projection.context.baselineMetric === currentSegment.baselineMetric &&
    projection.context.bestMetric === currentSegment.bestMetric &&
    projection.context.lastRunStatus === currentSegment.lastRunStatus &&
    projection.context.lastRunMetric === currentSegment.lastRunMetric
  );
}

function describeRuntimeProjectionSyncIssue(
  projection: ReturnType<typeof projectAutoresearchLedger>,
  currentSegment: AutoresearchSegmentSummary,
): string {
  return [
    `ledger state ${projection.state}`,
    `ledger run count ${projection.context.runCount}`,
    `receipt run count ${currentSegment.runCount}`,
  ].join("; ");
}

function createFallbackMachineInput(
  currentSegment: AutoresearchSegmentSummary,
  lastPostRunDecision: AutoresearchRunDecisionSummary | null,
): CampaignMachineInput | undefined {
  if (!currentSegment.configured) {
    return undefined;
  }

  return {
    segment: {
      name: currentSegment.name ?? "(unnamed)",
      metricName: currentSegment.metricName ?? "(unset)",
      metricUnit: currentSegment.metricUnit,
      direction: currentSegment.direction ?? "lower",
      benchmarkCommand: currentSegment.benchmarkCommand ?? "",
      checksCommand: currentSegment.checksCommand,
    },
    runCount: currentSegment.runCount,
    successfulRunCount: currentSegment.successfulRunCount,
    baselineMetric: currentSegment.baselineMetric,
    bestMetric: currentSegment.bestMetric,
    lastRunStatus: currentSegment.lastRunStatus,
    lastRunMetric: currentSegment.lastRunMetric,
    awaitingDecision: false,
    blockedReason:
      lastPostRunDecision?.mappedDecision === "block"
        ? (lastPostRunDecision.blockingReason ?? "campaign blocked pending operator action")
        : null,
    resumeState:
      lastPostRunDecision?.mappedDecision === "rebaseline"
        ? "rebaseline_needed"
        : lastPostRunDecision?.mappedDecision === "finalize"
          ? "finalize_candidate"
          : null,
  };
}

function ensureEventLedgerInitializedFromReceipts(
  cwd: string,
  entries: AutoresearchReceipt[],
): void {
  if (entries.length === 0) {
    return;
  }

  const currentSegmentView = getCurrentSegment(entries);
  const currentSegment = summarizeCurrentSegment(currentSegmentView);
  const reconstructedEntries = reconstructLedgerEntriesForCurrentSegment(currentSegmentView);
  const loadResult = loadAutoresearchLedger(cwd);
  if (loadResult.entries.length === 0 && loadResult.invalidLineCount === 0) {
    appendLedgerEntries(cwd, reconstructedEntries);
    return;
  }

  const projection = projectAutoresearchLedger(cwd);
  if (!projectionMatchesCurrentSegment(projection, currentSegment)) {
    appendLedgerEntries(cwd, reconstructedEntries);
  }
}

function appendLedgerEntries(cwd: string, entries: AutoresearchLedgerEventEntry[]): void {
  for (const entry of entries) {
    appendLedgerEvent(cwd, entry);
  }
}

function reconstructLedgerEntriesForCurrentSegment(
  currentSegment: CurrentSegmentView,
): AutoresearchLedgerEventEntry[] {
  if (!currentSegment.config) {
    return [];
  }

  const config = currentSegment.config;
  return [
    createLedgerEventEntry(
      campaignEvents.configureSegment(createCampaignSegmentConfigFromReceipt(config)),
      config.createdAt,
    ),
    ...currentSegment.runs.flatMap((run) => reconstructLedgerEntriesForRun(run, config)),
  ];
}

function reconstructLedgerEntriesForRun(
  run: AutoresearchRunReceipt,
  config: AutoresearchConfigReceipt,
): AutoresearchLedgerEventEntry[] {
  const benchmarkCommand =
    run.benchmarkCommand ?? config.benchmarkCommand ?? "bash autoresearch.sh";
  const checksCommand = run.checksCommand ?? config.checksCommand ?? null;
  const entries: AutoresearchLedgerEventEntry[] = [
    createLedgerEventEntry(
      campaignEvents.startRun({
        description: reconstructOriginalRunDescription(run.description),
        benchmarkCommand,
        checksCommand,
      }),
      run.timestamp,
    ),
  ];

  if (run.status === "crash") {
    entries.push(
      createLedgerEventEntry(
        campaignEvents.benchmarkFailed("reconstructed crash receipt"),
        run.timestamp,
      ),
    );
  } else {
    entries.push(
      createLedgerEventEntry(
        campaignEvents.benchmarkSucceeded({
          metric: run.metric,
          requiresChecks: checksCommand !== null,
        }),
        run.timestamp,
      ),
    );

    if (checksCommand !== null) {
      entries.push(
        createLedgerEventEntry(
          run.status === "checks_failed" || run.checksPassed === false
            ? campaignEvents.checksFailed("reconstructed checks failure receipt")
            : campaignEvents.checksSucceeded(),
          run.timestamp,
        ),
      );
    }
  }

  entries.push(
    createLedgerEventEntry(
      campaignEvents.receiptRecorded({
        status: run.status,
        metric: run.metric,
      }),
      run.timestamp,
    ),
    createLedgerEventEntry(
      campaignEvents.decideNextAction(
        run.decision?.mappedDecision ?? "iterate",
        run.decision
          ? formatRunDecisionLedgerReason(run.decision)
          : "reconstructed from receipt history",
      ),
      run.timestamp,
    ),
  );

  return entries;
}

function ensureMachineReadyForBoundedRun(cwd: string): void {
  let status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });

  if (status.control.kind === "continue") {
    consumeAutoresearchContinueControl(cwd, status);
    status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  }

  if (status.control.kind === "awaiting_operator") {
    throw new Error(
      `Cannot start a bounded autoresearch run while control state awaiting_operator requires one of: ${formatAllowedActions(status.control.allowedActions)}`,
    );
  }

  if (
    status.control.kind === "rebaseline" ||
    status.control.kind === "finalize" ||
    status.control.kind === "stop"
  ) {
    throw new Error(
      `Cannot start a bounded autoresearch run while control state ${status.control.kind} is selected`,
    );
  }

  if (!canCampaignMachineStartBoundedRun(status.runtimeProjection.state)) {
    throw new Error(
      `Cannot start a bounded autoresearch run while the machine is in state ${status.runtimeProjection.state}`,
    );
  }
}

function consumeAutoresearchContinueControl(cwd: string, status: AutoresearchRuntimeStatus): void {
  switch (status.runtimeProjection.state) {
    case "awaiting_decision":
      appendLedgerEvent(
        cwd,
        createLedgerEventEntry(
          campaignEvents.decideNextAction(
            "iterate",
            "operator selected continue through autoresearch_runtime_control",
          ),
        ),
      );
      return;
    case "finalize_candidate":
      appendLedgerEvent(cwd, createLedgerEventEntry(campaignEvents.rejectFinalize()));
      return;
    default:
      return;
  }
}

function createCampaignSegmentConfigFromReceipt(
  receipt: AutoresearchConfigReceipt,
): CampaignSegmentConfig {
  return {
    name: receipt.name,
    metricName: receipt.metricName,
    metricUnit: receipt.metricUnit,
    direction: receipt.direction,
    benchmarkCommand: receipt.benchmarkCommand ?? "bash autoresearch.sh",
    checksCommand: receipt.checksCommand ?? null,
  };
}

function describeBenchmarkFailure(
  benchmark: CommandExecutionSummary,
  metricContractFailed: boolean,
): string {
  if (metricContractFailed) {
    return "primary metric missing from benchmark output";
  }
  if (benchmark.timedOut) {
    return "benchmark timed out";
  }
  if (benchmark.exitCode === null) {
    return "benchmark ended with a signal or process error";
  }
  return `benchmark exited with code ${benchmark.exitCode}`;
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
    decision: parseRunDecisionSummary(value.decision),
  };
}

function parseRunDecisionSummary(value: unknown): AutoresearchRunDecisionSummary | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("Run receipt decision summary must be an object.");
  }
  if (value.kind !== "next_hypothesis") {
    throw new Error(`Unsupported run receipt decision kind: ${String(value.kind)}`);
  }
  if (value.templateName !== AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME) {
    throw new Error(`Unexpected run receipt decision template: ${String(value.templateName)}`);
  }
  if (!isNextHypothesisDecisionStatus(value.status)) {
    throw new Error(`Invalid run receipt decision status: ${String(value.status)}`);
  }
  if (typeof value.mappedDecision !== "string" || !isCampaignDecision(value.mappedDecision)) {
    throw new Error(`Invalid run receipt mapped decision: ${String(value.mappedDecision)}`);
  }
  if (
    value.failureStage !== undefined &&
    value.failureStage !== null &&
    !isDecisionFailureStage(value.failureStage)
  ) {
    throw new Error(`Invalid run receipt decision failure stage: ${String(value.failureStage)}`);
  }

  return {
    kind: "next_hypothesis",
    templateName: AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
    status: value.status,
    mappedDecision: value.mappedDecision,
    blockingReason:
      typeof value.blockingReason === "string"
        ? value.blockingReason
        : value.blockingReason === null
          ? null
          : null,
    failureStage:
      value.failureStage === null || value.failureStage === undefined ? null : value.failureStage,
    stateRead: typeof value.stateRead === "string" ? value.stateRead : null,
    nextHypothesis: typeof value.nextHypothesis === "string" ? value.nextHypothesis : null,
    targetFiles: parseStringArray(value.targetFiles),
    expectedPrimaryEffect:
      typeof value.expectedPrimaryEffect === "string" ? value.expectedPrimaryEffect : null,
    timestamp: coerceNumber(value.timestamp, "decision.timestamp"),
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

function isNextHypothesisDecisionStatus(value: unknown): value is NextHypothesisDecisionStatus {
  return (
    value === "ready" ||
    value === "rebaseline_needed" ||
    value === "finalize_candidate" ||
    value === "blocked"
  );
}

function isDecisionFailureStage(value: unknown): value is AutoresearchDecisionFailureStage {
  return value === "prompt_plane" || value === "executor" || value === "parse";
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

function formatPromptVaultDecisionAvailability(
  value: AutoresearchPromptVaultDecisionAvailability,
): string {
  switch (value) {
    case "available_not_yet_used":
      return "available (not used yet)";
    case "available_last_used_successfully":
      return "available (last used successfully)";
    case "available_last_used_blocked":
      return "available (last use blocked)";
  }
}

function formatLastPostRunDecision(value: AutoresearchRunDecisionSummary | null): string {
  if (!value) {
    return "(none)";
  }

  const summary =
    value.blockingReason ?? value.nextHypothesis ?? value.stateRead ?? "decision recorded";
  return `${value.status} -> ${value.mappedDecision} (${summary})`;
}

function formatAllowedActions(actions: readonly string[]): string {
  return actions.length > 0 ? actions.join(", ") : "(none)";
}

function isAutoresearchOperatorAction(value: string): value is AutoresearchOperatorAction {
  return AUTORESEARCH_OPERATOR_ACTIONS.includes(value as AutoresearchOperatorAction);
}

function assertAutoresearchControlActionAllowed(
  status: AutoresearchRuntimeStatus,
  decision: AutoresearchOperatorAction,
): void {
  if (status.control.allowedActions.includes(decision)) {
    return;
  }

  throw new Error(
    `Cannot set autoresearch control to ${decision} while the machine is in state ${status.runtimeProjection.state}; allowed actions: ${formatAllowedActions(status.control.allowedActions)}`,
  );
}

function createExplicitAutoresearchControlState(input: {
  status: AutoresearchRuntimeStatus;
  decision: AutoresearchOperatorAction;
  reason?: string;
  selectedAt: number;
}): AutoresearchControlStateV1 {
  return {
    kind: input.decision,
    allowedActions: [...input.status.control.allowedActions],
    reason:
      normalizeInlineReason(input.reason ?? null) ??
      defaultAutoresearchControlReason(input.decision, input.status),
    selectedAt: input.selectedAt,
  };
}

function defaultAutoresearchControlReason(
  decision: AutoresearchOperatorAction,
  status: AutoresearchRuntimeStatus,
): string {
  switch (decision) {
    case "continue":
      return canCampaignMachineStartBoundedRun(status.runtimeProjection.state)
        ? "operator approved another bounded runtime iteration"
        : "operator approved continuing from a control-gated runtime posture";
    case "rebaseline":
      return "operator requested rebaseline work before another ordinary bounded run";
    case "finalize":
      return "operator selected finalization as the next bounded control-plane phase";
    case "stop":
      return "operator halted package-local autoresearch progression";
  }
}

function describeAutoresearchControlNextStep(status: AutoresearchRuntimeStatus): string {
  switch (status.control.kind) {
    case "continue":
      if (status.runtimeProjection.state === "finalize_candidate") {
        return "Run autoresearch_runtime_run to consume continue, reject finalization for now, and start another bounded iteration.";
      }
      if (status.runtimeProjection.state === "awaiting_decision") {
        return "Run autoresearch_runtime_run to consume continue and advance the machine back into a runnable bounded posture.";
      }
      return "Run autoresearch_runtime_run to start the next bounded iteration; continue will be consumed once the run starts.";
    case "rebaseline":
      return "Use autoresearch_runtime_run with reconfigure=true (plus name + metricName when required) before another ordinary bounded run.";
    case "finalize":
      return "Use autoresearch_runtime_status with action=finalize for the governed packet or wait for the later finalization slice; ordinary bounded runs stay blocked.";
    case "stop":
      return "No further bounded runs will start until autoresearch_runtime_control changes the control state.";
    case "awaiting_operator":
      return `Use ${AUTORESEARCH_CONTROL_TOOL_NAME} with action=set to choose one of: ${formatAllowedActions(status.control.allowedActions)}.`;
    case "none":
      if (canCampaignMachineStartBoundedRun(status.runtimeProjection.state)) {
        return "Run autoresearch_runtime_run for the next bounded iteration, or set stop to hold the package-local runtime.";
      }
      if (status.runtimeProjection.state === "segment_unconfigured") {
        return "Bootstrap the bounded runtime with autoresearch_runtime_run using name + metricName, or set stop to hold it idle.";
      }
      if (isCampaignMachineTerminalState(status.runtimeProjection.state)) {
        return "The bounded runtime is complete; no further control action is required in this workstream.";
      }
      if (isCampaignMachineAwaitingOperatorChoice(status.runtimeProjection.state)) {
        return `Choose a lawful control action with ${AUTORESEARCH_CONTROL_TOOL_NAME}: ${formatAllowedActions(status.control.allowedActions)}.`;
      }
      return "Wait for the current bounded runtime transition to settle before issuing another operator control change.";
  }
}

function cloneAutoresearchControlState(
  control: AutoresearchControlStateV1,
): AutoresearchControlStateV1 {
  return {
    kind: control.kind,
    allowedActions: [...control.allowedActions],
    reason: control.reason,
    selectedAt: control.selectedAt,
  };
}

function formatTargetFiles(files: readonly string[]): string {
  return files.length > 0 ? files.join(", ") : "(none)";
}

function describeChecksState(run: AutoresearchRunReceipt): string {
  if (run.checksCommand === null || run.checksCommand === undefined) {
    return "not run";
  }
  if (run.checksPassed === true) {
    return "passed";
  }
  if (run.checksPassed === false) {
    return "failed";
  }
  return "not recorded";
}

function formatRunHistoryLine(run: AutoresearchRunReceipt, metricUnit: string): string {
  return [
    `iteration ${run.iteration ?? "?"}`,
    run.status,
    `metric ${formatMetricValue(run.metric, metricUnit)}`,
    run.decision ? `decision ${run.decision.status}` : null,
    run.description,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
}

function normalizeArray(values: readonly string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeInlineReason(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function formatSetupBlockingReason(outcome: SetupDecisionOutcome): string {
  if (isDecisionErrorOutcome(outcome)) {
    return outcome.blockingReason;
  }
  return outcome.missingInformation.join("; ") || "setup decision blocked";
}

function formatFinalizeBlockingReason(outcome: FinalizeDecisionOutcome): string {
  if (isDecisionErrorOutcome(outcome)) {
    return outcome.blockingReason;
  }
  return normalizeInlineReason(outcome.overallResult) ?? "finalize decision blocked";
}

function isDecisionErrorOutcome(
  outcome: SetupDecisionOutcome | NextHypothesisDecisionOutcome | FinalizeDecisionOutcome,
): outcome is
  | Extract<SetupDecisionOutcome, { failureStage: AutoresearchDecisionFailureStage }>
  | Extract<NextHypothesisDecisionOutcome, { failureStage: AutoresearchDecisionFailureStage }>
  | Extract<FinalizeDecisionOutcome, { failureStage: AutoresearchDecisionFailureStage }> {
  return "failureStage" in outcome;
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

function formatTimestamp(value: number | null): string {
  if (value === null) {
    return "(none)";
  }
  return new Date(value).toISOString();
}

function hasOwn(record: MetricMap, key: string): boolean {
  return Object.hasOwn(record, key);
}

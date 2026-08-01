import { existsSync } from "node:fs";
import path from "node:path";

import { campaignEvents } from "../machine/events.ts";
import {
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  mapNextHypothesisOutcomeToCampaignDecision,
  type NextHypothesisDecisionOutcome,
  type NextHypothesisDecisionPacket,
} from "./decisions.ts";
import { appendLedgerEvent, createLedgerEventEntry } from "./ledger.ts";
import { joinOutput, runShellCommand } from "./runtime-command.ts";
import { normalizeArray, stringOrNull } from "./runtime-common.ts";
import {
  formatConfidenceValue,
  formatExit,
  formatLastRun,
  formatMetricValue,
} from "./runtime-format.ts";
import { isSuccessfulMetricRun } from "./runtime-metrics.ts";
import type {
  AutoresearchReceipt,
  AutoresearchRunDecisionSummary,
  AutoresearchRunReceipt,
  AutoresearchRuntimeStatus,
  CommandExecutionSummary,
  ExecuteAutoresearchRunInput,
  ExecuteAutoresearchRunLiveDecisionInput,
  ExecuteAutoresearchRunResult,
} from "./runtime-model.ts";
import {
  appendReceipt,
  createRunReceipt,
  loadReceiptLog,
  parseMetricLines,
  resolveAutoresearchPaths,
} from "./runtime-receipts.ts";
import {
  buildAutoresearchRuntimeStatus,
  buildAutoresearchRuntimeStatusFromEntries,
  createCampaignSegmentConfigFromReceipt,
  createConfigFromInput,
  decorateRunDescription,
  defaultBenchmarkCommand,
  describeBenchmarkFailure,
  determineRunStatus,
  ensureEventLedgerInitializedFromReceipts,
  ensureMachineReadyForBoundedRun,
  getCurrentSegment,
  resolveChecksCommand,
} from "./runtime-status.ts";
import {
  describeChecksState,
  formatRunHistoryLine,
  hasOwn,
  isDecisionErrorOutcome,
  normalizeInlineReason,
} from "./runtime-status-format.ts";

const DEFAULT_BENCHMARK_TIMEOUT_SECONDS = 600;
const DEFAULT_CHECKS_TIMEOUT_SECONDS = 300;
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
  input.signal?.throwIfAborted();

  const paths = resolveAutoresearchPaths(cwd);
  const loadResult = loadReceiptLog(cwd);
  const entries = [...loadResult.entries];
  input.signal?.throwIfAborted();
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
  const candidateExecutionCwd = stringOrNull(input.experiment?.candidate?.worktreePath);
  const resolvedCandidateExecutionCwd = candidateExecutionCwd
    ? path.resolve(cwd, candidateExecutionCwd)
    : null;
  if (resolvedCandidateExecutionCwd && !existsSync(resolvedCandidateExecutionCwd)) {
    throw new Error(
      `candidateWorktree does not exist; refusing to measure controller cwd as candidate: ${resolvedCandidateExecutionCwd}`,
    );
  }
  const commandCwd = resolvedCandidateExecutionCwd ?? cwd;

  if (input.postureCommand?.trim()) {
    await assertAutoresearchPostureReady({
      cwd,
      command: input.postureCommand,
      timeoutSeconds: input.postureTimeoutSeconds ?? 15,
      signal: input.signal,
    });
    input.signal?.throwIfAborted();
  }
  ensureMachineReadyForBoundedRun(cwd, {
    allowBootstrapConfig: createdConfig,
    allowRebaselineReconfigure: input.reconfigure === true,
  });

  if (createdConfig) {
    input.signal?.throwIfAborted();
    appendReceipt(cwd, config);
    input.signal?.throwIfAborted();
    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.configureSegment(createCampaignSegmentConfigFromReceipt(config)),
        config.createdAt,
      ),
    );
  }
  input.signal?.throwIfAborted();
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
    cwd: commandCwd,
    timeoutSeconds: input.timeoutSeconds ?? DEFAULT_BENCHMARK_TIMEOUT_SECONDS,
    signal: input.signal,
  });
  input.signal?.throwIfAborted();

  const parsedMetrics = parseMetricLines(joinOutput(benchmark));
  const metricName = config.metricName;
  const hasPrimaryMetric = hasOwn(parsedMetrics, metricName);
  const benchmarkSucceeded = benchmark.exitCode === 0 && !benchmark.timedOut;
  const metricContractFailed = benchmarkSucceeded && !hasPrimaryMetric;
  const primaryMetric = hasPrimaryMetric ? parsedMetrics[metricName] : 0;

  if (benchmarkSucceeded && !metricContractFailed) {
    input.signal?.throwIfAborted();
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
    input.signal?.throwIfAborted();
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
      cwd: commandCwd,
      timeoutSeconds: input.checksTimeoutSeconds ?? DEFAULT_CHECKS_TIMEOUT_SECONDS,
      signal: input.signal,
    });
    input.signal?.throwIfAborted();
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
  const runKind = input.runKind ?? "ordinary";
  const runReceipt = createRunReceipt({
    status,
    runKind: runKind === "ordinary" ? undefined : runKind,
    experiment: input.experiment,
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
  runReceipt.empiricalDecisionClass = nextStatus.currentSegment.empiricalDecisionClass;

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
  input.signal?.throwIfAborted();
  if (decisionSummary) {
    runReceipt.decision = decisionSummary;
  }

  input.signal?.throwIfAborted();
  appendReceipt(cwd, runReceipt);
  input.signal?.throwIfAborted();
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
  input.signal?.throwIfAborted();
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

  input.signal?.throwIfAborted();
  const finalStatus = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

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
    status: finalStatus,
  };
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function assertAutoresearchPostureReady(input: {
  cwd: string;
  command: string;
  timeoutSeconds: number;
  signal?: AbortSignal;
}): Promise<void> {
  const posture = await runShellCommand(input);
  if (posture.exitCode !== 0 || posture.timedOut) {
    throw new Error(
      `Autoresearch posture gate failed: command exited ${formatExit(posture.exitCode, posture.timedOut)}; ${posture.outputTail}`,
    );
  }
  const gate = evaluateAutoresearchPostureOutput(joinOutput(posture));
  if (!gate.ready) {
    throw new Error(`Autoresearch posture gate blocked: ${gate.reason}`);
  }
}

function evaluateAutoresearchPostureOutput(output: string): { ready: boolean; reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(output.trim());
  } catch {
    return { ready: true, reason: "posture output was not JSON; treated as advisory" };
  }
  if (!value || typeof value !== "object") return { ready: true, reason: "posture ok" };
  const record = value as Record<string, unknown>;
  if (record.reconcileRecommended === true) {
    return { ready: false, reason: "reconcileRecommended=true" };
  }
  if (record.ready === false) {
    return { ready: false, reason: "ready=false" };
  }
  if (record.result === "blocked" || record.result === "unsafe") {
    return { ready: false, reason: `result=${String(record.result)}` };
  }
  if (typeof record.recommendedCommand === "string" && record.recommendedCommand.trim()) {
    return { ready: false, reason: `recommended command: ${record.recommendedCommand.trim()}` };
  }
  return { ready: true, reason: "posture ok" };
}

async function runAutoresearchPostRunDecision(input: {
  cwd: string;
  entries: AutoresearchReceipt[];
  status: AutoresearchRuntimeStatus;
  runReceipt: AutoresearchRunReceipt;
  liveDecision: ExecuteAutoresearchRunLiveDecisionInput;
  signal?: AbortSignal;
}): Promise<AutoresearchRunDecisionSummary> {
  input.signal?.throwIfAborted();
  const outcome = await input.liveDecision.runtime.runNextHypothesis(
    buildRuntimeNextHypothesisPacket(input),
    {
      cwd: input.cwd,
      currentCompany: input.liveDecision.currentCompany,
      model: input.liveDecision.model,
      signal: input.signal,
    },
  );
  input.signal?.throwIfAborted();
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
      `last run: ${formatLastRun(input.status.currentSegment.lastRunStatus, input.status.currentSegment.lastRunMetric, metricUnit, input.status.currentSegment.lastRunKind)}`,
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

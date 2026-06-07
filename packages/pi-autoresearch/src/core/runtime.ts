import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import {
  canCampaignMachineStartBoundedRun,
  isCampaignMachineAwaitingOperatorChoice,
  isCampaignMachineTerminalState,
} from "../machine/campaign.ts";
import { campaignEvents } from "../machine/events.ts";
import { formatAutoresearchAutoContinuationGateLines } from "./autoContinuation.ts";
import {
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  mapNextHypothesisOutcomeToCampaignDecision,
  type NextHypothesisDecisionOutcome,
  type NextHypothesisDecisionPacket,
} from "./decisions.ts";
import {
  beginAutoresearchCampaignGoal,
  buildAutoresearchCampaignGoalStatus,
  recordAutoresearchCampaignGoalSegment,
} from "./goal.ts";
import { appendLedgerEvent, createLedgerEventEntry } from "./ledger.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
} from "./llamacppCampaign.ts";
import {
  AUTORESEARCH_OPERATOR_ACTIONS,
  type AutoresearchControlStateV1,
  type AutoresearchOperatorAction,
  formatAutoresearchRuntimeSnapshotReuse,
  persistAutoresearchRuntimeSnapshot,
} from "./resume.ts";
import {
  applyDspxAdvisoryPlan,
  assertCampaignStartWillNotUseStaleActiveSegment,
  assertUsableFreshDspxProgramGenPlan,
  buildAutoresearchAutoplan,
  canBenchmarkScriptProposalDriveBaseline,
  formatCampaignStartNextToolCall,
  formatSetupNextToolCall,
  maybeWriteAutoresearchScript,
  resolveDspxRepoPath,
} from "./runtime-autoplan.ts";
import { normalizeAutoresearchCandidateLifecyclePolicy } from "./runtime-candidate-policy.ts";
import { buildAutoresearchSegmentCloseout } from "./runtime-closeout.ts";
import { joinOutput, runProcessCommand, runShellCommand } from "./runtime-command.ts";
import { normalizeArray, stringOrNull } from "./runtime-common.ts";
import {
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_LOCAL_ARTIFACTS,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
} from "./runtime-constants.ts";
import { formatAutoresearchDashboard } from "./runtime-dashboard.ts";
import {
  formatAutoresearchGuidedCandidateJourneyLines,
  formatAutoresearchSetupGuideLines,
} from "./runtime-dashboard-guidance.ts";
import {
  buildAutoresearchAkEvidencePacket,
  buildAutoresearchKnowledgeExportPacket,
  buildAutoresearchOracleEvidencePacket,
  formatAutoresearchAkEvidencePacket,
  formatAutoresearchKnowledgeExportPacket,
  formatAutoresearchLearningExportResult,
  formatAutoresearchOracleEvidenceExportResult,
  formatAutoresearchOracleEvidencePacket,
  writeAutoresearchKnowledgeExportPacket,
  writeAutoresearchOracleEvidencePacket,
} from "./runtime-evidence-exports.ts";
import {
  formatConfidenceValue,
  formatEmpiricalPosture,
  formatExit,
  formatLastRun,
  formatMetricInterpretation,
  formatMetricThresholdValue,
  formatMetricValue,
  formatTimestamp,
} from "./runtime-format.ts";
import { isSuccessfulMetricRun } from "./runtime-metrics.ts";
import type {
  AutoresearchLoopPeerHandoff,
  AutoresearchLoopPeerMode,
  AutoresearchLoopProgressEvent,
  AutoresearchPeerAssistLane,
  AutoresearchPeerAssistPlan,
  AutoresearchReceipt,
  AutoresearchRunDecisionSummary,
  AutoresearchRunReceipt,
  AutoresearchRuntimeStatus,
  AutoresearchSegmentCloseout,
  BuildAutoresearchPeerAssistInput,
  CommandExecutionSummary,
  ExecuteAutoresearchCampaignStartInput,
  ExecuteAutoresearchCampaignStartResult,
  ExecuteAutoresearchFinalizeDecisionInput,
  ExecuteAutoresearchFinalizeDecisionResult,
  ExecuteAutoresearchLoopInput,
  ExecuteAutoresearchLoopResult,
  ExecuteAutoresearchResumeApplyInput,
  ExecuteAutoresearchResumeApplyResult,
  ExecuteAutoresearchRunInput,
  ExecuteAutoresearchRunLiveDecisionInput,
  ExecuteAutoresearchRunResult,
  ExecuteAutoresearchSetupDecisionInput,
  ExecuteAutoresearchSetupDecisionResult,
  ExecuteAutoresearchSetupInput,
  ExecuteAutoresearchSetupResult,
  InspectAutoresearchRuntimeControlResult,
  SetAutoresearchRuntimeControlInput,
  SetAutoresearchRuntimeControlResult,
} from "./runtime-model.ts";
import {
  buildAutoresearchPeerAssistPlan,
  formatAutoresearchPeerAssistPlan,
  formatAutoresearchPeerLaneRecommendations,
} from "./runtime-peer-assist.ts";
import {
  appendReceipt,
  createConfigReceipt,
  createRunReceipt,
  loadReceiptLog,
  parseMetricLines,
  resolveAutoresearchPaths,
} from "./runtime-receipts.ts";
import {
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchResumePlanFromStatus,
  formatAutoresearchResumeApplyPlanSummaryLines,
  formatAutoresearchResumePlanSummaryLines,
} from "./runtime-resume-plan.ts";
import {
  buildAutoresearchRuntimeStatus,
  buildAutoresearchRuntimeStatusFromEntries,
  createCampaignSegmentConfigFromReceipt,
  createConfigFromInput,
  createRuntimeSnapshotInput,
  decorateRunDescription,
  defaultBenchmarkCommand,
  describeBenchmarkFailure,
  determineRunStatus,
  enrichFinalizeDecisionPacket,
  enrichSetupDecisionPacket,
  ensureEventLedgerInitializedFromReceipts,
  ensureMachineReadyForBoundedRun,
  formatLastPostRunDecision,
  formatLlamacppCampaignProjectionAvailability,
  formatLlamacppCampaignProjectionLabel,
  formatPromptVaultDecisionAvailability,
  getCurrentSegment,
  resolveChecksCommand,
} from "./runtime-status.ts";
import {
  describeChecksState,
  formatCandidateBindingLines,
  formatExperimentLabel,
  formatExperimentLineageLines,
  formatFinalizeBlockingReason,
  formatRunHistoryLine,
  formatSetupBlockingReason,
  formatTargetFiles,
  hasOwn,
  isDecisionErrorOutcome,
  normalizeInlineReason,
} from "./runtime-status-format.ts";
import { AUTORESEARCH_SELF_HOSTING_TOOL_NAME } from "./selfHosting.ts";

export {
  formatAutoresearchCampaignGoalStatus,
  setAutoresearchCampaignGoalControl,
} from "./goal.ts";
export type {
  AutoresearchAdapterContractCatalog,
  AutoresearchAdapterContractEntry,
  AutoresearchAdapterPacketValidationIssue,
  AutoresearchAdapterPacketValidationResult,
} from "./runtime-adapter.ts";
export {
  buildAutoresearchAdapterContractCatalog,
  validateAutoresearchAdapterPacket,
} from "./runtime-adapter.ts";
export {
  formatAutoresearchAdapterContractCatalog,
  formatAutoresearchAdapterPacketValidationResult,
} from "./runtime-adapter-format.ts";
export { buildAutoresearchAutoplan, formatAutoresearchAutoplanResult } from "./runtime-autoplan.ts";
export {
  buildAutoresearchCandidateBindPlan,
  formatAutoresearchCandidateBindPlan,
} from "./runtime-candidate-bind.ts";
export {
  applyAutoresearchCandidateInventoryCleanup,
  buildAutoresearchCandidateInventoryCleanupPlan,
  formatAutoresearchCandidateInventoryCleanupPlan,
} from "./runtime-candidate-cleanup.ts";
export { buildAutoresearchCandidateDecisionWorkbench } from "./runtime-candidate-decision.ts";
export {
  formatAutoresearchCandidateDecisionDashboardSummary,
  formatAutoresearchCandidateDecisionWorkbench,
} from "./runtime-candidate-decision-format.ts";
export {
  buildAutoresearchCandidateResultPacket,
  formatAutoresearchCandidateResultExportResult,
  formatAutoresearchCandidateResultPacket,
  writeAutoresearchCandidateResultPacket,
} from "./runtime-candidate-result.ts";
export * from "./runtime-constants.ts";
export { buildAutoresearchSegmentCloseout };
export { formatAutoresearchDashboard };
export {
  buildAutoresearchAkEvidencePacket,
  buildAutoresearchKnowledgeExportPacket,
  buildAutoresearchOracleEvidencePacket,
  formatAutoresearchAkEvidencePacket,
  formatAutoresearchKnowledgeExportPacket,
  formatAutoresearchLearningExportResult,
  formatAutoresearchOracleEvidenceExportResult,
  formatAutoresearchOracleEvidencePacket,
  writeAutoresearchKnowledgeExportPacket,
  writeAutoresearchOracleEvidencePacket,
};
export { buildAutoresearchPeerAssistPlan, formatAutoresearchPeerAssistPlan };
export { exportAutoresearchDashboardHtml } from "./runtime-dashboard-export.ts";
export type {
  AutoresearchDashboardChartPoint,
  AutoresearchMatrixCampaignArtifactKind,
  AutoresearchMatrixCampaignArtifactReference,
  AutoresearchMatrixCampaignArtifactSummary,
  AutoresearchMatrixCampaignCellSummary,
  AutoresearchMatrixCampaignDashboardChart,
  AutoresearchOpenCandidateReviewPosture,
} from "./runtime-matrix.ts";
export {
  AUTORESEARCH_MATRIX_CAMPAIGN_ARTIFACT_ROOTS,
  discoverAutoresearchMatrixCampaignArtifacts,
} from "./runtime-matrix.ts";
export {
  buildAutoresearchMetricReadinessReview,
  describeMetricThresholdCaveat,
} from "./runtime-metric-readiness.ts";
export * from "./runtime-model.ts";
export {
  appendReceipt,
  createConfigReceipt,
  createRunReceipt,
  loadReceiptLog,
  parseMetricLines,
  parseReceiptLine,
  resolveAutoresearchPaths,
  serializeReceipt,
} from "./runtime-receipts.ts";
export {
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchResumePlan,
  formatAutoresearchResumeApplyPlan,
  formatAutoresearchResumePlan,
} from "./runtime-resume-plan.ts";
export { buildAutoresearchRuntimeStatus } from "./runtime-status.ts";

const DEFAULT_BENCHMARK_TIMEOUT_SECONDS = 600;
const DEFAULT_CHECKS_TIMEOUT_SECONDS = 300;
export async function executeAutoresearchSetup(
  input: ExecuteAutoresearchSetupInput,
): Promise<ExecuteAutoresearchSetupResult> {
  const cwd = path.resolve(input.cwd);
  const action = input.action ?? "plan";
  const paths = resolveAutoresearchPaths(cwd);
  const plannedConfig = createConfigReceipt(input);
  let wroteBenchmarkScript = false;
  let wroteChecksScript = false;

  if (action === "plan") {
    return {
      cwd,
      action,
      plannedConfig,
      appliedConfig: false,
      wroteBenchmarkScript: false,
      wroteChecksScript: false,
      run: null,
      status: buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false }),
      nextToolCall: formatSetupNextToolCall(cwd, plannedConfig, "apply"),
    };
  }

  wroteBenchmarkScript = maybeWriteAutoresearchScript({
    path: paths.benchmarkScriptPath,
    content: input.benchmarkScript,
    allowOverwrite: input.allowOverwriteScripts === true,
  });
  wroteChecksScript = maybeWriteAutoresearchScript({
    path: paths.checksScriptPath,
    content: input.checksScript ?? undefined,
    allowOverwrite: input.allowOverwriteScripts === true,
  });

  if (action === "baseline") {
    const run = await executeAutoresearchRun({
      cwd,
      description: input.description?.trim() || `baseline for ${plannedConfig.name}`,
      name: plannedConfig.name,
      metricName: plannedConfig.metricName,
      metricUnit: plannedConfig.metricUnit,
      direction: plannedConfig.direction,
      metricThreshold: plannedConfig.metricThreshold,
      benchmarkCommand: plannedConfig.benchmarkCommand,
      checksCommand: plannedConfig.checksCommand,
      reconfigure: input.reconfigure,
      postureCommand: input.postureCommand,
      postureTimeoutSeconds: input.postureTimeoutSeconds,
      timeoutSeconds: input.timeoutSeconds,
      checksTimeoutSeconds: input.checksTimeoutSeconds,
      signal: input.signal,
    });
    return {
      cwd,
      action,
      plannedConfig,
      appliedConfig: run.createdConfig,
      wroteBenchmarkScript,
      wroteChecksScript,
      run,
      status: run.status,
      nextToolCall: `autoresearch_runtime_loop({ cwd: ${JSON.stringify(cwd)}, goal: ${JSON.stringify(input.description ?? plannedConfig.name)}, maxIterations: 3 })`,
    };
  }

  const currentStatus = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  if (currentStatus.currentSegment.configured && input.reconfigure !== true) {
    throw new Error(
      "runtime already has a configured segment; pass reconfigure=true to append a new config receipt",
    );
  }
  const entries = loadReceiptLog(cwd).entries;
  ensureEventLedgerInitializedFromReceipts(cwd, entries);
  appendReceipt(cwd, plannedConfig);
  appendLedgerEvent(
    cwd,
    createLedgerEventEntry(
      campaignEvents.configureSegment(createCampaignSegmentConfigFromReceipt(plannedConfig)),
      plannedConfig.createdAt,
    ),
  );

  return {
    cwd,
    action,
    plannedConfig,
    appliedConfig: true,
    wroteBenchmarkScript,
    wroteChecksScript,
    run: null,
    status: buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true }),
    nextToolCall: formatSetupNextToolCall(cwd, plannedConfig, "baseline"),
  };
}

export function formatAutoresearchSetupResult(result: ExecuteAutoresearchSetupResult): string {
  return [
    "# PI-AUTORESEARCH SETUP",
    "",
    `- cwd: ${result.cwd}`,
    `- action: ${result.action}`,
    `- applied config: ${result.appliedConfig ? "yes" : "no"}`,
    `- wrote benchmark script: ${result.wroteBenchmarkScript ? "yes" : "no"}`,
    `- wrote checks script: ${result.wroteChecksScript ? "yes" : "no"}`,
    `- campaign: ${result.plannedConfig.name}`,
    `- metric: ${result.plannedConfig.metricName} (${result.plannedConfig.metricUnit || "unitless"}, ${result.plannedConfig.direction} is better)`,
    `- success threshold: ${formatMetricThresholdValue(result.plannedConfig.metricThreshold ?? null, result.plannedConfig.metricUnit)}`,
    `- benchmark command: ${result.plannedConfig.benchmarkCommand ?? "(default/autodetect)"}`,
    `- checks command: ${result.plannedConfig.checksCommand ?? "(none)"}`,
    `- machine state: ${result.status.runtimeProjection.state}`,
    result.run
      ? `- baseline: ${result.run.runReceipt.status} ${result.run.primaryMetricName}=${formatMetricValue(result.run.primaryMetric, result.status.currentSegment.metricUnit)}`
      : "- baseline: not run",
    "",
    "## Next exact tool call",
    `\`${result.nextToolCall}\``,
  ].join("\n");
}

export async function executeAutoresearchCampaignStart(
  input: ExecuteAutoresearchCampaignStartInput,
): Promise<ExecuteAutoresearchCampaignStartResult> {
  const cwd = path.resolve(input.cwd);
  const objective = input.objective.trim();
  if (!objective) throw new Error("objective is required for autoresearch_campaign_start");

  const setupMode = input.setupMode ?? "autoplan";
  const runMode = input.runMode ?? "plan_only";
  const maxIterations = input.maxIterations ?? 3;
  if (maxIterations < 1) throw new Error("maxIterations must be at least 1");
  const candidatePolicy = normalizeAutoresearchCandidateLifecyclePolicy(input.candidatePolicy);
  const shouldRunDspxProgramGen = input.runDspxProgramGen === true;
  const shouldMaterializeDspxIntent =
    input.materializeDspxIntent === true || shouldRunDspxProgramGen;

  const buildAutoplan = (dspxBehaviorPathOverride?: string) =>
    buildAutoresearchAutoplan({
      cwd,
      objective,
      planner: input.planner,
      filesInScope: input.filesInScope,
      offLimits: input.offLimits,
      constraints: input.constraints,
      benchmarkCommand: input.benchmarkCommand,
      checksCommand: input.checksCommand,
      metricName: input.metricName,
      metricUnit: input.metricUnit,
      direction: input.direction,
      metricThreshold: input.metricThreshold,
      materializeDspxIntent: shouldMaterializeDspxIntent,
      dspxIntentPath: input.dspxIntentPath,
      dspxOutdir: input.dspxOutdir,
      dspxBehaviorPath: dspxBehaviorPathOverride ?? input.dspxBehaviorPath,
    });

  let autoplan = buildAutoplan();
  let dspxProgramGenRun: CommandExecutionSummary | null = null;
  if (shouldRunDspxProgramGen) {
    if (input.planner !== "dspx_program" || !autoplan.dspxProgramGen) {
      throw new Error("runDspxProgramGen requires planner=dspx_program.");
    }
    const behaviorPath = path.join(autoplan.dspxProgramGen.outdir, "behavior_results.json");
    rmSync(behaviorPath, { force: true });
    const dspxProgramGenTimeoutSeconds = input.dspxProgramGenTimeoutSeconds ?? 120;
    if (
      !Number.isFinite(dspxProgramGenTimeoutSeconds) ||
      dspxProgramGenTimeoutSeconds < 1 ||
      dspxProgramGenTimeoutSeconds > 600
    ) {
      throw new Error(
        `dspxProgramGenTimeoutSeconds must be a finite number between 1 and 600, received: ${String(input.dspxProgramGenTimeoutSeconds)}`,
      );
    }
    dspxProgramGenRun = await runProcessCommand({
      command: autoplan.dspxProgramGen.command,
      executable: autoplan.dspxProgramGen.argv[0] ?? "just",
      args: autoplan.dspxProgramGen.argv.slice(1),
      cwd: resolveDspxRepoPath(),
      timeoutSeconds: dspxProgramGenTimeoutSeconds,
      signal: input.signal,
    });
    if (dspxProgramGenRun.exitCode !== 0 || dspxProgramGenRun.timedOut) {
      throw new Error(
        `DSPx program-gen failed or timed out (exit=${String(dspxProgramGenRun.exitCode)}, timedOut=${String(dspxProgramGenRun.timedOut)}): ${dspxProgramGenRun.outputTail}`,
      );
    }
    const dspxAutoplan = buildAutoplan(behaviorPath);
    if (dspxAutoplan.dspxAdvisory?.behaviorPath !== behaviorPath) {
      throw new Error(
        "runDspxProgramGen must read behavior_results.json from the generated DSPx outdir.",
      );
    }
    assertUsableFreshDspxProgramGenPlan(dspxAutoplan);
    autoplan = applyDspxAdvisoryPlan(dspxAutoplan);
  }

  const warnings = [...autoplan.risks];
  let setupDecision: ExecuteAutoresearchSetupDecisionResult | null = null;
  if (setupMode === "prompt_vault_setup") {
    if (!input.decisionRuntime) {
      throw new Error("setupMode=prompt_vault_setup requires a decisionRuntime");
    }
    setupDecision = await requestAutoresearchSetupDecision({
      cwd,
      packet: {
        optimizationObjective: objective,
        repoContext: [
          `runtime_status=${autoplan.status.runtimeProjection.state}`,
          `autoplan_campaign=${autoplan.config.name}`,
          `autoplan_metric=${autoplan.config.metricName}`,
        ],
        filesInScope: autoplan.filesInScope,
        offLimits: autoplan.offLimits,
        benchmarkSurfaces: [
          autoplan.benchmarkCommand ?? "(missing benchmark command)",
          autoplan.checksCommand ? `checks: ${autoplan.checksCommand}` : "checks: none",
        ],
        existingArtifacts: AUTORESEARCH_LOCAL_ARTIFACTS.filter((artifact) =>
          existsSync(path.join(cwd, artifact)),
        ),
        hardConstraints: autoplan.constraints,
        blockers: autoplan.risks,
      },
      runtime: input.decisionRuntime,
      model: input.model,
      signal: input.signal,
    });
  }

  const benchmarkScriptProposal = canBenchmarkScriptProposalDriveBaseline(
    autoplan.benchmarkScriptProposal,
  )
    ? autoplan.benchmarkScriptProposal
    : null;
  const benchmarkCommand = benchmarkScriptProposal?.benchmarkCommand ?? autoplan.benchmarkCommand;

  if (runMode !== "plan_only" && !benchmarkCommand) {
    throw new Error(
      "autoresearch_campaign_start cannot execute because no benchmark command is available; rerun with runMode=plan_only or pass benchmarkCommand.",
    );
  }
  if (runMode !== "plan_only" && input.reconfigure !== true) {
    assertCampaignStartWillNotUseStaleActiveSegment({
      cwd,
      objective,
      runMode,
      setupMode,
      maxIterations,
      currentSegment: autoplan.status.currentSegment,
      requestedConfig: autoplan.config,
      benchmarkCommand,
      checksCommand: autoplan.checksCommand,
    });
  }

  let setupResult: ExecuteAutoresearchSetupResult | null = null;
  let loopResult: ExecuteAutoresearchLoopResult | null = null;

  if (runMode === "baseline") {
    setupResult = await executeAutoresearchSetup({
      cwd,
      action: "baseline",
      name: autoplan.config.name,
      metricName: autoplan.config.metricName,
      metricUnit: autoplan.config.metricUnit,
      direction: autoplan.config.direction,
      metricThreshold: autoplan.config.metricThreshold,
      benchmarkCommand: benchmarkCommand ?? undefined,
      checksCommand: autoplan.checksCommand,
      description: input.description ?? `Baseline for ${objective}`,
      benchmarkScript: benchmarkScriptProposal?.benchmarkScript,
      allowOverwriteScripts: input.allowOverwriteScripts,
      reconfigure: input.reconfigure,
      postureCommand: input.postureCommand,
      postureTimeoutSeconds: input.postureTimeoutSeconds,
      timeoutSeconds: input.timeoutSeconds,
      checksTimeoutSeconds: input.checksTimeoutSeconds,
      signal: input.signal,
    });
  }

  if (runMode === "bounded_loop") {
    loopResult = await executeAutoresearchLoop({
      cwd,
      goal: objective,
      maxIterations,
      maxWallClockMinutes: input.maxWallClockMinutes,
      description: input.description ?? `Start supervised campaign for ${objective}`,
      name: autoplan.config.name,
      metricName: autoplan.config.metricName,
      metricUnit: autoplan.config.metricUnit,
      direction: autoplan.config.direction,
      metricThreshold: autoplan.config.metricThreshold,
      benchmarkCommand: benchmarkCommand ?? undefined,
      checksCommand: autoplan.checksCommand,
      timeoutSeconds: input.timeoutSeconds,
      checksTimeoutSeconds: input.checksTimeoutSeconds,
      reconfigure: input.reconfigure,
      postureCommand: input.postureCommand,
      postureTimeoutSeconds: input.postureTimeoutSeconds,
      decisionGoal: input.decisionGoal,
      decisionRuntime: input.decisionRuntime,
      decisionConstraints: input.decisionConstraints ?? autoplan.constraints,
      decisionFilesInScope: input.decisionFilesInScope ?? autoplan.filesInScope,
      decisionOffLimits: input.decisionOffLimits ?? autoplan.offLimits,
      decisionIdeasBacklog: input.decisionIdeasBacklog,
      decisionAsiNotes: input.decisionAsiNotes,
      decisionDeadEndMemory: input.decisionDeadEndMemory,
      model: input.model,
      stopOn: input.stopOn,
      peerMode: input.peerMode,
      campaignGoalId: input.campaignGoalId,
      campaignGoalIterationBudget: input.campaignGoalIterationBudget,
      campaignGoalWallClockMinutesBudget: input.campaignGoalWallClockMinutesBudget,
      campaignGoalTokenBudget: input.campaignGoalTokenBudget,
      campaignGoalAutoContinue: input.campaignGoalAutoContinue,
      signal: input.signal,
      onProgress: input.onProgress,
    });
  }

  const status = loopResult?.status ?? setupResult?.status ?? buildAutoresearchRuntimeStatus(cwd);
  return {
    cwd,
    objective,
    setupMode,
    runMode,
    maxIterations,
    autoplan,
    setupDecision,
    setupResult,
    loopResult,
    dspxProgramGenRun,
    candidatePolicy,
    status,
    nextToolCall: formatCampaignStartNextToolCall({
      cwd,
      objective,
      runMode,
      maxIterations,
      setupMode,
      canExecute: Boolean(benchmarkCommand),
      candidatePolicy,
      reconfigure: input.reconfigure === true || autoplan.status.currentSegment.configured,
    }),
    warnings,
  };
}

export function formatAutoresearchCampaignStartResult(
  result: ExecuteAutoresearchCampaignStartResult,
): string {
  const setupDecisionLines = result.setupDecision
    ? [
        "",
        "## Governed setup decision",
        `- status: ${result.setupDecision.outcome.status}`,
        `- template: ${result.setupDecision.outcome.templateName}`,
        `- kind: ${result.setupDecision.outcome.kind}`,
      ]
    : [];
  const dspxProgramGenRunLines = result.dspxProgramGenRun
    ? [
        "",
        "## DSPx program-gen run",
        `- command: ${result.dspxProgramGenRun.command}`,
        `- exit: ${String(result.dspxProgramGenRun.exitCode)}`,
        `- timed out: ${result.dspxProgramGenRun.timedOut ? "yes" : "no"}`,
        `- duration: ${result.dspxProgramGenRun.durationSeconds.toFixed(2)}s`,
      ]
    : [];
  const dspxPlannerOutputLines =
    result.autoplan.dspxAdvisory?.authority === "validated_generated_dspy_planner_output"
      ? [
          "",
          "## Generated DSPy planner output (validated)",
          `- behavior: ${result.autoplan.dspxAdvisory.behaviorPath}`,
          `- status: ${result.autoplan.dspxAdvisory.status ?? "unknown"} (${result.autoplan.dspxAdvisory.passed}/${result.autoplan.dspxAdvisory.total} passed)`,
          `- matched objective: ${result.autoplan.dspxAdvisory.matchedObjective ? "yes" : "no"}`,
          ...(result.autoplan.dspxAdvisory.proposal
            ? [
                `- campaign plan: ${result.autoplan.dspxAdvisory.proposal.campaignName ?? "(missing)"}`,
                `- metric plan: ${result.autoplan.dspxAdvisory.proposal.metricName ?? "(missing)"}`,
                `- benchmark plan: ${result.autoplan.dspxAdvisory.proposal.benchmarkCommand ?? "(missing)"}`,
                `- checks plan: ${result.autoplan.dspxAdvisory.proposal.checksCommand ?? "(none)"}`,
              ]
            : ["- campaign plan: (missing)"]),
          "- boundary: generated DSPy planner output configures only this local pi-autoresearch campaign; pi-autoresearch still owns setup application, receipts, bounded runs, and stop gates.",
        ]
      : [];
  const executionLines = result.loopResult
    ? [
        "",
        "## Bounded loop",
        `- completed iterations: ${result.loopResult.completedIterations}/${result.loopResult.requestedIterations}`,
        `- stop reason: ${result.loopResult.stopReason}`,
        `- peer mode: ${result.loopResult.peerMode}`,
        `- peer lane: ${result.loopResult.peerAssist.lane}`,
        `- peer reason: ${result.loopResult.peerAssist.reason}`,
        `- peer tool: ${result.loopResult.peerAssist.toolName ?? "(none)"}`,
        result.loopResult.peerAssist.toolCall
          ? `- peer call: ${result.loopResult.peerAssist.toolCall}`
          : "- peer call: (none)",
        `- peer launch handoff: ${result.loopResult.peerLaunchHandoff.status}`,
        `- peer launch note: ${result.loopResult.peerLaunchHandoff.note}`,
        `- peer evidence boundary: ${result.loopResult.peerAssist.evidenceWarning}`,
        `- campaign goal status: ${result.loopResult.campaignGoal.status}`,
        `- campaign goal progress: ${result.loopResult.campaignGoal.usage.completedIterations}/${result.loopResult.campaignGoal.budget.iterations ?? "unbounded"} iteration(s)`,
        `- campaign goal next continuation: ${result.loopResult.campaignGoal.nextContinuationCall ?? "(none)"}`,
      ]
    : result.setupResult
      ? [
          "",
          "## Baseline",
          `- applied config: ${result.setupResult.appliedConfig ? "yes" : "no"}`,
          result.setupResult.run
            ? `- result: ${result.setupResult.run.runReceipt.status} ${result.setupResult.run.primaryMetricName}=${formatMetricValue(result.setupResult.run.primaryMetric, result.setupResult.status.currentSegment.metricUnit)}`
            : "- result: not run",
        ]
      : [];

  return [
    "# PI-AUTORESEARCH CAMPAIGN START",
    "",
    `- cwd: ${result.cwd}`,
    `- objective: ${result.objective}`,
    `- setup mode: ${result.setupMode}`,
    `- run mode: ${result.runMode}`,
    `- campaign: ${result.autoplan.config.name}`,
    `- metric: ${result.autoplan.config.metricName} (${result.autoplan.config.metricUnit || "unitless"}, ${result.autoplan.config.direction} is better)`,
    `- success threshold: ${formatMetricThresholdValue(result.autoplan.config.metricThreshold ?? null, result.autoplan.config.metricUnit)}`,
    `- benchmark command: ${result.autoplan.benchmarkCommand ?? "(missing)"}`,
    `- checks command: ${result.autoplan.checksCommand ?? "(none)"}`,
    `- machine state: ${result.status.runtimeProjection.state}`,
    "",
    "## Scope",
    `- files in scope: ${formatTargetFiles(result.autoplan.filesInScope)}`,
    `- off limits: ${formatTargetFiles(result.autoplan.offLimits)}`,
    "",
    "## Measurement contract",
    ...(result.autoplan.measurementContract
      ? [
          `- authority: ${result.autoplan.measurementContract.optimizationAuthority}`,
          `- freshness: ${result.autoplan.measurementContract.freshness}`,
          `- causal link: ${result.autoplan.measurementContract.causalLink}`,
          `- reason: ${result.autoplan.measurementContract.reason}`,
        ]
      : ["- unavailable; review benchmark command before execution"]),
    "",
    "## Candidate lifecycle policy",
    `- mode: ${result.candidatePolicy.mode}`,
    `- keep: ${result.candidatePolicy.keep}`,
    `- discard: ${result.candidatePolicy.discard}`,
    `- rewind: ${result.candidatePolicy.rewind}`,
    `- authority: ${result.candidatePolicy.authority}`,
    `- worktree role: ${result.candidatePolicy.worktreeRole}`,
    `- replay-fabric role: ${result.candidatePolicy.replayFabricRole}`,
    `- ASC rewind role: ${result.candidatePolicy.ascRewindRole}`,
    ...setupDecisionLines,
    ...dspxProgramGenRunLines,
    ...dspxPlannerOutputLines,
    ...executionLines,
    "",
    "## Warnings / gates",
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Next exact tool call",
    `\`${result.nextToolCall}\``,
    "",
    "## Dashboard",
    formatAutoresearchDashboard(result.status, result.candidatePolicy),
  ].join("\n");
}

export async function executeAutoresearchResumeApply(
  input: ExecuteAutoresearchResumeApplyInput,
): Promise<ExecuteAutoresearchResumeApplyResult> {
  const cwd = path.resolve(input.cwd);
  if (input.operatorConfirmation !== "RUN FOREGROUND RESUME") {
    throw new Error('operatorConfirmation must exactly equal "RUN FOREGROUND RESUME"');
  }
  if (!Number.isInteger(input.maxIterations) || input.maxIterations < 1) {
    throw new Error("maxIterations must be a positive integer");
  }
  if (!Number.isFinite(input.maxWallClockMinutes) || input.maxWallClockMinutes <= 0) {
    throw new Error("maxWallClockMinutes must be a positive number");
  }

  const applyPlan = buildAutoresearchResumeApplyPlan(cwd);
  if (!applyPlan.planReady) {
    throw new Error(
      `resume_apply is blocked: ${applyPlan.blockedReasons.join("; ") || "plan is not ready"}`,
    );
  }
  if (applyPlan.resumePlan.segmentKey !== input.segmentKey) {
    throw new Error("segmentKey does not match the current reusable resume plan");
  }
  if (applyPlan.resumePlan.runtimeKey !== input.runtimeKey) {
    throw new Error("runtimeKey does not match the current reusable resume plan");
  }

  const loopResult = await executeAutoresearchLoop({
    cwd,
    goal: applyPlan.resumePlan.campaign ?? "resume-apply",
    maxIterations: input.maxIterations,
    maxWallClockMinutes: input.maxWallClockMinutes,
    description:
      input.description ??
      `foreground resume for ${applyPlan.resumePlan.campaign ?? "current autoresearch campaign"}`,
    timeoutSeconds: input.timeoutSeconds,
    checksTimeoutSeconds: input.checksTimeoutSeconds,
    postureCommand: input.postureCommand,
    postureTimeoutSeconds: input.postureTimeoutSeconds,
    peerMode: "off",
    signal: input.signal,
    onProgress: input.onProgress,
  });

  return {
    cwd,
    action: "resume_apply",
    executionAuthorized: true,
    applyPlan,
    loopResult,
    authorityWarnings: [
      "resume_apply ran only inside this foreground tool call with explicit budgets and exact operator confirmation",
      "no daemon, background restart, peer launch, candidate lifecycle mutation, package-local promotion, or external evidence/learning write was authorized",
    ],
  };
}

export function formatAutoresearchResumeApplyResult(
  result: ExecuteAutoresearchResumeApplyResult,
): string {
  return [
    "# PI-AUTORESEARCH RESUME APPLY",
    "",
    `- cwd: ${result.cwd}`,
    `- action: ${result.action}`,
    `- execution authorized: ${result.executionAuthorized ? "yes" : "no"}`,
    `- completed iterations: ${result.loopResult.completedIterations}/${result.loopResult.requestedIterations}`,
    `- stop reason: ${result.loopResult.stopReason}`,
    `- elapsed: ${result.loopResult.elapsedSeconds.toFixed(2)}s`,
    `- final machine state: ${result.loopResult.status.runtimeProjection.state}`,
    "",
    "## Applied plan",
    ...formatAutoresearchResumeApplyPlanSummaryLines(result.applyPlan),
    "",
    "## Loop result",
    ...formatAutoresearchLoopResult(result.loopResult).split("\n"),
    "",
    "## Authority warnings",
    ...result.authorityWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

export function formatAutoresearchStatusText(status: AutoresearchRuntimeStatus): string {
  const currentSegmentLines = status.currentSegment.configured
    ? [
        `- configured campaign: ${status.currentSegment.name ?? "(unnamed)"}`,
        `- primary metric: ${status.currentSegment.metricName ?? "(unset)"} (${status.currentSegment.metricUnit || "unitless"}, ${status.currentSegment.direction ?? "unset"} is better)`,
        `- success threshold: ${formatMetricThresholdValue(status.currentSegment.metricThreshold, status.currentSegment.metricUnit)}`,
        `- benchmark command: ${status.currentSegment.benchmarkCommand ?? "(unset)"}`,
        `- checks command: ${status.currentSegment.checksCommand ?? "(none)"}`,
        `- current-segment runs: ${status.currentSegment.runCount} total / ${status.currentSegment.successfulRunCount} successful`,
        `- baseline metric: ${formatMetricValue(status.currentSegment.baselineMetric, status.currentSegment.metricUnit)}`,
        `- best metric: ${formatMetricValue(status.currentSegment.bestMetric, status.currentSegment.metricUnit)}`,
        `- confidence: ${formatConfidenceValue(status.currentSegment.confidence)}`,
        `- empirical decision: ${status.currentSegment.empiricalDecisionClass}`,
        `- empirical posture: ${formatEmpiricalPosture(status.empiricalPosture)}`,
        `- timing interpretation: ${formatMetricInterpretation(status.currentSegment.metricInterpretation, status.currentSegment.metricUnit)}`,
        `- last run: ${formatLastRun(status.currentSegment.lastRunStatus, status.currentSegment.lastRunMetric, status.currentSegment.metricUnit, status.currentSegment.lastRunKind)}`,
      ]
    : [
        "- configured campaign: no",
        "- current-segment runs: 0 total / 0 successful",
        "- baseline metric: (n/a)",
        "- best metric: (n/a)",
        "- confidence: (n/a)",
        "- empirical decision: not_evaluated",
        `- empirical posture: ${formatEmpiricalPosture(status.empiricalPosture)}`,
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
    `- campaign goal status: ${status.campaignGoal.status}`,
    `- campaign goal objective: ${status.campaignGoal.objective ?? "(none)"}`,
    `- campaign goal progress: ${status.campaignGoal.usage.completedIterations}/${status.campaignGoal.budget.iterations ?? "unbounded"} iteration(s) across ${status.campaignGoal.usage.foregroundSegments} foreground segment(s)`,
    `- campaign goal next continuation: ${status.campaignGoal.nextContinuationCall ?? "(none)"}`,
    `- auto-continuation eligible: ${status.autoContinuation.eligible ? "yes" : "no"}`,
    `- auto-continuation follow-up: ${status.autoContinuation.eligible ? "will be sent after settle window" : "will not be sent"}`,
    `- auto-continuation blockers: ${status.autoContinuation.blockedReasons.length > 0 ? status.autoContinuation.blockedReasons.join(", ") : "(none)"}`,
    ...formatAutoresearchAutoContinuationGateLines(status.autoContinuation),
    `- event ledger present: ${projection.hasLedger ? "yes" : "no"}`,
    `- invalid ledger lines: ${projection.invalidLedgerLines}`,
    `- ledger replay: ${projection.replayedEventCount}/${projection.eventCount} events accepted`,
    `- ledger replay issues: ${projection.rejectedEvents.length}`,
    `- projection sync issues: ${projection.syncIssues.length}`,
    `- live Prompt Vault decisions: ${formatPromptVaultDecisionAvailability(status.promptVaultDecisions.availability)}`,
    `- last post-run decision: ${formatLastPostRunDecision(status.promptVaultDecisions.lastPostRunDecision)}`,
    `- manifest campaign projection: ${formatLlamacppCampaignProjectionAvailability(status.llamacppCampaignProjection.availability)}`,
    `- manifest campaign projection path: ${status.llamacppCampaignProjection.projectionPath ?? "(unresolved)"}`,
    `- projected manifest campaign: ${formatLlamacppCampaignProjectionLabel(status.llamacppCampaignProjection)}`,
    `- projected receipt root: ${status.llamacppCampaignProjection.receiptRootPath ?? "(none)"}`,
    `- projected overall state: ${status.llamacppCampaignProjection.overallState ?? "(none)"}`,
    `- projection stale reason: ${status.llamacppCampaignProjection.staleReason ?? "(none)"}`,
    ...currentSegmentLines,
    `- ready Prompt Vault templates: ${status.readyPromptVaultTemplates.join(", ")}`,
    `- blocked Prompt Vault templates: ${status.blockedPromptVaultTemplates.join(", ")}`,
    `- next slices: ${formatNextSlices(status.nextSlices)}`,
    "",
    "## Setup guide",
    ...(status.cwd
      ? formatAutoresearchSetupGuideLines(status.cwd)
      : ["- provide cwd to show exact setup calls"]),
    "",
    "## Guided candidate journey: bind -> measure -> candidate_result_export",
    ...(status.cwd
      ? formatAutoresearchGuidedCandidateJourneyLines(status.cwd)
      : ["- provide cwd to show exact bind/measure/export calls"]),
    "",
    "## Peer lane recommendations",
    ...formatAutoresearchPeerLaneRecommendations({ cwd: status.cwd }),
  ].join("\n");
}

export function formatAutoresearchSegmentCloseout(closeout: AutoresearchSegmentCloseout): string {
  const metricUnit = closeout.metricUnit;
  const runLines = closeout.runs.map((run) => {
    const experimentLabel = run.experiment
      ? ` | hypothesis ${formatExperimentLabel(run.experiment)}`
      : "";
    const candidateLabel = run.experiment?.candidate?.branch
      ? ` | candidate ${run.experiment.candidate.branch}`
      : "";
    return `- iteration ${run.iteration ?? "?"}: ${run.status}/${run.runKind} | empirical ${run.empiricalDecisionClass} | metric ${formatMetricValue(run.metric, metricUnit)} | checks ${run.checks}${experimentLabel}${candidateLabel} | ${run.description}`;
  });
  const candidateLines = closeout.candidateBindings.flatMap((binding, index) => [
    `- candidate ${index + 1}:`,
    ...formatCandidateBindingLines(binding).map((line) => `  ${line}`),
  ]);

  return [
    "# PI-AUTORESEARCH SEGMENT CLOSEOUT",
    "",
    `- packet kind: ${closeout.packetKind}`,
    `- adapter contract version: ${closeout.adapterContractVersion}`,
    `- target kinds: ${closeout.targetKinds.join(", ")}`,
    `- cwd: ${closeout.cwd}`,
    `- receipt log: ${closeout.receiptPath}`,
    `- campaign: ${closeout.campaign ?? "(unnamed)"}`,
    `- metric: ${closeout.metricName ?? "(unset)"} (${metricUnit || "unitless"}, ${closeout.direction ?? "unset"} is better)`,
    `- runs: ${closeout.runCount} total / ${closeout.successfulRunCount} successful`,
    `- baseline: ${formatMetricValue(closeout.baselineMetric, metricUnit)}`,
    `- best: ${formatMetricValue(closeout.bestMetric, metricUnit)}`,
    `- empirical decision: ${closeout.empiricalDecisionClass}`,
    `- empirical posture: ${formatEmpiricalPosture(closeout.empiricalPosture)}`,
    `- timing interpretation: ${formatMetricInterpretation(closeout.timingInterpretation, metricUnit)}`,
    `- recommended action: ${closeout.recommendedAction}`,
    `- Oracle-ready evidence records: ${closeout.oracleReadyEvidence.recordCount}`,
    `- Oracle preflight status: ${closeout.oracleReadyEvidence.preflightStatus}`,
    `- Oracle target: ${closeout.oracleReadyEvidence.target}`,
    `- adapter boundary: ${closeout.adapterBoundary}`,
    `- evidence boundary: ${closeout.evidenceBoundary}`,
    "",
    "## Runs",
    ...(runLines.length > 0 ? runLines : ["- (none)"]),
    "",
    "## Candidate bindings",
    ...(candidateLines.length > 0 ? candidateLines : ["- (none)"]),
    "",
    "## Oracle-ready evidence boundary",
    `- packet: ${closeout.oracleReadyEvidence.packetKind}`,
    `- records: ${closeout.oracleReadyEvidence.recordCount}`,
    `- preflight status: ${closeout.oracleReadyEvidence.preflightStatus}`,
    `- boundary: ${closeout.oracleReadyEvidence.authorityBoundary}`,
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
    "The bounded runtime kernel is available through the /autoresearch <objective> front door, local benchmark/check execution, machine projection, append-only receipt/event logging, governed Prompt Vault decision requests, bounded loop execution, posture-gated runs, peer-assist planning/launch handoff, bounded finalization orchestration, one bounded supervised self-hosting public seam, and manifest-driven llama.cpp campaign planning/fork preparation/stage binding plus package-local campaign receipt/status projection, exact-task AK-binding snapshot derivation, one-step campaign-local advancement, and one dedicated public manifest campaign-control seam.",
    "This package now owns bounded finalization planning, approval, local branch materialization, one public `autoresearch_self_hosting_run` seam for controller/candidate/evaluator/promotion orchestration under the supervised self-hosting contract, checked manifest-driven branch/lane planning, one exact 41/42/43 stage-binding surface, one projection-only llama.cpp campaign status artifact, one non-mutating AK-ready manifest-campaign binding helper, one bounded one-step campaign-local advance helper, one dedicated public `autoresearch_llamacpp_campaign_control` seam for current status plus one-step public advancement with optional exact-task AK context, and a bounded in-call autoresearch loop. The technical `autoresearch_llamacpp_campaign` tool remains available below that public seam for raw matrix/fork/stage actions; the current package still does not own hidden daemonized self-improvement, direct AK mutation policy, automatic controller rotation, whole-campaign execution, automatic visible peer spawning, or remote review choreography.",
    "",
    "## Available surfaces",
    `- command: /${status.commandName}`,
    `- tools: ${status.toolNames.join(", ")}`,
    `- use ${AUTORESEARCH_CAMPAIGN_START_TOOL_NAME} as the supervised campaign front door from one bounded objective; plan first, then optionally bootstrap a baseline or bounded loop`,
    "- use autoresearch_runtime_status to inspect the current bounded runtime state",
    `- use ${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME} to inspect a candidate worktree/branch and prepare the exact measurement call without running or mutating anything`,
    `- use ${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME} to inspect or plan candidate keep/discard/rewind decisions without mutating worktrees or promoting`,
    "- use autoresearch_runtime_status with action=setup or action=finalize to request governed setup/finalize packets",
    "- use autoresearch_runtime_control to inspect or set continue / rebaseline / finalize / stop operator intent",
    "- use autoresearch_runtime_finalize to inspect, plan, approve, and materialize a bounded finalization workflow",
    "- use autoresearch_runtime_run to execute one bounded local run and optionally request a governed post-run next-hypothesis decision with decisionGoal; postureCommand can fail closed before benchmark execution",
    `- use ${AUTORESEARCH_AUTOPLAN_TOOL_NAME} to inspect the repo/problem space and propose bounded campaign setup; planner=dspx_program can materialize a DSPx-generated DSPy planner assembly`,
    `- use ${AUTORESEARCH_SETUP_TOOL_NAME} to plan/apply a config receipt or bootstrap a baseline run without needing a slash-command wizard`,
    `- use ${AUTORESEARCH_PEER_ASSIST_TOOL_NAME} to plan one canonical visible peer lane without launching it`,
    `- use ${AUTORESEARCH_LOOP_TOOL_NAME} to execute a bounded in-call loop with maxIterations, optional wall-clock/posture gates, live progress updates, and optional explicit peer-launch handoff`,
    `- use ${AUTORESEARCH_SELF_HOSTING_TOOL_NAME} for the public supervised self-hosting seam: inspect controller/candidate/evaluator state, prepare the candidate worktree, run one bounded self-hosting wave, use action=start_and_watch for in-call progress updates, and optionally plan/apply promotion or rollback records without package-local self-promotion`,
    `- use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME} for the public manifest campaign-control seam: current status, optional exact-task AK context, and one-step public advance without raw stage/build inputs`,
    `- use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} for lower-level technical manifest work such as branch/lane matrix planning, fork preparation, raw stage binding, exact AK-ready snapshots, or technical one-step advancement`,
    "",
    "## Peer lane recommendations",
    ...formatAutoresearchPeerLaneRecommendations({ cwd: status.cwd }),
    "",
    ...configurationBlock,
    "",
    "## Local artifact plan",
    ...status.localArtifacts.map((artifact) => `- ${artifact}`),
    "",
    "## Manifest campaign projection",
    `- availability: ${formatLlamacppCampaignProjectionAvailability(status.llamacppCampaignProjection.availability)}`,
    `- projection path: ${status.llamacppCampaignProjection.projectionPath ?? "(unresolved)"}`,
    `- projected manifest: ${formatLlamacppCampaignProjectionLabel(status.llamacppCampaignProjection)}`,
    `- projected receipt root: ${status.llamacppCampaignProjection.receiptRootPath ?? "(none)"}`,
    `- projected overall state: ${status.llamacppCampaignProjection.overallState ?? "(none)"}`,
    `- stale reason: ${status.llamacppCampaignProjection.staleReason ?? "(none)"}`,
    `- refresh path: use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with the current manifestPath to create or refresh the projection artifact`,
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
    ...(status.nextSlices.length > 0
      ? status.nextSlices.map((slice) => `- ${slice}`)
      : ["- none currently committed in product-posture"]),
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
    `- run kind: ${result.runReceipt.runKind ?? "ordinary"}`,
    `- empirical decision: ${result.runReceipt.empiricalDecisionClass ?? result.status.currentSegment.empiricalDecisionClass}`,
    ...formatExperimentLineageLines(result.runReceipt.experiment),
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
    `- segment empirical decision: ${result.status.currentSegment.empiricalDecisionClass}`,
    `- timing interpretation: ${formatMetricInterpretation(result.status.currentSegment.metricInterpretation, metricUnit)}`,
    "",
    "## Peer lane recommendations",
    ...formatAutoresearchPeerLaneRecommendations({
      cwd: result.cwd,
      runStatus: result.runReceipt.status,
      decisionSummary: result.decisionSummary,
    }),
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
        `- lawful owner route: ${outcome.lawfulOwnerRoute}`,
        `- missing binding action: ${outcome.missingBindingAction}`,
        "- recovery steps:",
        ...outcome.recoverySteps.map((step) => `  - ${step}`),
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
      `- lawful owner route: ${outcome.lawfulOwnerRoute}`,
      `- missing binding action: ${outcome.missingBindingAction}`,
      "- recovery steps:",
      ...outcome.recoverySteps.map((step) => `  - ${step}`),
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
  const resumePlan = buildAutoresearchResumePlanFromStatus(result.cwd, result.status);
  const resumeApplyPlan = buildAutoresearchResumeApplyPlan(result.cwd);

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
    "",
    "## Resume plan",
    ...formatAutoresearchResumePlanSummaryLines(resumePlan),
    "",
    "## Resume apply plan-only proposal",
    ...formatAutoresearchResumeApplyPlanSummaryLines(resumeApplyPlan),
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
  }
  ensureMachineReadyForBoundedRun(cwd, {
    allowBootstrapConfig: createdConfig,
    allowRebaselineReconfigure: input.reconfigure === true,
  });

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
      cwd: commandCwd,
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
    status: buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true }),
  };
}

export async function executeAutoresearchLoop(
  input: ExecuteAutoresearchLoopInput,
): Promise<ExecuteAutoresearchLoopResult> {
  const cwd = path.resolve(input.cwd);
  const goal = input.goal.trim();
  if (goal.length === 0) throw new Error("goal is required");
  if (!Number.isInteger(input.maxIterations) || input.maxIterations < 1) {
    throw new Error("maxIterations must be a positive integer");
  }

  const startedAt = Date.now();
  const hasCampaignGoalBudget =
    input.campaignGoalIterationBudget !== undefined ||
    input.campaignGoalWallClockMinutesBudget !== undefined ||
    input.campaignGoalTokenBudget !== undefined;
  if (input.campaignGoalAutoContinue === true && !hasCampaignGoalBudget) {
    throw new Error(
      "campaignGoalAutoContinue requires an explicit package-local campaign goal budget",
    );
  }
  const shouldTrackCampaignGoal = input.campaignGoalId !== undefined || hasCampaignGoalBudget;
  const campaignGoalLedger = shouldTrackCampaignGoal
    ? beginAutoresearchCampaignGoal({
        cwd,
        objective: goal,
        goalId: input.campaignGoalId,
        iterationBudget: input.campaignGoalIterationBudget,
        wallClockMinutesBudget: input.campaignGoalWallClockMinutesBudget,
        tokenLikeBudget: input.campaignGoalTokenBudget,
        autoContinue: input.campaignGoalAutoContinue === true,
        now: startedAt,
      })
    : null;
  const remainingGoalIterations =
    campaignGoalLedger?.budget.iterations === null || campaignGoalLedger === null
      ? input.maxIterations
      : Math.max(
          0,
          campaignGoalLedger.budget.iterations - campaignGoalLedger.usage.completedIterations,
        );
  if (campaignGoalLedger && remainingGoalIterations < 1) {
    throw new Error("campaign goal iteration budget is exhausted");
  }
  const segmentMaxIterations = Math.min(input.maxIterations, remainingGoalIterations);
  const stopOn = new Set(
    input.stopOn ?? ["blocked", "rebaseline", "finalize", "crash", "checks_failed"],
  );
  const peerMode = input.peerMode ?? "plan";
  const runs: ExecuteAutoresearchRunResult[] = [];
  let stopReason = "maxIterations reached";

  emitAutoresearchLoopProgress(input, {
    phase: "loop_start",
    cwd,
    goal,
    iteration: null,
    maxIterations: segmentMaxIterations,
    elapsedSeconds: 0,
    message: `Starting bounded autoresearch loop for ${goal} with maxIterations=${segmentMaxIterations}.`,
  });

  for (let index = 0; index < segmentMaxIterations; index += 1) {
    input.signal?.throwIfAborted();
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    if (
      input.maxWallClockMinutes !== undefined &&
      Date.now() - startedAt >= input.maxWallClockMinutes * 60_000
    ) {
      stopReason = "maxWallClockMinutes reached";
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }

    const statusBefore = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
    if (statusBefore.control.kind === "awaiting_operator") {
      stopReason = `awaiting operator control: ${formatAllowedActions(statusBefore.control.allowedActions)}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    if (["stop", "rebaseline", "finalize"].includes(statusBefore.control.kind)) {
      stopReason = `control state ${statusBefore.control.kind}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    const canBootstrapFirstSegment =
      index === 0 &&
      statusBefore.runtimeProjection.state === "segment_unconfigured" &&
      Boolean(input.name?.trim()) &&
      Boolean(input.metricName?.trim());
    if (
      !canBootstrapFirstSegment &&
      !canCampaignMachineStartBoundedRun(statusBefore.runtimeProjection.state)
    ) {
      stopReason = `machine state ${statusBefore.runtimeProjection.state}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }

    const previousDecision = runs.at(-1)?.decisionSummary;
    const requestedDescription = input.description?.trim();
    const description =
      index === 0
        ? requestedDescription
          ? requestedDescription.includes(goal)
            ? requestedDescription
            : `${requestedDescription} Operator objective: ${goal}`
          : `loop baseline/iteration for ${goal}`
        : previousDecision?.nextHypothesis?.trim() || `loop iteration ${index + 1} for ${goal}`;

    emitAutoresearchLoopProgress(input, {
      phase: "iteration_start",
      cwd,
      goal,
      iteration: index + 1,
      maxIterations: segmentMaxIterations,
      elapsedSeconds,
      nextHypothesis: previousDecision?.nextHypothesis ?? null,
      message: `Starting autoresearch loop iteration ${index + 1}/${segmentMaxIterations}: ${description}`,
    });

    let run: ExecuteAutoresearchRunResult;
    try {
      run = await executeAutoresearchRun({
        cwd,
        description,
        name: index === 0 ? input.name : undefined,
        metricName: index === 0 ? input.metricName : undefined,
        metricUnit: index === 0 ? input.metricUnit : undefined,
        direction: index === 0 ? input.direction : undefined,
        metricThreshold: index === 0 ? input.metricThreshold : undefined,
        benchmarkCommand: input.benchmarkCommand,
        checksCommand: input.checksCommand,
        timeoutSeconds: input.timeoutSeconds,
        checksTimeoutSeconds: input.checksTimeoutSeconds,
        reconfigure: index === 0 ? input.reconfigure : false,
        postureCommand: input.postureCommand,
        postureTimeoutSeconds: input.postureTimeoutSeconds,
        liveDecision:
          input.decisionRuntime && (input.decisionGoal ?? goal).trim().length > 0
            ? {
                runtime: input.decisionRuntime,
                goal: input.decisionGoal ?? goal,
                constraints: input.decisionConstraints,
                filesInScope: input.decisionFilesInScope,
                offLimits: input.decisionOffLimits,
                ideasBacklog: input.decisionIdeasBacklog,
                asiNotes: input.decisionAsiNotes,
                deadEndMemory: input.decisionDeadEndMemory,
                model: input.model,
              }
            : undefined,
        signal: input.signal,
      });
    } catch (error) {
      stopReason = `run execution stopped: ${formatErrorMessage(error)}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    runs.push(run);

    emitAutoresearchLoopProgress(input, {
      phase: "iteration_complete",
      cwd,
      goal,
      iteration: index + 1,
      maxIterations: segmentMaxIterations,
      elapsedSeconds: (Date.now() - startedAt) / 1000,
      runStatus: run.runReceipt.status,
      primaryMetricName: run.primaryMetricName,
      primaryMetric: run.primaryMetric,
      bestMetric: run.status.currentSegment.bestMetric,
      nextHypothesis: run.decisionSummary?.nextHypothesis ?? null,
      message: `Completed autoresearch loop iteration ${index + 1}/${segmentMaxIterations}: ${run.runReceipt.status} ${run.primaryMetricName}=${formatMetricValue(run.primaryMetric, run.status.currentSegment.metricUnit)}.`,
    });

    if (stopOn.has(run.runReceipt.status)) {
      stopReason = `stopOn run status ${run.runReceipt.status}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    if (run.decisionSummary?.mappedDecision === "block" && stopOn.has("blocked")) {
      stopReason = run.decisionSummary.blockingReason ?? "governed decision blocked";
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    if (run.decisionSummary?.mappedDecision === "rebaseline" && stopOn.has("rebaseline")) {
      stopReason = "governed decision requested rebaseline";
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    if (run.decisionSummary?.mappedDecision === "finalize" && stopOn.has("finalize")) {
      stopReason = "governed decision requested finalize";
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
  }

  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const campaignGoal = campaignGoalLedger
    ? recordAutoresearchCampaignGoalSegment({
        cwd,
        goalId: campaignGoalLedger.goalId,
        requestedIterations: segmentMaxIterations,
        completedIterations: runs.length,
        elapsedSeconds,
        stopReason,
        toolName: AUTORESEARCH_LOOP_TOOL_NAME,
        toolCall: formatCampaignGoalLoopCall({
          cwd,
          goal,
          maxIterations: segmentMaxIterations,
          maxWallClockMinutes: input.maxWallClockMinutes,
          campaignGoalId: campaignGoalLedger.goalId,
          campaignGoalIterationBudget: campaignGoalLedger.budget.iterations,
          campaignGoalWallClockMinutesBudget:
            campaignGoalLedger.budget.wallClockSeconds === null
              ? null
              : campaignGoalLedger.budget.wallClockSeconds / 60,
          campaignGoalTokenBudget: campaignGoalLedger.budget.tokenLikeUnits,
          campaignGoalAutoContinue: input.campaignGoalAutoContinue === true,
        }),
        autoContinue: input.campaignGoalAutoContinue === true,
        startedAt,
        completedAt: Date.now(),
      })
    : null;
  const status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });
  const peerAssist = buildAutoresearchPeerAssistPlan(
    buildLoopPeerAssistInput(input, cwd, goal, peerMode),
  );
  const peerLaunchHandoff = buildLoopPeerHandoff(peerMode, peerAssist);
  const result: ExecuteAutoresearchLoopResult = {
    cwd,
    goal,
    requestedIterations: segmentMaxIterations,
    completedIterations: runs.length,
    stopReason,
    elapsedSeconds,
    runs,
    peerMode,
    peerAssist,
    peerLaunchHandoff,
    campaignGoal: campaignGoal ? buildAutoresearchCampaignGoalStatus(cwd) : status.campaignGoal,
    status,
  };

  emitAutoresearchLoopProgress(input, {
    phase: "loop_complete",
    cwd,
    goal,
    iteration: null,
    maxIterations: segmentMaxIterations,
    elapsedSeconds,
    stopReason,
    bestMetric: status.currentSegment.bestMetric,
    peerLane: peerAssist.lane,
    message: `Completed bounded autoresearch loop after ${runs.length}/${input.maxIterations} iterations: ${stopReason}.`,
  });

  return result;
}

export function formatAutoresearchLoopResult(result: ExecuteAutoresearchLoopResult): string {
  const runLines = result.runs.map(
    (run, index) =>
      `- #${index + 1}: ${run.runReceipt.status} ${run.primaryMetricName}=${formatMetricValue(run.primaryMetric, result.status.currentSegment.metricUnit)}${run.decisionSummary ? ` decision=${run.decisionSummary.mappedDecision}` : ""}`,
  );
  const lastDecision = result.runs.at(-1)?.decisionSummary;
  return [
    "# PI-AUTORESEARCH LOOP",
    "",
    `- cwd: ${result.cwd}`,
    `- goal: ${result.goal}`,
    `- completed iterations: ${result.completedIterations}/${result.requestedIterations}`,
    `- elapsed: ${result.elapsedSeconds.toFixed(2)}s`,
    `- stop reason: ${result.stopReason}`,
    `- final machine state: ${result.status.runtimeProjection.state}`,
    `- campaign goal status: ${result.campaignGoal.status}`,
    `- campaign goal progress: ${result.campaignGoal.usage.completedIterations}/${result.campaignGoal.budget.iterations ?? "unbounded"} iteration(s) across ${result.campaignGoal.usage.foregroundSegments} foreground segment(s)`,
    `- campaign goal next continuation: ${result.campaignGoal.nextContinuationCall ?? "(none)"}`,
    `- current best: ${formatMetricValue(result.status.currentSegment.bestMetric, result.status.currentSegment.metricUnit)}`,
    `- last hypothesis: ${lastDecision?.nextHypothesis ?? "(none)"}`,
    "",
    "## Runs",
    ...(runLines.length > 0 ? runLines : ["- (none)"]),
    "",
    "## Peer assist plan",
    `- peer mode: ${result.peerMode}`,
    `- lane: ${result.peerAssist.lane}`,
    `- reason: ${result.peerAssist.reason}`,
    `- tool: ${result.peerAssist.toolName ?? "(none)"}`,
    result.peerAssist.toolCall ? `- call: ${result.peerAssist.toolCall}` : "- call: (none)",
    `- launch handoff: ${result.peerLaunchHandoff.status}`,
    `- launch note: ${result.peerLaunchHandoff.note}`,
    "",
    "## Final dashboard",
    formatAutoresearchDashboard(result.status),
  ].join("\n");
}

function formatCampaignGoalLoopCall(input: {
  cwd: string;
  goal: string;
  maxIterations: number;
  maxWallClockMinutes?: number;
  campaignGoalId: string;
  campaignGoalIterationBudget: number | null;
  campaignGoalWallClockMinutesBudget: number | null;
  campaignGoalTokenBudget: number | null;
  campaignGoalAutoContinue?: boolean;
}): string {
  const wallClockField =
    input.maxWallClockMinutes === undefined
      ? ""
      : `, maxWallClockMinutes: ${input.maxWallClockMinutes}`;
  const iterationBudgetField =
    input.campaignGoalIterationBudget === null
      ? ""
      : `, campaignGoalIterationBudget: ${input.campaignGoalIterationBudget}`;
  const wallClockBudgetField =
    input.campaignGoalWallClockMinutesBudget === null
      ? ""
      : `, campaignGoalWallClockMinutesBudget: ${input.campaignGoalWallClockMinutesBudget}`;
  const tokenBudgetField =
    input.campaignGoalTokenBudget === null
      ? ""
      : `, campaignGoalTokenBudget: ${input.campaignGoalTokenBudget}`;
  const autoContinueField = input.campaignGoalAutoContinue
    ? ", campaignGoalAutoContinue: true"
    : "";
  return `${AUTORESEARCH_LOOP_TOOL_NAME}({ cwd: ${JSON.stringify(input.cwd)}, goal: ${JSON.stringify(input.goal)}, maxIterations: ${input.maxIterations}${wallClockField}, campaignGoalId: ${JSON.stringify(input.campaignGoalId)}${iterationBudgetField}${wallClockBudgetField}${tokenBudgetField}${autoContinueField}, peerMode: "off" })`;
}

function buildLoopPeerAssistInput(
  input: ExecuteAutoresearchLoopInput,
  cwd: string,
  goal: string,
  peerMode: AutoresearchLoopPeerMode,
): BuildAutoresearchPeerAssistInput {
  const lane = peerModeToPeerAssistLane(peerMode);
  const objective = buildLoopPeerAssistObjective(lane, cwd, goal);
  return {
    cwd,
    lane,
    ...(objective ? { objective } : {}),
    targetFiles: input.decisionFilesInScope,
    offLimits: input.decisionOffLimits,
    constraints: input.decisionConstraints,
    reportBack: "manual",
  };
}

function buildLoopPeerAssistObjective(
  lane: AutoresearchPeerAssistLane | "auto",
  cwd: string,
  goal: string,
): string | undefined {
  if (lane === "candidate") {
    return `Try one bounded candidate patch for ${goal} in an isolated worktree; report diff and check evidence only.`;
  }
  if (lane === "scout") {
    return `Review loop outcome for ${goal} and recommend one bounded next controller action.`;
  }
  if (lane === "fork") {
    return `Continue loop context for ${goal} visibly under ${cwd} for operator-guided exploration.`;
  }
  return undefined;
}

function peerModeToPeerAssistLane(
  peerMode: AutoresearchLoopPeerMode,
): AutoresearchPeerAssistLane | "auto" {
  if (peerMode === "off") return "none";
  if (peerMode === "launch_scout") return "scout";
  if (peerMode === "launch_candidate") return "candidate";
  if (peerMode === "launch_fork") return "fork";
  return "auto";
}

function buildLoopPeerHandoff(
  peerMode: AutoresearchLoopPeerMode,
  peerAssist: AutoresearchPeerAssistPlan,
): AutoresearchLoopPeerHandoff {
  const requested = peerMode.startsWith("launch_");
  if (!requested) {
    return {
      mode: peerMode,
      requested: false,
      status: "not_requested",
      toolName: peerAssist.toolName,
      toolCall: peerAssist.toolCall,
      note:
        peerMode === "off"
          ? "Peer assist was disabled for this loop."
          : "Peer assist was planned only; no visible peer was launched by pi-autoresearch.",
    };
  }
  if (!peerAssist.toolName || !peerAssist.toolCall) {
    return {
      mode: peerMode,
      requested: true,
      status: "unavailable",
      toolName: null,
      toolCall: null,
      note: "Explicit peer launch was requested, but no canonical peer tool call is available.",
    };
  }
  return {
    mode: peerMode,
    requested: true,
    status: "handoff_required",
    toolName: peerAssist.toolName,
    toolCall: peerAssist.toolCall,
    note: "Explicit peer launch requested: dispatch the canonical visible peer tool call separately; peer/intercom output remains communication until controller verification.",
  };
}

function emitAutoresearchLoopStop(
  input: ExecuteAutoresearchLoopInput,
  cwd: string,
  goal: string,
  startedAt: number,
  stopReason: string,
): void {
  emitAutoresearchLoopProgress(input, {
    phase: "loop_stop",
    cwd,
    goal,
    iteration: null,
    maxIterations: input.maxIterations,
    elapsedSeconds: (Date.now() - startedAt) / 1000,
    stopReason,
    message: `Stopping bounded autoresearch loop: ${stopReason}.`,
  });
}

function emitAutoresearchLoopProgress(
  input: ExecuteAutoresearchLoopInput,
  event: AutoresearchLoopProgressEvent,
): void {
  input.onProgress?.(event);
}

function formatErrorMessage(error: unknown): string {
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

function formatAllowedActions(actions: readonly string[]): string {
  return actions.length > 0 ? actions.join(", ") : "(none)";
}

function formatNextSlices(slices: readonly string[]): string {
  return slices.length > 0 ? slices.join(", ") : "(none currently committed)";
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

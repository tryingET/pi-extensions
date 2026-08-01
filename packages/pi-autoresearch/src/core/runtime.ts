import { existsSync, rmSync } from "node:fs";
import path from "node:path";

import {
  applyDspxAdvisoryPlan,
  assertCampaignStartWillNotUseStaleActiveSegment,
  assertUsableFreshDspxProgramGenPlan,
  buildAutoresearchAutoplan,
  canBenchmarkScriptProposalDriveBaseline,
  formatCampaignStartNextToolCall,
  resolveDspxRepoPath,
} from "./runtime-autoplan.ts";
import { normalizeAutoresearchCandidateLifecyclePolicy } from "./runtime-candidate-policy.ts";
import { runProcessCommand } from "./runtime-command.ts";
import { AUTORESEARCH_LOCAL_ARTIFACTS } from "./runtime-constants.ts";
import { requestAutoresearchSetupDecision } from "./runtime-decisions.ts";
import { executeAutoresearchLoop } from "./runtime-loop.ts";
import type {
  CommandExecutionSummary,
  ExecuteAutoresearchCampaignStartInput,
  ExecuteAutoresearchCampaignStartResult,
  ExecuteAutoresearchLoopResult,
  ExecuteAutoresearchSetupDecisionResult,
  ExecuteAutoresearchSetupResult,
} from "./runtime-model.ts";
import { executeAutoresearchSetup } from "./runtime-setup.ts";
import { buildAutoresearchRuntimeStatus } from "./runtime-status.ts";

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
export { buildAutoresearchSegmentCloseout } from "./runtime-closeout.ts";
export * from "./runtime-constants.ts";
export {
  formatAutoresearchControlResult,
  inspectAutoresearchRuntimeControl,
  setAutoresearchRuntimeControl,
} from "./runtime-control.ts";
export { formatAutoresearchDashboard } from "./runtime-dashboard.ts";
export { exportAutoresearchDashboardHtml } from "./runtime-dashboard-export.ts";
export {
  requestAutoresearchFinalizeDecision,
  requestAutoresearchSetupDecision,
} from "./runtime-decisions.ts";
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
} from "./runtime-evidence-exports.ts";
export { executeAutoresearchLoop, formatAutoresearchLoopResult } from "./runtime-loop.ts";
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
  buildAutoresearchPeerAssistPlan,
  formatAutoresearchPeerAssistPlan,
} from "./runtime-peer-assist.ts";
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
  formatAutoresearchCampaignStartResult,
  formatAutoresearchDecisionResult,
  formatAutoresearchResumeApplyResult,
  formatAutoresearchSetupResult,
} from "./runtime-result-format.ts";
export { executeAutoresearchResumeApply } from "./runtime-resume-apply.ts";
export {
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchResumePlan,
  formatAutoresearchResumeApplyPlan,
  formatAutoresearchResumePlan,
} from "./runtime-resume-plan.ts";
export { executeAutoresearchRun } from "./runtime-run.ts";
export { formatAutoresearchRunResult } from "./runtime-run-format.ts";
export { executeAutoresearchSetup } from "./runtime-setup.ts";
export { buildAutoresearchRuntimeStatus } from "./runtime-status.ts";
export {
  buildAutoresearchHelpText,
  formatAutoresearchSegmentCloseout,
  formatAutoresearchStatusText,
} from "./runtime-status-text.ts";

export async function executeAutoresearchCampaignStart(
  input: ExecuteAutoresearchCampaignStartInput,
): Promise<ExecuteAutoresearchCampaignStartResult> {
  const cwd = path.resolve(input.cwd);
  const objective = input.objective.trim();
  if (!objective) throw new Error("objective is required for autoresearch_campaign_start");
  input.signal?.throwIfAborted();

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
    input.signal?.throwIfAborted();
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
    input.signal?.throwIfAborted();
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
    input.signal?.throwIfAborted();
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
    input.signal?.throwIfAborted();
  }

  input.signal?.throwIfAborted();
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

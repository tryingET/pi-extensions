import { formatAutoresearchDashboard } from "./runtime-dashboard.ts";
import { formatMetricThresholdValue, formatMetricValue } from "./runtime-format.ts";
import { formatAutoresearchLoopResult } from "./runtime-loop.ts";
import type {
  ExecuteAutoresearchCampaignStartResult,
  ExecuteAutoresearchFinalizeDecisionResult,
  ExecuteAutoresearchResumeApplyResult,
  ExecuteAutoresearchSetupDecisionResult,
  ExecuteAutoresearchSetupResult,
} from "./runtime-model.ts";
import { formatAutoresearchResumeApplyPlanSummaryLines } from "./runtime-resume-plan.ts";
import {
  formatFinalizeBlockingReason,
  formatSetupBlockingReason,
  formatTargetFiles,
  isDecisionErrorOutcome,
} from "./runtime-status-format.ts";

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

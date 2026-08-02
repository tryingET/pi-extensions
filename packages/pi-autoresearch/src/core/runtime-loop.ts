import path from "node:path";

import { canCampaignMachineStartBoundedRun } from "../machine/campaign.ts";
import {
  beginAutoresearchCampaignGoal,
  buildAutoresearchCampaignGoalStatus,
  recordAutoresearchCampaignGoalSegment,
} from "./goal.ts";
import { hashAutoresearchObjective } from "./runtime-autoplan-helpers.ts";
import { AUTORESEARCH_LOOP_TOOL_NAME } from "./runtime-constants.ts";
import { formatAllowedActions } from "./runtime-control.ts";
import { formatAutoresearchDashboard } from "./runtime-dashboard.ts";
import { formatMetricValue } from "./runtime-format.ts";
import type {
  AutoresearchLoopPeerHandoff,
  AutoresearchLoopPeerMode,
  AutoresearchLoopProgressEvent,
  AutoresearchPeerAssistLane,
  AutoresearchPeerAssistPlan,
  BuildAutoresearchPeerAssistInput,
  ExecuteAutoresearchLoopInput,
  ExecuteAutoresearchLoopResult,
  ExecuteAutoresearchRunResult,
} from "./runtime-model.ts";
import { buildAutoresearchPeerAssistPlan } from "./runtime-peer-assist.ts";
import { executeAutoresearchRun, formatErrorMessage } from "./runtime-run.ts";
import { buildAutoresearchRuntimeStatus } from "./runtime-status.ts";

export async function executeAutoresearchLoop(
  input: ExecuteAutoresearchLoopInput,
): Promise<ExecuteAutoresearchLoopResult> {
  const cwd = path.resolve(input.cwd);
  const goal = input.goal.trim();
  if (goal.length === 0) throw new Error("goal is required");
  if (!Number.isInteger(input.maxIterations) || input.maxIterations < 1) {
    throw new Error("maxIterations must be a positive integer");
  }
  input.signal?.throwIfAborted();

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
        objectiveDigest: index === 0 ? hashAutoresearchObjective(goal) : undefined,
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
      input.signal?.throwIfAborted();
      stopReason = `run execution stopped: ${formatErrorMessage(error)}`;
      emitAutoresearchLoopStop(input, cwd, goal, startedAt, stopReason);
      break;
    }
    input.signal?.throwIfAborted();
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

  input.signal?.throwIfAborted();
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
  input.signal?.throwIfAborted();
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
  const objective = lane === "auto" ? undefined : buildLoopPeerAssistObjective(lane, cwd, goal);
  return {
    cwd,
    lane,
    goal,
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
  input.signal?.throwIfAborted();
  input.onProgress?.(event);
}

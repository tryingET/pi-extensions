import path from "node:path";

import { normalizeArray } from "./runtime-common.ts";
import { formatLastRun } from "./runtime-format.ts";
import type {
  AutoresearchPeerAssistLane,
  AutoresearchPeerAssistPlan,
  AutoresearchRunDecisionSummary,
  BuildAutoresearchPeerAssistInput,
  RunStatus,
} from "./runtime-model.ts";
import { buildAutoresearchRuntimeStatus } from "./runtime-status.ts";

export function formatAutoresearchPeerLaneRecommendations(input: {
  cwd?: string;
  runStatus?: RunStatus | null;
  decisionSummary?: AutoresearchRunDecisionSummary | null;
}): string[] {
  const cwd = input.cwd ?? "/path/to/campaign";
  const failedOrAmbiguous =
    input.runStatus === "crash" ||
    input.runStatus === "checks_failed" ||
    input.runStatus === "discard" ||
    input.decisionSummary?.status === "blocked";
  const targetFiles = input.decisionSummary?.targetFiles ?? [];
  const candidateFiles = targetFiles.length > 0 ? targetFiles : ["<target files>"];

  return [
    "- pi-autoresearch does not auto-spawn visible peers; the controller/operator chooses whether to launch them.",
    failedOrAmbiguous
      ? `- failed/ambiguous run scout: scout_peer_spawn({ objective: "Inspect the latest pi-autoresearch run artifacts under ${cwd} and recommend one bounded next controller action.", cwd: "${cwd}", reportBack: "manual" })`
      : `- optional scout/reviewer: scout_peer_spawn({ objective: "Review the current pi-autoresearch state under ${cwd} and identify one bounded risk or next experiment.", cwd: "${cwd}", reportBack: "manual" })`,
    `- candidate patch lane: candidate_peer_spawn({ objective: "Try one bounded candidate patch for the current pi-autoresearch hypothesis in an isolated worktree; report diff and check evidence only.", cwd: "${cwd}", filesInScope: ${JSON.stringify(candidateFiles)}, reportBack: "manual" })`,
    `- inherited-context lane when intentional: fork_peer_spawn({ objective: "Continue this autoresearch context in a visible peer for operator-guided exploration.", cwd: "${cwd}" })`,
    "- Peer/intercom messages remain communication only; copy verified findings into receipts, ASI, diary, or AK evidence through the controller-owned surfaces before treating them as evidence.",
  ];
}

export function buildAutoresearchPeerAssistPlan(
  input: BuildAutoresearchPeerAssistInput,
): AutoresearchPeerAssistPlan {
  const cwd = path.resolve(input.cwd);
  const status = buildAutoresearchRuntimeStatus(cwd);
  const targetFiles = normalizeArray(input.targetFiles);
  const offLimits = normalizeArray(input.offLimits);
  const constraints = normalizeArray(input.constraints);
  const reportBack = input.reportBack ?? "manual";
  const requestedLane = input.lane ?? "auto";
  const lastRunStatus = status.currentSegment.lastRunStatus;
  const failedOrAmbiguous =
    lastRunStatus === "crash" ||
    lastRunStatus === "checks_failed" ||
    lastRunStatus === "discard" ||
    status.promptVaultDecisions.lastPostRunDecision?.status === "blocked";

  let lane: AutoresearchPeerAssistLane;
  let reason: string;
  if (requestedLane !== "auto") {
    lane = requestedLane;
    reason = `operator requested ${requestedLane} peer lane`;
  } else if (!status.currentSegment.configured) {
    lane = "none";
    reason = "runtime is not configured yet; bootstrap a campaign before peer assist";
  } else if (failedOrAmbiguous) {
    lane = "scout";
    reason =
      "latest run is failed, ambiguous, or blocked; a read-only scout should diagnose before mutation";
  } else if (targetFiles.length > 0) {
    lane = "candidate";
    reason = "target files are available; an isolated candidate worktree can try one bounded patch";
  } else {
    lane = "scout";
    reason =
      "runtime is configured but lacks a scoped candidate target; scout review is the safest next peer lane";
  }

  const goal =
    input.goal?.trim() || status.currentSegment.name || "the current autoresearch campaign";
  const baseObjective =
    input.objective?.trim() ||
    (lane === "candidate"
      ? `Try one bounded candidate patch for ${goal} in an isolated worktree; report diff and check evidence only.`
      : lane === "fork"
        ? `Continue this autoresearch context for ${goal} visibly under ${cwd} for operator-guided exploration.`
        : lane === "scout"
          ? `Inspect the current pi-autoresearch state for ${goal} under ${cwd} and recommend one bounded next controller action.`
          : "No peer assist is recommended until the runtime is configured.");

  const parentRequired = reportBack === "intercom" && (lane === "scout" || lane === "candidate");
  let toolName: string | null = null;
  let toolCall: string | null = null;
  if (lane === "scout") {
    toolName = "scout_peer_spawn";
    toolCall = `scout_peer_spawn({ objective: ${JSON.stringify(baseObjective)}, cwd: ${JSON.stringify(cwd)}, reportBack: ${JSON.stringify(reportBack)}${input.parentPeerTarget ? `, parentPeerTarget: ${JSON.stringify(input.parentPeerTarget)}` : ""} })`;
  } else if (lane === "candidate") {
    toolName = "candidate_peer_spawn";
    const files = targetFiles.length > 0 ? targetFiles : ["<target files>"];
    toolCall = `candidate_peer_spawn({ objective: ${JSON.stringify(baseObjective)}, cwd: ${JSON.stringify(cwd)}, filesInScope: ${JSON.stringify(files)}, offLimits: ${JSON.stringify(offLimits)}, constraints: ${JSON.stringify(constraints)}, reportBack: ${JSON.stringify(reportBack)}${input.parentPeerTarget ? `, parentPeerTarget: ${JSON.stringify(input.parentPeerTarget)}` : ""} })`;
  } else if (lane === "fork") {
    toolName = "fork_peer_spawn";
    toolCall = `fork_peer_spawn({ objective: ${JSON.stringify(baseObjective)}, cwd: ${JSON.stringify(cwd)} })`;
  }

  return {
    cwd,
    lane,
    reason,
    objective: baseObjective,
    toolName,
    toolCall,
    reportBack,
    parentPeerTargetRequired: parentRequired,
    status,
    evidenceWarning:
      "Peer/intercom messages are communication only; controller verification is required before receipts, ASI, diary, or AK evidence treat them as evidence.",
  };
}

export function formatAutoresearchPeerAssistPlan(plan: AutoresearchPeerAssistPlan): string {
  return [
    "# PI-AUTORESEARCH PEER ASSIST",
    "",
    `- cwd: ${plan.cwd}`,
    `- lane: ${plan.lane}`,
    `- reason: ${plan.reason}`,
    `- objective: ${plan.objective}`,
    `- tool: ${plan.toolName ?? "(none)"}`,
    `- reportBack: ${plan.reportBack}`,
    `- parentPeerTarget required: ${plan.parentPeerTargetRequired ? "yes" : "no"}`,
    `- machine state: ${plan.status.runtimeProjection.state}`,
    `- latest run: ${formatLastRun(plan.status.currentSegment.lastRunStatus, plan.status.currentSegment.lastRunMetric, plan.status.currentSegment.metricUnit, plan.status.currentSegment.lastRunKind)}`,
    "",
    "## Exact suggested call",
    plan.toolCall ? `\`${plan.toolCall}\`` : "- (none)",
    "",
    "## Evidence warning",
    plan.evidenceWarning,
  ].join("\n");
}

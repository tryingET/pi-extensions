import { existsSync } from "node:fs";

import type { CampaignMachineInput } from "../machine/campaign.ts";
import {
  type AutoresearchAutoContinuationSessionGate,
  buildAutoresearchAutoContinuationDecision,
  buildAutoresearchAutoContinuationSessionGateFromEnv,
} from "./autoContinuation.ts";
import { buildAutoresearchCampaignGoalStatus } from "./goal.ts";
import {
  loadAutoresearchLedger,
  projectAutoresearchLedger,
  projectAutoresearchLedgerEntries,
  resolveAutoresearchLedgerPath,
} from "./ledger.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  loadLlamacppCampaignProjectionState,
} from "./llamacppCampaign.ts";
import {
  type AutoresearchRuntimeSnapshotInput,
  deriveAutoresearchControlState,
  loadAutoresearchRuntimeControlState,
  persistAutoresearchRuntimeSnapshot,
} from "./resume.ts";
import {
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_LOCAL_ARTIFACTS,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_PHASE,
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  BLOCKED_PROMPT_VAULT_TEMPLATES,
  READY_PROMPT_VAULT_TEMPLATES,
} from "./runtime-constants.ts";
import type {
  AutoresearchLlamacppCampaignProjectionStatus,
  AutoresearchPromptVaultDecisionStatus,
  AutoresearchReceipt,
  AutoresearchRunDecisionSummary,
  AutoresearchRunReceipt,
  AutoresearchRuntimeProjection,
  AutoresearchRuntimeStatus,
  AutoresearchSegmentSummary,
} from "./runtime-model.ts";
import type { AutoresearchPaths } from "./runtime-receipts.ts";
import {
  buildAutoresearchEmpiricalPosture,
  getCurrentSegment,
  summarizeCurrentSegment,
} from "./runtime-status-segment.ts";
import { AUTORESEARCH_SELF_HOSTING_TOOL_NAME } from "./selfHosting.ts";

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

function buildAutoresearchLlamacppCampaignProjectionStatus(
  cwd: string | undefined,
): AutoresearchLlamacppCampaignProjectionStatus {
  if (!cwd) {
    return {
      availability: "not_projected",
      projectionPath: null,
      manifestPath: null,
      campaignId: null,
      manifestKey: null,
      receiptRootPath: null,
      overallState: null,
      staleReason: null,
      updatedAt: null,
    };
  }

  const projectionState = loadLlamacppCampaignProjectionState({ cwd });
  return {
    availability: projectionState.availability,
    projectionPath: projectionState.path,
    manifestPath: projectionState.projection?.manifest.path ?? null,
    campaignId: projectionState.projection?.manifest.campaignId ?? null,
    manifestKey: projectionState.projection?.manifest.manifestKey ?? null,
    receiptRootPath: projectionState.projection?.manifest.receiptRootPath ?? null,
    overallState: projectionState.projection?.status.overallState ?? null,
    staleReason: projectionState.staleReason,
    updatedAt: projectionState.projection?.updatedAt ?? null,
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

export function buildAutoresearchRuntimeStatusFromEntries(
  cwd: string | undefined,
  paths: AutoresearchPaths | null,
  entries: AutoresearchReceipt[],
  invalidLineCount: number,
  options: {
    persistSnapshot?: boolean;
    autoContinuationSession?: AutoresearchAutoContinuationSessionGate;
  } = {},
): AutoresearchRuntimeStatus {
  const currentSegmentView = getCurrentSegment(entries);
  const currentSegment = summarizeCurrentSegment(currentSegmentView);
  const empiricalPosture = buildAutoresearchEmpiricalPosture(
    currentSegment,
    currentSegmentView.runs,
  );
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
  const llamacppCampaignProjection = buildAutoresearchLlamacppCampaignProjectionStatus(cwd);
  const campaignGoal = cwd
    ? buildAutoresearchCampaignGoalStatus(cwd)
    : buildAutoresearchCampaignGoalStatus(process.cwd());
  const snapshotInput =
    cwd !== undefined
      ? createRuntimeSnapshotInput(cwd, currentSegment, runtimeProjection, promptVaultDecisions)
      : null;
  const loadedControl =
    cwd !== undefined && snapshotInput
      ? loadAutoresearchRuntimeControlState({ cwd, current: snapshotInput })
      : null;
  const control = loadedControl?.control ?? defaultControl;
  const autoContinuation = buildAutoresearchAutoContinuationDecision({
    cwd: cwd ?? process.cwd(),
    campaignGoal,
    runtime: {
      machineState: runtimeProjection.state,
      controlKind: control.kind,
      blockedReason: runtimeProjection.blockedReason,
      completionReason: runtimeProjection.completionReason,
    },
    session:
      options.autoContinuationSession ?? buildAutoresearchAutoContinuationSessionGateFromEnv(),
  });

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
      AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
      AUTORESEARCH_STATUS_TOOL_NAME,
      AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
      AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
      AUTORESEARCH_RUN_TOOL_NAME,
      AUTORESEARCH_CONTROL_TOOL_NAME,
      AUTORESEARCH_FINALIZE_TOOL_NAME,
      AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
      AUTORESEARCH_LOOP_TOOL_NAME,
      AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
      AUTORESEARCH_AUTOPLAN_TOOL_NAME,
      AUTORESEARCH_SETUP_TOOL_NAME,
      AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
      AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
      AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
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
    empiricalPosture,
    runtimeProjection,
    runtimeSnapshot: loadedControl?.snapshotStatus ?? {
      exists: false,
      reuse: "unavailable",
      discardedReason: null,
      segmentKey: null,
      runtimeKey: null,
    },
    control,
    campaignGoal,
    autoContinuation,
    promptVaultDecisions,
    llamacppCampaignProjection,
    nextSlices: [],
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

export function createRuntimeSnapshotInput(
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
      objectiveDigest: currentSegment.objectiveDigest,
      metricName: currentSegment.metricName,
      metricUnit: currentSegment.metricUnit,
      direction: currentSegment.direction,
      metricThreshold: currentSegment.metricThreshold,
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

export function projectionMatchesCurrentSegment(
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
    (projection.context.segment?.objectiveDigest ?? null) === currentSegment.objectiveDigest &&
    projection.context.segment?.metricName === currentSegment.metricName &&
    projection.context.segment?.metricUnit === currentSegment.metricUnit &&
    projection.context.segment?.direction === currentSegment.direction &&
    (projection.context.segment?.metricThreshold ?? null) === currentSegment.metricThreshold &&
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
      ...(currentSegment.objectiveDigest
        ? { objectiveDigest: currentSegment.objectiveDigest }
        : {}),
      metricName: currentSegment.metricName ?? "(unset)",
      metricUnit: currentSegment.metricUnit,
      direction: currentSegment.direction ?? "lower",
      metricThreshold: currentSegment.metricThreshold,
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

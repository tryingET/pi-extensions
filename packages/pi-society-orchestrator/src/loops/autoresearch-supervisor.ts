export const AUTORESEARCH_RUNTIME_STATES = [
  "idle",
  "segment_unconfigured",
  "ready",
  "running_benchmark",
  "running_checks",
  "recording_receipt",
  "awaiting_decision",
  "rebaseline_needed",
  "finalize_candidate",
  "blocked",
  "completed",
] as const;

export type AutoresearchRuntimeState = (typeof AUTORESEARCH_RUNTIME_STATES)[number];

export type AutoresearchMetricDirection = "lower" | "higher";

export type AutoresearchRunStatus =
  | "baseline"
  | "candidate"
  | "keep"
  | "discard"
  | "crash"
  | "checks_failed";

export interface AutoresearchSupervisorSegmentLike {
  configured: boolean;
  name: string | null;
  metricName: string | null;
  metricUnit: string;
  direction: AutoresearchMetricDirection | null;
  benchmarkCommand: string | null;
  checksCommand: string | null;
  runCount: number;
  successfulRunCount: number;
  baselineMetric: number | null;
  bestMetric: number | null;
  lastRunStatus: AutoresearchRunStatus | null;
  lastRunMetric: number | null;
}

export interface AutoresearchSupervisorRejectedEventLike {
  reason: string;
}

export interface AutoresearchSupervisorRuntimeProjectionLike {
  state: string;
  source: "ledger" | "receipt_fallback";
  ledgerPath?: string;
  hasLedger: boolean;
  invalidLedgerLines: number;
  eventCount: number;
  replayedEventCount: number;
  rejectedEvents: readonly AutoresearchSupervisorRejectedEventLike[];
  syncIssues: readonly string[];
}

export interface AutoresearchSupervisorRuntimeStatusLike {
  cwd?: string;
  currentSegment: AutoresearchSupervisorSegmentLike;
  runtimeProjection: AutoresearchSupervisorRuntimeProjectionLike;
}

export interface AutoresearchSupervisorLedgerLike {
  context: {
    blockedReason: string | null;
    completionReason: string | null;
  };
}

export interface AutoresearchSupervisorInput {
  runtime: AutoresearchSupervisorRuntimeStatusLike;
  ledger?: AutoresearchSupervisorLedgerLike;
}

export const AUTORESEARCH_SUPERVISOR_STATES = [
  "idle",
  "campaign_unconfigured",
  "configured",
  "monitoring",
  "decision_required",
  "rebaseline_needed",
  "finalize_candidate",
  "blocked",
  "completed",
  "projection_blocked",
] as const;

export type AutoresearchSupervisorState = (typeof AUTORESEARCH_SUPERVISOR_STATES)[number];

export const AUTORESEARCH_SUPERVISOR_ACTIONS = ["wait", "project", "fail_closed"] as const;

export type AutoresearchSupervisorAction = (typeof AUTORESEARCH_SUPERVISOR_ACTIONS)[number];

export const AUTORESEARCH_SUPERVISOR_MILESTONES = [
  "configured",
  "decision-required",
  "rebaseline-needed",
  "finalize-candidate",
  "blocked",
  "completed",
] as const;

export type AutoresearchSupervisorMilestone = (typeof AUTORESEARCH_SUPERVISOR_MILESTONES)[number];

export type AutoresearchSupervisorEvidenceResult = "pass" | "fail" | "skip";

export interface AutoresearchSupervisorSnapshot {
  state: AutoresearchSupervisorState;
  runtimeState: AutoresearchRuntimeState | null;
  action: AutoresearchSupervisorAction;
  observationCount: number;
  projectable: boolean;
  milestone: AutoresearchSupervisorMilestone | null;
  evidenceResult: AutoresearchSupervisorEvidenceResult | null;
  projectionKey: string | null;
  projectionBlockedReason: string | null;
  summary: string;
  cwd?: string;
  segment: AutoresearchSupervisorSegmentLike;
  runtimeProjection: {
    source: "ledger" | "receipt_fallback";
    ledgerPath?: string;
    hasLedger: boolean;
    invalidLedgerLines: number;
    eventCount: number;
    replayedEventCount: number;
    rejectedEventCount: number;
    syncIssueCount: number;
  };
  reasons: {
    blockedReason: string | null;
    completionReason: string | null;
  };
}

export type AutoresearchSupervisorEvent =
  | { type: "OBSERVE"; input: AutoresearchSupervisorInput }
  | { type: "RESET" };

const PROJECTABLE_RUNTIME_STATES = new Set<AutoresearchRuntimeState>([
  "awaiting_decision",
  "rebaseline_needed",
  "finalize_candidate",
  "blocked",
  "completed",
]);

export function isAutoresearchRuntimeState(value: string): value is AutoresearchRuntimeState {
  return AUTORESEARCH_RUNTIME_STATES.some((candidate) => candidate === value);
}

export function createAutoresearchSupervisorMachine(): AutoresearchSupervisorSnapshot {
  return {
    state: "idle",
    runtimeState: null,
    action: "wait",
    observationCount: 0,
    projectable: false,
    milestone: null,
    evidenceResult: null,
    projectionKey: null,
    projectionBlockedReason: null,
    summary: "Autoresearch supervisor is idle.",
    cwd: undefined,
    segment: createEmptySegment(),
    runtimeProjection: {
      source: "receipt_fallback",
      ledgerPath: undefined,
      hasLedger: false,
      invalidLedgerLines: 0,
      eventCount: 0,
      replayedEventCount: 0,
      rejectedEventCount: 0,
      syncIssueCount: 0,
    },
    reasons: {
      blockedReason: null,
      completionReason: null,
    },
  };
}

export function transitionAutoresearchSupervisor(
  snapshot: AutoresearchSupervisorSnapshot,
  event: AutoresearchSupervisorEvent,
): AutoresearchSupervisorSnapshot {
  if (event.type === "RESET") {
    return createAutoresearchSupervisorMachine();
  }

  const next = deriveAutoresearchSupervisorSnapshot(event.input);
  return {
    ...next,
    observationCount: snapshot.observationCount + 1,
  };
}

export function observeAutoresearchSupervisor(
  input: AutoresearchSupervisorInput,
  snapshot: AutoresearchSupervisorSnapshot = createAutoresearchSupervisorMachine(),
): AutoresearchSupervisorSnapshot {
  return transitionAutoresearchSupervisor(snapshot, { type: "OBSERVE", input });
}

export function deriveAutoresearchSupervisorSnapshot(
  input: AutoresearchSupervisorInput,
): AutoresearchSupervisorSnapshot {
  const runtime = input.runtime;
  const runtimeState = parseRuntimeState(runtime.runtimeProjection.state);
  const segment = cloneSegment(runtime.currentSegment);
  const reasons = {
    blockedReason: input.ledger?.context.blockedReason ?? null,
    completionReason: input.ledger?.context.completionReason ?? null,
  };
  const runtimeProjection = {
    source: runtime.runtimeProjection.source,
    ledgerPath: runtime.runtimeProjection.ledgerPath,
    hasLedger: runtime.runtimeProjection.hasLedger,
    invalidLedgerLines: runtime.runtimeProjection.invalidLedgerLines,
    eventCount: runtime.runtimeProjection.eventCount,
    replayedEventCount: runtime.runtimeProjection.replayedEventCount,
    rejectedEventCount: runtime.runtimeProjection.rejectedEvents.length,
    syncIssueCount: runtime.runtimeProjection.syncIssues.length,
  };

  if (!runtimeState) {
    return createDerivedSnapshot({
      state: "projection_blocked",
      runtimeState: null,
      action: "fail_closed",
      milestone: null,
      evidenceResult: null,
      projectionKey: null,
      projectionBlockedReason: `unsupported autoresearch runtime state: ${runtime.runtimeProjection.state}`,
      summary: `Autoresearch supervisor cannot project a milestone: unsupported autoresearch runtime state: ${runtime.runtimeProjection.state}`,
      cwd: runtime.cwd,
      segment,
      runtimeProjection,
      reasons,
    });
  }

  const integrityFailure = getIntegrityFailure(input, runtimeState);
  if (integrityFailure) {
    return createDerivedSnapshot({
      state: "projection_blocked",
      runtimeState,
      action: "fail_closed",
      milestone: null,
      evidenceResult: null,
      projectionKey: null,
      projectionBlockedReason: integrityFailure,
      summary: `Autoresearch supervisor cannot project a milestone: ${integrityFailure}`,
      cwd: runtime.cwd,
      segment,
      runtimeProjection,
      reasons,
    });
  }

  switch (runtimeState) {
    case "idle":
    case "segment_unconfigured":
      return createDerivedSnapshot({
        state: "campaign_unconfigured",
        runtimeState,
        action: "wait",
        milestone: null,
        evidenceResult: null,
        projectionKey: null,
        projectionBlockedReason: null,
        summary: "No configured autoresearch campaign is available yet.",
        cwd: runtime.cwd,
        segment,
        runtimeProjection,
        reasons,
      });

    case "ready": {
      if (!segment.configured) {
        return createDerivedSnapshot({
          state: "campaign_unconfigured",
          runtimeState,
          action: "wait",
          milestone: null,
          evidenceResult: null,
          projectionKey: null,
          projectionBlockedReason: null,
          summary: "No configured autoresearch campaign is available yet.",
          cwd: runtime.cwd,
          segment,
          runtimeProjection,
          reasons,
        });
      }

      if (segment.runCount === 0) {
        return createProjectedSnapshot({
          state: "configured",
          runtimeState,
          milestone: "configured",
          evidenceResult: "pass",
          summary: `Campaign '${formatSegmentName(segment.name)}' is configured and ready for the first bounded run.`,
          cwd: runtime.cwd,
          segment,
          runtimeProjection,
          reasons,
        });
      }

      return createDerivedSnapshot({
        state: "monitoring",
        runtimeState,
        action: "wait",
        milestone: null,
        evidenceResult: null,
        projectionKey: null,
        projectionBlockedReason: null,
        summary: `Campaign '${formatSegmentName(segment.name)}' is in local runtime state ready; no new coarse milestone is ready yet.`,
        cwd: runtime.cwd,
        segment,
        runtimeProjection,
        reasons,
      });
    }

    case "running_benchmark":
    case "running_checks":
    case "recording_receipt":
      return createDerivedSnapshot({
        state: "monitoring",
        runtimeState,
        action: "wait",
        milestone: null,
        evidenceResult: null,
        projectionKey: null,
        projectionBlockedReason: null,
        summary: `Campaign '${formatSegmentName(segment.name)}' is in local runtime state ${runtimeState}; no coarse milestone is ready yet.`,
        cwd: runtime.cwd,
        segment,
        runtimeProjection,
        reasons,
      });

    case "awaiting_decision":
      return createProjectedSnapshot({
        state: "decision_required",
        runtimeState,
        milestone: "decision-required",
        evidenceResult: "pass",
        summary: buildDecisionSummary(segment),
        cwd: runtime.cwd,
        segment,
        runtimeProjection,
        reasons,
      });

    case "rebaseline_needed":
      return createProjectedSnapshot({
        state: "rebaseline_needed",
        runtimeState,
        milestone: "rebaseline-needed",
        evidenceResult: "skip",
        summary: buildRebaselineSummary(segment),
        cwd: runtime.cwd,
        segment,
        runtimeProjection,
        reasons,
      });

    case "finalize_candidate":
      return createProjectedSnapshot({
        state: "finalize_candidate",
        runtimeState,
        milestone: "finalize-candidate",
        evidenceResult: "pass",
        summary: buildFinalizeSummary(segment),
        cwd: runtime.cwd,
        segment,
        runtimeProjection,
        reasons,
      });

    case "blocked":
      return createProjectedSnapshot({
        state: "blocked",
        runtimeState,
        milestone: "blocked",
        evidenceResult: "fail",
        summary: buildBlockedSummary(segment, reasons.blockedReason),
        cwd: runtime.cwd,
        segment,
        runtimeProjection,
        reasons,
      });

    case "completed":
      return createProjectedSnapshot({
        state: "completed",
        runtimeState,
        milestone: "completed",
        evidenceResult: "pass",
        summary: buildCompletedSummary(segment, reasons.completionReason),
        cwd: runtime.cwd,
        segment,
        runtimeProjection,
        reasons,
      });
  }
}

function createProjectedSnapshot(
  snapshot: Omit<
    AutoresearchSupervisorSnapshot,
    "action" | "observationCount" | "projectable" | "projectionBlockedReason" | "projectionKey"
  > & {
    milestone: AutoresearchSupervisorMilestone;
    evidenceResult: AutoresearchSupervisorEvidenceResult;
  },
): AutoresearchSupervisorSnapshot {
  return {
    ...snapshot,
    action: "project",
    observationCount: 0,
    projectable: true,
    projectionBlockedReason: null,
    projectionKey: buildAutoresearchSupervisorProjectionKey(snapshot),
  };
}

function createDerivedSnapshot(
  snapshot: Omit<AutoresearchSupervisorSnapshot, "observationCount" | "projectable">,
): AutoresearchSupervisorSnapshot {
  return {
    ...snapshot,
    observationCount: 0,
    projectable: snapshot.action === "project",
  };
}

function getIntegrityFailure(
  input: AutoresearchSupervisorInput,
  runtimeState: AutoresearchRuntimeState,
): string | null {
  const runtime = input.runtime;
  const rejectedEventCount = runtime.runtimeProjection.rejectedEvents.length;
  if (runtime.runtimeProjection.invalidLedgerLines > 0) {
    return `event ledger has ${runtime.runtimeProjection.invalidLedgerLines} invalid line(s)`;
  }
  const projectableContextRequired = requiresProjectableContext(
    runtimeState,
    runtime.currentSegment.runCount,
  );
  if (rejectedEventCount > 0 && projectableContextRequired) {
    return `event ledger replay rejected ${rejectedEventCount} event(s)`;
  }
  if (!projectableContextRequired) {
    return null;
  }
  if (!runtime.cwd) {
    return "runtime cwd is required for milestone projection";
  }
  if (!runtime.currentSegment.configured) {
    return "current bounded segment is not configured";
  }
  if (!hasSegmentIdentity(runtime.currentSegment)) {
    return "current bounded segment identity is incomplete";
  }
  return null;
}

function requiresProjectableContext(
  runtimeState: AutoresearchRuntimeState,
  runCount: number,
): boolean {
  return (
    PROJECTABLE_RUNTIME_STATES.has(runtimeState) || (runtimeState === "ready" && runCount === 0)
  );
}

function hasSegmentIdentity(segment: AutoresearchSupervisorSegmentLike): boolean {
  return (
    Boolean(segment.name && segment.name.trim().length > 0) &&
    Boolean(segment.metricName && segment.metricName.trim().length > 0) &&
    segment.direction !== null
  );
}

function parseRuntimeState(value: string): AutoresearchRuntimeState | null {
  return isAutoresearchRuntimeState(value) ? value : null;
}

function createEmptySegment(): AutoresearchSupervisorSegmentLike {
  return {
    configured: false,
    name: null,
    metricName: null,
    metricUnit: "",
    direction: null,
    benchmarkCommand: null,
    checksCommand: null,
    runCount: 0,
    successfulRunCount: 0,
    baselineMetric: null,
    bestMetric: null,
    lastRunStatus: null,
    lastRunMetric: null,
  };
}

function cloneSegment(
  segment: AutoresearchSupervisorSegmentLike,
): AutoresearchSupervisorSegmentLike {
  return {
    configured: segment.configured,
    name: segment.name,
    metricName: segment.metricName,
    metricUnit: segment.metricUnit,
    direction: segment.direction,
    benchmarkCommand: segment.benchmarkCommand,
    checksCommand: segment.checksCommand,
    runCount: segment.runCount,
    successfulRunCount: segment.successfulRunCount,
    baselineMetric: segment.baselineMetric,
    bestMetric: segment.bestMetric,
    lastRunStatus: segment.lastRunStatus,
    lastRunMetric: segment.lastRunMetric,
  };
}

function buildDecisionSummary(segment: AutoresearchSupervisorSegmentLike): string {
  const metricName = segment.metricName ?? "metric";
  const bestMetric =
    segment.bestMetric !== null
      ? `best ${metricName} is ${formatMetricValue(segment.bestMetric, segment.metricUnit)}`
      : `last run status is ${segment.lastRunStatus ?? "unknown"}`;
  return `${segment.runCount} runs recorded; ${bestMetric}; awaiting next bounded decision.`;
}

function buildRebaselineSummary(segment: AutoresearchSupervisorSegmentLike): string {
  const metricName = segment.metricName ?? "metric";
  const metricSummary =
    segment.lastRunMetric !== null
      ? `${metricName} is ${formatMetricValue(segment.lastRunMetric, segment.metricUnit)}`
      : `latest run status is ${segment.lastRunStatus ?? "unknown"}`;
  return `Campaign '${formatSegmentName(segment.name)}' needs rebaseline before continuing; latest ${metricSummary}.`;
}

function buildFinalizeSummary(segment: AutoresearchSupervisorSegmentLike): string {
  const metricName = segment.metricName ?? "metric";
  const metricSummary =
    segment.bestMetric !== null
      ? `best ${metricName} is ${formatMetricValue(segment.bestMetric, segment.metricUnit)}`
      : `latest run status is ${segment.lastRunStatus ?? "unknown"}`;
  return `Campaign '${formatSegmentName(segment.name)}' appears ready for finalization; ${metricSummary}.`;
}

function buildBlockedSummary(
  segment: AutoresearchSupervisorSegmentLike,
  blockedReason: string | null,
): string {
  const suffix = blockedReason ? `: ${blockedReason}` : ".";
  return `Campaign '${formatSegmentName(segment.name)}' is blocked${suffix}`;
}

function buildCompletedSummary(
  segment: AutoresearchSupervisorSegmentLike,
  completionReason: string | null,
): string {
  const suffix = completionReason ? `: ${completionReason}` : ".";
  return `Campaign '${formatSegmentName(segment.name)}' completed${suffix}`;
}

function formatSegmentName(value: string | null): string {
  return value && value.trim().length > 0 ? value : "(unnamed)";
}

function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) {
    return "(none)";
  }
  return unit.trim().length > 0 ? `${value} ${unit}` : String(value);
}

export function buildAutoresearchSupervisorProjectionKey(
  snapshot: Pick<AutoresearchSupervisorSnapshot, "milestone" | "segment" | "reasons">,
): string | null {
  if (!snapshot.milestone) {
    return null;
  }

  const segment = snapshot.segment;
  return [
    snapshot.milestone,
    `segment:${encodeProjectionToken(segment.name)}`,
    `metric:${encodeProjectionToken(segment.metricName)}`,
    `direction:${encodeProjectionToken(segment.direction)}`,
    `benchmark:${encodeProjectionToken(segment.benchmarkCommand)}`,
    `checks:${encodeProjectionToken(segment.checksCommand)}`,
    `runs:${segment.runCount}`,
    `success:${segment.successfulRunCount}`,
    `last:${encodeProjectionToken(segment.lastRunStatus)}`,
    `last_metric:${encodeProjectionToken(segment.lastRunMetric)}`,
    `baseline:${encodeProjectionToken(segment.baselineMetric)}`,
    `best:${encodeProjectionToken(segment.bestMetric)}`,
    `blocked:${encodeProjectionToken(snapshot.reasons.blockedReason)}`,
    `completed:${encodeProjectionToken(snapshot.reasons.completionReason)}`,
  ].join("|");
}

function encodeProjectionToken(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "none";
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return "none";
  }
  return encodeURIComponent(String(value));
}

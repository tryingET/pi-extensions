import {
  CAMPAIGN_MACHINE_STATES,
  type CampaignMachineResumeState,
  type CampaignMachineStateValue,
} from "../machine/campaign.ts";
import {
  AUTORESEARCH_OPERATOR_ACTIONS,
  type AutoresearchControlStateKind,
  type AutoresearchControlStateV1,
  type AutoresearchOperatorAction,
  type AutoresearchProjectionSource,
  type AutoresearchRuntimeSnapshotV1,
} from "./resume-model.ts";
import type {
  AutoresearchPromptVaultDecisionAvailability,
  AutoresearchRunDecisionSummary,
  MetricDirection,
  RunStatus,
} from "./runtime.ts";

export function parseAutoresearchRuntimeSnapshot(text: string): AutoresearchRuntimeSnapshotV1 {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Runtime snapshot must decode to an object");
  }
  if (parsed.type !== "runtime_snapshot") {
    throw new Error(`Unsupported runtime snapshot type: ${String(parsed.type)}`);
  }
  if (parsed.version !== 1) {
    throw new Error(`Unsupported runtime snapshot version: ${String(parsed.version)}`);
  }
  if (parsed.phase !== "bounded_runtime_kernel") {
    throw new Error(`Unsupported runtime snapshot phase: ${String(parsed.phase)}`);
  }

  return {
    type: "runtime_snapshot",
    version: 1,
    phase: "bounded_runtime_kernel",
    cwd: coerceString(parsed.cwd, "cwd"),
    updatedAt: coerceNumber(parsed.updatedAt, "updatedAt"),
    segmentKey: parseNullableString(parsed.segmentKey, "segmentKey"),
    runtimeKey: parseNullableString(parsed.runtimeKey, "runtimeKey"),
    projectionSource: parseProjectionSource(parsed.projectionSource),
    machine: parseSnapshotMachine(parsed.machine),
    segment: parseSnapshotSegment(parsed.segment),
    decision: parseSnapshotDecision(parsed.decision),
    control: parseAutoresearchControlState(parsed.control),
  };
}

function parseSnapshotMachine(value: unknown): AutoresearchRuntimeSnapshotV1["machine"] {
  if (!isRecord(value)) {
    throw new Error("Runtime snapshot machine block must be an object");
  }

  return {
    state: parseMachineState(value.state),
    resumeState: parseResumeState(value.resumeState),
    blockedReason: parseNullableString(value.blockedReason, "machine.blockedReason"),
    completionReason: parseNullableString(value.completionReason, "machine.completionReason"),
  };
}

function parseSnapshotSegment(value: unknown): AutoresearchRuntimeSnapshotV1["segment"] {
  if (!isRecord(value)) {
    throw new Error("Runtime snapshot segment block must be an object");
  }

  return {
    name: parseNullableString(value.name, "segment.name"),
    objectiveDigest: parseOptionalObjectiveDigest(value.objectiveDigest),
    metricName: parseNullableString(value.metricName, "segment.metricName"),
    metricUnit: coerceString(value.metricUnit, "segment.metricUnit"),
    direction: parseMetricDirection(value.direction),
    metricThreshold: parseOptionalNullableNumber(value.metricThreshold, "segment.metricThreshold"),
    benchmarkCommand: parseNullableString(value.benchmarkCommand, "segment.benchmarkCommand"),
    checksCommand: parseNullableString(value.checksCommand, "segment.checksCommand"),
    runCount: coerceNumber(value.runCount, "segment.runCount"),
    successfulRunCount: coerceNumber(value.successfulRunCount, "segment.successfulRunCount"),
    baselineMetric: parseNullableNumber(value.baselineMetric, "segment.baselineMetric"),
    bestMetric: parseNullableNumber(value.bestMetric, "segment.bestMetric"),
    lastRunStatus: parseRunStatus(value.lastRunStatus),
    lastRunMetric: parseNullableNumber(value.lastRunMetric, "segment.lastRunMetric"),
  };
}

function parseSnapshotDecision(value: unknown): AutoresearchRuntimeSnapshotV1["decision"] {
  if (!isRecord(value)) {
    throw new Error("Runtime snapshot decision block must be an object");
  }

  return {
    availability: parseDecisionAvailability(value.availability),
    lastPostRunDecision: parseDecisionSummary(value.lastPostRunDecision),
  };
}

function parseAutoresearchControlState(value: unknown): AutoresearchControlStateV1 {
  if (!isRecord(value)) {
    throw new Error("Runtime snapshot control block must be an object");
  }

  return normalizeControlState({
    kind: parseControlStateKind(value.kind),
    allowedActions: parseOperatorActions(value.allowedActions),
    reason: parseNullableString(value.reason, "control.reason"),
    selectedAt: parseNullableNumber(value.selectedAt, "control.selectedAt"),
  });
}

function parseProjectionSource(value: unknown): AutoresearchProjectionSource {
  if (value !== "ledger" && value !== "receipt_fallback") {
    throw new Error(`Invalid runtime snapshot projectionSource: ${String(value)}`);
  }
  return value;
}

function parseOptionalObjectiveDigest(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error("segment.objectiveDigest must be a lowercase sha256 digest when present");
  }
  return value;
}

function parseMachineState(value: unknown): CampaignMachineStateValue {
  if (typeof value !== "string" || !CAMPAIGN_MACHINE_STATES.includes(value as never)) {
    throw new Error(`Invalid runtime snapshot machine state: ${String(value)}`);
  }
  return value as CampaignMachineStateValue;
}

function parseResumeState(value: unknown): CampaignMachineResumeState | null {
  if (value === null) {
    return null;
  }
  if (
    value === "segment_unconfigured" ||
    value === "ready" ||
    value === "running_benchmark" ||
    value === "running_checks" ||
    value === "recording_receipt" ||
    value === "awaiting_decision" ||
    value === "rebaseline_needed" ||
    value === "finalize_candidate"
  ) {
    return value;
  }
  throw new Error(`Invalid runtime snapshot machine resume state: ${String(value)}`);
}

function parseMetricDirection(value: unknown): MetricDirection | null {
  if (value === null) {
    return null;
  }
  if (value !== "lower" && value !== "higher") {
    throw new Error(`Invalid runtime snapshot metric direction: ${String(value)}`);
  }
  return value;
}

function parseRunStatus(value: unknown): RunStatus | null {
  if (value === null) {
    return null;
  }
  if (
    value !== "baseline" &&
    value !== "candidate" &&
    value !== "keep" &&
    value !== "discard" &&
    value !== "crash" &&
    value !== "checks_failed"
  ) {
    throw new Error(`Invalid runtime snapshot run status: ${String(value)}`);
  }
  return value;
}

function parseDecisionAvailability(value: unknown): AutoresearchPromptVaultDecisionAvailability {
  if (
    value !== "available_not_yet_used" &&
    value !== "available_last_used_successfully" &&
    value !== "available_last_used_blocked"
  ) {
    throw new Error(`Invalid Prompt Vault decision availability: ${String(value)}`);
  }
  return value;
}

function parseDecisionSummary(value: unknown): AutoresearchRunDecisionSummary | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("Runtime snapshot lastPostRunDecision must be an object or null");
  }
  if (value.kind !== "next_hypothesis") {
    throw new Error(`Invalid runtime snapshot decision kind: ${String(value.kind)}`);
  }

  return {
    kind: "next_hypothesis",
    templateName: coerceString(
      value.templateName,
      "decision.templateName",
    ) as AutoresearchRunDecisionSummary["templateName"],
    status: coerceString(
      value.status,
      "decision.status",
    ) as AutoresearchRunDecisionSummary["status"],
    mappedDecision: coerceString(
      value.mappedDecision,
      "decision.mappedDecision",
    ) as AutoresearchRunDecisionSummary["mappedDecision"],
    blockingReason: parseNullableString(value.blockingReason, "decision.blockingReason"),
    failureStage: parseNullableDecisionFailureStage(value.failureStage),
    stateRead: parseNullableString(value.stateRead, "decision.stateRead"),
    nextHypothesis: parseNullableString(value.nextHypothesis, "decision.nextHypothesis"),
    targetFiles: parseStringArray(value.targetFiles),
    expectedPrimaryEffect: parseNullableString(
      value.expectedPrimaryEffect,
      "decision.expectedPrimaryEffect",
    ),
    timestamp: coerceNumber(value.timestamp, "decision.timestamp"),
  };
}

function parseNullableDecisionFailureStage(
  value: unknown,
): AutoresearchRunDecisionSummary["failureStage"] {
  if (value === null || value === undefined) {
    return null;
  }
  if (value === "prompt_plane" || value === "executor" || value === "parse") {
    return value;
  }
  throw new Error(`Invalid decision failure stage: ${String(value)}`);
}

function parseControlStateKind(value: unknown): AutoresearchControlStateKind {
  if (
    value === "none" ||
    value === "awaiting_operator" ||
    value === "continue" ||
    value === "rebaseline" ||
    value === "finalize" ||
    value === "stop"
  ) {
    return value;
  }
  throw new Error(`Invalid runtime snapshot control kind: ${String(value)}`);
}

function parseOperatorActions(value: unknown): AutoresearchOperatorAction[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return normalizeOperatorActions(
    value.filter(
      (entry): entry is AutoresearchOperatorAction =>
        typeof entry === "string" &&
        AUTORESEARCH_OPERATOR_ACTIONS.includes(entry as AutoresearchOperatorAction),
    ),
  );
}

export function normalizeControlState(
  control: AutoresearchControlStateV1,
): AutoresearchControlStateV1 {
  const allowedActions = normalizeOperatorActions(control.allowedActions);
  return {
    kind: control.kind,
    allowedActions,
    reason: normalizeReason(control.reason),
    selectedAt:
      typeof control.selectedAt === "number" && Number.isFinite(control.selectedAt)
        ? control.selectedAt
        : null,
  };
}

function normalizeOperatorActions(
  actions: readonly AutoresearchOperatorAction[],
): AutoresearchOperatorAction[] {
  const seen = new Set<AutoresearchOperatorAction>();
  const normalized: AutoresearchOperatorAction[] = [];
  for (const action of AUTORESEARCH_OPERATOR_ACTIONS) {
    if (actions.includes(action) && !seen.has(action)) {
      seen.add(action);
      normalized.push(action);
    }
  }
  return normalized;
}

function normalizeReason(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}
function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function coerceString(value: unknown, field: string): string {
  if (typeof value === "string") {
    return value;
  }
  throw new Error(`Runtime snapshot field ${field} must be a string`);
}

function coerceNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Runtime snapshot field ${field} must be a finite number`);
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return coerceString(value, field);
}

function parseNullableNumber(value: unknown, field: string): number | null {
  if (value === null) {
    return null;
  }
  return coerceNumber(value, field);
}

function parseOptionalNullableNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  return coerceNumber(value, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

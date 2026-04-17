import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  CAMPAIGN_MACHINE_STATES,
  type CampaignMachineResumeState,
  type CampaignMachineStateValue,
} from "../machine/campaign.ts";
import type {
  AutoresearchPromptVaultDecisionAvailability,
  AutoresearchRunDecisionSummary,
  MetricDirection,
  RunStatus,
} from "./runtime.ts";

export const AUTORESEARCH_RUNTIME_SNAPSHOT_FILE = "autoresearch.runtime.json" as const;
export const AUTORESEARCH_OPERATOR_ACTIONS = [
  "continue",
  "rebaseline",
  "finalize",
  "stop",
] as const;

export type AutoresearchOperatorAction = (typeof AUTORESEARCH_OPERATOR_ACTIONS)[number];
export type AutoresearchControlStateKind =
  | "none"
  | "awaiting_operator"
  | AutoresearchOperatorAction;
export type AutoresearchRuntimeSnapshotReuse =
  | "unavailable"
  | "missing"
  | "reused"
  | "cwd_mismatch"
  | "segment_mismatch"
  | "runtime_mismatch"
  | "illegal_control"
  | "state_ahead"
  | "parse_failed";
export type AutoresearchProjectionSource = "ledger" | "receipt_fallback";

export interface AutoresearchControlStateV1 {
  kind: AutoresearchControlStateKind;
  allowedActions: AutoresearchOperatorAction[];
  reason: string | null;
  selectedAt: number | null;
}

export interface AutoresearchRuntimeSnapshotInput {
  cwd: string;
  phase: "bounded_runtime_kernel";
  projectionSource: AutoresearchProjectionSource;
  machine: {
    state: CampaignMachineStateValue;
    resumeState: CampaignMachineResumeState | null;
    blockedReason: string | null;
    completionReason: string | null;
  };
  segment: {
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
    lastRunStatus: RunStatus | null;
    lastRunMetric: number | null;
  };
  decision: {
    availability: AutoresearchPromptVaultDecisionAvailability;
    lastPostRunDecision: AutoresearchRunDecisionSummary | null;
  };
}

export interface AutoresearchRuntimeSnapshotV1 {
  type: "runtime_snapshot";
  version: 1;
  phase: "bounded_runtime_kernel";
  cwd: string;
  updatedAt: number;
  segmentKey: string | null;
  runtimeKey: string | null;
  projectionSource: AutoresearchProjectionSource;
  machine: {
    state: CampaignMachineStateValue;
    resumeState: CampaignMachineResumeState | null;
    blockedReason: string | null;
    completionReason: string | null;
  };
  segment: {
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
    lastRunStatus: RunStatus | null;
    lastRunMetric: number | null;
  };
  decision: {
    availability: AutoresearchPromptVaultDecisionAvailability;
    lastPostRunDecision: AutoresearchRunDecisionSummary | null;
  };
  control: AutoresearchControlStateV1;
}

export interface AutoresearchRuntimeSnapshotStatus {
  path?: string;
  exists: boolean;
  reuse: AutoresearchRuntimeSnapshotReuse;
  discardedReason: string | null;
  segmentKey: string | null;
  runtimeKey: string | null;
}

export interface LoadAutoresearchRuntimeControlStateInput {
  cwd: string;
  current: AutoresearchRuntimeSnapshotInput;
}

export interface LoadAutoresearchRuntimeControlStateResult {
  control: AutoresearchControlStateV1;
  snapshot: AutoresearchRuntimeSnapshotV1 | null;
  snapshotStatus: AutoresearchRuntimeSnapshotStatus;
}

export function resolveAutoresearchRuntimeSnapshotPath(cwd: string): string {
  return path.join(path.resolve(cwd), AUTORESEARCH_RUNTIME_SNAPSHOT_FILE);
}

export function createAutoresearchSegmentKey(
  segment: AutoresearchRuntimeSnapshotInput["segment"],
): string | null {
  if (!segment.name || !segment.metricName || segment.direction === null) {
    return null;
  }

  return digestObject({
    name: segment.name,
    metricName: segment.metricName,
    metricUnit: segment.metricUnit,
    direction: segment.direction,
    benchmarkCommand: segment.benchmarkCommand,
    checksCommand: segment.checksCommand,
  });
}

export function createAutoresearchRuntimeKey(input: AutoresearchRuntimeSnapshotInput): string {
  const segmentKey = createAutoresearchSegmentKey(input.segment);
  return digestObject({
    phase: input.phase,
    segmentKey,
    projectionSource: input.projectionSource,
    machine: input.machine,
    segment: {
      runCount: input.segment.runCount,
      successfulRunCount: input.segment.successfulRunCount,
      baselineMetric: input.segment.baselineMetric,
      bestMetric: input.segment.bestMetric,
      lastRunStatus: input.segment.lastRunStatus,
      lastRunMetric: input.segment.lastRunMetric,
    },
    decision: {
      availability: input.decision.availability,
      lastPostRunDecision: summarizeDecisionForKey(input.decision.lastPostRunDecision),
    },
  });
}

export function deriveAutoresearchControlState(input: {
  machineState: CampaignMachineStateValue;
  blockedReason: string | null;
  completionReason: string | null;
}): AutoresearchControlStateV1 {
  switch (input.machineState) {
    case "ready":
      return {
        kind: "none",
        allowedActions: ["continue", "stop"],
        reason: "runtime is ready for another bounded run",
        selectedAt: null,
      };
    case "awaiting_decision":
      return {
        kind: "awaiting_operator",
        allowedActions: ["continue", "rebaseline", "finalize", "stop"],
        reason: "bounded next move needs an explicit operator decision",
        selectedAt: null,
      };
    case "rebaseline_needed":
      return {
        kind: "awaiting_operator",
        allowedActions: ["rebaseline", "stop"],
        reason: "runtime requires rebaseline work before another bounded run",
        selectedAt: null,
      };
    case "finalize_candidate":
      return {
        kind: "awaiting_operator",
        allowedActions: ["continue", "finalize", "stop"],
        reason: "runtime is finalize-worthy and needs an explicit next step",
        selectedAt: null,
      };
    case "blocked":
      return {
        kind: "awaiting_operator",
        allowedActions: ["stop"],
        reason: input.blockedReason ?? "runtime is blocked pending operator action",
        selectedAt: null,
      };
    case "segment_unconfigured":
      return {
        kind: "none",
        allowedActions: ["stop"],
        reason: "runtime has no configured campaign segment yet",
        selectedAt: null,
      };
    case "completed":
      return {
        kind: "none",
        allowedActions: [],
        reason: input.completionReason ?? "runtime completed its bounded work",
        selectedAt: null,
      };
    case "running_benchmark":
      return {
        kind: "none",
        allowedActions: ["stop"],
        reason: "runtime is currently executing the benchmark command",
        selectedAt: null,
      };
    case "running_checks":
      return {
        kind: "none",
        allowedActions: ["stop"],
        reason: "runtime is currently executing checks",
        selectedAt: null,
      };
    case "recording_receipt":
      return {
        kind: "none",
        allowedActions: ["stop"],
        reason: "runtime is recording the latest bounded run receipt",
        selectedAt: null,
      };
    case "idle":
      return {
        kind: "none",
        allowedActions: ["stop"],
        reason: "runtime is idle",
        selectedAt: null,
      };
  }
}

export function buildAutoresearchRuntimeSnapshot(
  input: AutoresearchRuntimeSnapshotInput,
  control = deriveAutoresearchControlState({
    machineState: input.machine.state,
    blockedReason: input.machine.blockedReason,
    completionReason: input.machine.completionReason,
  }),
  updatedAt = Date.now(),
): AutoresearchRuntimeSnapshotV1 {
  const cwd = path.resolve(input.cwd);
  return {
    type: "runtime_snapshot",
    version: 1,
    phase: input.phase,
    cwd,
    updatedAt,
    segmentKey: createAutoresearchSegmentKey(input.segment),
    runtimeKey: createAutoresearchRuntimeKey({ ...input, cwd }),
    projectionSource: input.projectionSource,
    machine: {
      state: input.machine.state,
      resumeState: input.machine.resumeState,
      blockedReason: input.machine.blockedReason,
      completionReason: input.machine.completionReason,
    },
    segment: { ...input.segment },
    decision: {
      availability: input.decision.availability,
      lastPostRunDecision: cloneDecisionSummary(input.decision.lastPostRunDecision),
    },
    control: normalizeControlState(control),
  };
}

export function writeAutoresearchRuntimeSnapshot(
  cwd: string,
  snapshot: AutoresearchRuntimeSnapshotV1,
): string {
  const snapshotPath = resolveAutoresearchRuntimeSnapshotPath(cwd);
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshotPath;
}

export function persistAutoresearchRuntimeSnapshot(input: {
  cwd: string;
  current: AutoresearchRuntimeSnapshotInput;
  control?: AutoresearchControlStateV1;
  updatedAt?: number;
}): AutoresearchRuntimeSnapshotV1 {
  const snapshot = buildAutoresearchRuntimeSnapshot(input.current, input.control, input.updatedAt);
  writeAutoresearchRuntimeSnapshot(input.cwd, snapshot);
  return snapshot;
}

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

export function loadAutoresearchRuntimeSnapshot(cwd: string): AutoresearchRuntimeSnapshotV1 | null {
  const snapshotPath = resolveAutoresearchRuntimeSnapshotPath(cwd);
  if (!existsSync(snapshotPath)) {
    return null;
  }
  return parseAutoresearchRuntimeSnapshot(readFileSync(snapshotPath, "utf8"));
}

export function loadAutoresearchRuntimeControlState(
  input: LoadAutoresearchRuntimeControlStateInput,
): LoadAutoresearchRuntimeControlStateResult {
  const cwd = path.resolve(input.cwd);
  const snapshotPath = resolveAutoresearchRuntimeSnapshotPath(cwd);
  const defaultControl = deriveAutoresearchControlState({
    machineState: input.current.machine.state,
    blockedReason: input.current.machine.blockedReason,
    completionReason: input.current.machine.completionReason,
  });
  const segmentKey = createAutoresearchSegmentKey(input.current.segment);
  const runtimeKey = createAutoresearchRuntimeKey({ ...input.current, cwd });
  const baseStatus: AutoresearchRuntimeSnapshotStatus = {
    path: snapshotPath,
    exists: false,
    reuse: "missing",
    discardedReason: null,
    segmentKey,
    runtimeKey,
  };

  if (!existsSync(snapshotPath)) {
    return {
      control: defaultControl,
      snapshot: null,
      snapshotStatus: baseStatus,
    };
  }

  let snapshot: AutoresearchRuntimeSnapshotV1;
  try {
    snapshot = parseAutoresearchRuntimeSnapshot(readFileSync(snapshotPath, "utf8"));
  } catch (error) {
    return {
      control: defaultControl,
      snapshot: null,
      snapshotStatus: {
        ...baseStatus,
        exists: true,
        reuse: "parse_failed",
        discardedReason: error instanceof Error ? error.message : String(error),
      },
    };
  }

  if (snapshot.cwd !== cwd) {
    return {
      control: defaultControl,
      snapshot,
      snapshotStatus: {
        ...baseStatus,
        exists: true,
        reuse: "cwd_mismatch",
        discardedReason: `snapshot cwd ${snapshot.cwd} does not match current cwd ${cwd}`,
      },
    };
  }

  if (snapshot.segmentKey !== segmentKey) {
    return {
      control: defaultControl,
      snapshot,
      snapshotStatus: {
        ...baseStatus,
        exists: true,
        reuse: "segment_mismatch",
        discardedReason: "snapshot segment fingerprint no longer matches the configured segment",
      },
    };
  }

  if (snapshot.runtimeKey !== runtimeKey) {
    const reuse =
      machineStateRank(snapshot.machine.state) > machineStateRank(input.current.machine.state)
        ? "state_ahead"
        : "runtime_mismatch";
    return {
      control: defaultControl,
      snapshot,
      snapshotStatus: {
        ...baseStatus,
        exists: true,
        reuse,
        discardedReason:
          reuse === "state_ahead"
            ? `snapshot state ${snapshot.machine.state} is ahead of replayable history ${input.current.machine.state}`
            : "snapshot runtime fingerprint no longer matches the derived runtime posture",
      },
    };
  }

  if (!isSavedControlLegal(snapshot.control, defaultControl)) {
    return {
      control: defaultControl,
      snapshot,
      snapshotStatus: {
        ...baseStatus,
        exists: true,
        reuse: "illegal_control",
        discardedReason: `snapshot control kind ${snapshot.control.kind} is not legal for machine state ${input.current.machine.state}`,
      },
    };
  }

  return {
    control: mergeSavedControl(snapshot.control, defaultControl, snapshot.updatedAt),
    snapshot,
    snapshotStatus: {
      ...baseStatus,
      exists: true,
      reuse: "reused",
      discardedReason: null,
    },
  };
}

export function formatAutoresearchRuntimeSnapshotReuse(
  reuse: AutoresearchRuntimeSnapshotReuse,
): string {
  switch (reuse) {
    case "unavailable":
      return "unavailable";
    case "missing":
      return "not reused (snapshot missing)";
    case "reused":
      return "reused saved control overlay";
    case "cwd_mismatch":
      return "not reused (cwd mismatch)";
    case "segment_mismatch":
      return "not reused (segment mismatch)";
    case "runtime_mismatch":
      return "not reused (runtime mismatch)";
    case "illegal_control":
      return "not reused (illegal saved control)";
    case "state_ahead":
      return "not reused (snapshot claimed a later machine state)";
    case "parse_failed":
      return "not reused (snapshot unreadable)";
  }
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
    metricName: parseNullableString(value.metricName, "segment.metricName"),
    metricUnit: coerceString(value.metricUnit, "segment.metricUnit"),
    direction: parseMetricDirection(value.direction),
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

function mergeSavedControl(
  saved: AutoresearchControlStateV1,
  currentDefault: AutoresearchControlStateV1,
  updatedAt: number,
): AutoresearchControlStateV1 {
  if (saved.kind === "none" || saved.kind === "awaiting_operator") {
    return {
      kind: saved.kind,
      allowedActions: [...currentDefault.allowedActions],
      reason: saved.reason ?? currentDefault.reason,
      selectedAt: null,
    };
  }

  return {
    kind: saved.kind,
    allowedActions: [...currentDefault.allowedActions],
    reason: saved.reason ?? currentDefault.reason,
    selectedAt: saved.selectedAt ?? updatedAt,
  };
}

function isSavedControlLegal(
  saved: AutoresearchControlStateV1,
  currentDefault: AutoresearchControlStateV1,
): boolean {
  if (saved.kind === currentDefault.kind) {
    return true;
  }

  return saved.kind !== "none" && saved.kind !== "awaiting_operator"
    ? currentDefault.allowedActions.includes(saved.kind)
    : false;
}

function normalizeControlState(control: AutoresearchControlStateV1): AutoresearchControlStateV1 {
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

function summarizeDecisionForKey(
  decision: AutoresearchRunDecisionSummary | null,
): Record<string, unknown> | null {
  if (!decision) {
    return null;
  }

  return {
    templateName: decision.templateName,
    status: decision.status,
    mappedDecision: decision.mappedDecision,
    blockingReason: decision.blockingReason,
    failureStage: decision.failureStage,
    stateRead: decision.stateRead,
    nextHypothesis: decision.nextHypothesis,
    targetFiles: [...decision.targetFiles],
    expectedPrimaryEffect: decision.expectedPrimaryEffect,
    timestamp: decision.timestamp,
  };
}

function cloneDecisionSummary(
  decision: AutoresearchRunDecisionSummary | null,
): AutoresearchRunDecisionSummary | null {
  if (!decision) {
    return null;
  }

  return {
    ...decision,
    targetFiles: [...decision.targetFiles],
  };
}

function machineStateRank(state: CampaignMachineStateValue): number {
  return [
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
  ].indexOf(state);
}

function digestObject(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

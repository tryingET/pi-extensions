import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { CampaignMachineStateValue } from "../machine/campaign.ts";
import { normalizeControlState, parseAutoresearchRuntimeSnapshot } from "./resume-codec.ts";
import {
  type AutoresearchControlStateV1,
  type AutoresearchRuntimeSnapshotInput,
  type AutoresearchRuntimeSnapshotReuse,
  type AutoresearchRuntimeSnapshotStatus,
  type AutoresearchRuntimeSnapshotV1,
  type LoadAutoresearchRuntimeControlStateInput,
  type LoadAutoresearchRuntimeControlStateResult,
  resolveAutoresearchRuntimeSnapshotPath,
} from "./resume-model.ts";
import type { AutoresearchRunDecisionSummary } from "./runtime.ts";

export { parseAutoresearchRuntimeSnapshot } from "./resume-codec.ts";
export type {
  AutoresearchControlStateKind,
  AutoresearchControlStateV1,
  AutoresearchOperatorAction,
  AutoresearchProjectionSource,
  AutoresearchRuntimeSnapshotInput,
  AutoresearchRuntimeSnapshotReuse,
  AutoresearchRuntimeSnapshotStatus,
  AutoresearchRuntimeSnapshotV1,
  LoadAutoresearchRuntimeControlStateInput,
  LoadAutoresearchRuntimeControlStateResult,
} from "./resume-model.ts";
export {
  AUTORESEARCH_OPERATOR_ACTIONS,
  AUTORESEARCH_RUNTIME_SNAPSHOT_FILE,
  resolveAutoresearchRuntimeSnapshotPath,
} from "./resume-model.ts";

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
    ...(segment.metricThreshold === null ? {} : { metricThreshold: segment.metricThreshold }),
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

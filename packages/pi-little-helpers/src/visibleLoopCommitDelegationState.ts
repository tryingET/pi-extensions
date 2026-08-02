// summary: validates persisted visible-loop delegated commit correlation and frontier state.
// read_when:
//   - changing same-process delegation reload recovery or persisted dispatch evidence.

import { isDeepStrictEqual } from "node:util";
import {
  createVisibleLoopDelegatedCommitRuntime,
  getExpectedVisibleLoopDelegatedCommitExecutionPolicy,
  getVisibleLoopDelegatedCommitFrontierBinding,
  isVisibleLoopDelegatedCommitFrontier,
  type VisibleLoopDelegatedCommitExecutionPolicy,
  type VisibleLoopDelegatedCommitFrontierBinding,
  type VisibleLoopDelegatedCommitRuntime,
} from "./visibleLoopCommitDelegation.ts";
import { validatePersistedVisibleLoopAscSettlementReceipt } from "./visibleLoopCommitDelegationReceipt.ts";
import type { ActiveVisibleLoopState } from "./visibleLoopRecovery.ts";

const SCHEMA_7_DELEGATED_COMMIT_KEYS = [
  "admittedExecutionPolicy",
  "admittedToolCallId",
  "completedToolCallId",
  "frontier",
  "phase",
  "settledExecutionPolicy",
  "settledToolCallId",
  "succeededIteration",
  "toolCallId",
];

const SCHEMA_8_DELEGATED_COMMIT_KEYS = [
  ...SCHEMA_7_DELEGATED_COMMIT_KEYS.slice(0, 5),
  "receipt",
  ...SCHEMA_7_DELEGATED_COMMIT_KEYS.slice(5),
];

function hasExactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(record).sort().join("\n") === keys.join("\n");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && Boolean(value.trim()));
}

function parsePersistedExecutionPolicy(
  value: unknown,
): VisibleLoopDelegatedCommitExecutionPolicy | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join("\n") !== "allowUnlimited\ntimeout" ||
    typeof record.timeout !== "number" ||
    !Number.isFinite(record.timeout) ||
    (record.allowUnlimited !== null && typeof record.allowUnlimited !== "boolean")
  ) {
    return undefined;
  }
  return { timeout: record.timeout, allowUnlimited: record.allowUnlimited as boolean | null };
}

function parsePersistedFrontier(
  value: unknown,
): VisibleLoopDelegatedCommitFrontierBinding | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join("\n") !== "iteration\nplanId\npromptIndex\nrunId" ||
    typeof record.runId !== "string" ||
    !record.runId.trim() ||
    typeof record.planId !== "string" ||
    !record.planId.trim() ||
    !Number.isInteger(record.iteration) ||
    Number(record.iteration) < 1 ||
    !Number.isInteger(record.promptIndex) ||
    Number(record.promptIndex) < 1
  ) {
    return undefined;
  }
  return {
    runId: record.runId,
    planId: record.planId,
    iteration: Number(record.iteration),
    promptIndex: Number(record.promptIndex),
  };
}

/** Parse and bind persisted dispatch evidence to the exact restored run/plan frontier. */
export function parseVisibleLoopDelegatedCommitRuntime(
  state: ActiveVisibleLoopState,
  value: unknown,
): VisibleLoopDelegatedCommitRuntime | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, SCHEMA_8_DELEGATED_COMMIT_KEYS)) return null;
  if (
    record.phase !== "idle" &&
    record.phase !== "started" &&
    record.phase !== "admitted" &&
    record.phase !== "settled" &&
    record.phase !== "succeeded" &&
    record.phase !== "failed_closed"
  ) {
    return null;
  }
  const frontier = parsePersistedFrontier(record.frontier);
  const admittedPolicy = parsePersistedExecutionPolicy(record.admittedExecutionPolicy);
  const settledPolicy = parsePersistedExecutionPolicy(record.settledExecutionPolicy);
  const receipt = validatePersistedVisibleLoopAscSettlementReceipt(record.receipt);
  if (
    frontier === undefined ||
    admittedPolicy === undefined ||
    settledPolicy === undefined ||
    receipt === undefined ||
    !isNullableString(record.toolCallId) ||
    !isNullableString(record.admittedToolCallId) ||
    !isNullableString(record.settledToolCallId) ||
    !isNullableString(record.completedToolCallId) ||
    (record.succeededIteration !== null && !Number.isInteger(record.succeededIteration))
  ) {
    return null;
  }
  const runtime: VisibleLoopDelegatedCommitRuntime = {
    phase: record.phase,
    frontier,
    toolCallId: record.toolCallId,
    admittedToolCallId: record.admittedToolCallId,
    settledToolCallId: record.settledToolCallId,
    completedToolCallId: record.completedToolCallId,
    admittedExecutionPolicy: admittedPolicy,
    settledExecutionPolicy: settledPolicy,
    receipt,
    succeededIteration:
      record.succeededIteration === null ? null : Number(record.succeededIteration),
  };

  const expectedPolicy = getExpectedVisibleLoopDelegatedCommitExecutionPolicy(state);
  const expectedFrontier = getVisibleLoopDelegatedCommitFrontierBinding(state);
  const bindingMatches = Boolean(
    expectedFrontier && runtime.frontier && isDeepStrictEqual(runtime.frontier, expectedFrontier),
  );
  const ids = [
    runtime.toolCallId,
    runtime.admittedToolCallId,
    runtime.settledToolCallId,
    runtime.completedToolCallId,
  ];
  const allIdsNull = ids.every((id) => id === null);
  const firstId = runtime.toolCallId;
  const startedShape = Boolean(
    bindingMatches &&
      firstId &&
      runtime.admittedToolCallId === null &&
      runtime.settledToolCallId === null &&
      runtime.completedToolCallId === null &&
      runtime.admittedExecutionPolicy === null &&
      runtime.settledExecutionPolicy === null &&
      runtime.receipt === null &&
      runtime.succeededIteration === null,
  );
  const admittedShape = Boolean(
    bindingMatches &&
      firstId &&
      runtime.admittedToolCallId === firstId &&
      runtime.settledToolCallId === null &&
      runtime.completedToolCallId === null &&
      expectedPolicy &&
      isDeepStrictEqual(runtime.admittedExecutionPolicy, expectedPolicy) &&
      runtime.settledExecutionPolicy === null &&
      runtime.receipt === null &&
      runtime.succeededIteration === null,
  );
  const settledShape = Boolean(
    bindingMatches &&
      firstId &&
      runtime.admittedToolCallId === firstId &&
      runtime.settledToolCallId === firstId &&
      runtime.completedToolCallId === null &&
      expectedPolicy &&
      isDeepStrictEqual(runtime.admittedExecutionPolicy, expectedPolicy) &&
      isDeepStrictEqual(runtime.settledExecutionPolicy, expectedPolicy) &&
      runtime.receipt === null &&
      runtime.succeededIteration === null,
  );
  const completedShape = Boolean(
    bindingMatches &&
      firstId &&
      runtime.admittedToolCallId === firstId &&
      runtime.settledToolCallId === firstId &&
      runtime.completedToolCallId === firstId &&
      expectedPolicy &&
      isDeepStrictEqual(runtime.admittedExecutionPolicy, expectedPolicy) &&
      isDeepStrictEqual(runtime.settledExecutionPolicy, expectedPolicy) &&
      runtime.receipt !== null,
  );
  const succeededShape = Boolean(
    completedShape && runtime.succeededIteration === state.plan?.iteration,
  );
  const completedFailedShape = Boolean(completedShape && runtime.succeededIteration === null);
  const idleShape = Boolean(
    runtime.frontier === null &&
      allIdsNull &&
      runtime.admittedExecutionPolicy === null &&
      runtime.settledExecutionPolicy === null &&
      runtime.receipt === null &&
      runtime.succeededIteration === null,
  );

  const phaseMatches =
    (runtime.phase === "idle" && idleShape) ||
    (runtime.phase === "started" && startedShape) ||
    (runtime.phase === "admitted" && admittedShape) ||
    (runtime.phase === "settled" && settledShape) ||
    (runtime.phase === "succeeded" && succeededShape) ||
    (runtime.phase === "failed_closed" &&
      state.stopped &&
      state.plan?.lifecycle === "failed_closed" &&
      (idleShape || startedShape || admittedShape || settledShape || completedFailedShape));
  return phaseMatches ? runtime : null;
}

function migrateSchema7VisibleLoopDelegatedCommitRuntime(
  state: ActiveVisibleLoopState,
  value: unknown,
): VisibleLoopDelegatedCommitRuntime | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const legacy = value as Record<string, unknown>;
  if (!hasExactKeys(legacy, SCHEMA_7_DELEGATED_COMMIT_KEYS)) return null;

  // Schema 7 predates persisted canonical ASC receipts. Adding an explicit null is truthful only
  // for shapes that had not claimed success; the schema-8 parser then proves their exact frontier,
  // tool-call, and execution-policy correlation before migration.
  if (legacy.phase === "succeeded") return null;
  return parseVisibleLoopDelegatedCommitRuntime(state, { ...legacy, receipt: null });
}

export function restoreVisibleLoopDelegatedCommitRuntime(
  state: ActiveVisibleLoopState,
  schemaVersion: 6 | 7 | 8,
  value: unknown,
): VisibleLoopDelegatedCommitRuntime {
  if (schemaVersion === 8) {
    const delegatedCommit = parseVisibleLoopDelegatedCommitRuntime(state, value);
    if (!delegatedCommit) {
      throw new Error("active visible-loop delegated commit state is invalid");
    }
    return delegatedCommit;
  }
  if (schemaVersion === 7) {
    const delegatedCommit = migrateSchema7VisibleLoopDelegatedCommitRuntime(state, value);
    if (!delegatedCommit) {
      const phase =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>).phase
          : undefined;
      const hasCanonicalSchema7Shape =
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        hasExactKeys(value as Record<string, unknown>, SCHEMA_7_DELEGATED_COMMIT_KEYS);
      if (hasCanonicalSchema7Shape && phase === "succeeded") {
        throw new Error(
          "schema-7 delegated commit success lacks canonical ASC receipt identity; explicit terminal resolution is required",
        );
      }
      throw new Error("schema-7 visible-loop delegated commit state is not safely migratable");
    }
    return delegatedCommit;
  }
  if (isVisibleLoopDelegatedCommitFrontier(state)) {
    throw new Error(
      "legacy active snapshot lacks delegated dispatch correlation; explicit terminal resolution is required before retry",
    );
  }
  return createVisibleLoopDelegatedCommitRuntime();
}

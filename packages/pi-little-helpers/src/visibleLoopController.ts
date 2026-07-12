// summary: maintains the adaptive visible-loop proof ledger, weighted budget, invariants, and continuation decisions.
// read_when:
//   - changing adaptive controller events, proof validation, cost limits, or continuation policy.
import type {
  VisibleLoopAdaptiveControllerConfig,
  VisibleLoopContinuationDecision,
  VisibleLoopControllerEventKind,
  VisibleLoopControllerInvalidation,
  VisibleLoopControllerProof,
  VisibleLoopControllerState,
} from "./visibleLoopTypes.ts";

const MAX_PROOFS = 200;
const MAX_INVALIDATIONS = 200;
const MAX_CONFIGURED_WEIGHTED_COST = 100_000;
const MAX_RECORDED_WEIGHTED_COST = 1_000_000_000;

export const DEFAULT_VISIBLE_LOOP_CONTROLLER_WEIGHTS: Record<
  VisibleLoopControllerEventKind,
  number
> = {
  child_started: 1,
  initial_prompt_delivered: 2,
  followup_prompt_delivered: 1,
  completion_checkpoint_delivered: 2,
  delegated_completion_requested: 3,
  prompt_delivery_failed: 8,
  completion_requested: 1,
  iteration_completed: 2,
  continuation_failed: 8,
};

export function resolveVisibleLoopAdaptiveControllerConfig(
  env: NodeJS.ProcessEnv,
): VisibleLoopAdaptiveControllerConfig | undefined {
  const configuredMode = env.PI_VISIBLE_LOOP_ADAPTIVE_CONTROLLER?.trim().toLowerCase();
  if (configuredMode === "0" || configuredMode === "false" || configuredMode === "off") {
    return undefined;
  }
  return {
    mode: "adaptive-v1",
    maxWeightedCost: parseBoundedPositiveNumber(
      env.PI_VISIBLE_LOOP_MAX_WEIGHTED_COST,
      100,
      MAX_CONFIGURED_WEIGHTED_COST,
    ),
    weights: { ...DEFAULT_VISIBLE_LOOP_CONTROLLER_WEIGHTS },
  };
}

export function createVisibleLoopControllerState(): VisibleLoopControllerState {
  return {
    schemaVersion: 1,
    sequence: 0,
    weightedCost: 0,
    proofs: [],
    invalidations: [],
  };
}

export interface VisibleLoopControllerEvent {
  kind: VisibleLoopControllerEventKind;
  iteration: number;
  promptIndex?: number;
  reason?: string;
}

export interface VisibleLoopControllerTransition {
  state: VisibleLoopControllerState;
  eventSequence: number;
  eventCost: number;
  addedProofIds: string[];
  invalidatedProofIds: string[];
}

export function transitionVisibleLoopController(
  config: VisibleLoopAdaptiveControllerConfig,
  current: VisibleLoopControllerState,
  event: VisibleLoopControllerEvent,
): VisibleLoopControllerTransition {
  assertControllerConfig(config);
  assertControllerState(current);
  if (!Number.isInteger(event.iteration) || event.iteration < 1 || event.iteration > 100) {
    throw new TypeError("controller event iteration must be an integer between 1 and 100");
  }
  if (
    event.promptIndex !== undefined &&
    (!Number.isInteger(event.promptIndex) || event.promptIndex < 1 || event.promptIndex > 100)
  ) {
    throw new TypeError("controller event promptIndex must be an integer between 1 and 100");
  }

  const sequence = current.sequence + 1;
  const eventCost = config.weights[event.kind];
  const proofs = [...current.proofs];
  const invalidations = [...current.invalidations];
  const addedProofIds: string[] = [];
  const invalidatedProofIds: string[] = [];

  const proof = proofForEvent(event, sequence);
  if (proof && !proofs.some((item) => item.id === proof.id)) {
    proofs.push(proof);
    addedProofIds.push(proof.id);
  }

  if (event.kind === "prompt_delivery_failed" || event.kind === "continuation_failed") {
    const reason = boundedReason(event.reason ?? event.kind);
    const alreadyInvalidated = new Set(invalidations.map((item) => item.proofId));
    for (const candidate of proofs) {
      if (candidate.iteration !== event.iteration || alreadyInvalidated.has(candidate.id)) continue;
      invalidations.push({ proofId: candidate.id, reason, eventSequence: sequence });
      invalidatedProofIds.push(candidate.id);
    }
  }

  return {
    state: {
      schemaVersion: 1,
      sequence,
      weightedCost: current.weightedCost + eventCost,
      proofs: proofs.slice(-MAX_PROOFS),
      invalidations: invalidations.slice(-MAX_INVALIDATIONS),
    },
    eventSequence: sequence,
    eventCost,
    addedProofIds,
    invalidatedProofIds,
  };
}

export interface VisibleLoopCompletionInvariantInput {
  state: VisibleLoopControllerState;
  iteration: number;
  promptCount: number;
  delegatedCompletion: boolean;
}

export type VisibleLoopCompletionInvariantResult =
  | { ok: true; proofIds: string[] }
  | { ok: false; error: string; missingProofIds: string[]; invalidatedProofIds: string[] };

export function validateVisibleLoopCompletionInvariants(
  input: VisibleLoopCompletionInvariantInput,
): VisibleLoopCompletionInvariantResult {
  assertControllerState(input.state);
  if (!Number.isInteger(input.iteration) || input.iteration < 1) {
    return invariantFailure("invalid iteration", [], []);
  }
  if (!Number.isInteger(input.promptCount) || input.promptCount < 1 || input.promptCount > 100) {
    return invariantFailure("invalid prompt count", [], []);
  }

  const required = Array.from({ length: input.promptCount }, (_, index) =>
    promptProofId(input.iteration, index + 1),
  );
  required.push(
    input.delegatedCompletion
      ? delegatedCompletionProofId(input.iteration)
      : checkpointProofId(input.iteration),
  );
  const proofIds = new Set(input.state.proofs.map((proof) => proof.id));
  const invalidated = new Set(input.state.invalidations.map((item) => item.proofId));
  const missingProofIds = required.filter((id) => !proofIds.has(id));
  const invalidatedProofIds = required.filter((id) => invalidated.has(id));
  if (missingProofIds.length > 0 || invalidatedProofIds.length > 0) {
    return invariantFailure(
      "adaptive completion proofs are missing or invalidated",
      missingProofIds,
      invalidatedProofIds,
    );
  }
  return { ok: true, proofIds: required };
}

export function decideVisibleLoopContinuation(input: {
  completedIterations: number;
  loopCount: number;
  weightedCost: number;
  maxWeightedCost: number;
  hasNewSessionContinuation: boolean;
}): VisibleLoopContinuationDecision {
  if (input.completedIterations >= input.loopCount) {
    return { method: "complete", reason: "loop_count_reached" };
  }
  if (input.weightedCost > input.maxWeightedCost) {
    return { method: "baseline_fallback", reason: "budget_exceeded" };
  }
  return input.hasNewSessionContinuation
    ? { method: "new_session", reason: "fresh_proof_within_budget" }
    : { method: "same_session", reason: "fresh_proof_within_budget" };
}

export function assertControllerConfig(
  value: unknown,
): asserts value is VisibleLoopAdaptiveControllerConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("adaptiveController must be an object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["mode", "maxWeightedCost", "weights"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new TypeError("adaptiveController has unknown fields");
  }
  if (record.mode !== "adaptive-v1") throw new TypeError("adaptiveController mode is invalid");
  if (
    typeof record.maxWeightedCost !== "number" ||
    !Number.isFinite(record.maxWeightedCost) ||
    record.maxWeightedCost < 1 ||
    record.maxWeightedCost > MAX_CONFIGURED_WEIGHTED_COST
  ) {
    throw new TypeError("adaptiveController maxWeightedCost is invalid");
  }
  if (
    typeof record.weights !== "object" ||
    record.weights === null ||
    Array.isArray(record.weights)
  ) {
    throw new TypeError("adaptiveController weights must be an object");
  }
  const weights = record.weights as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_VISIBLE_LOOP_CONTROLLER_WEIGHTS)) {
    const weight = weights[key];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1000) {
      throw new TypeError(`adaptiveController weight ${key} is invalid`);
    }
  }
  const unknown = Object.keys(weights).filter(
    (key) => !(key in DEFAULT_VISIBLE_LOOP_CONTROLLER_WEIGHTS),
  );
  if (unknown.length > 0)
    throw new TypeError(`adaptiveController has unknown weights: ${unknown.join(", ")}`);
}

export function assertControllerState(value: unknown): asserts value is VisibleLoopControllerState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("controller state must be an object");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(["schemaVersion", "sequence", "weightedCost", "proofs", "invalidations"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new TypeError("controller state has unknown fields");
  }
  if (
    record.schemaVersion !== 1 ||
    !Number.isInteger(record.sequence) ||
    Number(record.sequence) < 0 ||
    typeof record.weightedCost !== "number" ||
    !Number.isFinite(record.weightedCost) ||
    record.weightedCost < 0 ||
    record.weightedCost > MAX_RECORDED_WEIGHTED_COST ||
    !Array.isArray(record.proofs) ||
    record.proofs.length > MAX_PROOFS ||
    !Array.isArray(record.invalidations) ||
    record.invalidations.length > MAX_INVALIDATIONS
  ) {
    throw new TypeError("controller state is invalid");
  }

  const sequence = Number(record.sequence);
  const proofIds = new Set<string>();
  for (const rawProof of record.proofs) {
    assertControllerProof(rawProof, sequence);
    if (proofIds.has(rawProof.id)) throw new TypeError("controller proof ids must be unique");
    proofIds.add(rawProof.id);
  }
  const invalidatedProofIds = new Set<string>();
  for (const rawInvalidation of record.invalidations) {
    assertControllerInvalidation(rawInvalidation, sequence, proofIds);
    if (invalidatedProofIds.has(rawInvalidation.proofId)) {
      throw new TypeError("controller invalidations must be unique per proof");
    }
    invalidatedProofIds.add(rawInvalidation.proofId);
  }
}

function assertControllerProof(
  value: unknown,
  stateSequence: number,
): asserts value is VisibleLoopControllerProof {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("controller proof must be an object");
  }
  const proof = value as Record<string, unknown>;
  if (
    !Number.isInteger(proof.iteration) ||
    Number(proof.iteration) < 1 ||
    Number(proof.iteration) > 100 ||
    !Number.isInteger(proof.eventSequence) ||
    Number(proof.eventSequence) < 1 ||
    Number(proof.eventSequence) > stateSequence
  ) {
    throw new TypeError("controller proof sequence or iteration is invalid");
  }
  const iteration = Number(proof.iteration);
  let expectedId: string;
  if (proof.kind === "prompt_delivered") {
    if (
      !Number.isInteger(proof.promptIndex) ||
      Number(proof.promptIndex) < 1 ||
      Number(proof.promptIndex) > 100
    ) {
      throw new TypeError("controller prompt proof index is invalid");
    }
    expectedId = promptProofId(iteration, Number(proof.promptIndex));
  } else if (proof.kind === "completion_checkpoint_delivered") {
    if (proof.promptIndex !== undefined) {
      throw new TypeError("controller checkpoint proof cannot contain promptIndex");
    }
    expectedId = checkpointProofId(iteration);
  } else if (proof.kind === "delegated_completion_requested") {
    if (proof.promptIndex !== undefined) {
      throw new TypeError("controller delegated proof cannot contain promptIndex");
    }
    expectedId = delegatedCompletionProofId(iteration);
  } else {
    throw new TypeError("controller proof kind is invalid");
  }
  if (proof.id !== expectedId) throw new TypeError("controller proof id is inconsistent");
  const allowed = new Set(["id", "kind", "iteration", "promptIndex", "eventSequence"]);
  if (Object.keys(proof).some((key) => !allowed.has(key))) {
    throw new TypeError("controller proof has unknown fields");
  }
}

function assertControllerInvalidation(
  value: unknown,
  stateSequence: number,
  proofIds: Set<string>,
): asserts value is VisibleLoopControllerInvalidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("controller invalidation must be an object");
  }
  const invalidation = value as Record<string, unknown>;
  if (
    typeof invalidation.proofId !== "string" ||
    !proofIds.has(invalidation.proofId) ||
    typeof invalidation.reason !== "string" ||
    !invalidation.reason.trim() ||
    invalidation.reason.length > 256 ||
    /[\r\n]/u.test(invalidation.reason) ||
    !Number.isInteger(invalidation.eventSequence) ||
    Number(invalidation.eventSequence) < 1 ||
    Number(invalidation.eventSequence) > stateSequence
  ) {
    throw new TypeError("controller invalidation is invalid");
  }
  const allowed = new Set(["proofId", "reason", "eventSequence"]);
  if (Object.keys(invalidation).some((key) => !allowed.has(key))) {
    throw new TypeError("controller invalidation has unknown fields");
  }
}

function proofForEvent(
  event: VisibleLoopControllerEvent,
  sequence: number,
): VisibleLoopControllerProof | undefined {
  if (event.kind === "initial_prompt_delivered" || event.kind === "followup_prompt_delivered") {
    if (event.promptIndex === undefined) {
      throw new TypeError("prompt delivery event requires promptIndex");
    }
    return {
      id: promptProofId(event.iteration, event.promptIndex),
      kind: "prompt_delivered",
      iteration: event.iteration,
      promptIndex: event.promptIndex,
      eventSequence: sequence,
    };
  }
  if (event.kind === "completion_checkpoint_delivered") {
    return {
      id: checkpointProofId(event.iteration),
      kind: "completion_checkpoint_delivered",
      iteration: event.iteration,
      eventSequence: sequence,
    };
  }
  if (event.kind === "delegated_completion_requested") {
    return {
      id: delegatedCompletionProofId(event.iteration),
      kind: "delegated_completion_requested",
      iteration: event.iteration,
      eventSequence: sequence,
    };
  }
  return undefined;
}

function promptProofId(iteration: number, promptIndex: number): string {
  return `iteration:${iteration}:prompt:${promptIndex}:delivered`;
}

function checkpointProofId(iteration: number): string {
  return `iteration:${iteration}:completion-checkpoint:delivered`;
}

function delegatedCompletionProofId(iteration: number): string {
  return `iteration:${iteration}:delegated-completion:requested`;
}

function invariantFailure(
  error: string,
  missingProofIds: string[],
  invalidatedProofIds: string[],
): VisibleLoopCompletionInvariantResult {
  return { ok: false, error, missingProofIds, invalidatedProofIds };
}

function parseBoundedPositiveNumber(
  value: string | undefined,
  fallback: number,
  max: number,
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= max ? parsed : fallback;
}

function boundedReason(value: string): string {
  return (
    value
      .replace(/[\r\n]+/gu, " ")
      .trim()
      .slice(0, 256) || "controller event"
  );
}

// summary: binds continuation child-start proof to the consumed launch claim and durable ACTIVE child frontier.
// read_when:
//   - changing continuation launch confirmation, child identity, or same-process reload proof.

import { isDeepStrictEqual } from "node:util";
import type { VisibleLoopIterationLease } from "./visibleLoopContinuationClaim.ts";
import type {
  VisibleLoopChildStartProof,
  VisibleLoopContinuationLaunchClaim,
  VisibleLoopLeaseOwner,
} from "./visibleLoopContinuationIdentity.ts";
import type { VisibleLoopPlanProgress } from "./visibleLoopPlan.ts";

interface VisibleLoopChildProofState {
  ownerSessionId: string;
  config: { runId: string };
  hostProcessId: number;
  hostProcessIncarnation: string;
  stopped: boolean;
  plan: VisibleLoopPlanProgress | null;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join("\n") === [...keys].sort().join("\n");
}

function parseOwner(value: unknown): VisibleLoopLeaseOwner | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const owner = value as Record<string, unknown>;
  if (
    !exactKeys(owner, ["sessionId", "processId", "processIncarnation"]) ||
    typeof owner.sessionId !== "string" ||
    !owner.sessionId ||
    !Number.isInteger(owner.processId) ||
    Number(owner.processId) < 1 ||
    typeof owner.processIncarnation !== "string" ||
    !owner.processIncarnation
  ) {
    return null;
  }
  return {
    sessionId: owner.sessionId,
    processId: Number(owner.processId),
    processIncarnation: owner.processIncarnation,
  };
}

function parseLaunchClaim(value: unknown): VisibleLoopContinuationLaunchClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const claim = value as Record<string, unknown>;
  const launchOwner = parseOwner(claim.launchOwner);
  if (
    !exactKeys(claim, ["originatingPlanId", "claimToken", "launchOwner"]) ||
    typeof claim.originatingPlanId !== "string" ||
    !claim.originatingPlanId ||
    typeof claim.claimToken !== "string" ||
    !/^[A-Za-z0-9_-]{32,128}$/u.test(claim.claimToken) ||
    !launchOwner
  ) {
    return null;
  }
  return {
    originatingPlanId: claim.originatingPlanId,
    claimToken: claim.claimToken,
    launchOwner,
  };
}

export function parseVisibleLoopChildStartProof(value: unknown): VisibleLoopChildStartProof | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const proof = value as Record<string, unknown>;
  const launchClaim = parseLaunchClaim(proof.launchClaim);
  const childOwner = parseOwner(proof.childOwner);
  if (
    !exactKeys(proof, [
      "schema",
      "runId",
      "iteration",
      "launchClaim",
      "childOwner",
      "activePlanId",
      "frontierStepIndex",
    ]) ||
    proof.schema !== "pi.visible-loop-child-start.v1" ||
    typeof proof.runId !== "string" ||
    !proof.runId ||
    !Number.isInteger(proof.iteration) ||
    Number(proof.iteration) < 2 ||
    !launchClaim ||
    !childOwner ||
    typeof proof.activePlanId !== "string" ||
    !proof.activePlanId ||
    !Number.isInteger(proof.frontierStepIndex) ||
    Number(proof.frontierStepIndex) !== 0
  ) {
    return null;
  }
  return {
    schema: "pi.visible-loop-child-start.v1",
    runId: proof.runId,
    iteration: Number(proof.iteration),
    launchClaim,
    childOwner,
    activePlanId: proof.activePlanId,
    frontierStepIndex: 0,
  };
}

function stateOwner(state: VisibleLoopChildProofState): VisibleLoopLeaseOwner {
  return {
    sessionId: state.ownerSessionId,
    processId: state.hostProcessId,
    processIncarnation: state.hostProcessIncarnation,
  };
}

function matchesActiveChildState(
  state: VisibleLoopChildProofState,
  proof: VisibleLoopChildStartProof,
  lease: VisibleLoopIterationLease,
  requireCurrentFrontier = false,
): boolean {
  const plan = state.plan;
  const currentFrontierMatches = Boolean(
    plan?.frontier?.stepIndex === proof.frontierStepIndex &&
      (plan.frontier.state === "submitted" || plan.frontier.state === "running"),
  );
  return Boolean(
    (!requireCurrentFrontier || currentFrontierMatches) &&
      !state.stopped &&
      plan?.lifecycle === "active" &&
      plan.iteration === proof.iteration &&
      plan.planId === proof.activePlanId &&
      plan.steps[proof.frontierStepIndex] &&
      lease.status === "ACTIVE" &&
      lease.runId === proof.runId &&
      lease.iteration === proof.iteration &&
      lease.planId === proof.activePlanId &&
      isDeepStrictEqual(lease.owner, proof.childOwner) &&
      isDeepStrictEqual(lease.launchClaim, proof.launchClaim) &&
      isDeepStrictEqual(stateOwner(state), proof.childOwner),
  );
}

export function createVisibleLoopChildStartProof(
  state: VisibleLoopChildProofState,
  claimToken: string,
  lease: VisibleLoopIterationLease,
): VisibleLoopChildStartProof | null {
  const plan = state.plan;
  if (
    !plan?.frontier ||
    plan.frontier.stepIndex !== 0 ||
    (plan.frontier.state !== "submitted" && plan.frontier.state !== "running") ||
    lease.status !== "ACTIVE" ||
    !lease.launchClaim ||
    lease.launchClaim.claimToken !== claimToken
  ) {
    return null;
  }
  const proof: VisibleLoopChildStartProof = {
    schema: "pi.visible-loop-child-start.v1",
    runId: state.config.runId,
    iteration: plan.iteration,
    launchClaim: lease.launchClaim,
    childOwner: stateOwner(state),
    activePlanId: plan.planId,
    frontierStepIndex: plan.frontier.stepIndex,
  };
  return matchesActiveChildState(state, proof, lease, true) ? proof : null;
}

export function validatePersistedVisibleLoopChildStartProof(
  state: VisibleLoopChildProofState,
  value: unknown,
  lease: VisibleLoopIterationLease,
): VisibleLoopChildStartProof | null | undefined {
  if (lease.status !== "ACTIVE") return undefined;
  if (lease.launchClaim === null) return value === null || value === undefined ? null : undefined;
  const proof = parseVisibleLoopChildStartProof(value);
  return proof && matchesActiveChildState(state, proof, lease) ? proof : undefined;
}

export function validateObservedVisibleLoopChildStartProof(input: {
  value: unknown;
  runId: string;
  iteration: number;
  originatingPlanId: string;
  claimToken: string;
  launchOwner: VisibleLoopLeaseOwner;
  lease: VisibleLoopIterationLease;
  snapshot: unknown;
}): VisibleLoopChildStartProof | null {
  const proof = parseVisibleLoopChildStartProof(input.value);
  if (
    !proof ||
    proof.runId !== input.runId ||
    proof.iteration !== input.iteration ||
    proof.launchClaim.originatingPlanId !== input.originatingPlanId ||
    proof.launchClaim.claimToken !== input.claimToken ||
    !isDeepStrictEqual(proof.launchClaim.launchOwner, input.launchOwner) ||
    !input.snapshot ||
    typeof input.snapshot !== "object" ||
    Array.isArray(input.snapshot)
  ) {
    return null;
  }
  const snapshot = input.snapshot as Record<string, unknown>;
  const state = {
    ownerSessionId: snapshot.ownerSessionId,
    config: { runId: snapshot.runId },
    hostProcessId: snapshot.hostProcessId,
    hostProcessIncarnation: snapshot.hostProcessIncarnation,
    stopped: snapshot.stopped,
    plan: snapshot.plan,
  } as VisibleLoopChildProofState;
  if (
    snapshot.schemaVersion !== 8 ||
    !isDeepStrictEqual(snapshot.continuationStartProof, proof) ||
    !matchesActiveChildState(state, proof, input.lease, true)
  ) {
    return null;
  }
  return proof;
}

// summary: defines and parses visible-loop lease owners, continuation claims, and child-start identities.
// read_when:
//   - changing continuation claim ownership, child process identity, or persisted proof schemas.

export interface VisibleLoopLeaseOwner {
  sessionId: string;
  processId: number;
  processIncarnation: string;
}

export interface VisibleLoopContinuationLaunchClaim {
  originatingPlanId: string;
  claimToken: string;
  launchOwner: VisibleLoopLeaseOwner;
}

export interface VisibleLoopChildStartProof {
  schema: "pi.visible-loop-child-start.v1";
  runId: string;
  iteration: number;
  launchClaim: VisibleLoopContinuationLaunchClaim;
  childOwner: VisibleLoopLeaseOwner;
  activePlanId: string;
  frontierStepIndex: number;
}

export function parseVisibleLoopLeaseOwner(value: unknown): VisibleLoopLeaseOwner {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("visible-loop lease owner is invalid");
  }
  const owner = value as Partial<VisibleLoopLeaseOwner>;
  if (
    typeof owner.sessionId !== "string" ||
    !owner.sessionId ||
    !Number.isInteger(owner.processId) ||
    Number(owner.processId) < 1 ||
    typeof owner.processIncarnation !== "string" ||
    !owner.processIncarnation
  ) {
    throw new Error("visible-loop lease owner binding is invalid");
  }
  return {
    sessionId: owner.sessionId,
    processId: Number(owner.processId),
    processIncarnation: owner.processIncarnation,
  };
}

export function parseVisibleLoopContinuationLaunchClaim(
  value: unknown,
): VisibleLoopContinuationLaunchClaim | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("visible-loop continuation launch claim is invalid");
  }
  const claim = value as Record<string, unknown>;
  if (
    Object.keys(claim).sort().join("\n") !== "claimToken\nlaunchOwner\noriginatingPlanId" ||
    typeof claim.originatingPlanId !== "string" ||
    !claim.originatingPlanId ||
    typeof claim.claimToken !== "string" ||
    !/^[A-Za-z0-9_-]{32,128}$/u.test(claim.claimToken)
  ) {
    throw new Error("visible-loop continuation launch claim binding is invalid");
  }
  return {
    originatingPlanId: claim.originatingPlanId,
    claimToken: claim.claimToken,
    launchOwner: parseVisibleLoopLeaseOwner(claim.launchOwner),
  };
}

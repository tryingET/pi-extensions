import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  parseVisibleLoopContinuationLaunchClaim,
  parseVisibleLoopLeaseOwner,
  type VisibleLoopContinuationLaunchClaim,
  type VisibleLoopLeaseOwner,
} from "./visibleLoopContinuationIdentity.ts";
import { getVisibleLoopStateDir } from "./visibleLoopState.ts";

interface VisibleLoopLeaseBase {
  schemaVersion: 1;
  runId: string;
  iteration: number;
  owner: VisibleLoopLeaseOwner;
}

export type VisibleLoopIterationLease =
  | (VisibleLoopLeaseBase & {
      status: "ACTIVE";
      planId: string | null;
      launchClaim: VisibleLoopContinuationLaunchClaim | null;
    })
  | (VisibleLoopLeaseBase & {
      status: "LAUNCHING";
      originatingPlanId: string;
      claimToken: string;
    })
  | (VisibleLoopLeaseBase & {
      status: "FAILED";
      originatingPlanId: string;
      claimToken: string;
      failureReason: string;
    })
  | (VisibleLoopLeaseBase & { status: "COMPLETED"; planId: string });

export type VisibleLoopLeaseResult<T> =
  | { ok: true; value: T; changed: boolean }
  | { ok: false; error: string };

export type VisibleLoopLeaseEntryDisposition =
  | "claimed_initial"
  | "consumed_launch"
  | "recovered_failure"
  | "resumed_owner";

type LeaseMutation<T> = {
  value: T;
  lease: VisibleLoopIterationLease;
  changed: boolean;
};

class LeaseRejectedError extends Error {}

function leaseKey(runId: string): string {
  return createHash("sha256").update(runId).digest("hex");
}

export function getVisibleLoopIterationLeasePath(
  runId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(getVisibleLoopStateDir(env), "leases", `${leaseKey(runId)}.json`);
}

function requireOwnerOnlyDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (lstatSync(path).isSymbolicLink())
    throw new Error("visible-loop lease directory is a symlink");
  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o700)
    throw new Error(`visible-loop lease directory mode drift: ${mode.toString(8)}`);
}

function isClaimToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/u.test(value);
}

function parseLease(value: unknown, expectedRunId: string): VisibleLoopIterationLease {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("visible-loop iteration lease is invalid");
  }
  const lease = value as Record<string, unknown>;
  if (
    lease.schemaVersion !== 1 ||
    lease.runId !== expectedRunId ||
    !Number.isInteger(lease.iteration) ||
    Number(lease.iteration) < 1
  ) {
    throw new Error("visible-loop iteration lease binding drift");
  }
  const base = {
    schemaVersion: 1 as const,
    runId: expectedRunId,
    iteration: Number(lease.iteration),
    owner: parseVisibleLoopLeaseOwner(lease.owner),
  };
  if (lease.status === "ACTIVE") {
    if (lease.planId !== null && (typeof lease.planId !== "string" || !lease.planId)) {
      throw new Error("visible-loop ACTIVE lease plan binding is invalid");
    }
    return {
      ...base,
      status: "ACTIVE",
      planId: lease.planId as string | null,
      launchClaim: parseVisibleLoopContinuationLaunchClaim(lease.launchClaim),
    };
  }
  if (lease.status === "COMPLETED") {
    if (typeof lease.planId !== "string" || !lease.planId) {
      throw new Error("visible-loop COMPLETED lease plan binding is invalid");
    }
    return { ...base, status: "COMPLETED", planId: lease.planId };
  }
  if (lease.status === "LAUNCHING" || lease.status === "FAILED") {
    if (typeof lease.originatingPlanId !== "string" || !lease.originatingPlanId) {
      throw new Error("visible-loop continuation lease plan binding is invalid");
    }
    if (!isClaimToken(lease.claimToken)) {
      throw new Error("visible-loop continuation lease claim token is invalid");
    }
    if (lease.status === "FAILED") {
      if (typeof lease.failureReason !== "string" || !lease.failureReason) {
        throw new Error("visible-loop FAILED lease reason is invalid");
      }
      return {
        ...base,
        status: "FAILED",
        originatingPlanId: lease.originatingPlanId,
        claimToken: lease.claimToken,
        failureReason: lease.failureReason,
      };
    }
    return {
      ...base,
      status: "LAUNCHING",
      originatingPlanId: lease.originatingPlanId,
      claimToken: lease.claimToken,
    };
  }
  throw new Error("visible-loop iteration lease status is invalid");
}

function sameOwner(left: VisibleLoopLeaseOwner, right: VisibleLoopLeaseOwner): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.processId === right.processId &&
    left.processIncarnation === right.processIncarnation
  );
}

function readLeaseFile(path: string, runId: string): VisibleLoopIterationLease | null {
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error("visible-loop lease file is a symlink");
    const mode = statSync(path).mode & 0o777;
    if ((mode & 0o077) !== 0 || (mode & 0o600) !== 0o600) {
      throw new Error(`visible-loop lease file mode drift: ${mode.toString(8)}`);
    }
    return parseLease(JSON.parse(readFileSync(path, "utf8")) as unknown, runId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function syncDirectory(path: string): void {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeLeaseFile(path: string, lease: VisibleLoopIterationLease): void {
  const expected = parseLease(lease, lease.runId);
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(expected, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    const descriptor = openSync(temporaryPath, "r");
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporaryPath, path);
    syncDirectory(dirname(path));
    const observed = readLeaseFile(path, lease.runId);
    if (!observed || JSON.stringify(observed) !== JSON.stringify(expected)) {
      throw new Error("visible-loop lease atomic write read-back drift");
    }
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function mutateLease<T>(
  runId: string,
  env: NodeJS.ProcessEnv,
  mutate: (lease: VisibleLoopIterationLease | null) => LeaseMutation<T>,
): VisibleLoopLeaseResult<T> {
  if (!runId) return { ok: false, error: "visible-loop runId is unavailable" };
  const path = getVisibleLoopIterationLeasePath(runId, env);
  const leaseDirectory = dirname(path);
  const lockPath = `${path}.lock`;
  let acquired = false;
  let result: VisibleLoopLeaseResult<T>;
  try {
    requireOwnerOnlyDirectory(leaseDirectory);
    mkdirSync(lockPath, { mode: 0o700 });
    acquired = true;
    const mutation = mutate(readLeaseFile(path, runId));
    if (mutation.changed) writeLeaseFile(path, mutation.lease);
    result = { ok: true, value: mutation.value, changed: mutation.changed };
  } catch (error) {
    const prefix = error instanceof LeaseRejectedError ? "" : "visible-loop lease failed closed: ";
    result = {
      ok: false,
      error: `${prefix}${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (acquired) {
    try {
      rmSync(lockPath, { recursive: true });
    } catch (error) {
      return {
        ok: false,
        error: `visible-loop lease failed closed: run lock release failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return result;
}

function activeLease(
  runId: string,
  iteration: number,
  owner: VisibleLoopLeaseOwner,
  launchClaim: VisibleLoopContinuationLaunchClaim | null = null,
): VisibleLoopIterationLease {
  return {
    schemaVersion: 1,
    runId,
    status: "ACTIVE",
    iteration,
    planId: null,
    owner,
    launchClaim,
  };
}

export function enterVisibleLoopIterationLease(input: {
  runId: string;
  iteration: number;
  owner: VisibleLoopLeaseOwner;
  claimToken?: string;
  env?: NodeJS.ProcessEnv;
}): VisibleLoopLeaseResult<VisibleLoopLeaseEntryDisposition> {
  return mutateLease(input.runId, input.env ?? process.env, (lease) => {
    parseVisibleLoopLeaseOwner(input.owner);
    if (!lease) {
      if (input.iteration !== 1 || input.claimToken) {
        throw new LeaseRejectedError("visible-loop lease rejects a non-initial unclaimed start");
      }
      return {
        value: "claimed_initial",
        lease: activeLease(input.runId, 1, input.owner),
        changed: true,
      };
    }
    if (
      lease.status === "ACTIVE" &&
      lease.iteration === input.iteration &&
      !input.claimToken &&
      sameOwner(lease.owner, input.owner)
    ) {
      return { value: "resumed_owner", lease, changed: false };
    }
    if (
      lease.status === "LAUNCHING" &&
      lease.iteration === input.iteration &&
      input.claimToken === lease.claimToken
    ) {
      return {
        value: "consumed_launch",
        lease: activeLease(input.runId, input.iteration, input.owner, {
          originatingPlanId: lease.originatingPlanId,
          claimToken: lease.claimToken,
          launchOwner: lease.owner,
        }),
        changed: true,
      };
    }
    if (lease.status === "FAILED" && lease.iteration === input.iteration && !input.claimToken) {
      return {
        value: "recovered_failure",
        lease: activeLease(input.runId, input.iteration, input.owner),
        changed: true,
      };
    }
    throw new LeaseRejectedError(
      `visible-loop lease rejects session ${input.owner.sessionId} entering iteration ${input.iteration} from ${lease.status}(${lease.iteration})`,
    );
  });
}

export function bindVisibleLoopActivePlan(input: {
  runId: string;
  iteration: number;
  planId: string;
  owner: VisibleLoopLeaseOwner;
  env?: NodeJS.ProcessEnv;
}): VisibleLoopLeaseResult<VisibleLoopIterationLease> {
  return mutateLease(input.runId, input.env ?? process.env, (lease) => {
    if (
      !lease ||
      lease.status !== "ACTIVE" ||
      lease.iteration !== input.iteration ||
      !sameOwner(lease.owner, input.owner) ||
      (lease.planId !== null && lease.planId !== input.planId)
    ) {
      throw new LeaseRejectedError("visible-loop ACTIVE plan binding ownership changed");
    }
    const next = { ...lease, planId: input.planId };
    return { value: next, lease: next, changed: lease.planId === null };
  });
}

export function launchNextVisibleLoopIteration(input: {
  runId: string;
  completedIteration: number;
  originatingPlanId: string;
  owner: VisibleLoopLeaseOwner;
  env?: NodeJS.ProcessEnv;
}): VisibleLoopLeaseResult<string> {
  const claimToken = randomBytes(32).toString("base64url");
  return mutateLease(input.runId, input.env ?? process.env, (lease) => {
    if (
      !lease ||
      lease.status !== "ACTIVE" ||
      lease.iteration !== input.completedIteration ||
      lease.planId !== input.originatingPlanId ||
      !sameOwner(lease.owner, input.owner)
    ) {
      throw new LeaseRejectedError("visible-loop continuation launch ownership changed");
    }
    const next: VisibleLoopIterationLease = {
      schemaVersion: 1,
      runId: input.runId,
      status: "LAUNCHING",
      iteration: input.completedIteration + 1,
      originatingPlanId: input.originatingPlanId,
      claimToken,
      owner: input.owner,
    };
    return { value: claimToken, lease: next, changed: true };
  });
}

export function failVisibleLoopIterationLaunch(input: {
  runId: string;
  nextIteration: number;
  originatingPlanId: string;
  claimToken: string;
  owner: VisibleLoopLeaseOwner;
  failureReason: string;
  env?: NodeJS.ProcessEnv;
}): VisibleLoopLeaseResult<VisibleLoopIterationLease> {
  return mutateLease(input.runId, input.env ?? process.env, (lease) => {
    if (
      !lease ||
      lease.status !== "LAUNCHING" ||
      lease.iteration !== input.nextIteration ||
      lease.originatingPlanId !== input.originatingPlanId ||
      lease.claimToken !== input.claimToken ||
      !sameOwner(lease.owner, input.owner)
    ) {
      throw new LeaseRejectedError("visible-loop failed-launch callback is stale");
    }
    const next: VisibleLoopIterationLease = {
      ...lease,
      status: "FAILED",
      failureReason: input.failureReason,
    };
    return { value: next, lease: next, changed: true };
  });
}

export function confirmVisibleLoopIterationLaunch(input: {
  runId: string;
  nextIteration: number;
  originatingPlanId: string;
  claimToken: string;
  owner: VisibleLoopLeaseOwner;
  env?: NodeJS.ProcessEnv;
}): VisibleLoopLeaseResult<VisibleLoopIterationLease> {
  return mutateLease(input.runId, input.env ?? process.env, (lease) => {
    if (
      !lease ||
      lease.status !== "LAUNCHING" ||
      lease.iteration !== input.nextIteration ||
      lease.originatingPlanId !== input.originatingPlanId ||
      lease.claimToken !== input.claimToken ||
      !sameOwner(lease.owner, input.owner)
    ) {
      throw new LeaseRejectedError("visible-loop launch callback is stale");
    }
    return { value: lease, lease, changed: false };
  });
}

function transitionActiveLease(input: {
  runId: string;
  iteration: number;
  planId: string;
  owner: VisibleLoopLeaseOwner;
  status: "ACTIVE" | "COMPLETED";
  env?: NodeJS.ProcessEnv;
}): VisibleLoopLeaseResult<VisibleLoopIterationLease> {
  return mutateLease(input.runId, input.env ?? process.env, (lease) => {
    if (
      !lease ||
      lease.status !== "ACTIVE" ||
      lease.iteration !== input.iteration ||
      lease.planId !== input.planId ||
      !sameOwner(lease.owner, input.owner)
    ) {
      throw new LeaseRejectedError("visible-loop ACTIVE transition ownership changed");
    }
    const next: VisibleLoopIterationLease =
      input.status === "COMPLETED"
        ? { ...lease, status: "COMPLETED", planId: input.planId }
        : activeLease(input.runId, input.iteration + 1, input.owner);
    return { value: next, lease: next, changed: true };
  });
}

export function advanceLocalVisibleLoopIteration(
  input: Omit<Parameters<typeof transitionActiveLease>[0], "status">,
): VisibleLoopLeaseResult<VisibleLoopIterationLease> {
  return transitionActiveLease({ ...input, status: "ACTIVE" });
}

export function completeVisibleLoopIterationLease(
  input: Omit<Parameters<typeof transitionActiveLease>[0], "status">,
): VisibleLoopLeaseResult<VisibleLoopIterationLease> {
  return transitionActiveLease({ ...input, status: "COMPLETED" });
}

export function readVisibleLoopIterationLease(
  runId: string,
  env: NodeJS.ProcessEnv = process.env,
): VisibleLoopLeaseResult<VisibleLoopIterationLease | null> {
  try {
    return {
      ok: true,
      value: readLeaseFile(getVisibleLoopIterationLeasePath(runId, env), runId),
      changed: false,
    };
  } catch (error) {
    return {
      ok: false,
      error: `visible-loop lease failed closed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

import { readFileSync } from "node:fs";
import {
  advanceLocalVisibleLoopIteration,
  confirmVisibleLoopIterationLaunch,
  failVisibleLoopIterationLaunch,
  launchNextVisibleLoopIteration,
  readVisibleLoopIterationLease,
} from "./visibleLoopContinuationClaim.ts";
import type {
  VisibleLoopChildStartProof,
  VisibleLoopLeaseOwner,
} from "./visibleLoopContinuationIdentity.ts";
import {
  parseVisibleLoopChildStartProof,
  validateObservedVisibleLoopChildStartProof,
} from "./visibleLoopContinuationProof.ts";
import type { VisibleLoopPlanProgress } from "./visibleLoopPlan.ts";
import { getVisibleLoopCommandName, getVisibleLoopHumanLabel } from "./visibleLoopProfiles.ts";
import {
  type ActiveVisibleLoopState,
  readActiveVisibleLoopSnapshot,
  type VisibleLoopContext,
} from "./visibleLoopRecovery.ts";
import { appendVisibleLoopStatus, getVisibleLoopStatusPath } from "./visibleLoopState.ts";

export type VisibleLoopContinuationResult = { ok: true } | { ok: false; error: string };

const DEFAULT_VISIBLE_LOOP_CONTINUATION_START_TIMEOUT_MS = 30_000;
const MAX_VISIBLE_LOOP_CONTINUATION_START_TIMEOUT_MS = 120_000;
const DEFAULT_VISIBLE_LOOP_CONTINUATION_START_POLL_INTERVAL_MS = 100;

export function resolveVisibleLoopContinuationStartTimeoutMs(
  env: NodeJS.ProcessEnv,
  configured?: number,
): number {
  const candidate =
    typeof configured === "number"
      ? configured
      : Number.parseInt(env.PI_VISIBLE_LOOP_CONTINUATION_START_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return DEFAULT_VISIBLE_LOOP_CONTINUATION_START_TIMEOUT_MS;
  }
  return Math.min(Math.floor(candidate), MAX_VISIBLE_LOOP_CONTINUATION_START_TIMEOUT_MS);
}

export function resolveVisibleLoopContinuationStartPollIntervalMs(configured?: number): number {
  if (typeof configured !== "number" || !Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_VISIBLE_LOOP_CONTINUATION_START_POLL_INTERVAL_MS;
  }
  return Math.max(1, Math.floor(configured));
}

class VisibleLoopContinuationStartUnconfirmedError extends Error {
  constructor(runId: string, expectedIteration: number, timeoutMs: number) {
    super(
      `correlated child start was not observed for run ${runId} iteration ${expectedIteration} within ${timeoutMs}ms`,
    );
    this.name = "VisibleLoopContinuationStartUnconfirmedError";
  }
}

class VisibleLoopStatusCursorUnavailableError extends Error {
  constructor(runId: string, reason: string) {
    super(`could not establish a fresh child-start boundary for run ${runId}: ${reason}`);
    this.name = "VisibleLoopStatusCursorUnavailableError";
  }
}

export function readVisibleLoopContinuationStatusCursor(
  config: ActiveVisibleLoopState["config"],
  env: NodeJS.ProcessEnv,
): number {
  try {
    return readFileSync(getVisibleLoopStatusPath(config, env)).byteLength;
  } catch (error) {
    throw new VisibleLoopStatusCursorUnavailableError(
      config.runId,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function readCorrelatedVisibleLoopChildStart(
  state: ActiveVisibleLoopState,
  expectedIteration: number,
  originatingPlanId: string,
  claimToken: string,
  launchOwner: VisibleLoopLeaseOwner,
  statusCursor: number,
  env: NodeJS.ProcessEnv,
): VisibleLoopChildStartProof | null {
  try {
    const status = readFileSync(getVisibleLoopStatusPath(state.config, env));
    if (status.byteLength < statusCursor) return null;
    for (const line of status.subarray(statusCursor).toString("utf8").split("\n")) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const candidate = parseVisibleLoopChildStartProof(entry.proof);
        if (
          entry.event !== "child_started" ||
          entry.runId !== state.config.runId ||
          entry.iteration !== expectedIteration ||
          !candidate
        ) {
          continue;
        }
        const lease = readVisibleLoopIterationLease(state.config.runId, env);
        const snapshot = readActiveVisibleLoopSnapshot(candidate.childOwner.sessionId, env);
        if (!lease.ok || !lease.value || snapshot.kind !== "ok") continue;
        const proof = validateObservedVisibleLoopChildStartProof({
          value: candidate,
          runId: state.config.runId,
          iteration: expectedIteration,
          originatingPlanId,
          claimToken,
          launchOwner,
          lease: lease.value,
          snapshot: snapshot.value,
        });
        if (proof) return proof;
      } catch {
        // Ignore malformed or stale diagnostic records and continue polling exact durable identity.
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function waitForCorrelatedVisibleLoopChildStart(
  state: ActiveVisibleLoopState,
  expectedIteration: number,
  originatingPlanId: string,
  claimToken: string,
  launchOwner: VisibleLoopLeaseOwner,
  statusCursor: number,
  env: NodeJS.ProcessEnv,
): Promise<VisibleLoopChildStartProof> {
  const deadline = Date.now() + state.continuationStartTimeoutMs;
  while (Date.now() <= deadline) {
    const proof = readCorrelatedVisibleLoopChildStart(
      state,
      expectedIteration,
      originatingPlanId,
      claimToken,
      launchOwner,
      statusCursor,
      env,
    );
    if (proof) return proof;
    await new Promise<void>((resolvePromise) => {
      setTimeout(resolvePromise, state.continuationStartPollIntervalMs);
    });
  }
  throw new VisibleLoopContinuationStartUnconfirmedError(
    state.config.runId,
    expectedIteration,
    state.continuationStartTimeoutMs,
  );
}

interface VisibleLoopContinuationDependencies {
  isCurrentRuntime(): boolean;
  getActiveState(): ActiveVisibleLoopState | null;
  clearActiveState(): void;
  queueIteration(state: ActiveVisibleLoopState): void;
}

function leaseOwner(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
): VisibleLoopLeaseOwner | null {
  const sessionId = ctx.sessionManager?.getSessionId?.()?.trim();
  if (!sessionId || sessionId !== state.ownerSessionId) return null;
  return {
    sessionId: state.ownerSessionId,
    processId: state.hostProcessId,
    processIncarnation: state.hostProcessIncarnation,
  };
}

function ownsFinalizedState(
  state: ActiveVisibleLoopState,
  plan: VisibleLoopPlanProgress,
  activeState: ActiveVisibleLoopState | null,
): boolean {
  return Boolean(
    activeState === state &&
      state.plan === plan &&
      plan.lifecycle === "finalized" &&
      plan.iteration === state.completedIterations &&
      state.stopped,
  );
}

function recordStaleVisibleLoopContinuation(
  state: ActiveVisibleLoopState,
  plan: VisibleLoopPlanProgress,
  nextIteration: number,
  phase: "before_launch" | "resolved" | "rejected" | "local_resume",
  env: NodeJS.ProcessEnv,
  error?: unknown,
): void {
  appendVisibleLoopStatus(
    state.config,
    {
      event: "stale_continuation_ignored",
      planId: plan.planId,
      nextIteration,
      phase,
      ...(error === undefined
        ? {}
        : { error: error instanceof Error ? error.message : String(error) }),
    },
    env,
  );
}

export function continueVisibleLoopAfterFinalizedIteration(
  state: ActiveVisibleLoopState,
  plan: VisibleLoopPlanProgress,
  ctx: VisibleLoopContext,
  env: NodeJS.ProcessEnv,
  progressReport: Promise<void>,
  dependencies: VisibleLoopContinuationDependencies,
): VisibleLoopContinuationResult {
  const followingIteration = state.completedIterations + 1;
  const owner = leaseOwner(state, ctx);
  if (!owner || !ownsFinalizedState(state, plan, dependencies.getActiveState())) {
    recordStaleVisibleLoopContinuation(state, plan, followingIteration, "before_launch", env);
    return { ok: false, error: "visible-loop continuation owner is stale" };
  }

  if (state.continueInNewSession) {
    dependencies.clearActiveState();
    const claimed = launchNextVisibleLoopIteration({
      runId: state.config.runId,
      completedIteration: state.completedIterations,
      originatingPlanId: plan.planId,
      owner,
      env,
    });
    if (!claimed.ok) {
      recordStaleVisibleLoopContinuation(state, plan, followingIteration, "before_launch", env);
      return { ok: false, error: claimed.error };
    }
    const claimToken = claimed.value;
    appendVisibleLoopStatus(
      state.config,
      {
        event: "next_iteration_launch_requested",
        nextIteration: followingIteration,
        planId: plan.planId,
        claimToken,
      },
      env,
    );
    const completedIterations = state.completedIterations;
    void (async () => {
      await progressReport;
      const stillLaunching = confirmVisibleLoopIterationLaunch({
        runId: state.config.runId,
        nextIteration: followingIteration,
        originatingPlanId: plan.planId,
        claimToken,
        owner,
        env,
      });
      if (!stillLaunching.ok) {
        recordStaleVisibleLoopContinuation(state, plan, followingIteration, "before_launch", env);
        return;
      }
      try {
        const childStartCursor = state.readContinuationStatusCursor(state.config, env);
        if (!Number.isSafeInteger(childStartCursor) || childStartCursor < 0) {
          throw new VisibleLoopStatusCursorUnavailableError(
            state.config.runId,
            "cursor reader returned an invalid byte offset",
          );
        }
        await state.continueInNewSession?.({
          config: state.config,
          configPath: state.configPath,
          completedIterations,
          nextIteration: followingIteration,
          claimToken,
        });
        const childStartProof = await waitForCorrelatedVisibleLoopChildStart(
          state,
          followingIteration,
          plan.planId,
          claimToken,
          owner,
          childStartCursor,
          env,
        );
        appendVisibleLoopStatus(
          state.config,
          {
            event: "next_iteration_child_start_confirmed",
            nextIteration: followingIteration,
            planId: plan.planId,
            claimToken,
            proof: childStartProof,
          },
          env,
        );
        // Preserve the current event vocabulary, but only after exact child-start proof.
        appendVisibleLoopStatus(
          state.config,
          {
            event: "next_iteration_launch_dispatched",
            nextIteration: followingIteration,
            planId: plan.planId,
            claimToken,
            proof: childStartProof,
          },
          env,
        );
        ctx.ui?.setStatus?.(getVisibleLoopCommandName(state.config), undefined);
        ctx.ui?.setWidget?.(`${getVisibleLoopCommandName(state.config)}-plan`, undefined);
      } catch (error) {
        const failure = error instanceof Error ? error.message : String(error);
        const failed = failVisibleLoopIterationLaunch({
          runId: state.config.runId,
          nextIteration: followingIteration,
          originatingPlanId: plan.planId,
          claimToken,
          owner,
          failureReason: failure,
          env,
        });
        if (!failed.ok) {
          recordStaleVisibleLoopContinuation(
            state,
            plan,
            followingIteration,
            "rejected",
            env,
            error,
          );
        }
        const failurePhase =
          error instanceof VisibleLoopStatusCursorUnavailableError
            ? "status_boundary_unavailable"
            : error instanceof VisibleLoopContinuationStartUnconfirmedError
              ? "child_start_timeout"
              : "launcher_rejected";
        if (failed.ok && failurePhase === "launcher_rejected") {
          appendVisibleLoopStatus(
            state.config,
            {
              event: "next_iteration_spawn_failed",
              nextIteration: followingIteration,
              planId: plan.planId,
              claimToken,
              priorPlanLifecycle: plan.lifecycle,
              error: failure,
            },
            env,
          );
        }
        appendVisibleLoopStatus(
          state.config,
          {
            event: "next_iteration_child_start_unconfirmed",
            nextIteration: followingIteration,
            planId: plan.planId,
            claimToken,
            failurePhase,
            error: failure,
          },
          env,
        );
        ctx.ui?.notify?.(
          `${getVisibleLoopHumanLabel(state.config)} requested iteration ${followingIteration}/${state.config.loopCount}, but the launch effect is unconfirmed; the loop remains stopped to avoid duplicate execution: ${failure}`,
          "error",
        );
      }
    })();
    return { ok: true };
  }

  const advanced = advanceLocalVisibleLoopIteration({
    runId: state.config.runId,
    iteration: state.completedIterations,
    planId: plan.planId,
    owner,
    env,
  });
  if (!advanced.ok) {
    recordStaleVisibleLoopContinuation(state, plan, followingIteration, "local_resume", env);
    return { ok: false, error: advanced.error };
  }
  void progressReport.finally(() => {
    setTimeout(() => {
      if (
        !dependencies.isCurrentRuntime() ||
        !ownsFinalizedState(state, plan, dependencies.getActiveState())
      ) {
        recordStaleVisibleLoopContinuation(state, plan, followingIteration, "local_resume", env);
        return;
      }
      state.stopped = false;
      dependencies.queueIteration(state);
    }, 250);
  });
  return { ok: true };
}

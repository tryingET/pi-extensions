import {
  advanceLocalVisibleLoopIteration,
  confirmVisibleLoopIterationLaunch,
  failVisibleLoopIterationLaunch,
  launchNextVisibleLoopIteration,
  type VisibleLoopLeaseOwner,
} from "./visibleLoopContinuationClaim.ts";
import type { VisibleLoopPlanProgress } from "./visibleLoopPlan.ts";
import { getVisibleLoopCommandName, getVisibleLoopHumanLabel } from "./visibleLoopProfiles.ts";
import type { ActiveVisibleLoopState, VisibleLoopContext } from "./visibleLoopRecovery.ts";
import { appendVisibleLoopStatus } from "./visibleLoopState.ts";

export type VisibleLoopContinuationResult = { ok: true } | { ok: false; error: string };

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
        await state.continueInNewSession?.({
          config: state.config,
          configPath: state.configPath,
          completedIterations,
          nextIteration: followingIteration,
          claimToken,
        });
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
          return;
        }
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
        ctx.ui?.notify?.(
          `${getVisibleLoopHumanLabel(state.config)} failed to launch iteration ${followingIteration}/${state.config.loopCount}; prior plan is finalized and cannot be reused: ${failure}`,
          "error",
        );
        return;
      }
      const dispatched = confirmVisibleLoopIterationLaunch({
        runId: state.config.runId,
        nextIteration: followingIteration,
        originatingPlanId: plan.planId,
        claimToken,
        owner,
        env,
      });
      if (!dispatched.ok) {
        recordStaleVisibleLoopContinuation(state, plan, followingIteration, "resolved", env);
        return;
      }
      appendVisibleLoopStatus(
        state.config,
        {
          event: "next_iteration_launch_dispatched",
          nextIteration: followingIteration,
          planId: plan.planId,
          claimToken,
        },
        env,
      );
      ctx.ui?.setStatus?.(getVisibleLoopCommandName(state.config), undefined);
      ctx.ui?.setWidget?.(`${getVisibleLoopCommandName(state.config)}-plan`, undefined);
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

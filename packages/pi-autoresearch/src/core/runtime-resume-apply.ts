import path from "node:path";
import { executeAutoresearchLoop } from "./runtime-loop.ts";
import type {
  ExecuteAutoresearchResumeApplyInput,
  ExecuteAutoresearchResumeApplyResult,
} from "./runtime-model.ts";
import { buildAutoresearchResumeApplyPlan } from "./runtime-resume-plan.ts";

export async function executeAutoresearchResumeApply(
  input: ExecuteAutoresearchResumeApplyInput,
): Promise<ExecuteAutoresearchResumeApplyResult> {
  const cwd = path.resolve(input.cwd);
  if (input.operatorConfirmation !== "RUN FOREGROUND RESUME") {
    throw new Error('operatorConfirmation must exactly equal "RUN FOREGROUND RESUME"');
  }
  if (!Number.isInteger(input.maxIterations) || input.maxIterations < 1) {
    throw new Error("maxIterations must be a positive integer");
  }
  if (!Number.isFinite(input.maxWallClockMinutes) || input.maxWallClockMinutes <= 0) {
    throw new Error("maxWallClockMinutes must be a positive number");
  }

  const applyPlan = buildAutoresearchResumeApplyPlan(cwd);
  if (!applyPlan.planReady) {
    throw new Error(
      `resume_apply is blocked: ${applyPlan.blockedReasons.join("; ") || "plan is not ready"}`,
    );
  }
  if (applyPlan.resumePlan.segmentKey !== input.segmentKey) {
    throw new Error("segmentKey does not match the current reusable resume plan");
  }
  if (applyPlan.resumePlan.runtimeKey !== input.runtimeKey) {
    throw new Error("runtimeKey does not match the current reusable resume plan");
  }

  const loopResult = await executeAutoresearchLoop({
    cwd,
    goal: applyPlan.resumePlan.campaign ?? "resume-apply",
    maxIterations: input.maxIterations,
    maxWallClockMinutes: input.maxWallClockMinutes,
    description:
      input.description ??
      `foreground resume for ${applyPlan.resumePlan.campaign ?? "current autoresearch campaign"}`,
    timeoutSeconds: input.timeoutSeconds,
    checksTimeoutSeconds: input.checksTimeoutSeconds,
    postureCommand: input.postureCommand,
    postureTimeoutSeconds: input.postureTimeoutSeconds,
    peerMode: "off",
    signal: input.signal,
    onProgress: input.onProgress,
  });

  return {
    cwd,
    action: "resume_apply",
    executionAuthorized: true,
    applyPlan,
    loopResult,
    authorityWarnings: [
      "resume_apply ran only inside this foreground tool call with explicit budgets and exact operator confirmation",
      "no daemon, background restart, peer launch, candidate lifecycle mutation, package-local promotion, or external evidence/learning write was authorized",
    ],
  };
}

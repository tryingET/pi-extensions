import { getVisibleLoopCommandName } from "./visibleLoopProfiles.ts";
import type { VisibleLoopPromptExpansion } from "./visibleLoopPromptTemplates.ts";
import type { ActiveVisibleLoopState, VisibleLoopContext } from "./visibleLoopRecovery.ts";
import type { VisibleLoopRunConfig } from "./visibleLoopTypes.ts";

export type VisibleLoopPlanStepKind = "prompt" | "completion";
export type VisibleLoopPlanLifecycle = "active" | "finalized" | "failed_closed";
export type VisibleLoopFrontierState = "submitting" | "submitted" | "running";
export type VisibleLoopBarrierAttemptStatus = "in_flight" | "succeeded" | "failed_closed";

export interface VisibleLoopPlanStep {
  index: number;
  prompt: string;
  label: string;
  kind: VisibleLoopPlanStepKind;
  governedBarrier: boolean;
}

export interface VisibleLoopFrontier {
  stepIndex: number;
  state: VisibleLoopFrontierState;
}

export interface VisibleLoopBarrierAttempt {
  stepIndex: number;
  toolCallId: string;
  status: VisibleLoopBarrierAttemptStatus;
  handoffId?: string;
  runId?: string;
}

export interface VisibleLoopPlanProgress {
  planId: string;
  iteration: number;
  lifecycle: VisibleLoopPlanLifecycle;
  steps: VisibleLoopPlanStep[];
  settledCount: number;
  frontier: VisibleLoopFrontier | null;
  barrierAttempts: VisibleLoopBarrierAttempt[];
  failureReason?: string;
}

export interface VisibleLoopPlanCounts {
  plannedCount: number;
  releasedCount: number;
  submittedPendingCount: number;
  hostQueuedCount: number;
  blockedCount: number;
  runningCount: number;
  settledCount: number;
}

export type VisibleLoopRecoveryDisposition =
  | { disposition: "resume" }
  | { disposition: "schedule_frontier" }
  | { disposition: "fail_closed"; reason: string }
  | { disposition: "finalized" };

export function createVisibleLoopPlanProgress(
  steps: VisibleLoopPlanStep[],
  iteration: number,
  planId: string,
): VisibleLoopPlanProgress {
  return {
    planId,
    iteration,
    lifecycle: "active",
    steps,
    settledCount: 0,
    frontier: null,
    barrierAttempts: [],
  };
}

export function beginVisibleLoopFrontierSubmission(
  progress: VisibleLoopPlanProgress,
): VisibleLoopPlanStep | undefined {
  if (
    progress.lifecycle !== "active" ||
    progress.frontier !== null ||
    progress.settledCount >= progress.steps.length
  ) {
    return undefined;
  }
  const step = progress.steps[progress.settledCount];
  if (!step) return undefined;
  progress.frontier = { stepIndex: step.index, state: "submitting" };
  return step;
}

export function markVisibleLoopFrontierSubmitted(progress: VisibleLoopPlanProgress): boolean {
  if (progress.frontier?.state !== "submitting") return false;
  progress.frontier.state = "submitted";
  return true;
}

export function observeVisibleLoopPlanStep(
  progress: VisibleLoopPlanProgress,
  prompt: string,
): { step: VisibleLoopPlanStep; changed: boolean } | undefined {
  const frontier = progress.frontier;
  if (!frontier || (frontier.state !== "submitted" && frontier.state !== "running")) {
    return undefined;
  }
  const step = progress.steps[frontier.stepIndex];
  if (!step || step.index !== progress.settledCount || step.prompt !== prompt) return undefined;
  if (frontier.state === "running") return { step, changed: false };
  frontier.state = "running";
  return { step, changed: true };
}

export function settleRunningVisibleLoopPlanStep(
  progress: VisibleLoopPlanProgress,
): VisibleLoopPlanStep | undefined {
  const frontier = progress.frontier;
  if (!frontier || frontier.state !== "running" || frontier.stepIndex !== progress.settledCount) {
    return undefined;
  }
  const step = progress.steps[frontier.stepIndex];
  if (!step) return undefined;
  progress.settledCount += 1;
  progress.frontier = null;
  return step;
}

export function beginVisibleLoopBarrierAttempt(
  progress: VisibleLoopPlanProgress,
  stepIndex: number,
  toolCallId: string,
): "started" | "duplicate_event" | "duplicate_call" | "invalid" {
  const frontier = progress.frontier;
  const step = progress.steps[stepIndex];
  if (
    progress.lifecycle !== "active" ||
    frontier?.state !== "running" ||
    frontier.stepIndex !== stepIndex ||
    !step?.governedBarrier
  ) {
    return "invalid";
  }
  const existing = progress.barrierAttempts.find((attempt) => attempt.stepIndex === stepIndex);
  if (!existing) {
    progress.barrierAttempts.push({ stepIndex, toolCallId, status: "in_flight" });
    return "started";
  }
  if (existing.toolCallId === toolCallId) return "duplicate_event";
  existing.status = "failed_closed";
  failVisibleLoopPlan(progress, "duplicate governed deep-review call");
  return "duplicate_call";
}

export function completeVisibleLoopBarrierAttempt(
  progress: VisibleLoopPlanProgress,
  stepIndex: number,
  toolCallId: string,
  receipt: { ok: true; handoffId: string; runId?: string } | { ok: false; reason: string },
): "succeeded" | "failed_closed" | "ignored" {
  const attempt = progress.barrierAttempts.find((candidate) => candidate.stepIndex === stepIndex);
  if (!attempt || attempt.toolCallId !== toolCallId || attempt.status !== "in_flight") {
    return "ignored";
  }
  if (!receipt.ok) {
    attempt.status = "failed_closed";
    failVisibleLoopPlan(progress, receipt.reason);
    return "failed_closed";
  }
  attempt.status = "succeeded";
  attempt.handoffId = receipt.handoffId;
  if (receipt.runId) attempt.runId = receipt.runId;
  return "succeeded";
}

export function hasVisibleLoopBarrierSuccess(
  progress: VisibleLoopPlanProgress,
  stepIndex: number,
): boolean {
  return progress.barrierAttempts.some(
    (attempt) => attempt.stepIndex === stepIndex && attempt.status === "succeeded",
  );
}

export function finalizeVisibleLoopPlan(progress: VisibleLoopPlanProgress): boolean {
  if (progress.lifecycle !== "active") return false;
  progress.lifecycle = "finalized";
  return true;
}

export function failVisibleLoopPlan(progress: VisibleLoopPlanProgress, reason: string): void {
  progress.lifecycle = "failed_closed";
  progress.failureReason = reason;
}

export function getVisibleLoopRecoveryDisposition(
  progress: VisibleLoopPlanProgress,
  sameHostProcess: boolean,
): VisibleLoopRecoveryDisposition {
  if (progress.lifecycle === "finalized") return { disposition: "finalized" };
  if (progress.lifecycle === "failed_closed") {
    return {
      disposition: "fail_closed",
      reason: progress.failureReason ?? "visible-loop plan previously failed closed",
    };
  }
  if (!sameHostProcess) {
    return {
      disposition: "fail_closed",
      reason: "fresh host restart cannot safely recover visible-loop delivery effects",
    };
  }
  if (progress.frontier?.state === "submitting") {
    return {
      disposition: "fail_closed",
      reason: "visible-loop delivery effect is indeterminate after reload",
    };
  }
  if (progress.frontier) return { disposition: "resume" };
  if (progress.settledCount < progress.steps.length) return { disposition: "schedule_frontier" };
  return {
    disposition: "fail_closed",
    reason: "active visible-loop plan has no executable frontier",
  };
}

export function getVisibleLoopPlanCounts(progress: VisibleLoopPlanProgress): VisibleLoopPlanCounts {
  const plannedCount = progress.steps.length;
  const submittedPendingCount = progress.frontier?.state === "submitted" ? 1 : 0;
  const runningCount = progress.frontier?.state === "running" ? 1 : 0;
  const releasedCount = progress.settledCount + submittedPendingCount + runningCount;
  return {
    plannedCount,
    releasedCount,
    submittedPendingCount,
    // sendUserMessage has no delivery acknowledgement. Never present submission as host queue truth.
    hostQueuedCount: 0,
    blockedCount: Math.max(0, plannedCount - releasedCount),
    runningCount,
    settledCount: progress.settledCount,
  };
}

export function renderVisibleLoopPlanLines(
  progress: VisibleLoopPlanProgress,
  loopCount: number,
): string[] {
  const counts = getVisibleLoopPlanCounts(progress);
  const lifecycle =
    progress.lifecycle === "active" ? "" : ` · ${progress.lifecycle.replace("_", " ")}`;
  const lines = [
    `Visible-loop plan · iteration ${progress.iteration}/${loopCount}${lifecycle}`,
    `planned ${counts.plannedCount} · released ${counts.releasedCount} · submitted/pending ${counts.submittedPendingCount} · host queued ${counts.hostQueuedCount} · blocked ${counts.blockedCount} · running ${counts.runningCount} · settled ${counts.settledCount}`,
  ];
  for (const step of progress.steps) {
    const marker =
      step.index < progress.settledCount
        ? "✓"
        : step.index === progress.frontier?.stepIndex
          ? progress.frontier.state === "running"
            ? "▶"
            : progress.frontier.state === "submitted"
              ? "◌"
              : "?"
          : "⏸";
    const barrier = step.governedBarrier ? " [receipt barrier]" : "";
    lines.push(`${marker} ${step.index + 1}. ${step.label}${barrier}`);
  }
  if (progress.failureReason) lines.push(`Failed closed: ${progress.failureReason}`);
  return lines;
}

export function labelVisibleLoopPlanStep(
  expansion: VisibleLoopPromptExpansion,
  prompt: string,
): string {
  if (prompt.includes("Governed deep-review execution step.")) return "Governed deep-review";
  if (expansion.templateName === "commit") return "Commit / delegated completion";
  const firstLine = prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Visible-loop prompt";
  return firstLine.length > 96 ? `${firstLine.slice(0, 93)}...` : firstLine;
}

export function renderVisibleLoopPlan(
  state: ActiveVisibleLoopState,
  ctx: VisibleLoopContext,
): void {
  if (!state.plan) return;
  ctx.ui?.setWidget?.(
    `${getVisibleLoopCommandName(state.config)}-plan`,
    renderVisibleLoopPlanLines(state.plan, state.config.loopCount),
    { placement: "aboveEditor" },
  );
}

export function visibleLoopDelegatesCompletion(
  config: VisibleLoopRunConfig,
  realFollowups: string[],
): boolean {
  const delegation = config.commitDelegation;
  if (!delegation) return false;
  const delegatedSlash = `/${delegation.promptTemplate}`;
  return realFollowups.some((prompt) => prompt.trim().split(/\s+/u)[0] === delegatedSlash);
}

export function getVisibleLoopPrompts(config: VisibleLoopRunConfig): string[] {
  return config.prompts.map((prompt) => prompt.trim()).filter(Boolean);
}

export function getVisibleLoopCompletionTurnCount(config: VisibleLoopRunConfig): number {
  const prompts = getVisibleLoopPrompts(config);
  return prompts.length + (visibleLoopDelegatesCompletion(config, prompts.slice(1)) ? 0 : 1);
}

export function parseVisibleLoopPlanProgress(value: unknown): VisibleLoopPlanProgress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value as Partial<VisibleLoopPlanProgress>;
  if (
    typeof plan.planId !== "string" ||
    !plan.planId.trim() ||
    !Number.isInteger(plan.iteration) ||
    Number(plan.iteration) < 1 ||
    (plan.lifecycle !== "active" &&
      plan.lifecycle !== "finalized" &&
      plan.lifecycle !== "failed_closed") ||
    !Array.isArray(plan.steps) ||
    !Number.isInteger(plan.settledCount) ||
    !Array.isArray(plan.barrierAttempts)
  ) {
    return null;
  }
  const steps = plan.steps.filter((step): step is VisibleLoopPlanStep =>
    Boolean(
      step &&
        typeof step === "object" &&
        Number.isInteger((step as VisibleLoopPlanStep).index) &&
        typeof (step as VisibleLoopPlanStep).prompt === "string" &&
        typeof (step as VisibleLoopPlanStep).label === "string" &&
        ((step as VisibleLoopPlanStep).kind === "prompt" ||
          (step as VisibleLoopPlanStep).kind === "completion") &&
        typeof (step as VisibleLoopPlanStep).governedBarrier === "boolean",
    ),
  );
  if (steps.length !== plan.steps.length || steps.some((step, index) => step.index !== index)) {
    return null;
  }
  const settledCount = Number(plan.settledCount);
  if (settledCount < 0 || settledCount > steps.length) return null;

  let frontier: VisibleLoopFrontier | null = null;
  if (plan.frontier !== null && plan.frontier !== undefined) {
    const candidate = plan.frontier as Partial<VisibleLoopFrontier>;
    if (
      candidate.stepIndex !== settledCount ||
      (candidate.state !== "submitting" &&
        candidate.state !== "submitted" &&
        candidate.state !== "running") ||
      !steps[candidate.stepIndex]
    ) {
      return null;
    }
    frontier = { stepIndex: candidate.stepIndex, state: candidate.state };
  }

  const barrierAttempts: VisibleLoopBarrierAttempt[] = [];
  for (const value of plan.barrierAttempts) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const attempt = value as Partial<VisibleLoopBarrierAttempt>;
    const toolCallId = typeof attempt.toolCallId === "string" ? attempt.toolCallId.trim() : "";
    const handoffId = typeof attempt.handoffId === "string" ? attempt.handoffId.trim() : "";
    const runId = typeof attempt.runId === "string" ? attempt.runId.trim() : "";
    if (
      !Number.isInteger(attempt.stepIndex) ||
      !steps[Number(attempt.stepIndex)]?.governedBarrier ||
      !toolCallId ||
      (attempt.status !== "in_flight" &&
        attempt.status !== "succeeded" &&
        attempt.status !== "failed_closed") ||
      (attempt.status === "succeeded" && !handoffId) ||
      barrierAttempts.some((candidate) => candidate.stepIndex === attempt.stepIndex)
    ) {
      return null;
    }
    barrierAttempts.push({
      stepIndex: Number(attempt.stepIndex),
      toolCallId,
      status: attempt.status,
      ...(handoffId ? { handoffId } : {}),
      ...(runId ? { runId } : {}),
    });
  }
  return {
    planId: plan.planId,
    iteration: Number(plan.iteration),
    lifecycle: plan.lifecycle,
    steps,
    settledCount,
    frontier,
    barrierAttempts,
    ...(typeof plan.failureReason === "string" ? { failureReason: plan.failureReason } : {}),
  };
}

import path from "node:path";

import { AUTORESEARCH_RESUME_APPLY_TOOL_NAME } from "./runtime-constants.ts";
import type {
  AutoresearchResumeApplyPlan,
  AutoresearchResumePlan,
  AutoresearchRuntimeStatus,
} from "./runtime-model.ts";
import { buildAutoresearchRuntimeStatus } from "./runtime-status.ts";

export function buildAutoresearchResumePlan(cwd: string): AutoresearchResumePlan {
  const status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  return buildAutoresearchResumePlanFromStatus(path.resolve(cwd), status);
}

export function buildAutoresearchResumePlanFromStatus(
  cwd: string,
  status: AutoresearchRuntimeStatus,
): AutoresearchResumePlan {
  const resolvedCwd = path.resolve(cwd);
  const blockingReasons: string[] = [];
  if (!status.currentSegment.configured) {
    blockingReasons.push("no configured segment exists to resume");
  }
  if (status.runtimeSnapshot.reuse !== "reused") {
    blockingReasons.push(`runtime snapshot is not reusable: ${status.runtimeSnapshot.reuse}`);
  }
  if (status.runtimeProjection.state !== "ready") {
    blockingReasons.push(`machine state is ${status.runtimeProjection.state}, not ready`);
  }
  if (status.control.kind === "awaiting_operator") {
    blockingReasons.push(
      `awaiting explicit operator control: ${formatAllowedActions(status.control.allowedActions)}`,
    );
  }
  if (["stop", "rebaseline", "finalize"].includes(status.control.kind)) {
    blockingReasons.push(`operator control state is ${status.control.kind}`);
  }
  const reusable = blockingReasons.length === 0;
  const goal = status.currentSegment.name ?? "<campaign-goal>";
  return {
    packetKind: "autoresearch.resume_plan.v1",
    cwd: resolvedCwd,
    campaign: status.currentSegment.name,
    segmentKey: status.runtimeSnapshot.segmentKey,
    runtimeKey: status.runtimeSnapshot.runtimeKey,
    snapshotReuse: status.runtimeSnapshot.reuse,
    reusable,
    machineState: status.runtimeProjection.state,
    controlState: status.control.kind,
    allowedControlActions: [...status.control.allowedActions],
    lastStopReason: status.control.reason ?? status.runtimeProjection.blockedReason ?? "(none)",
    remainingBudget: "operator_required",
    wouldRun: reusable
      ? `autoresearch_runtime_loop({ cwd: ${JSON.stringify(resolvedCwd)}, goal: ${JSON.stringify(goal)}, maxIterations: <explicit>, maxWallClockMinutes: <explicit> })`
      : null,
    blockingReasons,
    authorityWarnings: [
      "resume_plan is read-only and does not run benchmarks",
      "resume_apply must be a foreground operator-approved action if implemented later",
      "no hidden daemon, background restart, peer launch, candidate lifecycle mutation, or external evidence/learning write is authorized",
    ],
  };
}

export function formatAutoresearchResumePlan(plan: AutoresearchResumePlan): string {
  return [
    "# PI-AUTORESEARCH RESUME PLAN",
    "",
    "Read-only longer-campaign continuation plan. It does not run benchmarks, resume a loop, launch peers, mutate worktrees, or write external evidence.",
    "",
    `- packet kind: ${plan.packetKind}`,
    `- cwd: ${plan.cwd}`,
    `- campaign: ${plan.campaign ?? "(none)"}`,
    `- segment key: ${plan.segmentKey ?? "(none)"}`,
    `- runtime key: ${plan.runtimeKey ?? "(none)"}`,
    `- snapshot reuse: ${plan.snapshotReuse}`,
    `- reusable: ${plan.reusable ? "yes" : "no"}`,
    `- machine state: ${plan.machineState}`,
    `- control state: ${plan.controlState}`,
    `- allowed control actions: ${plan.allowedControlActions.join(", ") || "(none)"}`,
    `- last stop/control reason: ${plan.lastStopReason}`,
    `- remaining budget: ${plan.remainingBudget}`,
    `- would run: ${plan.wouldRun ?? "(blocked)"}`,
    "",
    "## Blocking reasons",
    ...(plan.blockingReasons.length > 0
      ? plan.blockingReasons.map((reason) => `- ${reason}`)
      : ["- (none)"]),
    "",
    "## Authority warnings",
    ...plan.authorityWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

export function formatAutoresearchResumePlanSummaryLines(plan: AutoresearchResumePlan): string[] {
  return [
    `- packet kind: ${plan.packetKind}`,
    `- reusable: ${plan.reusable ? "yes" : "no"}`,
    `- snapshot reuse: ${plan.snapshotReuse}`,
    `- machine/control: ${plan.machineState} / ${plan.controlState}`,
    `- last stop/control reason: ${plan.lastStopReason}`,
    `- would run: ${plan.wouldRun ?? "(blocked)"}`,
    `- blocking reasons: ${plan.blockingReasons.length > 0 ? plan.blockingReasons.join("; ") : "(none)"}`,
    "- boundary: resume_plan is read-only; no benchmark run, resume_apply, daemon, peer launch, candidate mutation, or external evidence/learning write is authorized.",
  ];
}

export function buildAutoresearchResumeApplyPlan(cwd: string): AutoresearchResumeApplyPlan {
  const resumePlan = buildAutoresearchResumePlan(cwd);
  const blockedReasons = [...resumePlan.blockingReasons];
  if (!resumePlan.reusable) {
    blockedReasons.unshift(
      "resume_plan is not reusable; inspect and resolve resume-plan blockers first",
    );
  }
  const planReady = resumePlan.reusable && blockedReasons.length === 0;
  const futureExecutorContract =
    "A callable foreground resume executor exists as autoresearch_runtime_resume_apply. It must run only in the active tool call, require exact segmentKey/runtimeKey, explicit maxIterations, explicit maxWallClockMinutes, and operatorConfirmation=RUN FOREGROUND RESUME, then re-check the same snapshot/runtime/control gates immediately before execution while preserving external AK/KES/Prompt Vault/candidate authority seams.";
  const futureForegroundCall = planReady
    ? `${AUTORESEARCH_RESUME_APPLY_TOOL_NAME}({ cwd: ${JSON.stringify(resumePlan.cwd)}, segmentKey: ${JSON.stringify(resumePlan.segmentKey)}, runtimeKey: ${JSON.stringify(resumePlan.runtimeKey)}, maxIterations: <explicit>, maxWallClockMinutes: <explicit>, operatorConfirmation: "RUN FOREGROUND RESUME" })`
    : null;

  return {
    packetKind: "autoresearch.resume_apply_plan.v1",
    cwd: resumePlan.cwd,
    action: "plan_only",
    planReady,
    executionAuthorized: false,
    executorAvailable: true,
    resumePlan,
    requiredOperatorInputs: [
      "explicit maxIterations",
      "explicit maxWallClockMinutes",
      "fresh operator confirmation immediately before the foreground executor",
      "controller verification that no external AK/KES/notes/issue/candidate mutation is implied",
    ],
    preflightChecks: [
      "rebuild resume_plan and require snapshotReuse=reused",
      "require machineState=ready",
      "require no awaiting_operator, stop, rebaseline, or finalize control gate",
      "require explicit foreground budgets before any run",
      "stop if Prompt Vault, checks, or posture gates request blocked/rebaseline/finalize",
    ],
    futureExecutorContract,
    futureForegroundCall,
    blockedReasons,
    authorityWarnings: [
      "resume_apply_plan is read-only and authorizes no benchmark run by itself",
      "autoresearch_runtime_resume_apply is the only callable executor and still requires exact explicit foreground confirmation",
      "no daemon, background restart, peer launch, candidate lifecycle mutation, package-local promotion, or external evidence/learning write is authorized",
    ],
  };
}

export function formatAutoresearchResumeApplyPlan(plan: AutoresearchResumeApplyPlan): string {
  return [
    "# PI-AUTORESEARCH RESUME APPLY PLAN",
    "",
    "Plan-only proposal for the explicit foreground resume executor. This surface itself does not run benchmarks, resume a loop, launch peers, mutate worktrees, or write external evidence.",
    "",
    `- packet kind: ${plan.packetKind}`,
    `- action: ${plan.action}`,
    `- cwd: ${plan.cwd}`,
    `- plan ready: ${plan.planReady ? "yes" : "no"}`,
    `- execution authorized: ${plan.executionAuthorized ? "yes" : "no"}`,
    `- executor available: ${plan.executorAvailable ? "yes" : "no"}`,
    `- foreground apply call: ${plan.futureForegroundCall ?? "(blocked)"}`,
    `- executor contract: ${plan.futureExecutorContract}`,
    "",
    "## Resume plan summary",
    ...formatAutoresearchResumePlanSummaryLines(plan.resumePlan),
    "",
    "## Required operator inputs",
    ...plan.requiredOperatorInputs.map((input) => `- ${input}`),
    "",
    "## Preflight checks",
    ...plan.preflightChecks.map((check) => `- ${check}`),
    "",
    "## Blocked reasons",
    ...(plan.blockedReasons.length > 0
      ? plan.blockedReasons.map((reason) => `- ${reason}`)
      : ["- (none)"]),
    "",
    "## Authority warnings",
    ...plan.authorityWarnings.map((warning) => `- ${warning}`),
  ].join("\n");
}

export function formatAutoresearchResumeApplyPlanSummaryLines(
  plan: AutoresearchResumeApplyPlan,
): string[] {
  return [
    `- packet kind: ${plan.packetKind}`,
    `- plan ready: ${plan.planReady ? "yes" : "no"}`,
    `- execution authorized: ${plan.executionAuthorized ? "yes" : "no"}`,
    `- executor available: ${plan.executorAvailable ? "yes" : "no"}`,
    `- foreground apply call: ${plan.futureForegroundCall ?? "(blocked)"}`,
    `- blocked reasons: ${plan.blockedReasons.length > 0 ? plan.blockedReasons.join("; ") : "(none)"}`,
    "- boundary: resume_apply_plan is read-only; only autoresearch_runtime_resume_apply may run, and only with exact foreground confirmation.",
  ];
}

function formatAllowedActions(actions: readonly string[]): string {
  return actions.length > 0 ? actions.join(", ") : "(none)";
}

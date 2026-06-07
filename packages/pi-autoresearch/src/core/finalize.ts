import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { campaignEvents } from "../machine/events.ts";
import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  type FinalizeDecisionOutcome,
  type FinalizeDecisionPacket,
  type FinalizeDecisionResult,
} from "./decisions.ts";
import {
  normalizeBranchRef,
  normalizeGoalSlug,
  parseAutoresearchFinalizationPlan,
  parseFinalizationGroupsJsonDraft,
} from "./finalize-codec.ts";
import {
  assertAutoresearchCleanWorktree,
  assertAutoresearchDestinationBranchesAvailable,
  checkoutAutoresearchBranch,
  checkoutAutoresearchDetached,
  collectAutoresearchGitContext,
  ensureCommitDescendsFrom,
  ensureCommitReachableFrom,
  isAutoresearchSessionArtifactPath,
  listBranchCommitFiles,
  listEffectiveGroupFiles,
  normalizeCommitRef,
  readSingleParentCommit,
  rollbackAutoresearchMaterializationBranches,
  runGitCommand,
  spawnGit,
  tryResolveGitPathObject,
  uniqueStrings,
} from "./finalize-git.ts";
import {
  type ApproveAutoresearchFinalizationPlanInput,
  type ApproveAutoresearchFinalizationPlanResult,
  AUTORESEARCH_FINALIZATION_PLAN_FILE,
  type AutoresearchFinalizationContext,
  type AutoresearchFinalizationGitContext,
  type AutoresearchFinalizationGroupDraftV1,
  type AutoresearchFinalizationGroupsJsonDraftV1,
  type AutoresearchFinalizationGroupV1,
  type AutoresearchFinalizationPlanReuse,
  type AutoresearchFinalizationPlanStatus,
  type AutoresearchFinalizationPlanV1,
  type AutoresearchFinalizationVerificationResult,
  type AutoresearchKeptRunContext,
  type CreateAutoresearchFinalizationContextInput,
  type ExecuteAutoresearchFinalizationInput,
  type ExecuteAutoresearchFinalizationResult,
  type InspectAutoresearchFinalizationResult,
  type LoadAutoresearchFinalizationPlanStateInput,
  type LoadAutoresearchFinalizationPlanStateResult,
  type MaterializeAutoresearchFinalizationPlanInput,
  type MaterializeAutoresearchFinalizationPlanResult,
  type PlanAutoresearchFinalizationFromDecisionInput,
  type PlanAutoresearchFinalizationFromDecisionResult,
  type RequestAutoresearchFinalizationPlanInput,
  type RequestAutoresearchFinalizationPlanResult,
} from "./finalize-model.ts";
import { appendLedgerEvent, createLedgerEventEntry } from "./ledger.ts";
import {
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_PHASE,
  type AutoresearchConfigReceipt,
  type AutoresearchReceipt,
  type AutoresearchRunReceipt,
  type AutoresearchRuntimeStatus,
  buildAutoresearchRuntimeStatus,
  loadReceiptLog,
  requestAutoresearchFinalizeDecision,
} from "./runtime.ts";

export { parseAutoresearchFinalizationPlan } from "./finalize-codec.ts";
export {
  collectAutoresearchGitContext,
  isAutoresearchSessionArtifactPath,
} from "./finalize-git.ts";
export type {
  ApproveAutoresearchFinalizationPlanInput,
  ApproveAutoresearchFinalizationPlanResult,
  AutoresearchFinalizationAction,
  AutoresearchFinalizationApprovalState,
  AutoresearchFinalizationContext,
  AutoresearchFinalizationDisposition,
  AutoresearchFinalizationGitContext,
  AutoresearchFinalizationGroupDraftV1,
  AutoresearchFinalizationGroupsJsonDraftV1,
  AutoresearchFinalizationGroupV1,
  AutoresearchFinalizationMaterializationStatus,
  AutoresearchFinalizationPlanReuse,
  AutoresearchFinalizationPlanStatus,
  AutoresearchFinalizationPlanV1,
  AutoresearchFinalizationVerificationResult,
  AutoresearchKeptRunContext,
  CreateAutoresearchFinalizationContextInput,
  ExecuteAutoresearchFinalizationInput,
  ExecuteAutoresearchFinalizationResult,
  InspectAutoresearchFinalizationResult,
  LoadAutoresearchFinalizationPlanStateInput,
  LoadAutoresearchFinalizationPlanStateResult,
  MaterializeAutoresearchFinalizationPlanInput,
  MaterializeAutoresearchFinalizationPlanResult,
  MaterializeAutoresearchFinalizationTestHooks,
  PlanAutoresearchFinalizationFromDecisionInput,
  PlanAutoresearchFinalizationFromDecisionResult,
  RequestAutoresearchFinalizationPlanInput,
  RequestAutoresearchFinalizationPlanResult,
} from "./finalize-model.ts";
export { AUTORESEARCH_FINALIZATION_PLAN_FILE } from "./finalize-model.ts";

export function resolveAutoresearchFinalizationPlanPath(cwd: string): string {
  return path.join(path.resolve(cwd), AUTORESEARCH_FINALIZATION_PLAN_FILE);
}

export function readAutoresearchIdeasBacklog(cwd: string): string[] {
  const ideasPath = path.join(path.resolve(cwd), "autoresearch.ideas.md");
  if (!existsSync(ideasPath)) {
    return [];
  }

  return readFileSync(ideasPath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .map((line) => line.replace(/^[-*]\s+/u, ""))
    .filter(Boolean);
}

export function createAutoresearchFinalizationContext(
  input: CreateAutoresearchFinalizationContextInput,
): AutoresearchFinalizationContext {
  const cwd = path.resolve(input.cwd);
  const status = input.status ?? buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  ensureFinalizePlanningEligible(status);

  const { config, runs } = getCurrentSegment(loadReceiptLog(cwd).entries);
  if (!config) {
    throw new Error("Cannot plan finalization without a configured autoresearch segment.");
  }

  const git = collectAutoresearchGitContext(cwd, { trunkRef: input.trunkRef });
  const keptRuns = collectKeptRunContext(cwd, runs, config);
  if (keptRuns.length === 0) {
    throw new Error("Cannot plan finalization without at least one kept run with a commit hash.");
  }

  const goalSlug = normalizeGoalSlug(config.name);
  const packet: FinalizeDecisionPacket = {
    keptRuns: keptRuns.map((run) => run.summary),
    campaignContext: [
      `campaign: ${config.name}`,
      `machine state: ${status.runtimeProjection.state}`,
      `source branch: ${git.sourceBranch}`,
      `base ref: ${git.baseRef}`,
      `target trunk: ${git.trunkRef}`,
    ],
    mergeBase: git.baseRef,
    trunkTarget: git.trunkRef,
    commitSummaries: buildCommitSummaries(cwd, git.baseRef, keptRuns),
    dependencyNotes: [],
    ideasToLeaveOut: readAutoresearchIdeasBacklog(cwd),
  };

  return {
    cwd,
    status,
    git,
    goalSlug,
    config,
    keptRuns,
    packet,
  };
}

export function buildAutoresearchFinalizationPlan(input: {
  context: AutoresearchFinalizationContext;
  decision: FinalizeDecisionResult;
  createdAt?: number;
}): AutoresearchFinalizationPlanV1 {
  const normalized = normalizeFinalizeDecisionForPlan(input.context, input.decision);
  const createdAt = input.createdAt ?? Date.now();

  return {
    type: "finalization_plan",
    version: 1,
    phase: AUTORESEARCH_PHASE,
    cwd: input.context.cwd,
    sourceBranch: input.context.git.sourceBranch,
    trunkRef: input.context.git.trunkRef,
    baseRef: input.context.git.baseRef,
    finalTree: input.context.git.finalTree,
    goalSlug: normalized.goalSlug,
    segmentKey: input.context.status.runtimeSnapshot.segmentKey,
    runtimeKey: input.context.status.runtimeSnapshot.runtimeKey,
    projectionSource: input.context.status.runtimeProjection.source,
    createdAt,
    decision: {
      templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
      overallResult: input.decision.overallResult,
      groupingRationale: [...input.decision.groupingRationale],
      riskNotes: [...input.decision.riskNotes],
      cleanupHints: [...input.decision.cleanupHints],
    },
    groups: normalized.groups,
    groupsJsonDraft: normalized.groupsJsonDraft,
    approval: {
      required: true,
      state: "pending",
      reason: null,
      approvedAt: null,
    },
    materialization: {
      status: "not_started",
      createdBranches: [],
      verifiedAt: null,
      failureReason: null,
    },
  };
}

export function writeAutoresearchFinalizationPlan(
  cwd: string,
  plan: AutoresearchFinalizationPlanV1,
): string {
  const planPath = resolveAutoresearchFinalizationPlanPath(cwd);
  mkdirSync(path.dirname(planPath), { recursive: true });
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return planPath;
}

export function persistAutoresearchFinalizationPlan(input: {
  context: AutoresearchFinalizationContext;
  decision: FinalizeDecisionResult;
  createdAt?: number;
}): { plan: AutoresearchFinalizationPlanV1; planPath: string } {
  const plan = buildAutoresearchFinalizationPlan(input);
  const planPath = writeAutoresearchFinalizationPlan(input.context.cwd, plan);
  return { plan, planPath };
}

export function planAutoresearchFinalizationFromDecision(
  input: PlanAutoresearchFinalizationFromDecisionInput,
): PlanAutoresearchFinalizationFromDecisionResult {
  const context = createAutoresearchFinalizationContext({
    cwd: input.cwd,
    status: input.status,
    trunkRef: input.trunkRef,
  });
  const decision = ensureReadyFinalizeDecision(input.decision);
  const { plan, planPath } = persistAutoresearchFinalizationPlan({
    context,
    decision,
    createdAt: input.createdAt,
  });

  return {
    cwd: context.cwd,
    status: context.status,
    context,
    plan,
    planPath,
  };
}

export async function requestAutoresearchFinalizationPlan(
  input: RequestAutoresearchFinalizationPlanInput,
): Promise<RequestAutoresearchFinalizationPlanResult> {
  const context = createAutoresearchFinalizationContext({
    cwd: input.cwd,
    status: input.status,
    trunkRef: input.trunkRef,
  });
  const result = await requestAutoresearchFinalizeDecision({
    cwd: context.cwd,
    packet: context.packet,
    runtime: input.runtime,
    currentCompany: input.currentCompany,
    model: input.model,
    signal: input.signal,
  });
  const decision = ensureReadyFinalizeDecision(result.outcome);
  const planningContext = {
    ...context,
    status: result.status,
  } satisfies AutoresearchFinalizationContext;
  const { plan, planPath } = persistAutoresearchFinalizationPlan({
    context: planningContext,
    decision,
    createdAt: input.createdAt,
  });

  return {
    cwd: context.cwd,
    packet: context.packet,
    decision,
    status: result.status,
    plan,
    planPath,
  };
}

export function loadAutoresearchFinalizationPlan(
  cwd: string,
): AutoresearchFinalizationPlanV1 | null {
  const planPath = resolveAutoresearchFinalizationPlanPath(cwd);
  if (!existsSync(planPath)) {
    return null;
  }
  return parseAutoresearchFinalizationPlan(readFileSync(planPath, "utf8"));
}

export function loadAutoresearchFinalizationPlanState(
  input: LoadAutoresearchFinalizationPlanStateInput,
): LoadAutoresearchFinalizationPlanStateResult {
  const cwd = path.resolve(input.cwd);
  const status = input.status ?? buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: false });
  const planPath = resolveAutoresearchFinalizationPlanPath(cwd);
  const baseStatus: AutoresearchFinalizationPlanStatus = {
    path: planPath,
    exists: false,
    reuse: "missing",
    discardedReason: null,
    sourceBranch: null,
    trunkRef: normalizeBranchRef(input.trunkRef ?? "main"),
    baseRef: null,
    finalTree: null,
    runtimeKey: status.runtimeSnapshot.runtimeKey,
  };

  if (!existsSync(planPath)) {
    return {
      plan: null,
      planStatus: baseStatus,
      status,
      git: null,
    };
  }

  let plan: AutoresearchFinalizationPlanV1;
  try {
    plan = parseAutoresearchFinalizationPlan(readFileSync(planPath, "utf8"));
  } catch (error) {
    return {
      plan: null,
      planStatus: {
        ...baseStatus,
        exists: true,
        reuse: "parse_failed",
        discardedReason: error instanceof Error ? error.message : String(error),
      },
      status,
      git: null,
    };
  }

  if (plan.cwd !== cwd) {
    return {
      plan,
      planStatus: {
        ...baseStatus,
        exists: true,
        reuse: "cwd_mismatch",
        discardedReason: `plan cwd ${plan.cwd} does not match current cwd ${cwd}`,
        sourceBranch: plan.sourceBranch,
        trunkRef: plan.trunkRef,
        baseRef: plan.baseRef,
        finalTree: plan.finalTree,
        runtimeKey: plan.runtimeKey,
      },
      status,
      git: null,
    };
  }

  let git: AutoresearchFinalizationGitContext;
  try {
    git = collectAutoresearchGitContext(cwd, {
      trunkRef: input.trunkRef ?? plan.trunkRef,
    });
  } catch (error) {
    return {
      plan,
      planStatus: {
        ...baseStatus,
        exists: true,
        reuse: "unavailable",
        discardedReason: error instanceof Error ? error.message : String(error),
        sourceBranch: plan.sourceBranch,
        trunkRef: plan.trunkRef,
        baseRef: plan.baseRef,
        finalTree: plan.finalTree,
        runtimeKey: plan.runtimeKey,
      },
      status,
      git: null,
    };
  }

  if (plan.sourceBranch !== git.sourceBranch) {
    return buildStalePlanState(
      plan,
      status,
      git,
      "source_branch_mismatch",
      `plan source branch ${plan.sourceBranch} does not match current branch ${git.sourceBranch}`,
    );
  }

  if (plan.trunkRef !== git.trunkRef) {
    return buildStalePlanState(
      plan,
      status,
      git,
      "trunk_mismatch",
      `plan trunk ${plan.trunkRef} does not match current trunk ${git.trunkRef}`,
    );
  }

  if (plan.baseRef !== git.baseRef) {
    return buildStalePlanState(
      plan,
      status,
      git,
      "base_mismatch",
      `plan base ${plan.baseRef} does not match current merge-base ${git.baseRef}`,
    );
  }

  if (plan.finalTree !== git.finalTree) {
    return buildStalePlanState(
      plan,
      status,
      git,
      "final_tree_mismatch",
      `plan final tree ${plan.finalTree} does not match current HEAD ${git.finalTree}`,
    );
  }

  if (plan.runtimeKey !== status.runtimeSnapshot.runtimeKey) {
    const completedAfterMaterialization =
      plan.approval.state === "materialized" &&
      plan.materialization.status === "succeeded" &&
      status.runtimeProjection.state === "completed";
    if (!completedAfterMaterialization) {
      return buildStalePlanState(
        plan,
        status,
        git,
        "runtime_mismatch",
        "plan runtime fingerprint no longer matches the current runtime posture",
      );
    }
  }

  return {
    plan,
    planStatus: {
      path: planPath,
      exists: true,
      reuse: "reused",
      discardedReason: null,
      sourceBranch: plan.sourceBranch,
      trunkRef: plan.trunkRef,
      baseRef: plan.baseRef,
      finalTree: plan.finalTree,
      runtimeKey: plan.runtimeKey,
    },
    status,
    git,
  };
}

export function formatAutoresearchFinalizationPlanReuse(
  reuse: AutoresearchFinalizationPlanReuse,
): string {
  switch (reuse) {
    case "unavailable":
      return "unavailable";
    case "missing":
      return "missing";
    case "reused":
      return "reused";
    case "parse_failed":
      return "parse failed";
    case "cwd_mismatch":
      return "cwd mismatch";
    case "source_branch_mismatch":
      return "source-branch mismatch";
    case "trunk_mismatch":
      return "trunk mismatch";
    case "base_mismatch":
      return "merge-base mismatch";
    case "final_tree_mismatch":
      return "final-tree mismatch";
    case "runtime_mismatch":
      return "runtime mismatch";
  }
}

export function inspectAutoresearchFinalization(
  input: LoadAutoresearchFinalizationPlanStateInput,
): InspectAutoresearchFinalizationResult {
  const cwd = path.resolve(input.cwd);
  const state = loadAutoresearchFinalizationPlanState({
    cwd,
    status: input.status,
    trunkRef: input.trunkRef,
  });

  return {
    cwd,
    status: state.status,
    plan: state.plan,
    planStatus: state.planStatus,
    git: state.git,
    planPath: resolveAutoresearchFinalizationPlanPath(cwd),
    nextStep: describeAutoresearchFinalizationNextStep(state),
  };
}

export async function executeAutoresearchFinalization(
  input: ExecuteAutoresearchFinalizationInput,
): Promise<ExecuteAutoresearchFinalizationResult> {
  const action = input.action ?? "status";

  switch (action) {
    case "status": {
      const result = inspectAutoresearchFinalization({
        cwd: input.cwd,
        status: input.status,
        trunkRef: input.trunkRef,
      });
      return {
        ...result,
        action,
        disposition: "status",
        createdBranches: result.plan?.materialization.createdBranches ?? [],
        verification: null,
      };
    }
    case "plan": {
      const planned = await ensureAutoresearchFinalizationPlan(input);
      return {
        ...planned,
        action,
        verification: null,
        createdBranches: planned.plan?.materialization.createdBranches ?? [],
      };
    }
    case "approve": {
      const approved = approveAutoresearchFinalizationPlan({
        cwd: input.cwd,
        reason: input.reason,
        approvedAt: input.approvedAt,
        status: input.status,
        trunkRef: input.trunkRef,
      });
      return {
        ...approved,
        action,
        disposition: "approved",
        createdBranches: approved.plan?.materialization.createdBranches ?? [],
        verification: null,
      };
    }
    case "materialize": {
      const materialized = materializeAutoresearchFinalizationPlan({
        cwd: input.cwd,
        reason: input.reason,
        materializedAt: input.materializedAt,
        status: input.status,
        trunkRef: input.trunkRef,
        testHooks: input.testHooks,
      });
      return {
        ...materialized,
        action,
        disposition: "materialized",
      };
    }
  }
}

export function formatAutoresearchFinalizationResult(
  result:
    | ExecuteAutoresearchFinalizationResult
    | InspectAutoresearchFinalizationResult
    | ApproveAutoresearchFinalizationPlanResult
    | MaterializeAutoresearchFinalizationPlanResult,
): string {
  const plan = result.plan;
  const verification = "verification" in result ? result.verification : null;
  const disposition = "disposition" in result ? result.disposition : "status";
  const action = "action" in result ? result.action : "status";

  return [
    "# PI-AUTORESEARCH FINALIZE",
    "",
    `- cwd: ${result.cwd}`,
    `- action: ${action}`,
    `- disposition: ${disposition}`,
    `- machine state: ${result.status.runtimeProjection.state}`,
    `- control state: ${result.status.control.kind}`,
    `- plan path: ${result.planPath}`,
    `- plan reuse: ${formatAutoresearchFinalizationPlanReuse(result.planStatus.reuse)}`,
    `- plan discard reason: ${result.planStatus.discardedReason ?? "(none)"}`,
    plan ? `- source branch: ${plan.sourceBranch}` : "- source branch: (none)",
    plan ? `- trunk ref: ${plan.trunkRef}` : "- trunk ref: (none)",
    plan ? `- base ref: ${plan.baseRef}` : "- base ref: (none)",
    plan ? `- final tree: ${plan.finalTree}` : "- final tree: (none)",
    plan ? `- groups: ${plan.groups.length}` : "- groups: 0",
    plan ? `- approval state: ${plan.approval.state}` : "- approval state: (none)",
    plan ? `- approval reason: ${plan.approval.reason ?? "(none)"}` : "- approval reason: (none)",
    plan
      ? `- materialization status: ${plan.materialization.status}`
      : "- materialization status: (none)",
    plan
      ? `- materialization failure: ${plan.materialization.failureReason ?? "(none)"}`
      : "- materialization failure: (none)",
    `- created branches: ${formatCreatedBranches(plan?.materialization.createdBranches ?? [])}`,
    `- next step: ${result.nextStep}`,
    ...(verification
      ? [
          "",
          "## Verification",
          `- ok: ${verification.ok ? "yes" : "no"}`,
          `- union matches final tree: ${verification.unionMatchesFinalTree ? "yes" : "no"}`,
          `- missing final-tree files: ${formatCreatedBranches(verification.missingFinalTreeFiles)}`,
          `- unexpected final-tree files: ${formatCreatedBranches(verification.unexpectedFinalTreeFiles)}`,
          `- blob mismatches: ${formatCreatedBranches(verification.blobMismatches)}`,
          `- branch file mismatches: ${formatCreatedBranches(verification.branchFileMismatches)}`,
          `- non-independent branches: ${formatCreatedBranches(verification.nonIndependentBranches)}`,
          `- session artifact leaks: ${formatCreatedBranches(verification.sessionArtifactLeaks)}`,
          `- empty branches: ${formatCreatedBranches(verification.emptyBranches)}`,
        ]
      : []),
    ...(plan
      ? [
          "",
          "## Planned groups",
          ...plan.groups.map(
            (group) =>
              `- [${group.index}] ${group.branchName} <- ${group.lastCommit.slice(0, 12)} (${group.files.length} files)`,
          ),
        ]
      : []),
  ].join("\n");
}

export function approveAutoresearchFinalizationPlan(
  input: ApproveAutoresearchFinalizationPlanInput,
): ApproveAutoresearchFinalizationPlanResult {
  const cwd = path.resolve(input.cwd);
  const current = inspectAutoresearchFinalization({
    cwd,
    status: input.status,
    trunkRef: input.trunkRef,
  });
  const plan = requireFreshAutoresearchFinalizationPlan(current, "approve");
  assertAutoresearchFinalizeControlSelected(current.status, "approve");
  validateStoredAutoresearchFinalizationPlan(cwd, plan);

  if (plan.approval.state === "materialized" || plan.materialization.status === "succeeded") {
    throw new Error("Finalization plan is already materialized.");
  }

  const approvedAt = input.approvedAt ?? Date.now();
  const approvedPlan: AutoresearchFinalizationPlanV1 = {
    ...plan,
    approval: {
      required: true,
      state: "approved",
      reason:
        normalizeInlineReason(input.reason) ??
        "operator approved bounded finalization materialization",
      approvedAt,
    },
    materialization: {
      status: "not_started",
      createdBranches: [],
      verifiedAt: null,
      failureReason: null,
    },
  };
  writeAutoresearchFinalizationPlan(cwd, approvedPlan);

  const next = inspectAutoresearchFinalization({ cwd, trunkRef: input.trunkRef });
  return {
    ...next,
    approvalState: approvedPlan.approval.state,
  };
}

export function materializeAutoresearchFinalizationPlan(
  input: MaterializeAutoresearchFinalizationPlanInput,
): MaterializeAutoresearchFinalizationPlanResult {
  const cwd = path.resolve(input.cwd);
  const current = inspectAutoresearchFinalization({
    cwd,
    status: input.status,
    trunkRef: input.trunkRef,
  });
  const plan = requireFreshAutoresearchFinalizationPlan(current, "materialize");
  assertAutoresearchFinalizeControlSelected(current.status, "materialize");
  validateStoredAutoresearchFinalizationPlan(cwd, plan);

  if (plan.approval.state === "materialized" || plan.materialization.status === "succeeded") {
    throw new Error("Finalization plan is already materialized.");
  }
  if (plan.approval.state !== "approved") {
    throw new Error(
      `Cannot materialize finalization while approval state is ${plan.approval.state}; approve the plan first.`,
    );
  }

  assertAutoresearchCleanWorktree(cwd);
  assertAutoresearchDestinationBranchesAvailable(
    cwd,
    plan.groups.map((group) => group.branchName),
  );

  const createdBranches: string[] = [];
  let pendingBranch: string | null = null;
  let creationCompleted = false;
  const verifiedAt = input.materializedAt ?? Date.now();

  try {
    for (const group of plan.groups) {
      input.testHooks?.beforeCreateGroup?.(group);
      pendingBranch = group.branchName;
      createAutoresearchMaterializationBranch(cwd, plan, group);
      createdBranches.push(group.branchName);
      pendingBranch = null;
    }
    creationCompleted = true;

    checkoutAutoresearchBranch(cwd, plan.sourceBranch, true);
    input.testHooks?.beforeVerify?.({
      cwd,
      plan,
      createdBranches: [...createdBranches],
      sourceBranch: plan.sourceBranch,
    });

    const verification = verifyAutoresearchFinalizationMaterialization({
      cwd,
      plan,
      createdBranches,
    });
    if (!verification.ok) {
      throw new Error(describeAutoresearchFinalizationVerificationFailure(verification));
    }

    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.acceptFinalize(
          normalizeInlineReason(input.reason) ??
            "local finalization branches materialized and verified",
        ),
      ),
    );
    const status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

    writeAutoresearchFinalizationPlan(cwd, {
      ...plan,
      approval: {
        ...plan.approval,
        state: "materialized",
      },
      materialization: {
        status: "succeeded",
        createdBranches: [...createdBranches],
        verifiedAt,
        failureReason: null,
      },
    });

    const next = inspectAutoresearchFinalization({
      cwd,
      status,
      trunkRef: input.trunkRef,
    });
    return {
      ...next,
      createdBranches: [...createdBranches],
      verification,
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    try {
      checkoutAutoresearchBranch(cwd, plan.sourceBranch, true);
    } catch {
      // Best effort: the original source branch may already be checked out.
    }

    if (!creationCompleted) {
      rollbackAutoresearchMaterializationBranches(
        cwd,
        uniqueStrings(
          [...createdBranches, pendingBranch].filter((value): value is string => Boolean(value)),
        ),
      );
      persistAutoresearchMaterializationFailure(cwd, plan, [], failureReason);
    } else {
      persistAutoresearchMaterializationFailure(cwd, plan, createdBranches, failureReason);
    }
    throw error;
  }
}

export function verifyAutoresearchFinalizationMaterialization(input: {
  cwd: string;
  plan: AutoresearchFinalizationPlanV1;
  createdBranches?: readonly string[];
}): AutoresearchFinalizationVerificationResult {
  const cwd = path.resolve(input.cwd);
  const plan = input.plan;
  const groupedFiles = uniqueStrings(plan.groups.flatMap((group) => group.files));
  const finalTreeFiles = listEffectiveGroupFiles(cwd, plan.baseRef, plan.finalTree);
  const groupedFileSet = new Set(groupedFiles);
  const finalTreeFileSet = new Set(finalTreeFiles);
  const missingFinalTreeFiles = finalTreeFiles.filter((file) => !groupedFileSet.has(file));
  const unexpectedFinalTreeFiles = groupedFiles.filter((file) => !finalTreeFileSet.has(file));
  const blobMismatches: string[] = [];
  const branchFileMismatches: string[] = [];
  const nonIndependentBranches: string[] = [];
  const sessionArtifactLeaks: string[] = [];
  const emptyBranches: string[] = [];
  const createdBranchSet = new Set(
    input.createdBranches ?? plan.groups.map((group) => group.branchName),
  );

  for (const group of plan.groups) {
    if (!createdBranchSet.has(group.branchName)) {
      branchFileMismatches.push(`${group.branchName}: branch was not created`);
      continue;
    }

    const branchFilesWithSession = listBranchCommitFiles(cwd, group.branchName);
    const branchSessionFiles = branchFilesWithSession.filter((file) =>
      isAutoresearchSessionArtifactPath(file),
    );
    sessionArtifactLeaks.push(...branchSessionFiles.map((file) => `${group.branchName}:${file}`));

    const branchFiles = branchFilesWithSession.filter(
      (file) => !isAutoresearchSessionArtifactPath(file),
    );
    if (branchFiles.length === 0) {
      emptyBranches.push(group.branchName);
    }
    if (!sameStringArray(branchFiles, group.files)) {
      branchFileMismatches.push(
        `${group.branchName}: expected ${group.files.join(", ")} but saw ${branchFiles.join(", ") || "(none)"}`,
      );
    }

    const parentCommit = readSingleParentCommit(cwd, group.branchName);
    if (parentCommit !== plan.baseRef) {
      nonIndependentBranches.push(group.branchName);
    }

    for (const file of group.files) {
      const branchBlob = tryResolveGitPathObject(cwd, group.branchName, file);
      const finalTreeBlob = tryResolveGitPathObject(cwd, plan.finalTree, file);
      if (branchBlob !== finalTreeBlob) {
        blobMismatches.push(`${group.branchName}:${file}`);
      }
    }
  }

  const unionMatchesFinalTree =
    missingFinalTreeFiles.length === 0 &&
    unexpectedFinalTreeFiles.length === 0 &&
    blobMismatches.length === 0;

  return {
    ok:
      unionMatchesFinalTree &&
      branchFileMismatches.length === 0 &&
      nonIndependentBranches.length === 0 &&
      sessionArtifactLeaks.length === 0 &&
      emptyBranches.length === 0,
    unionMatchesFinalTree,
    missingFinalTreeFiles,
    unexpectedFinalTreeFiles,
    blobMismatches,
    branchFileMismatches,
    nonIndependentBranches,
    sessionArtifactLeaks,
    emptyBranches,
  };
}

async function ensureAutoresearchFinalizationPlan(
  input: ExecuteAutoresearchFinalizationInput,
): Promise<ExecuteAutoresearchFinalizationResult> {
  const cwd = path.resolve(input.cwd);
  const current = inspectAutoresearchFinalization({
    cwd,
    status: input.status,
    trunkRef: input.trunkRef,
  });

  if (current.plan && current.planStatus.reuse === "reused") {
    try {
      validateStoredAutoresearchFinalizationPlan(cwd, current.plan);
      return {
        ...current,
        action: "plan",
        disposition: "reused",
        createdBranches: current.plan.materialization.createdBranches,
        verification: null,
      };
    } catch (error) {
      if (!input.runtime) {
        throw new Error(
          `Current finalization plan is invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (!input.runtime) {
    throw new Error(
      "action=plan requires a decision runtime when no reusable finalization plan is available.",
    );
  }

  const planned = await requestAutoresearchFinalizationPlan({
    cwd,
    runtime: input.runtime,
    currentCompany: input.currentCompany,
    model: input.model,
    signal: input.signal,
    status: input.status,
    trunkRef: input.trunkRef,
    createdAt: input.createdAt,
  });
  const next = inspectAutoresearchFinalization({
    cwd,
    status: planned.status,
    trunkRef: input.trunkRef,
  });

  return {
    ...next,
    action: "plan",
    disposition: "planned",
    createdBranches: planned.plan.materialization.createdBranches,
    verification: null,
  };
}

function requireFreshAutoresearchFinalizationPlan(
  inspection: InspectAutoresearchFinalizationResult,
  action: "approve" | "materialize",
): AutoresearchFinalizationPlanV1 {
  if (!inspection.plan || inspection.planStatus.reuse !== "reused" || !inspection.git) {
    throw new Error(
      `Cannot ${action} finalization without a fresh plan; use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=plan first.`,
    );
  }
  return inspection.plan;
}

function describeAutoresearchFinalizationNextStep(
  state: LoadAutoresearchFinalizationPlanStateResult,
): string {
  if (!state.plan || state.planStatus.reuse !== "reused") {
    if (state.planStatus.exists && state.planStatus.reuse !== "reused") {
      return `Use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=plan to refresh the current finalization plan.`;
    }
    if (
      state.status.runtimeProjection.state === "finalize_candidate" ||
      state.status.control.kind === "finalize"
    ) {
      return `Use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=plan to generate a checked finalization plan.`;
    }
    return `Choose finalize with autoresearch_runtime_control once the runtime is finalize-worthy, then use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=plan.`;
  }

  if (
    state.plan.approval.state === "materialized" &&
    state.plan.materialization.status === "succeeded"
  ) {
    return "Local review branches are ready; the bounded runtime finalization slice is complete.";
  }

  if (state.status.control.kind !== "finalize") {
    return "Set autoresearch_runtime_control to finalize before approving or materializing the current plan.";
  }

  if (state.plan.approval.state === "pending") {
    return `Use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=approve to record explicit operator approval.`;
  }

  if (state.plan.materialization.status === "failed") {
    return `Clean the repo intentionally, inspect any created branches, then rerun ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=materialize.`;
  }

  if (state.plan.approval.state === "approved") {
    return `Use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=materialize to create local review branches from ${state.plan.baseRef.slice(0, 12)}.`;
  }

  return `Inspect the plan and continue with ${AUTORESEARCH_FINALIZE_TOOL_NAME}.`;
}

function validateStoredAutoresearchFinalizationPlan(
  cwd: string,
  plan: AutoresearchFinalizationPlanV1,
): void {
  if (plan.groups.length === 0) {
    throw new Error("Finalization plan must include at least one group.");
  }
  if (plan.groupsJsonDraft.base !== plan.baseRef) {
    throw new Error("Finalization plan draft base no longer matches plan.baseRef.");
  }
  if (plan.groupsJsonDraft.final_tree !== plan.finalTree) {
    throw new Error("Finalization plan draft final_tree no longer matches plan.finalTree.");
  }
  if (plan.groupsJsonDraft.trunk !== plan.trunkRef) {
    throw new Error("Finalization plan draft trunk no longer matches plan.trunkRef.");
  }
  if (plan.groupsJsonDraft.goal !== plan.goalSlug) {
    throw new Error("Finalization plan draft goal no longer matches plan.goalSlug.");
  }

  const seenFiles = new Set<string>();
  let previousCommit = plan.baseRef;
  for (const [index, group] of plan.groups.entries()) {
    const expectedIndex = index + 1;
    if (group.index !== expectedIndex) {
      throw new Error(
        `Finalization group index ${group.index} does not match position ${expectedIndex}.`,
      );
    }
    const expectedBranchName = `autoresearch/${plan.goalSlug}/${String(expectedIndex).padStart(2, "0")}-${group.slug}`;
    if (group.branchName !== expectedBranchName) {
      throw new Error(
        `Finalization group ${expectedIndex} branch ${group.branchName} does not match deterministic branch ${expectedBranchName}.`,
      );
    }
    if (!group.commits.includes(group.lastCommit)) {
      throw new Error(`Finalization group ${expectedIndex} commits must include lastCommit.`);
    }

    ensureCommitReachableFrom(cwd, group.lastCommit, plan.finalTree, group.lastCommit);
    ensureCommitDescendsFrom(cwd, previousCommit, group.lastCommit, group.lastCommit);

    const expectedFiles = listEffectiveGroupFiles(cwd, previousCommit, group.lastCommit);
    if (!sameStringArray(group.files, expectedFiles)) {
      throw new Error(
        `Finalization group ${expectedIndex} files no longer match the current repo history.`,
      );
    }
    if (group.files.length === 0) {
      throw new Error(`Finalization group ${expectedIndex} has no non-session files.`);
    }
    for (const file of group.files) {
      if (isAutoresearchSessionArtifactPath(file)) {
        throw new Error(
          `Finalization group ${expectedIndex} still includes session artifact ${file}.`,
        );
      }
      if (seenFiles.has(file)) {
        throw new Error(`File ${JSON.stringify(file)} appears in multiple finalization groups.`);
      }
      seenFiles.add(file);
    }
    previousCommit = group.lastCommit;
  }

  if (plan.groups.at(-1)?.lastCommit !== plan.finalTree) {
    throw new Error("Finalization plan does not reach the current final tree.");
  }

  const finalTreeFiles = listEffectiveGroupFiles(cwd, plan.baseRef, plan.finalTree);
  if (
    !sameStringArray(uniqueStrings(plan.groups.flatMap((group) => group.files)), finalTreeFiles)
  ) {
    throw new Error("Finalization groups do not cover the source branch final tree exactly.");
  }
}

function assertAutoresearchFinalizeControlSelected(
  status: AutoresearchRuntimeStatus,
  action: "approve" | "materialize",
): void {
  if (status.control.kind !== "finalize") {
    throw new Error(
      `Cannot ${action} finalization while control state is ${status.control.kind}; select finalize with autoresearch_runtime_control first.`,
    );
  }
}

function createAutoresearchMaterializationBranch(
  cwd: string,
  plan: AutoresearchFinalizationPlanV1,
  group: AutoresearchFinalizationGroupV1,
): void {
  checkoutAutoresearchDetached(cwd, plan.baseRef);
  runGitCommand(cwd, ["checkout", "--quiet", "-b", group.branchName]);

  for (const file of group.files) {
    applyAutoresearchMaterializedFile(cwd, group.lastCommit, file);
  }

  const staged = spawnGit(cwd, ["diff", "--cached", "--quiet"]);
  if (staged.status === 0) {
    throw new Error(`Finalization group ${group.index} would create an empty review commit.`);
  }

  runGitCommand(cwd, ["commit", "--quiet", "-m", group.title, "-m", group.body]);
}

function applyAutoresearchMaterializedFile(cwd: string, commitRef: string, file: string): void {
  if (tryResolveGitPathObject(cwd, commitRef, file) !== null) {
    runGitCommand(cwd, ["checkout", commitRef, "--", file], { trim: false });
    return;
  }
  runGitCommand(cwd, ["rm", "--quiet", "--ignore-unmatch", "--", file], { trim: false });
}

function persistAutoresearchMaterializationFailure(
  cwd: string,
  plan: AutoresearchFinalizationPlanV1,
  createdBranches: readonly string[],
  failureReason: string,
): void {
  try {
    writeAutoresearchFinalizationPlan(cwd, {
      ...plan,
      materialization: {
        status: "failed",
        createdBranches: [...createdBranches],
        verifiedAt: null,
        failureReason,
      },
    });
  } catch {
    // Best effort only: preserve the original failure over plan-write issues.
  }
}

function describeAutoresearchFinalizationVerificationFailure(
  verification: AutoresearchFinalizationVerificationResult,
): string {
  const problems: string[] = [];
  if (verification.missingFinalTreeFiles.length > 0) {
    problems.push(`missing final-tree files: ${verification.missingFinalTreeFiles.join(", ")}`);
  }
  if (verification.unexpectedFinalTreeFiles.length > 0) {
    problems.push(
      `unexpected final-tree files: ${verification.unexpectedFinalTreeFiles.join(", ")}`,
    );
  }
  if (verification.blobMismatches.length > 0) {
    problems.push(`blob mismatches: ${verification.blobMismatches.join(", ")}`);
  }
  if (verification.branchFileMismatches.length > 0) {
    problems.push(`branch file mismatches: ${verification.branchFileMismatches.join("; ")}`);
  }
  if (verification.nonIndependentBranches.length > 0) {
    problems.push(`non-independent branches: ${verification.nonIndependentBranches.join(", ")}`);
  }
  if (verification.sessionArtifactLeaks.length > 0) {
    problems.push(`session artifact leaks: ${verification.sessionArtifactLeaks.join(", ")}`);
  }
  if (verification.emptyBranches.length > 0) {
    problems.push(`empty branches: ${verification.emptyBranches.join(", ")}`);
  }
  return problems.length > 0
    ? `Finalization verification failed — ${problems.join(" | ")}`
    : "Finalization verification failed.";
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  if (sortedLeft.length !== sortedRight.length) {
    return false;
  }
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function formatCreatedBranches(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function normalizeInlineReason(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0 ? normalized : null;
}

function buildStalePlanState(
  plan: AutoresearchFinalizationPlanV1,
  status: AutoresearchRuntimeStatus,
  git: AutoresearchFinalizationGitContext,
  reuse: Exclude<
    AutoresearchFinalizationPlanReuse,
    "unavailable" | "missing" | "reused" | "parse_failed" | "cwd_mismatch"
  >,
  discardedReason: string,
): LoadAutoresearchFinalizationPlanStateResult {
  return {
    plan,
    planStatus: {
      path: resolveAutoresearchFinalizationPlanPath(plan.cwd),
      exists: true,
      reuse,
      discardedReason,
      sourceBranch: git.sourceBranch,
      trunkRef: git.trunkRef,
      baseRef: git.baseRef,
      finalTree: git.finalTree,
      runtimeKey: status.runtimeSnapshot.runtimeKey,
    },
    status,
    git,
  };
}

function ensureFinalizePlanningEligible(status: AutoresearchRuntimeStatus): void {
  if (
    status.runtimeProjection.state !== "finalize_candidate" &&
    status.control.kind !== "finalize"
  ) {
    throw new Error(
      `Cannot plan finalization while machine state ${status.runtimeProjection.state} and control state ${status.control.kind} do not indicate finalization.`,
    );
  }
}

function ensureReadyFinalizeDecision(outcome: FinalizeDecisionOutcome): FinalizeDecisionResult {
  if (isDecisionErrorOutcome(outcome)) {
    throw new Error(
      `Finalize decision blocked during ${outcome.failureStage}: ${outcome.blockingReason}`,
    );
  }
  if (outcome.status !== "ready") {
    throw new Error(outcome.overallResult || "Finalize decision did not return a ready plan.");
  }
  return outcome;
}

function collectKeptRunContext(
  cwd: string,
  runs: readonly AutoresearchRunReceipt[],
  config: AutoresearchConfigReceipt,
): AutoresearchKeptRunContext[] {
  return runs
    .filter((run) => run.status === "keep" && typeof run.commit === "string" && run.commit.trim())
    .map((run, index) => {
      const fullCommit = normalizeCommitRef(cwd, run.commit ?? "", `kept run ${index + 1} commit`);
      return {
        receipt: run,
        fullCommit,
        summary: formatKeptRunSummary(index, run, fullCommit, config),
      } satisfies AutoresearchKeptRunContext;
    });
}

function formatKeptRunSummary(
  index: number,
  run: AutoresearchRunReceipt,
  fullCommit: string,
  config: AutoresearchConfigReceipt,
): string {
  const metricUnit = config.metricUnit ? ` ${config.metricUnit}` : "";
  const iterationLabel =
    typeof run.iteration === "number" ? `run ${run.iteration}` : `keep ${index + 1}`;
  return `${iterationLabel}: ${fullCommit.slice(0, 12)} | metric ${run.metric}${metricUnit} | ${run.description}`;
}

function buildCommitSummaries(
  cwd: string,
  baseRef: string,
  keptRuns: readonly AutoresearchKeptRunContext[],
): string[] {
  const summaries: string[] = [];
  let previous = baseRef;

  for (const run of keptRuns) {
    ensureCommitDescendsFrom(cwd, previous, run.fullCommit, run.fullCommit);
    const diffStat = runGitCommand(
      cwd,
      ["diff", "--stat", "--compact-summary", previous, run.fullCommit],
      { trim: false },
    )
      .trim()
      .replace(/\r\n?/gu, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" | ");
    summaries.push(
      `${run.fullCommit} (${previous.slice(0, 12)}..${run.fullCommit.slice(0, 12)}): ${diffStat || "no diff stat"}`,
    );
    previous = run.fullCommit;
  }

  return summaries;
}

function normalizeFinalizeDecisionForPlan(
  context: AutoresearchFinalizationContext,
  decision: FinalizeDecisionResult,
): {
  goalSlug: string;
  groups: AutoresearchFinalizationGroupV1[];
  groupsJsonDraft: AutoresearchFinalizationGroupsJsonDraftV1;
} {
  const draft = parseFinalizationGroupsJsonDraft(decision.groupsJsonDraft);
  const baseRef = normalizeCommitRef(context.cwd, draft.base, "groupsJsonDraft.base");
  if (baseRef !== context.git.baseRef) {
    throw new Error(
      `GROUPS_JSON_DRAFT base ${baseRef} does not match current merge-base ${context.git.baseRef}.`,
    );
  }

  const finalTree = normalizeCommitRef(context.cwd, draft.final_tree, "groupsJsonDraft.final_tree");
  if (finalTree !== context.git.finalTree) {
    throw new Error(
      `GROUPS_JSON_DRAFT final_tree ${finalTree} does not match current HEAD ${context.git.finalTree}.`,
    );
  }

  const trunkRef = normalizeBranchRef(draft.trunk);
  if (trunkRef !== context.git.trunkRef) {
    throw new Error(
      `GROUPS_JSON_DRAFT trunk ${trunkRef} does not match current trunk ${context.git.trunkRef}.`,
    );
  }

  if (draft.groups.length !== decision.proposedGroups.length) {
    throw new Error(
      `GROUPS_JSON_DRAFT groups (${draft.groups.length}) do not match proposed groups (${decision.proposedGroups.length}).`,
    );
  }

  const goalSlug = normalizeGoalSlug(draft.goal || context.goalSlug);
  const groups: AutoresearchFinalizationGroupV1[] = [];
  const normalizedDraftGroups: AutoresearchFinalizationGroupDraftV1[] = [];
  const seenFiles = new Set<string>();
  let previousCommit = context.git.baseRef;

  for (const [index, proposedGroup] of decision.proposedGroups.entries()) {
    const draftGroup = draft.groups[index];
    if (!draftGroup) {
      throw new Error(`Missing groups.json draft entry for proposed group ${index + 1}.`);
    }
    if (
      normalizeComparableText(draftGroup.title) !== normalizeComparableText(proposedGroup.title)
    ) {
      throw new Error(
        `Draft group ${index + 1} title ${JSON.stringify(draftGroup.title)} does not match proposed group ${JSON.stringify(proposedGroup.title)}.`,
      );
    }

    const lastCommit = normalizeCommitRef(
      context.cwd,
      draftGroup.last_commit,
      `groupsJsonDraft.groups[${index}].last_commit`,
    );
    ensureCommitReachableFrom(context.cwd, lastCommit, context.git.finalTree, lastCommit);
    ensureCommitDescendsFrom(context.cwd, previousCommit, lastCommit, lastCommit);

    const commits = uniqueStrings(
      [...proposedGroup.commits, draftGroup.last_commit].map((commit, commitIndex) =>
        normalizeCommitRef(context.cwd, commit, `proposedGroups[${index}].commits[${commitIndex}]`),
      ),
    );
    if (!commits.includes(lastCommit)) {
      commits.push(lastCommit);
    }

    const files = listEffectiveGroupFiles(context.cwd, previousCommit, lastCommit);
    if (files.length === 0) {
      throw new Error(`Finalization group ${index + 1} has no non-session files after exclusion.`);
    }
    for (const file of files) {
      if (seenFiles.has(file)) {
        throw new Error(`File ${JSON.stringify(file)} appears in multiple finalization groups.`);
      }
      seenFiles.add(file);
    }

    const slug = normalizeGoalSlug(draftGroup.slug);
    const branchName = `autoresearch/${goalSlug}/${String(index + 1).padStart(2, "0")}-${slug}`;
    groups.push({
      index: index + 1,
      title: draftGroup.title,
      slug,
      branchName,
      lastCommit,
      commits,
      files,
      metricEffect: proposedGroup.metricEffect,
      dependencyNotes: [...proposedGroup.dependencyNotes],
      body: draftGroup.body,
    });
    normalizedDraftGroups.push({
      title: draftGroup.title,
      body: draftGroup.body,
      last_commit: lastCommit,
      slug,
    });
    previousCommit = lastCommit;
  }

  return {
    goalSlug,
    groups,
    groupsJsonDraft: {
      base: context.git.baseRef,
      trunk: context.git.trunkRef,
      final_tree: context.git.finalTree,
      goal: goalSlug,
      groups: normalizedDraftGroups,
    },
  };
}

function getCurrentSegment(entries: readonly AutoresearchReceipt[]): {
  config: AutoresearchConfigReceipt | null;
  runs: AutoresearchRunReceipt[];
} {
  let config: AutoresearchConfigReceipt | null = null;
  let runs: AutoresearchRunReceipt[] = [];

  for (const entry of entries) {
    if (entry.type === "config") {
      config = entry;
      runs = [];
      continue;
    }
    if (config) {
      runs.push(entry);
    }
  }

  return { config, runs };
}

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function isDecisionErrorOutcome(
  outcome: FinalizeDecisionOutcome,
): outcome is Extract<FinalizeDecisionOutcome, { failureStage: string }> {
  return "failureStage" in outcome;
}

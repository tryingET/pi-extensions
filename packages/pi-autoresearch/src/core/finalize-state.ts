import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { normalizeBranchRef, parseAutoresearchFinalizationPlan } from "./finalize-codec.ts";
import { describeAutoresearchFinalizationNextStep } from "./finalize-format.ts";
import { collectAutoresearchGitContext } from "./finalize-git.ts";
import {
  AUTORESEARCH_FINALIZATION_PLAN_FILE,
  type AutoresearchFinalizationGitContext,
  type AutoresearchFinalizationPlanReuse,
  type AutoresearchFinalizationPlanStatus,
  type AutoresearchFinalizationPlanV1,
  type InspectAutoresearchFinalizationResult,
  type LoadAutoresearchFinalizationPlanStateInput,
  type LoadAutoresearchFinalizationPlanStateResult,
} from "./finalize-model.ts";
import { type AutoresearchRuntimeStatus, buildAutoresearchRuntimeStatus } from "./runtime.ts";

function resolveAutoresearchFinalizationPlanPath(cwd: string): string {
  return path.join(path.resolve(cwd), AUTORESEARCH_FINALIZATION_PLAN_FILE);
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

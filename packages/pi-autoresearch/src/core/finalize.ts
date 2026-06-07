import path from "node:path";

import {
  assertAutoresearchFinalizeControlSelected,
  materializeAutoresearchFinalizationPlan,
  normalizeInlineReason,
  requireFreshAutoresearchFinalizationPlan,
  validateStoredAutoresearchFinalizationPlan,
} from "./finalize-materialization.ts";
import type {
  ApproveAutoresearchFinalizationPlanInput,
  ApproveAutoresearchFinalizationPlanResult,
  AutoresearchFinalizationPlanV1,
  ExecuteAutoresearchFinalizationInput,
  ExecuteAutoresearchFinalizationResult,
} from "./finalize-model.ts";
import {
  requestAutoresearchFinalizationPlan,
  writeAutoresearchFinalizationPlan,
} from "./finalize-planning.ts";
import { inspectAutoresearchFinalization } from "./finalize-state.ts";

export { parseAutoresearchFinalizationPlan } from "./finalize-codec.ts";
export {
  formatAutoresearchFinalizationPlanReuse,
  formatAutoresearchFinalizationResult,
} from "./finalize-format.ts";
export {
  collectAutoresearchGitContext,
  isAutoresearchSessionArtifactPath,
} from "./finalize-git.ts";
export {
  materializeAutoresearchFinalizationPlan,
  verifyAutoresearchFinalizationMaterialization,
} from "./finalize-materialization.ts";
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
export {
  buildAutoresearchFinalizationPlan,
  createAutoresearchFinalizationContext,
  persistAutoresearchFinalizationPlan,
  planAutoresearchFinalizationFromDecision,
  readAutoresearchIdeasBacklog,
  requestAutoresearchFinalizationPlan,
  resolveAutoresearchFinalizationPlanPath,
  writeAutoresearchFinalizationPlan,
} from "./finalize-planning.ts";
export {
  inspectAutoresearchFinalization,
  loadAutoresearchFinalizationPlan,
  loadAutoresearchFinalizationPlanState,
} from "./finalize-state.ts";

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

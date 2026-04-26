import type { WorkflowRequest, WorkflowResult } from "./workflow.ts";
import type { WorkflowExecutionParams, WorkflowExecutor } from "./workflow-execution.ts";

export interface GovernedReviewLaneWorkflowOptions {
  artifactRoot?: string;
  extensionPath?: string;
}

export type GovernedReviewLaneWorkflowParams = Omit<
  WorkflowExecutionParams,
  "provenance" | "request"
> & {
  request: WorkflowRequest | unknown;
  reviewLane?: GovernedReviewLaneWorkflowOptions;
};

/**
 * Internal caller-boundary helper for governed review-lineage lanes.
 *
 * This is deliberately not part of the public `workflow_execute` request schema: callers that
 * already know they are executing governed review-lane work opt in here, while generic workflow
 * execution remains provenance-off.
 */
export function buildGovernedReviewLaneWorkflowParams(
  params: GovernedReviewLaneWorkflowParams,
): WorkflowExecutionParams {
  const { reviewLane, ...workflowParams } = params;

  return {
    ...workflowParams,
    provenance: {
      mode: "review_lane",
      ...(reviewLane?.artifactRoot ? { artifactRoot: reviewLane.artifactRoot } : {}),
      ...(reviewLane?.extensionPath ? { extensionPath: reviewLane.extensionPath } : {}),
    },
  };
}

export async function executeGovernedReviewLaneWorkflow(
  executor: WorkflowExecutor,
  params: GovernedReviewLaneWorkflowParams,
): Promise<WorkflowResult> {
  return executor.execute(buildGovernedReviewLaneWorkflowParams(params));
}

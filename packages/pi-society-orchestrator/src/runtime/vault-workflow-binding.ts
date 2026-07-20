// summary: validates exact Prompt Vault workflow bindings and materializes their caller-authored workflow request.
// read_when:
//   - changing vault_execute_template workflow bindings or governed workflow handoff validation.

import type { WorkflowRequest } from "./workflow.ts";

const OBJECTIVE_PLACEHOLDER = "$OBJECTIVE";
const DEEP_REVIEW_WORKFLOW_ID = "deep-review.v1";

export type VaultWorkflowBindingResult =
  | { ok: true; workflowId: string; request: WorkflowRequest }
  | { ok: false; error: string };

export function materializeVaultWorkflowBinding(
  templateName: string,
  executionArgs: Readonly<Record<string, unknown>>,
  objective: string,
): VaultWorkflowBindingResult {
  if (templateName !== "deep-review") {
    return {
      ok: false,
      error: `No package-owned workflow binding adapter exists for ${templateName}.`,
    };
  }
  if (executionArgs.workflow_id !== DEEP_REVIEW_WORKFLOW_ID) {
    return { ok: false, error: "deep-review binding has an unknown workflow_id." };
  }
  if (!objective.trim()) {
    return { ok: false, error: "deep-review workflow objective must be non-empty." };
  }

  const request = executionArgs.request;
  if (!isExactDeepReviewRequest(request)) {
    return {
      ok: false,
      error: "deep-review binding request does not match the accepted v1 graph.",
    };
  }

  return {
    ok: true,
    workflowId: DEEP_REVIEW_WORKFLOW_ID,
    request: {
      mode: "chain",
      steps: [{ kind: "step", agent: "reviewer", objective: objective.trim() }],
    },
  };
}

function isExactDeepReviewRequest(value: unknown): boolean {
  if (!isPlainRecord(value) || value.mode !== "chain") return false;
  if (!Array.isArray(value.steps) || value.steps.length !== 1) return false;
  const step = value.steps[0];
  return (
    isPlainRecord(step) &&
    step.kind === "step" &&
    step.agent === "reviewer" &&
    step.objective === OBJECTIVE_PLACEHOLDER &&
    Object.keys(step).length === 3 &&
    Object.keys(value).length === 2
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype,
  );
}

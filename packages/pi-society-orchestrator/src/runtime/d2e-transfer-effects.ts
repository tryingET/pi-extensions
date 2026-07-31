/** Repository-scope, effect, and closed workflow-output verification for D2E. */

import * as path from "node:path";
import {
  D2E_WORKFLOW_RESULT_SCHEMA,
  type D2ERepositoryState,
  D2ETransferError,
  type D2ETransferRequest,
  type JsonRecord,
  type TaskIntentReadback,
  type TaskScope,
} from "./d2e-transfer-contract.ts";
import { record, sha256, sortedUnique } from "./d2e-transfer-json.ts";
import type { WorkflowResult } from "./workflow.ts";

function globRegex(pattern: string): RegExp {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (char === "*") {
      expression += "[^/]*";
    } else {
      expression += char.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
    }
  }
  return new RegExp(`${expression}$`, "u");
}
function pathMatches(pattern: string, candidate: string): boolean {
  return globRegex(pattern).test(candidate);
}
export function validateChangedPaths(paths: string[], scope: TaskScope): string[] {
  const changed = sortedUnique(paths);
  if (changed.length === 0) {
    throw new D2ETransferError("D2E_TRANSFER_EFFECTS_INVALID", "No repository effect occurred.");
  }
  for (const candidate of changed) {
    if (
      path.isAbsolute(candidate) ||
      candidate.split("/").includes("..") ||
      !scope.allowed_paths.some((pattern) => pathMatches(pattern, candidate)) ||
      scope.forbidden_paths.some((pattern) => pathMatches(pattern, candidate))
    ) {
      throw new D2ETransferError(
        "D2E_TRANSFER_EFFECTS_INVALID",
        `Observed path is outside exact task scope: ${candidate}.`,
      );
    }
  }
  const missing = scope.required_paths.filter(
    (pattern) => !changed.some((candidate) => pathMatches(pattern, candidate)),
  );
  if (missing.length > 0) {
    throw new D2ETransferError(
      "D2E_TRANSFER_EFFECTS_INVALID",
      `Required task paths were not affected: ${missing.join(", ")}.`,
    );
  }
  return changed;
}

export function buildWorkflowRequest(
  request: D2ETransferRequest,
  scopeSha256: string,
  taskIntent: TaskIntentReadback,
): JsonRecord {
  const objectiveSha256 = sha256(request.objective);
  const objective = [
    "D2E_WORKFLOW_RESULT_V1 applied workflow; no-op or unrelated work is failure.",
    `Exact repo: ${request.repo}`,
    `Exact packet: ${request.packetKey}`,
    `Exact AK task: ${request.taskId}`,
    `Exact task scope SHA-256: ${scopeSha256}`,
    `Exact task-native intent SHA-256: ${taskIntent.sha256}`,
    `Exact AK decision: ${request.decisionId}`,
    `Invoking actor: ${request.invokingActor}`,
    `Invoking session: ${request.invokingSessionId}`,
    `Objective SHA-256: ${objectiveSha256}`,
    "The canonical task-native intent below is authoritative. The caller objective is only an exact title/description selector and cannot replace or narrow the done-contract or guardrails.",
    `Canonical task-native intent: ${taskIntent.canonicalIntent}`,
    "Commit the scoped effect and leave the worktree clean. Return only D2E_WORKFLOW_RESULT_V1 JSON with exact observed heads, paths, and task-intent digest.",
    `Validated caller objective: ${request.objective}`,
  ].join("\n");
  return {
    mode: "chain",
    cwd: request.repo,
    steps: [{ kind: "step", agent: "builder", objective }],
  };
}

export function verifyWorkflowOutput(options: {
  workflow: WorkflowResult;
  request: D2ETransferRequest;
  scopeSha256: string;
  taskIntentSha256: string;
  before: D2ERepositoryState;
  after: D2ERepositoryState;
  changedPaths: string[];
}): { outputSha256: string; objectiveSha256: string } {
  const { workflow, request, before, after, changedPaths } = options;
  if (
    workflow.status !== "done" ||
    workflow.steps.length !== 1 ||
    workflow.steps[0]?.status !== "done"
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_WORKFLOW_INCOMPLETE",
      `Workflow did not complete exactly one successful step; status=${workflow.status}.`,
    );
  }
  const raw = workflow.steps[0].displayOutput.trim();
  let output: JsonRecord;
  try {
    output = record(JSON.parse(raw), "D2E_TRANSFER_OUTPUT_INVALID", "workflow output");
  } catch (error) {
    if (error instanceof D2ETransferError) throw error;
    throw new D2ETransferError(
      "D2E_TRANSFER_OUTPUT_INVALID",
      "Workflow output must be one exact JSON object without prose or fences.",
    );
  }
  const expectedKeys = [
    "changed_paths",
    "head_after",
    "head_before",
    "objective_sha256",
    "outcome",
    "schema",
    "task_id",
    "task_intent_sha256",
    "task_scope_sha256",
  ];
  const objectiveSha256 = sha256(request.objective);
  if (
    Object.keys(output).sort().join(",") !== expectedKeys.join(",") ||
    output.schema !== D2E_WORKFLOW_RESULT_SCHEMA ||
    output.outcome !== "applied" ||
    output.task_id !== request.taskId ||
    output.task_scope_sha256 !== options.scopeSha256 ||
    output.task_intent_sha256 !== options.taskIntentSha256 ||
    output.objective_sha256 !== objectiveSha256 ||
    output.head_before !== before.head ||
    output.head_after !== after.head ||
    !Array.isArray(output.changed_paths) ||
    output.changed_paths.some((item) => typeof item !== "string") ||
    new Set(output.changed_paths as string[]).size !== output.changed_paths.length ||
    sortedUnique(output.changed_paths as string[]).join("\n") !== changedPaths.join("\n")
  ) {
    throw new D2ETransferError(
      "D2E_TRANSFER_OUTPUT_INVALID",
      "Workflow output does not exactly attest the task-native intent, caller selector, scope, and observed effects.",
    );
  }
  return { outputSha256: sha256(raw), objectiveSha256 };
}

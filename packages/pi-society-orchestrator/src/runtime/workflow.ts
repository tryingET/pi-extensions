import { type AgentTeam, isAgentTeam, resolveAgentForTeam } from "./agent-routing.ts";

export const WORKFLOW_MODES = ["chain", "parallel"] as const;
export type WorkflowMode = (typeof WORKFLOW_MODES)[number];

export const WORKFLOW_AGENT_NAMES = ["scout", "builder", "reviewer", "researcher"] as const;
export type WorkflowAgentName = (typeof WORKFLOW_AGENT_NAMES)[number];

export const WORKFLOW_STATUSES = ["done", "error", "aborted", "timed_out"] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export interface WorkflowRequest {
  mode: WorkflowMode;
  cwd?: string;
  steps: WorkflowNode[];
}

export type WorkflowNode = WorkflowStep | WorkflowParallelGroup;

export interface WorkflowStep {
  kind: "step";
  agent: WorkflowAgentName;
  objective: string;
  cwd?: string;
}

export interface WorkflowParallelGroup {
  kind: "parallel";
  tasks: WorkflowStep[];
  concurrency?: number;
  worktree?: boolean;
}

export interface WorkflowStepProvenanceResult {
  status: "captured" | "missing" | "unavailable" | "invalid";
  laneId: string;
  path: string;
  provenance?: unknown;
  warning?: string;
  error?: string;
}

export interface WorkflowStepResult {
  index: number;
  agent: WorkflowAgentName;
  status: WorkflowStatus;
  displayOutput: string;
  failureKind?: string;
  elapsedMs?: number;
  provenance?: WorkflowStepProvenanceResult;
}

export interface WorkflowWorktreeSummary {
  changedTasks: number;
  patchDir?: string;
  diffSummaryText: string;
}

export interface WorkflowResult {
  mode: WorkflowMode;
  status: WorkflowStatus;
  steps: WorkflowStepResult[];
  aggregatedOutput: string;
  worktreeSummary?: WorkflowWorktreeSummary;
}

export interface WorkflowValidationIssue {
  path: string;
  code:
    | "request_not_object"
    | "invalid_mode"
    | "invalid_cwd"
    | "missing_steps"
    | "empty_steps"
    | "invalid_node"
    | "invalid_node_kind"
    | "invalid_agent"
    | "empty_objective"
    | "parallel_tasks_not_array"
    | "parallel_tasks_empty"
    | "nested_parallel_group"
    | "invalid_concurrency"
    | "worktree_on_step"
    | "unknown_team"
    | "team_disallows_agent";
  message: string;
}

export type WorkflowValidationResult =
  | {
      ok: true;
      value: WorkflowRequest;
    }
  | {
      ok: false;
      issues: WorkflowValidationIssue[];
    };

export interface ValidateWorkflowRequestOptions {
  activeTeam?: string;
}

export interface WorkflowStepRef {
  nodeIndex: number;
  parallelTaskIndex?: number;
  path: string;
  step: WorkflowStep;
}

export function validateWorkflowRequest(
  input: unknown,
  options: ValidateWorkflowRequestOptions = {},
): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          path: "$",
          code: "request_not_object",
          message: "WorkflowRequest must be an object.",
        },
      ],
    };
  }

  const rawMode = input.mode;
  if (!isWorkflowMode(rawMode)) {
    issues.push({
      path: "mode",
      code: "invalid_mode",
      message: `WorkflowRequest.mode must be one of: ${WORKFLOW_MODES.join(", ")}.`,
    });
  }

  const cwd = validateOptionalNonEmptyString(input.cwd, "cwd", issues);

  if (!("steps" in input)) {
    issues.push({
      path: "steps",
      code: "missing_steps",
      message: "WorkflowRequest.steps is required.",
    });
  } else if (!Array.isArray(input.steps)) {
    issues.push({
      path: "steps",
      code: "missing_steps",
      message: "WorkflowRequest.steps must be an array.",
    });
  } else if (input.steps.length === 0) {
    issues.push({
      path: "steps",
      code: "empty_steps",
      message: "WorkflowRequest.steps must contain at least one workflow node.",
    });
  }

  const activeTeam = resolveRequestedTeam(options.activeTeam, issues);
  const steps = Array.isArray(input.steps)
    ? validateWorkflowNodes(input.steps, issues, activeTeam)
    : undefined;

  if (issues.length > 0 || !isWorkflowMode(rawMode) || !steps) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      mode: rawMode,
      cwd,
      steps,
    },
  };
}

export function isWorkflowRequest(
  input: unknown,
  options: ValidateWorkflowRequestOptions = {},
): input is WorkflowRequest {
  return validateWorkflowRequest(input, options).ok;
}

export function flattenWorkflowSteps(request: WorkflowRequest): WorkflowStepRef[] {
  const refs: WorkflowStepRef[] = [];

  request.steps.forEach((node, nodeIndex) => {
    if (node.kind === "step") {
      refs.push({
        nodeIndex,
        path: `steps[${nodeIndex}]`,
        step: node,
      });
      return;
    }

    node.tasks.forEach((task, parallelTaskIndex) => {
      refs.push({
        nodeIndex,
        parallelTaskIndex,
        path: `steps[${nodeIndex}].tasks[${parallelTaskIndex}]`,
        step: task,
      });
    });
  });

  return refs;
}

export function countWorkflowParallelGroups(request: WorkflowRequest): number {
  return request.steps.filter((node) => node.kind === "parallel").length;
}

function resolveRequestedTeam(
  activeTeam: string | undefined,
  issues: WorkflowValidationIssue[],
): AgentTeam | undefined {
  if (activeTeam === undefined) {
    return undefined;
  }

  if (!isAgentTeam(activeTeam)) {
    issues.push({
      path: "activeTeam",
      code: "unknown_team",
      message: `Unknown agent team: ${activeTeam}.`,
    });
    return undefined;
  }

  return activeTeam;
}

function validateWorkflowNodes(
  nodes: unknown[],
  issues: WorkflowValidationIssue[],
  activeTeam: AgentTeam | undefined,
): WorkflowNode[] | undefined {
  const validated: WorkflowNode[] = [];

  nodes.forEach((node, nodeIndex) => {
    const path = `steps[${nodeIndex}]`;
    const result = validateWorkflowNode(node, path, issues, activeTeam);
    if (result) {
      validated.push(result);
    }
  });

  return issues.length > 0 ? undefined : validated;
}

function validateWorkflowNode(
  node: unknown,
  path: string,
  issues: WorkflowValidationIssue[],
  activeTeam: AgentTeam | undefined,
): WorkflowNode | undefined {
  if (!isRecord(node)) {
    issues.push({
      path,
      code: "invalid_node",
      message: "Workflow nodes must be objects.",
    });
    return undefined;
  }

  if (node.kind === "step") {
    return validateWorkflowStep(node, path, issues, activeTeam);
  }

  if (node.kind === "parallel") {
    return validateWorkflowParallelGroup(node, path, issues, activeTeam);
  }

  issues.push({
    path: `${path}.kind`,
    code: "invalid_node_kind",
    message: "Workflow node kind must be 'step' or 'parallel'.",
  });
  return undefined;
}

function validateWorkflowStep(
  step: Record<string, unknown>,
  path: string,
  issues: WorkflowValidationIssue[],
  activeTeam: AgentTeam | undefined,
): WorkflowStep | undefined {
  const rawAgent = step.agent;
  if (!isWorkflowAgentName(rawAgent)) {
    issues.push({
      path: `${path}.agent`,
      code: "invalid_agent",
      message: `Workflow step agent must be one of: ${WORKFLOW_AGENT_NAMES.join(", ")}.`,
    });
  }

  const objective =
    typeof step.objective === "string" && step.objective.trim().length > 0
      ? step.objective.trim()
      : undefined;
  if (!objective) {
    issues.push({
      path: `${path}.objective`,
      code: "empty_objective",
      message: "Workflow step objective must be a non-empty string.",
    });
  }

  const cwd = validateOptionalNonEmptyString(step.cwd, `${path}.cwd`, issues);

  if (Object.hasOwn(step, "worktree")) {
    issues.push({
      path: `${path}.worktree`,
      code: "worktree_on_step",
      message: "worktree is only valid on parallel groups in the first slice.",
    });
  }

  if (isWorkflowAgentName(rawAgent) && activeTeam) {
    const resolution = resolveAgentForTeam(rawAgent, activeTeam);
    if (!resolution.ok) {
      issues.push({
        path: `${path}.agent`,
        code: "team_disallows_agent",
        message: resolution.error,
      });
    }
  }

  if (!isWorkflowAgentName(rawAgent) || !objective) {
    return undefined;
  }

  return {
    kind: "step",
    agent: rawAgent,
    objective,
    cwd,
  };
}

function validateWorkflowParallelGroup(
  group: Record<string, unknown>,
  path: string,
  issues: WorkflowValidationIssue[],
  activeTeam: AgentTeam | undefined,
): WorkflowParallelGroup | undefined {
  if (!Array.isArray(group.tasks)) {
    issues.push({
      path: `${path}.tasks`,
      code: "parallel_tasks_not_array",
      message: "Parallel group tasks must be an array of workflow steps.",
    });
    return undefined;
  }

  if (group.tasks.length === 0) {
    issues.push({
      path: `${path}.tasks`,
      code: "parallel_tasks_empty",
      message: "Parallel group tasks must contain at least one workflow step.",
    });
  }

  const concurrency = validateConcurrency(group.concurrency, `${path}.concurrency`, issues);
  const worktree = validateOptionalBoolean(group.worktree, `${path}.worktree`, issues);
  const tasks: WorkflowStep[] = [];

  group.tasks.forEach((task, taskIndex) => {
    const taskPath = `${path}.tasks[${taskIndex}]`;
    if (isRecord(task) && task.kind === "parallel") {
      issues.push({
        path: `${taskPath}.kind`,
        code: "nested_parallel_group",
        message: "Parallel groups may only contain step tasks in the first slice.",
      });
      return;
    }

    const validatedTask = validateWorkflowNode(task, taskPath, issues, activeTeam);
    if (validatedTask?.kind === "step") {
      tasks.push(validatedTask);
    }
  });

  if (issues.length > 0 || tasks.length === 0) {
    return undefined;
  }

  return {
    kind: "parallel",
    tasks,
    concurrency,
    worktree,
  };
}

function validateOptionalNonEmptyString(
  value: unknown,
  path: string,
  issues: WorkflowValidationIssue[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({
      path,
      code: "invalid_cwd",
      message: `${path} must be a non-empty string when provided.`,
    });
    return undefined;
  }

  return value.trim();
}

function validateConcurrency(
  value: unknown,
  path: string,
  issues: WorkflowValidationIssue[],
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    issues.push({
      path,
      code: "invalid_concurrency",
      message: "Parallel group concurrency must be a positive integer when provided.",
    });
    return undefined;
  }

  return value;
}

function validateOptionalBoolean(
  value: unknown,
  path: string,
  issues: WorkflowValidationIssue[],
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    issues.push({
      path,
      code: "invalid_node",
      message: `${path} must be a boolean when provided.`,
    });
    return undefined;
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkflowMode(value: unknown): value is WorkflowMode {
  return typeof value === "string" && WORKFLOW_MODES.includes(value as WorkflowMode);
}

function isWorkflowAgentName(value: unknown): value is WorkflowAgentName {
  return typeof value === "string" && WORKFLOW_AGENT_NAMES.includes(value as WorkflowAgentName);
}

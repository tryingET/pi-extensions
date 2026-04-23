import { AGENT_PROFILES } from "./agent-profiles.ts";
import { getExecutionStatus } from "./execution-status.ts";
import {
  createOrchestratorSubagentExecutor,
  type OrchestratorSubagentExecutor,
  type OrchestratorSubagentExecutorOptions,
  toExecutionLike,
} from "./subagent.ts";
import {
  flattenWorkflowSteps,
  validateWorkflowRequest,
  type WorkflowParallelGroup,
  type WorkflowRequest,
  type WorkflowResult,
  type WorkflowStatus,
  type WorkflowStep,
  type WorkflowStepResult,
  type WorkflowValidationIssue,
} from "./workflow.ts";

const WORKFLOW_STATUS_ORDER: WorkflowStatus[] = ["done", "error", "aborted", "timed_out"];

type WorkflowStatusCounts = Record<WorkflowStatus, number>;

export type WorkflowExecutionErrorCode =
  | "workflow_validation_failed"
  | "workflow_worktree_not_yet_supported";

export class WorkflowExecutionError extends Error {
  readonly code: WorkflowExecutionErrorCode;
  readonly issues?: WorkflowValidationIssue[];

  constructor(
    code: WorkflowExecutionErrorCode,
    message: string,
    options: { issues?: WorkflowValidationIssue[] } = {},
  ) {
    super(message);
    this.name = "WorkflowExecutionError";
    this.code = code;
    this.issues = options.issues;
  }
}

export interface WorkflowExecutionParams {
  request: WorkflowRequest | unknown;
  activeTeam: string;
  model: string;
  cwd: string;
  cognitiveToolContent: string;
  cognitiveToolName?: string;
  contextHeading?: string;
  contextBody?: string;
  extraSections?: string[];
  promptName?: string;
  promptContent?: string;
  promptTags?: string[];
  promptSource?: string;
  signal?: AbortSignal;
}

export interface WorkflowExecutor {
  execute(params: WorkflowExecutionParams): Promise<WorkflowResult>;
}

export interface WorkflowExecutorOptions extends OrchestratorSubagentExecutorOptions {
  executor?: OrchestratorSubagentExecutor;
}

export function createWorkflowExecutor(options: WorkflowExecutorOptions): WorkflowExecutor {
  const executor =
    options.executor ??
    createOrchestratorSubagentExecutor({
      sessionsDir: options.sessionsDir,
      state: options.state,
      spawner: options.spawner,
    });

  return {
    async execute(params) {
      const validatedRequest = validateWorkflowRequest(params.request, {
        activeTeam: params.activeTeam,
      });

      if (!validatedRequest.ok) {
        throw new WorkflowExecutionError(
          "workflow_validation_failed",
          "Workflow request failed validation.",
          { issues: validatedRequest.issues },
        );
      }

      const request = validatedRequest.value;
      const stepResults: WorkflowStepResult[] = [];

      for (const node of request.steps) {
        if (node.kind === "step") {
          const stepResult = await executeWorkflowStep({
            step: node,
            index: stepResults.length,
            request,
            params,
            executor,
          });
          stepResults.push(stepResult);

          if (request.mode === "chain" && stepResult.status !== "done") {
            break;
          }
          continue;
        }

        if (node.worktree) {
          throw new WorkflowExecutionError(
            "workflow_worktree_not_yet_supported",
            "Workflow execution does not support worktree groups yet. Land WF-4 before enabling worktree=true execution.",
          );
        }

        const parallelResults = await executeParallelGroup({
          group: node,
          startIndex: stepResults.length,
          request,
          params,
          executor,
        });
        stepResults.push(...parallelResults);

        if (request.mode === "chain" && aggregateWorkflowStatus(parallelResults) !== "done") {
          break;
        }
      }

      return {
        mode: request.mode,
        status: aggregateWorkflowStatus(stepResults),
        steps: stepResults,
        aggregatedOutput: buildAggregatedOutput(request, stepResults),
      };
    },
  };
}

async function executeParallelGroup(input: {
  group: WorkflowParallelGroup;
  startIndex: number;
  request: WorkflowRequest;
  params: WorkflowExecutionParams;
  executor: OrchestratorSubagentExecutor;
}): Promise<WorkflowStepResult[]> {
  const { group, startIndex, request, params, executor } = input;

  return Promise.all(
    group.tasks.map((step, parallelTaskIndex) =>
      executeWorkflowStep({
        step,
        index: startIndex + parallelTaskIndex,
        request,
        params,
        executor,
      }),
    ),
  );
}

async function executeWorkflowStep(input: {
  step: WorkflowStep;
  index: number;
  request: WorkflowRequest;
  params: WorkflowExecutionParams;
  executor: OrchestratorSubagentExecutor;
}): Promise<WorkflowStepResult> {
  const { step, index, request, params, executor } = input;
  const agentProfile = AGENT_PROFILES[step.agent];
  if (!agentProfile) {
    throw new WorkflowExecutionError(
      "workflow_validation_failed",
      `Unknown workflow agent profile: ${step.agent}`,
    );
  }

  const result = await executor.execute({
    agentProfile,
    cognitiveToolContent: params.cognitiveToolContent,
    cognitiveToolName: params.cognitiveToolName,
    objective: step.objective,
    model: params.model,
    cwd: step.cwd ?? request.cwd ?? params.cwd,
    contextHeading: params.contextHeading,
    contextBody: params.contextBody,
    extraSections: params.extraSections,
    promptName: params.promptName,
    promptContent: params.promptContent,
    promptTags: params.promptTags,
    promptSource: params.promptSource,
    signal: params.signal,
  });

  const executionLike = toExecutionLike(result);

  return {
    index,
    agent: step.agent,
    status: getExecutionStatus(executionLike),
    displayOutput: executionLike.output,
    failureKind: result.details.failureKind,
    elapsedMs: result.details.elapsed,
  };
}

function aggregateWorkflowStatus(stepResults: WorkflowStepResult[]): WorkflowStatus {
  if (stepResults.some((step) => step.status === "aborted")) {
    return "aborted";
  }
  if (stepResults.some((step) => step.status === "timed_out")) {
    return "timed_out";
  }
  if (stepResults.some((step) => step.status === "error")) {
    return "error";
  }
  return "done";
}

function buildAggregatedOutput(
  request: WorkflowRequest,
  stepResults: WorkflowStepResult[],
): string {
  const sections = [buildWorkflowSummarySection(request, stepResults)];
  let nextStepResultIndex = 0;
  let parallelGroupOrdinal = 0;

  for (const node of request.steps) {
    if (node.kind === "step") {
      const result = stepResults[nextStepResultIndex];
      if (!result) {
        break;
      }
      nextStepResultIndex += 1;
      sections.push(
        renderStepSection({
          headingLevel: "##",
          heading: `Step ${result.index + 1} — ${node.agent} — ${result.status}`,
          step: node,
          result,
        }),
      );
      continue;
    }

    const results = stepResults.slice(nextStepResultIndex, nextStepResultIndex + node.tasks.length);
    if (results.length === 0) {
      break;
    }
    nextStepResultIndex += results.length;
    parallelGroupOrdinal += 1;
    sections.push(
      renderParallelGroupSection({
        groupOrdinal: parallelGroupOrdinal,
        group: node,
        results,
      }),
    );
  }

  return sections.join("\n\n");
}

function buildWorkflowSummarySection(
  request: WorkflowRequest,
  stepResults: WorkflowStepResult[],
): string {
  const totalRequestedSteps = flattenWorkflowSteps(request).length;
  const lines = [
    "## Workflow summary",
    `- mode: ${request.mode}`,
    `- status: ${aggregateWorkflowStatus(stepResults)}`,
    `- executed_steps: ${stepResults.length}/${totalRequestedSteps}`,
    `- step_statuses: ${formatWorkflowStatusCounts(countWorkflowStatuses(stepResults))}`,
  ];

  const failureKinds = formatFailureKindCounts(countFailureKinds(stepResults));
  if (failureKinds) {
    lines.push(`- failure_kinds: ${failureKinds}`);
  }

  if (request.mode === "chain" && stepResults.length < totalRequestedSteps) {
    lines.push("- halted_early: true");
  }

  return lines.join("\n");
}

function renderParallelGroupSection(input: {
  groupOrdinal: number;
  group: WorkflowParallelGroup;
  results: WorkflowStepResult[];
}): string {
  const { groupOrdinal, group, results } = input;
  const lines = [
    `## Parallel group ${groupOrdinal} — ${aggregateWorkflowStatus(results)}`,
    `- tasks: ${group.tasks.length}`,
    `- step_statuses: ${formatWorkflowStatusCounts(countWorkflowStatuses(results))}`,
  ];

  if (typeof group.concurrency === "number") {
    lines.push(`- concurrency: ${group.concurrency}`);
  }
  if (group.worktree) {
    lines.push("- worktree: true");
  }

  const failureKinds = formatFailureKindCounts(countFailureKinds(results));
  if (failureKinds) {
    lines.push(`- failure_kinds: ${failureKinds}`);
  }

  const sections = [lines.join("\n")];

  results.forEach((result, index) => {
    const step = group.tasks[index];
    if (!step) {
      return;
    }

    sections.push(
      renderStepSection({
        headingLevel: "###",
        heading: `Task ${index + 1} — ${step.agent} — ${result.status}`,
        step,
        result,
      }),
    );
  });

  return sections.join("\n\n");
}

function renderStepSection(input: {
  headingLevel: "##" | "###";
  heading: string;
  step: WorkflowStep;
  result: WorkflowStepResult;
}): string {
  const { headingLevel, heading, step, result } = input;
  const lines = [`${headingLevel} ${heading}`, `Objective: ${step.objective}`];

  if (result.failureKind) {
    lines.push(`Failure kind: ${result.failureKind}`);
  }

  if (typeof result.elapsedMs === "number") {
    lines.push(`Elapsed: ${result.elapsedMs} ms`);
  }

  lines.push("Output:", formatDisplayOutput(result.displayOutput));
  return lines.join("\n");
}

function countWorkflowStatuses(stepResults: WorkflowStepResult[]): WorkflowStatusCounts {
  const counts = Object.fromEntries(
    WORKFLOW_STATUS_ORDER.map((status) => [status, 0]),
  ) as WorkflowStatusCounts;

  for (const step of stepResults) {
    counts[step.status] += 1;
  }

  return counts;
}

function countFailureKinds(stepResults: WorkflowStepResult[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const step of stepResults) {
    if (!step.failureKind) {
      continue;
    }
    counts.set(step.failureKind, (counts.get(step.failureKind) ?? 0) + 1);
  }

  return counts;
}

function formatWorkflowStatusCounts(counts: WorkflowStatusCounts): string {
  const entries = WORKFLOW_STATUS_ORDER.filter((status) => counts[status] > 0).map(
    (status) => `${status}=${counts[status]}`,
  );
  return entries.length > 0 ? entries.join(", ") : "none";
}

function formatFailureKindCounts(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([failureKind, count]) => `${failureKind}=${count}`)
    .join(", ");
}

function formatDisplayOutput(displayOutput: string): string {
  return displayOutput.trim().length > 0 ? displayOutput : "(no display output)";
}

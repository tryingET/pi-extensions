import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { AGENT_PROFILES } from "./agent-profiles.ts";
import { getExecutionStatus } from "./execution-status.ts";
import {
  buildReviewLaneProvenanceEnv,
  createReviewLaneProvenanceRequest,
  formatReviewLaneProvenanceLine,
  mergeUniqueStrings,
  type ReviewLaneProvenanceConfig,
  readReviewLaneProvenanceResult,
} from "./review-lane-provenance.ts";
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
  type WorkflowWorktreeSummary,
} from "./workflow.ts";
import {
  buildWorkflowWorktreeSummary,
  cleanupWorkflowWorktrees,
  createWorkflowWorktrees,
  findWorkflowWorktreeTaskCwdConflict,
  formatWorkflowWorktreeTaskCwdConflict,
  type WorkflowWorktreeSetup,
} from "./workflow-worktree.ts";

const WORKFLOW_STATUS_ORDER: WorkflowStatus[] = ["done", "error", "aborted", "timed_out"];

type WorkflowStatusCounts = Record<WorkflowStatus, number>;

export type WorkflowExecutionErrorCode =
  | "workflow_validation_failed"
  | "workflow_worktree_cwd_conflict"
  | "workflow_worktree_setup_failed";

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
  extensions?: string[];
  env?: Record<string, string>;
  provenance?: ReviewLaneProvenanceConfig;
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
      const executionRunId = randomUUID();
      const worktreePatchRootDir = path.join(
        os.tmpdir(),
        `pi-orch-workflow-worktree-patches-${executionRunId}`,
      );
      const stepResults: WorkflowStepResult[] = [];
      const worktreeGroupSummaries = new Map<number, WorkflowWorktreeSummary>();

      for (const [nodeIndex, node] of request.steps.entries()) {
        if (node.kind === "step") {
          const stepResult = await executeWorkflowStep({
            step: node,
            index: stepResults.length,
            request,
            params,
            executor,
            executionRunId,
          });
          stepResults.push(stepResult);

          if (request.mode === "chain" && stepResult.status !== "done") {
            break;
          }
          continue;
        }

        const parallelExecution = node.worktree
          ? await executeWorktreeParallelGroup({
              group: node,
              nodeIndex,
              request,
              params,
              executor,
              executionRunId,
              worktreePatchRootDir,
              startIndex: stepResults.length,
            })
          : {
              results: await executeParallelGroup({
                group: node,
                startIndex: stepResults.length,
                request,
                params,
                executor,
                executionRunId,
              }),
              worktreeSummary: undefined,
            };

        stepResults.push(...parallelExecution.results);
        if (parallelExecution.worktreeSummary) {
          worktreeGroupSummaries.set(nodeIndex, parallelExecution.worktreeSummary);
        }

        if (
          request.mode === "chain" &&
          aggregateWorkflowStatus(parallelExecution.results) !== "done"
        ) {
          break;
        }
      }

      const worktreeSummary = mergeWorkflowWorktreeSummaries([...worktreeGroupSummaries.values()]);

      return {
        mode: request.mode,
        status: aggregateWorkflowStatus(stepResults),
        steps: stepResults,
        aggregatedOutput: buildAggregatedOutput(request, stepResults, {
          worktreeSummary,
          worktreeGroupSummaries,
        }),
        ...(worktreeSummary ? { worktreeSummary } : {}),
      };
    },
  };
}

async function executeWorktreeParallelGroup(input: {
  group: WorkflowParallelGroup;
  nodeIndex: number;
  request: WorkflowRequest;
  params: WorkflowExecutionParams;
  executor: OrchestratorSubagentExecutor;
  executionRunId: string;
  worktreePatchRootDir: string;
  startIndex: number;
}): Promise<{ results: WorkflowStepResult[]; worktreeSummary: WorkflowWorktreeSummary }> {
  const {
    group,
    nodeIndex,
    request,
    params,
    executor,
    executionRunId,
    worktreePatchRootDir,
    startIndex,
  } = input;
  const sharedCwd = request.cwd ?? params.cwd;
  const conflict = findWorkflowWorktreeTaskCwdConflict(group.tasks, sharedCwd);
  if (conflict) {
    throw new WorkflowExecutionError(
      "workflow_worktree_cwd_conflict",
      formatWorkflowWorktreeTaskCwdConflict(conflict, sharedCwd),
    );
  }

  let worktreeSetup: WorkflowWorktreeSetup;
  try {
    worktreeSetup = createWorkflowWorktrees({
      cwd: sharedCwd,
      runId: `${executionRunId}-group-${nodeIndex + 1}`,
      tasks: group.tasks,
    });
  } catch (error) {
    throw new WorkflowExecutionError(
      "workflow_worktree_setup_failed",
      error instanceof Error ? error.message : String(error),
    );
  }

  const cwdOverrides = worktreeSetup.worktrees.map((worktree) => worktree.agentCwd);
  const patchDir = path.join(worktreePatchRootDir, `group-${nodeIndex + 1}`);

  try {
    let results: WorkflowStepResult[] | undefined;
    let executionError: unknown;

    try {
      results = await executeParallelGroup({
        group,
        startIndex,
        request,
        params,
        executor,
        executionRunId,
        cwdOverrides,
      });
    } catch (error) {
      executionError = error;
    }

    const worktreeSummary = buildWorkflowWorktreeSummary({
      setup: worktreeSetup,
      agents: group.tasks.map((task) => task.agent),
      patchDir,
    });

    if (executionError) {
      throw executionError;
    }

    return {
      results: results ?? [],
      worktreeSummary,
    };
  } finally {
    cleanupWorkflowWorktrees(worktreeSetup);
  }
}

async function executeParallelGroup(input: {
  group: WorkflowParallelGroup;
  startIndex: number;
  request: WorkflowRequest;
  params: WorkflowExecutionParams;
  executor: OrchestratorSubagentExecutor;
  executionRunId: string;
  cwdOverrides?: string[];
}): Promise<WorkflowStepResult[]> {
  const { group, startIndex, request, params, executor, executionRunId, cwdOverrides } = input;

  const settled = await Promise.allSettled(
    group.tasks.map((step, parallelTaskIndex) =>
      executeWorkflowStep({
        step,
        index: startIndex + parallelTaskIndex,
        request,
        params,
        executor,
        executionRunId,
        cwdOverride: cwdOverrides?.[parallelTaskIndex],
      }),
    ),
  );

  const rejected = settled.find((result) => result.status === "rejected");
  if (rejected?.status === "rejected") {
    throw rejected.reason;
  }

  return settled
    .filter(
      (result): result is PromiseFulfilledResult<WorkflowStepResult> =>
        result.status === "fulfilled",
    )
    .map((result) => result.value);
}

async function executeWorkflowStep(input: {
  step: WorkflowStep;
  index: number;
  request: WorkflowRequest;
  params: WorkflowExecutionParams;
  executor: OrchestratorSubagentExecutor;
  executionRunId: string;
  cwdOverride?: string;
}): Promise<WorkflowStepResult> {
  const { step, index, request, params, executor, executionRunId, cwdOverride } = input;
  const agentProfile = AGENT_PROFILES[step.agent];
  if (!agentProfile) {
    throw new WorkflowExecutionError(
      "workflow_validation_failed",
      `Unknown workflow agent profile: ${step.agent}`,
    );
  }

  const provenanceRequest = createReviewLaneProvenanceRequest({
    config: params.provenance,
    runId: executionRunId,
    stepIndex: index,
    agent: step.agent,
  });
  const provenanceEnv = buildReviewLaneProvenanceEnv(provenanceRequest);
  const mergedEnv =
    params.env || provenanceEnv
      ? {
          ...(params.env ?? {}),
          ...(provenanceEnv ?? {}),
        }
      : undefined;

  const result = await executor.execute({
    agentProfile,
    cognitiveToolContent: params.cognitiveToolContent,
    cognitiveToolName: params.cognitiveToolName,
    objective: step.objective,
    model: params.model,
    cwd: cwdOverride ?? step.cwd ?? request.cwd ?? params.cwd,
    contextHeading: params.contextHeading,
    contextBody: params.contextBody,
    extraSections: params.extraSections,
    extensions: mergeUniqueStrings(
      params.extensions,
      provenanceRequest?.extensionPath ? [provenanceRequest.extensionPath] : undefined,
    ),
    env: mergedEnv,
    promptName: params.promptName,
    promptContent: params.promptContent,
    promptTags: params.promptTags,
    promptSource: params.promptSource,
    signal: params.signal,
  });

  const executionLike = toExecutionLike(result);
  const stepStatus = getExecutionStatus(executionLike);
  const provenance = readReviewLaneProvenanceResult({
    request: provenanceRequest,
    stepStatus,
  });

  return {
    index,
    agent: step.agent,
    status: stepStatus,
    displayOutput: executionLike.output,
    failureKind: result.details.failureKind,
    elapsedMs: result.details.elapsed,
    ...(provenance ? { provenance } : {}),
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
  extras: {
    worktreeSummary?: WorkflowWorktreeSummary;
    worktreeGroupSummaries: Map<number, WorkflowWorktreeSummary>;
  },
): string {
  const sections = [buildWorkflowSummarySection(request, stepResults, extras.worktreeSummary)];
  let nextStepResultIndex = 0;
  let parallelGroupOrdinal = 0;

  for (const [nodeIndex, node] of request.steps.entries()) {
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
        worktreeSummary: extras.worktreeGroupSummaries.get(nodeIndex),
      }),
    );
  }

  return sections.join("\n\n");
}

function buildWorkflowSummarySection(
  request: WorkflowRequest,
  stepResults: WorkflowStepResult[],
  worktreeSummary?: WorkflowWorktreeSummary,
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

  if (worktreeSummary) {
    lines.push(`- worktree_changed_tasks: ${worktreeSummary.changedTasks}`);
    if (worktreeSummary.patchDir) {
      lines.push(`- worktree_patch_dir: ${worktreeSummary.patchDir}`);
    }
  }

  return lines.join("\n");
}

function renderParallelGroupSection(input: {
  groupOrdinal: number;
  group: WorkflowParallelGroup;
  results: WorkflowStepResult[];
  worktreeSummary?: WorkflowWorktreeSummary;
}): string {
  const { groupOrdinal, group, results, worktreeSummary } = input;
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

  if (worktreeSummary) {
    lines.push(`- worktree_changed_tasks: ${worktreeSummary.changedTasks}`);
    if (worktreeSummary.patchDir) {
      lines.push(`- worktree_patch_dir: ${worktreeSummary.patchDir}`);
    }
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

  if (worktreeSummary?.diffSummaryText.trim()) {
    sections.push(worktreeSummary.diffSummaryText.trim());
  }

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

  const provenanceLine = formatReviewLaneProvenanceLine(result.provenance);
  if (provenanceLine) {
    lines.push(provenanceLine);
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

function mergeWorkflowWorktreeSummaries(
  summaries: WorkflowWorktreeSummary[],
): WorkflowWorktreeSummary | undefined {
  if (summaries.length === 0) {
    return undefined;
  }

  const diffSummaryText = summaries
    .map((summary) => summary.diffSummaryText.trim())
    .filter(Boolean)
    .join("\n\n");
  const patchDirs = summaries
    .map((summary) => summary.patchDir)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const patchDir =
    patchDirs.length === 0
      ? undefined
      : patchDirs.length === 1
        ? patchDirs[0]
        : findCommonAncestorPath(patchDirs);

  return {
    changedTasks: summaries.reduce((sum, summary) => sum + summary.changedTasks, 0),
    ...(patchDir ? { patchDir } : {}),
    diffSummaryText,
  };
}

function findCommonAncestorPath(paths: string[]): string | undefined {
  let ancestor = path.resolve(paths[0]);

  for (const candidate of paths.slice(1)) {
    const resolvedCandidate = path.resolve(candidate);
    while (!isSamePathOrDescendant(resolvedCandidate, ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        return undefined;
      }
      ancestor = parent;
    }
  }

  return ancestor;
}

function isSamePathOrDescendant(candidate: string, ancestor: string): boolean {
  const relative = path.relative(ancestor, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

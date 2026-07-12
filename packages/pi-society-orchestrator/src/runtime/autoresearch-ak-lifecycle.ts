// ---
// summary: "Completes an anchored AK task only after recorded autoresearch completion and successful local finalization materialization."
// read_when:
//   - "Changing autoresearch-to-AK task completion gates, lifecycle keys, task anchoring, or terminal-state handling."
// ---

import * as path from "node:path";
import type {
  AutoresearchRuntimeStatus,
  InspectAutoresearchFinalizationResult,
} from "@tryinget/pi-autoresearch/src/runtime.ts";
import { type RunAkCommandResult, runAkCommandAsync } from "./ak.ts";
import type {
  AutoresearchAkProjectorResult,
  AutoresearchAkTaskAnchor,
} from "./autoresearch-ak-projector.ts";

export const AUTORESEARCH_AK_LIFECYCLE_CONTRACT_VERSION = 1 as const;
export const AUTORESEARCH_AK_LIFECYCLE_OWNER = "pi-society-orchestrator" as const;
export const AUTORESEARCH_AK_LIFECYCLE_RUNTIME_OWNER = "pi-autoresearch" as const;

export type AutoresearchAkLifecycleAction =
  | "none"
  | "completed_task"
  | "already_terminal"
  | "blocked";

export interface AutoresearchAkLifecycleObservation {
  cwd: string;
  runtime: AutoresearchRuntimeStatus;
  finalization: InspectAutoresearchFinalizationResult;
}

export interface AutoresearchAkTaskCompletionResult extends Record<string, unknown> {
  contract_version: typeof AUTORESEARCH_AK_LIFECYCLE_CONTRACT_VERSION;
  completion_owner: typeof AUTORESEARCH_AK_LIFECYCLE_OWNER;
  runtime_owner: typeof AUTORESEARCH_AK_LIFECYCLE_RUNTIME_OWNER;
  lifecycle_key: string;
  cwd: string;
  summary: string;
  runtime: {
    state: "completed";
    completion_reason: string;
    run_count: number;
    best_metric: number | null;
  };
  finalization: {
    materialization_status: "succeeded";
    created_branches: string[];
  };
}

export interface AutoresearchAkLifecycleCandidate {
  kind: "complete_task" | "evidence_only" | "blocked";
  reason: string;
  result?: AutoresearchAkTaskCompletionResult;
}

export interface EvaluateAutoresearchAkLifecycleParams {
  taskId: number;
  akPath: string;
  societyDb: string;
  observation: AutoresearchAkLifecycleObservation;
  projector: AutoresearchAkProjectorResult;
  signal?: AbortSignal;
  runAk?: (params: {
    akPath: string;
    societyDb: string;
    args: string[];
    cwd?: string;
    signal?: AbortSignal;
  }) => Promise<RunAkCommandResult>;
}

export interface EvaluateAutoresearchAkLifecycleResult {
  ok: boolean;
  action: AutoresearchAkLifecycleAction;
  summary: string;
  error?: string;
  candidate?: AutoresearchAkLifecycleCandidate;
  task?: AutoresearchAkTaskAnchor;
  result?: AutoresearchAkTaskCompletionResult;
}

interface RawTaskAnchor {
  id?: unknown;
  repo?: unknown;
  title?: unknown;
  status?: unknown;
  entity_version?: unknown;
}

export function deriveAutoresearchAkLifecycleCandidate(input: {
  observation: AutoresearchAkLifecycleObservation;
  projector: AutoresearchAkProjectorResult;
}): AutoresearchAkLifecycleCandidate {
  if (input.projector.action === "blocked" || input.projector.ok === false) {
    const reason = input.projector.error || input.projector.candidate.reason;
    return {
      kind: "blocked",
      reason,
    };
  }

  const payload = input.projector.candidate.payload;
  if (input.projector.candidate.kind !== "projectable" || !payload) {
    return {
      kind: "evidence_only",
      reason: input.projector.candidate.reason,
    };
  }

  if (payload.details.milestone !== "completed") {
    return {
      kind: "evidence_only",
      reason: input.projector.candidate.reason,
    };
  }

  if (input.projector.action !== "recorded" && input.projector.action !== "already-projected") {
    return {
      kind: "evidence_only",
      reason:
        "Completed milestone evidence is not durably recorded yet; AK completion stays evidence-only.",
    };
  }

  if (input.observation.runtime.runtimeProjection.state !== "completed") {
    return {
      kind: "evidence_only",
      reason: "Package runtime is not in completed state; AK completion stays evidence-only.",
    };
  }

  const completionReason = normalizeText(
    input.observation.runtime.runtimeProjection.completionReason ||
      payload.details.runtime.completion_reason,
  );
  if (!completionReason) {
    return {
      kind: "evidence_only",
      reason: "Runtime completion reason is missing; AK completion stays evidence-only.",
    };
  }

  const plan = input.observation.finalization.plan;
  if (!plan) {
    return {
      kind: "evidence_only",
      reason: "Finalization plan is missing; AK completion stays evidence-only.",
    };
  }

  if (plan.materialization.status !== "succeeded") {
    return {
      kind: "evidence_only",
      reason: `Finalization materialization is ${plan.materialization.status}; AK completion stays evidence-only.`,
    };
  }

  const createdBranches = normalizeBranches(plan.materialization.createdBranches);
  if (createdBranches.length === 0) {
    return {
      kind: "evidence_only",
      reason:
        "Finalization plan does not list created review branches; AK completion stays evidence-only.",
    };
  }

  return {
    kind: "complete_task",
    reason: "Autoresearch campaign completed after verified local finalization materialization.",
    result: buildAutoresearchAkTaskCompletionResult({
      cwd: path.resolve(input.observation.cwd),
      segmentName: payload.details.segment.name,
      runCount: payload.details.runtime.run_count,
      completionReason,
      bestMetric: payload.details.runtime.best_metric,
      createdBranches,
    }),
  };
}

export async function evaluateAutoresearchAkLifecycle(
  params: EvaluateAutoresearchAkLifecycleParams,
): Promise<EvaluateAutoresearchAkLifecycleResult> {
  const candidate = deriveAutoresearchAkLifecycleCandidate({
    observation: params.observation,
    projector: params.projector,
  });

  if (candidate.kind === "blocked") {
    return {
      ok: false,
      action: "blocked",
      summary: candidate.reason,
      error: candidate.reason,
      candidate,
    };
  }

  if (candidate.kind !== "complete_task" || !candidate.result) {
    return {
      ok: true,
      action: "none",
      summary: candidate.reason,
      candidate,
    };
  }

  const task = await loadTaskAnchor({
    akPath: params.akPath,
    societyDb: params.societyDb,
    taskId: params.taskId,
    cwd: params.observation.cwd,
    signal: params.signal,
    runAk: params.runAk,
  });

  if (!task.ok) {
    return {
      ok: false,
      action: "blocked",
      summary: task.error,
      error: task.error,
      candidate,
    };
  }

  const taskStatus = normalizeTaskStatus(task.value.status);
  if (isTerminalTaskStatus(taskStatus)) {
    return {
      ok: true,
      action: "already_terminal",
      summary: `AK task ${params.taskId} is already ${taskStatus}.`,
      candidate,
      task: task.value,
      result: candidate.result,
    };
  }

  if (!isWithinRepo(candidate.result.cwd, task.value.repo)) {
    const error = `campaign cwd ${candidate.result.cwd} is outside anchored task repo ${task.value.repo}`;
    return {
      ok: false,
      action: "blocked",
      summary: error,
      error,
      candidate,
      task: task.value,
      result: candidate.result,
    };
  }

  const complete = await (params.runAk || runAkCommandAsync)({
    akPath: params.akPath,
    societyDb: params.societyDb,
    args: ["task", "complete", String(params.taskId), "--result", JSON.stringify(candidate.result)],
    cwd: task.value.repo,
    signal: params.signal,
  });

  if (!complete.ok) {
    const error = complete.stderr || `ak task complete ${params.taskId} failed`;
    return {
      ok: false,
      action: "blocked",
      summary: error,
      error,
      candidate,
      task: task.value,
      result: candidate.result,
    };
  }

  return {
    ok: true,
    action: "completed_task",
    summary: `AK task ${params.taskId} completed after verified local finalization materialization.`,
    candidate,
    task: task.value,
    result: candidate.result,
  };
}

export function buildAutoresearchAkTaskCompletionResult(input: {
  cwd: string;
  segmentName: string;
  runCount: number;
  completionReason: string;
  bestMetric: number | null;
  createdBranches: readonly string[];
}): AutoresearchAkTaskCompletionResult {
  const completionReason = normalizeText(input.completionReason) || "campaign completed";
  const createdBranches = normalizeBranches(input.createdBranches);

  return {
    contract_version: AUTORESEARCH_AK_LIFECYCLE_CONTRACT_VERSION,
    completion_owner: AUTORESEARCH_AK_LIFECYCLE_OWNER,
    runtime_owner: AUTORESEARCH_AK_LIFECYCLE_RUNTIME_OWNER,
    lifecycle_key: buildAutoresearchAkLifecycleKey({
      segmentName: input.segmentName,
      runCount: input.runCount,
      completionReason,
      branchCount: createdBranches.length,
    }),
    cwd: path.resolve(input.cwd),
    summary: "Autoresearch campaign completed after verified local finalization materialization.",
    runtime: {
      state: "completed",
      completion_reason: completionReason,
      run_count: input.runCount,
      best_metric: input.bestMetric,
    },
    finalization: {
      materialization_status: "succeeded",
      created_branches: createdBranches,
    },
  };
}

export function buildAutoresearchAkLifecycleKey(input: {
  segmentName: string;
  runCount: number;
  completionReason: string;
  branchCount: number;
}): string {
  return [
    "complete",
    `segment:${encodeProjectionToken(input.segmentName)}`,
    `runs:${normalizeNonNegativeInteger(input.runCount)}`,
    `completed:${encodeProjectionToken(input.completionReason)}`,
    `branches:${normalizeNonNegativeInteger(input.branchCount)}`,
  ].join("|");
}

async function loadTaskAnchor(input: {
  akPath: string;
  societyDb: string;
  taskId: number;
  cwd: string;
  signal?: AbortSignal;
  runAk?: (params: {
    akPath: string;
    societyDb: string;
    args: string[];
    cwd?: string;
    signal?: AbortSignal;
  }) => Promise<RunAkCommandResult>;
}): Promise<{ ok: true; value: AutoresearchAkTaskAnchor } | { ok: false; error: string }> {
  const runAk = input.runAk || runAkCommandAsync;
  const result = await runAk({
    akPath: input.akPath,
    societyDb: input.societyDb,
    args: ["task", "show", String(input.taskId), "-F", "json"],
    cwd: input.cwd,
    signal: input.signal,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr || `ak task show ${input.taskId} failed`,
    };
  }

  return parseTaskAnchor(result.stdout, input.taskId);
}

function parseTaskAnchor(
  stdout: string,
  expectedTaskId: number,
): { ok: true; value: AutoresearchAkTaskAnchor } | { ok: false; error: string } {
  let parsed: RawTaskAnchor;
  try {
    parsed = JSON.parse(stdout) as RawTaskAnchor;
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `failed to parse ak task show output: ${error.message}`
          : "failed to parse ak task show output",
    };
  }

  if (!Number.isInteger(parsed.id) || parsed.id !== expectedTaskId) {
    return {
      ok: false,
      error: `ak task show returned unexpected task id: ${String(parsed.id)}`,
    };
  }

  if (typeof parsed.repo !== "string" || parsed.repo.trim().length === 0) {
    return {
      ok: false,
      error: "ak task show did not include a repo path",
    };
  }

  return {
    ok: true,
    value: {
      id: parsed.id,
      repo: path.resolve(parsed.repo),
      title: typeof parsed.title === "string" ? parsed.title : undefined,
      status: typeof parsed.status === "string" ? parsed.status : undefined,
      entityVersion:
        typeof parsed.entity_version === "number" && Number.isFinite(parsed.entity_version)
          ? parsed.entity_version
          : undefined,
    },
  };
}

function normalizeTaskStatus(value: string | undefined): string | null {
  return normalizeText(value)?.toLowerCase() ?? null;
}

function isTerminalTaskStatus(status: string | null): status is "completed" | "done" | "failed" {
  return status === "completed" || status === "done" || status === "failed";
}

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBranches(value: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const branches: string[] = [];

  for (const entry of value || []) {
    const normalized = normalizeText(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    branches.push(normalized);
  }

  return branches;
}

function normalizeNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function encodeProjectionToken(value: string): string {
  return encodeURIComponent(value.trim() || "none");
}

function isWithinRepo(cwd: string, repoRoot: string): boolean {
  const resolvedCwd = path.resolve(cwd);
  const resolvedRepoRoot = path.resolve(repoRoot);
  return (
    resolvedCwd === resolvedRepoRoot || resolvedCwd.startsWith(`${resolvedRepoRoot}${path.sep}`)
  );
}

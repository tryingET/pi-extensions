import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  type AutoresearchDecisionRuntime,
  type FinalizeDecisionOutcome,
  type FinalizeDecisionPacket,
  type FinalizeDecisionResult,
} from "./decisions.ts";
import {
  AUTORESEARCH_PHASE,
  type AutoresearchConfigReceipt,
  type AutoresearchReceipt,
  type AutoresearchRunReceipt,
  type AutoresearchRuntimeStatus,
  buildAutoresearchRuntimeStatus,
  loadReceiptLog,
  requestAutoresearchFinalizeDecision,
} from "./runtime.ts";

export const AUTORESEARCH_FINALIZATION_PLAN_FILE = "autoresearch.finalization.json" as const;

export type AutoresearchFinalizationApprovalState =
  | "pending"
  | "approved"
  | "materialized"
  | "superseded";
export type AutoresearchFinalizationMaterializationStatus = "not_started" | "succeeded" | "failed";
export type AutoresearchFinalizationPlanReuse =
  | "unavailable"
  | "missing"
  | "reused"
  | "parse_failed"
  | "cwd_mismatch"
  | "source_branch_mismatch"
  | "trunk_mismatch"
  | "base_mismatch"
  | "final_tree_mismatch"
  | "runtime_mismatch";

export interface AutoresearchFinalizationGroupDraftV1 {
  title: string;
  body: string;
  last_commit: string;
  slug: string;
}

export interface AutoresearchFinalizationGroupsJsonDraftV1 {
  base: string;
  trunk: string;
  final_tree: string;
  goal: string;
  groups: AutoresearchFinalizationGroupDraftV1[];
}

export interface AutoresearchFinalizationGroupV1 {
  index: number;
  title: string;
  slug: string;
  branchName: string;
  lastCommit: string;
  commits: string[];
  files: string[];
  metricEffect: string;
  dependencyNotes: string[];
  body: string;
}

export interface AutoresearchFinalizationPlanV1 {
  type: "finalization_plan";
  version: 1;
  phase: typeof AUTORESEARCH_PHASE;
  cwd: string;
  sourceBranch: string;
  trunkRef: string;
  baseRef: string;
  finalTree: string;
  goalSlug: string;
  segmentKey: string | null;
  runtimeKey: string | null;
  projectionSource: "ledger" | "receipt_fallback";
  createdAt: number;
  decision: {
    templateName: typeof AUTORESEARCH_FINALIZE_TEMPLATE_NAME;
    overallResult: string;
    groupingRationale: string[];
    riskNotes: string[];
    cleanupHints: string[];
  };
  groups: AutoresearchFinalizationGroupV1[];
  groupsJsonDraft: AutoresearchFinalizationGroupsJsonDraftV1;
  approval: {
    required: true;
    state: AutoresearchFinalizationApprovalState;
    reason: string | null;
    approvedAt: number | null;
  };
  materialization: {
    status: AutoresearchFinalizationMaterializationStatus;
    createdBranches: string[];
    verifiedAt: number | null;
    failureReason: string | null;
  };
}

export interface AutoresearchFinalizationPlanStatus {
  path?: string;
  exists: boolean;
  reuse: AutoresearchFinalizationPlanReuse;
  discardedReason: string | null;
  sourceBranch: string | null;
  trunkRef: string | null;
  baseRef: string | null;
  finalTree: string | null;
  runtimeKey: string | null;
}

export interface AutoresearchFinalizationGitContext {
  sourceBranch: string;
  trunkRef: string;
  baseRef: string;
  finalTree: string;
}

export interface AutoresearchKeptRunContext {
  receipt: AutoresearchRunReceipt;
  fullCommit: string;
  summary: string;
}

export interface AutoresearchFinalizationContext {
  cwd: string;
  status: AutoresearchRuntimeStatus;
  git: AutoresearchFinalizationGitContext;
  goalSlug: string;
  config: AutoresearchConfigReceipt;
  keptRuns: AutoresearchKeptRunContext[];
  packet: FinalizeDecisionPacket;
}

export interface CreateAutoresearchFinalizationContextInput {
  cwd: string;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
}

export interface PlanAutoresearchFinalizationFromDecisionInput {
  cwd: string;
  decision: FinalizeDecisionResult;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
  createdAt?: number;
}

export interface PlanAutoresearchFinalizationFromDecisionResult {
  cwd: string;
  status: AutoresearchRuntimeStatus;
  context: AutoresearchFinalizationContext;
  plan: AutoresearchFinalizationPlanV1;
  planPath: string;
}

export interface RequestAutoresearchFinalizationPlanInput {
  cwd: string;
  runtime: AutoresearchDecisionRuntime;
  currentCompany?: string;
  model?: string;
  signal?: AbortSignal;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
  createdAt?: number;
}

export interface RequestAutoresearchFinalizationPlanResult {
  cwd: string;
  packet: FinalizeDecisionPacket;
  decision: FinalizeDecisionResult;
  status: AutoresearchRuntimeStatus;
  plan: AutoresearchFinalizationPlanV1;
  planPath: string;
}

export interface LoadAutoresearchFinalizationPlanStateInput {
  cwd: string;
  status?: AutoresearchRuntimeStatus;
  trunkRef?: string;
}

export interface LoadAutoresearchFinalizationPlanStateResult {
  plan: AutoresearchFinalizationPlanV1 | null;
  planStatus: AutoresearchFinalizationPlanStatus;
  status: AutoresearchRuntimeStatus;
  git: AutoresearchFinalizationGitContext | null;
}

export function resolveAutoresearchFinalizationPlanPath(cwd: string): string {
  return path.join(path.resolve(cwd), AUTORESEARCH_FINALIZATION_PLAN_FILE);
}

export function isAutoresearchSessionArtifactPath(filePath: string): boolean {
  return path.basename(filePath).startsWith("autoresearch.");
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

export function collectAutoresearchGitContext(
  cwd: string,
  options: { trunkRef?: string; allowDetached?: boolean; allowTrunk?: boolean } = {},
): AutoresearchFinalizationGitContext {
  const resolvedCwd = path.resolve(cwd);
  const sourceBranch = runGitCommand(resolvedCwd, ["branch", "--show-current"]);
  if (!sourceBranch) {
    if (options.allowDetached) {
      throw new Error("Detached HEAD — finalization planning requires a source branch.");
    }
    throw new Error("Detached HEAD — finalization planning requires a source branch.");
  }

  const trunkRef = normalizeBranchRef(options.trunkRef ?? "main");
  if (!options.allowTrunk && normalizeBranchRef(sourceBranch) === trunkRef) {
    throw new Error(`On trunk (${trunkRef}) — finalization planning requires a feature branch.`);
  }

  const finalTree = normalizeCommitRef(resolvedCwd, "HEAD", "HEAD");
  const baseRef = normalizeCommitRef(
    resolvedCwd,
    runGitCommand(resolvedCwd, ["merge-base", "HEAD", trunkRef]),
    `merge-base(HEAD, ${trunkRef})`,
  );

  return {
    sourceBranch,
    trunkRef,
    baseRef,
    finalTree,
  };
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

export function parseAutoresearchFinalizationPlan(text: string): AutoresearchFinalizationPlanV1 {
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Finalization plan must decode to an object");
  }
  if (parsed.type !== "finalization_plan") {
    throw new Error(`Unsupported finalization plan type: ${String(parsed.type)}`);
  }
  if (parsed.version !== 1) {
    throw new Error(`Unsupported finalization plan version: ${String(parsed.version)}`);
  }
  if (parsed.phase !== AUTORESEARCH_PHASE) {
    throw new Error(`Unsupported finalization plan phase: ${String(parsed.phase)}`);
  }

  return {
    type: "finalization_plan",
    version: 1,
    phase: AUTORESEARCH_PHASE,
    cwd: coerceString(parsed.cwd, "cwd"),
    sourceBranch: coerceString(parsed.sourceBranch, "sourceBranch"),
    trunkRef: normalizeBranchRef(coerceString(parsed.trunkRef, "trunkRef")),
    baseRef: coerceString(parsed.baseRef, "baseRef"),
    finalTree: coerceString(parsed.finalTree, "finalTree"),
    goalSlug: normalizeGoalSlug(coerceString(parsed.goalSlug, "goalSlug")),
    segmentKey: parseNullableString(parsed.segmentKey, "segmentKey"),
    runtimeKey: parseNullableString(parsed.runtimeKey, "runtimeKey"),
    projectionSource: parseProjectionSource(parsed.projectionSource),
    createdAt: coerceNumber(parsed.createdAt, "createdAt"),
    decision: parseFinalizationDecisionSummary(parsed.decision),
    groups: parseFinalizationGroups(parsed.groups),
    groupsJsonDraft: parseFinalizationGroupsJsonDraft(parsed.groupsJsonDraft),
    approval: parseFinalizationApproval(parsed.approval),
    materialization: parseFinalizationMaterialization(parsed.materialization),
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
    return buildStalePlanState(
      plan,
      status,
      git,
      "runtime_mismatch",
      "plan runtime fingerprint no longer matches the current runtime posture",
    );
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

function listEffectiveGroupFiles(cwd: string, fromCommit: string, toCommit: string): string[] {
  const raw = runGitCommand(cwd, ["diff", "--name-only", "-z", fromCommit, toCommit], {
    trim: false,
  });

  return uniqueStrings(
    raw
      .split("\u0000")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => !isAutoresearchSessionArtifactPath(entry)),
  );
}

function ensureCommitReachableFrom(
  cwd: string,
  candidate: string,
  descendant: string,
  label: string,
): void {
  const result = spawnGit(cwd, ["merge-base", "--is-ancestor", candidate, descendant]);
  if (result.status === 0) {
    return;
  }
  throw new Error(`${label} is not reachable from source branch HEAD ${descendant}.`);
}

function ensureCommitDescendsFrom(
  cwd: string,
  previousCommit: string,
  nextCommit: string,
  label: string,
): void {
  const result = spawnGit(cwd, ["merge-base", "--is-ancestor", previousCommit, nextCommit]);
  if (result.status === 0) {
    return;
  }
  throw new Error(`${label} does not descend from the prior finalization point ${previousCommit}.`);
}

function parseFinalizationDecisionSummary(
  value: unknown,
): AutoresearchFinalizationPlanV1["decision"] {
  if (!isRecord(value)) {
    throw new Error("decision must be an object");
  }
  if (value.templateName !== AUTORESEARCH_FINALIZE_TEMPLATE_NAME) {
    throw new Error(`Unsupported decision template: ${String(value.templateName)}`);
  }
  return {
    templateName: AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
    overallResult: coerceString(value.overallResult, "decision.overallResult"),
    groupingRationale: parseStringArray(value.groupingRationale, "decision.groupingRationale"),
    riskNotes: parseStringArray(value.riskNotes, "decision.riskNotes"),
    cleanupHints: parseStringArray(value.cleanupHints, "decision.cleanupHints"),
  };
}

function parseFinalizationGroups(value: unknown): AutoresearchFinalizationGroupV1[] {
  if (!Array.isArray(value)) {
    throw new Error("groups must be an array");
  }
  return value.map((group, index) => parseFinalizationGroup(group, index));
}

function parseFinalizationGroup(value: unknown, index: number): AutoresearchFinalizationGroupV1 {
  if (!isRecord(value)) {
    throw new Error(`groups[${index}] must be an object`);
  }
  return {
    index: coerceNumber(value.index, `groups[${index}].index`),
    title: coerceString(value.title, `groups[${index}].title`),
    slug: normalizeGoalSlug(coerceString(value.slug, `groups[${index}].slug`)),
    branchName: coerceString(value.branchName, `groups[${index}].branchName`),
    lastCommit: coerceString(value.lastCommit, `groups[${index}].lastCommit`),
    commits: parseStringArray(value.commits, `groups[${index}].commits`),
    files: parseStringArray(value.files, `groups[${index}].files`),
    metricEffect: coerceString(value.metricEffect, `groups[${index}].metricEffect`),
    dependencyNotes: parseStringArray(value.dependencyNotes, `groups[${index}].dependencyNotes`),
    body: coerceString(value.body, `groups[${index}].body`),
  };
}

function parseFinalizationGroupsJsonDraft(
  value: unknown,
): AutoresearchFinalizationGroupsJsonDraftV1 {
  if (!isRecord(value)) {
    throw new Error("groupsJsonDraft must be an object");
  }
  const groupsValue = value.groups;
  if (!Array.isArray(groupsValue) || groupsValue.length === 0) {
    throw new Error("groupsJsonDraft.groups must be a non-empty array");
  }
  return {
    base: coerceString(value.base, "groupsJsonDraft.base"),
    trunk: normalizeBranchRef(coerceString(value.trunk, "groupsJsonDraft.trunk")),
    final_tree: coerceString(value.final_tree, "groupsJsonDraft.final_tree"),
    goal: normalizeGoalSlug(coerceString(value.goal, "groupsJsonDraft.goal")),
    groups: groupsValue.map((group, index) => parseFinalizationGroupDraft(group, index)),
  };
}

function parseFinalizationGroupDraft(
  value: unknown,
  index: number,
): AutoresearchFinalizationGroupDraftV1 {
  if (!isRecord(value)) {
    throw new Error(`groupsJsonDraft.groups[${index}] must be an object`);
  }
  return {
    title: coerceString(value.title, `groupsJsonDraft.groups[${index}].title`),
    body: coerceString(value.body, `groupsJsonDraft.groups[${index}].body`),
    last_commit: coerceString(value.last_commit, `groupsJsonDraft.groups[${index}].last_commit`),
    slug: normalizeGoalSlug(coerceString(value.slug, `groupsJsonDraft.groups[${index}].slug`)),
  };
}

function parseFinalizationApproval(value: unknown): AutoresearchFinalizationPlanV1["approval"] {
  if (!isRecord(value)) {
    throw new Error("approval must be an object");
  }
  const state = coerceString(value.state, "approval.state");
  if (
    state !== "pending" &&
    state !== "approved" &&
    state !== "materialized" &&
    state !== "superseded"
  ) {
    throw new Error(`Unsupported approval state: ${state}`);
  }
  return {
    required: true,
    state,
    reason: parseNullableString(value.reason, "approval.reason"),
    approvedAt: parseNullableNumber(value.approvedAt, "approval.approvedAt"),
  };
}

function parseFinalizationMaterialization(
  value: unknown,
): AutoresearchFinalizationPlanV1["materialization"] {
  if (!isRecord(value)) {
    throw new Error("materialization must be an object");
  }
  const status = coerceString(value.status, "materialization.status");
  if (status !== "not_started" && status !== "succeeded" && status !== "failed") {
    throw new Error(`Unsupported materialization status: ${status}`);
  }
  return {
    status,
    createdBranches: parseStringArray(value.createdBranches, "materialization.createdBranches"),
    verifiedAt: parseNullableNumber(value.verifiedAt, "materialization.verifiedAt"),
    failureReason: parseNullableString(value.failureReason, "materialization.failureReason"),
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

function parseProjectionSource(value: unknown): "ledger" | "receipt_fallback" {
  if (value === "ledger" || value === "receipt_fallback") {
    return value;
  }
  throw new Error(`Unsupported projection source: ${String(value)}`);
}

function normalizeCommitRef(cwd: string, ref: string, field: string): string {
  const normalized = ref.trim();
  if (!normalized) {
    throw new Error(`${field} must be a non-empty commit reference.`);
  }
  return runGitCommand(cwd, ["rev-parse", "--verify", `${normalized}^{commit}`]);
}

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function normalizeGoalSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");
  if (!slug) {
    throw new Error(`Cannot derive a non-empty slug from ${JSON.stringify(value)}.`);
  }
  return slug;
}

function normalizeBranchRef(value: string): string {
  return value.trim().replace(/^refs\/heads\//u, "") || "main";
}

function coerceString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function coerceNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`);
  }
  return value;
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return coerceString(value, field);
}

function parseNullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return coerceNumber(value, field);
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value.map((entry, index) => coerceString(entry, `${field}[${index}]`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function isDecisionErrorOutcome(
  outcome: FinalizeDecisionOutcome,
): outcome is Extract<FinalizeDecisionOutcome, { failureStage: string }> {
  return "failureStage" in outcome;
}

function runGitCommand(cwd: string, args: string[], options: { trim?: boolean } = {}): string {
  const result = spawnGit(cwd, args);
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
  const stdout = result.stdout ?? "";
  return options.trim === false ? stdout : stdout.trim();
}

function spawnGit(cwd: string, args: string[]) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

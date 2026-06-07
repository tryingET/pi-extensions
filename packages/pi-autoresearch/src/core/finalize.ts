import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  type FinalizeDecisionOutcome,
  type FinalizeDecisionPacket,
  type FinalizeDecisionResult,
} from "./decisions.ts";
import {
  normalizeBranchRef,
  normalizeGoalSlug,
  parseFinalizationGroupsJsonDraft,
} from "./finalize-codec.ts";
import {
  collectAutoresearchGitContext,
  ensureCommitDescendsFrom,
  ensureCommitReachableFrom,
  listEffectiveGroupFiles,
  normalizeCommitRef,
  runGitCommand,
  uniqueStrings,
} from "./finalize-git.ts";
import {
  assertAutoresearchFinalizeControlSelected,
  materializeAutoresearchFinalizationPlan,
  normalizeInlineReason,
  requireFreshAutoresearchFinalizationPlan,
  validateStoredAutoresearchFinalizationPlan,
} from "./finalize-materialization.ts";
import {
  type ApproveAutoresearchFinalizationPlanInput,
  type ApproveAutoresearchFinalizationPlanResult,
  AUTORESEARCH_FINALIZATION_PLAN_FILE,
  type AutoresearchFinalizationContext,
  type AutoresearchFinalizationGroupDraftV1,
  type AutoresearchFinalizationGroupsJsonDraftV1,
  type AutoresearchFinalizationGroupV1,
  type AutoresearchFinalizationPlanV1,
  type AutoresearchKeptRunContext,
  type CreateAutoresearchFinalizationContextInput,
  type ExecuteAutoresearchFinalizationInput,
  type ExecuteAutoresearchFinalizationResult,
  type PlanAutoresearchFinalizationFromDecisionInput,
  type PlanAutoresearchFinalizationFromDecisionResult,
  type RequestAutoresearchFinalizationPlanInput,
  type RequestAutoresearchFinalizationPlanResult,
} from "./finalize-model.ts";
import { inspectAutoresearchFinalization } from "./finalize-state.ts";
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
  inspectAutoresearchFinalization,
  loadAutoresearchFinalizationPlan,
  loadAutoresearchFinalizationPlanState,
} from "./finalize-state.ts";

export function resolveAutoresearchFinalizationPlanPath(cwd: string): string {
  return path.join(path.resolve(cwd), AUTORESEARCH_FINALIZATION_PLAN_FILE);
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

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function isDecisionErrorOutcome(
  outcome: FinalizeDecisionOutcome,
): outcome is Extract<FinalizeDecisionOutcome, { failureStage: string }> {
  return "failureStage" in outcome;
}

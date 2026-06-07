import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { campaignEvents } from "../machine/events.ts";
import { describeAutoresearchFinalizationVerificationFailure } from "./finalize-format.ts";
import {
  assertAutoresearchCleanWorktree,
  assertAutoresearchDestinationBranchesAvailable,
  checkoutAutoresearchBranch,
  checkoutAutoresearchDetached,
  ensureCommitDescendsFrom,
  ensureCommitReachableFrom,
  isAutoresearchSessionArtifactPath,
  listBranchCommitFiles,
  listEffectiveGroupFiles,
  readSingleParentCommit,
  rollbackAutoresearchMaterializationBranches,
  runGitCommand,
  spawnGit,
  tryResolveGitPathObject,
  uniqueStrings,
} from "./finalize-git.ts";
import {
  AUTORESEARCH_FINALIZATION_PLAN_FILE,
  type AutoresearchFinalizationGroupV1,
  type AutoresearchFinalizationPlanV1,
  type AutoresearchFinalizationVerificationResult,
  type InspectAutoresearchFinalizationResult,
  type MaterializeAutoresearchFinalizationPlanInput,
  type MaterializeAutoresearchFinalizationPlanResult,
} from "./finalize-model.ts";
import { inspectAutoresearchFinalization } from "./finalize-state.ts";
import { appendLedgerEvent, createLedgerEventEntry } from "./ledger.ts";
import {
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  type AutoresearchRuntimeStatus,
  buildAutoresearchRuntimeStatus,
} from "./runtime.ts";

export function materializeAutoresearchFinalizationPlan(
  input: MaterializeAutoresearchFinalizationPlanInput,
): MaterializeAutoresearchFinalizationPlanResult {
  const cwd = path.resolve(input.cwd);
  const current = inspectAutoresearchFinalization({
    cwd,
    status: input.status,
    trunkRef: input.trunkRef,
  });
  const plan = requireFreshAutoresearchFinalizationPlan(current, "materialize");
  assertAutoresearchFinalizeControlSelected(current.status, "materialize");
  validateStoredAutoresearchFinalizationPlan(cwd, plan);

  if (plan.approval.state === "materialized" || plan.materialization.status === "succeeded") {
    throw new Error("Finalization plan is already materialized.");
  }
  if (plan.approval.state !== "approved") {
    throw new Error(
      `Cannot materialize finalization while approval state is ${plan.approval.state}; approve the plan first.`,
    );
  }

  assertAutoresearchCleanWorktree(cwd);
  assertAutoresearchDestinationBranchesAvailable(
    cwd,
    plan.groups.map((group) => group.branchName),
  );

  const createdBranches: string[] = [];
  let pendingBranch: string | null = null;
  let creationCompleted = false;
  const verifiedAt = input.materializedAt ?? Date.now();

  try {
    for (const group of plan.groups) {
      input.testHooks?.beforeCreateGroup?.(group);
      pendingBranch = group.branchName;
      createAutoresearchMaterializationBranch(cwd, plan, group);
      createdBranches.push(group.branchName);
      pendingBranch = null;
    }
    creationCompleted = true;

    checkoutAutoresearchBranch(cwd, plan.sourceBranch, true);
    input.testHooks?.beforeVerify?.({
      cwd,
      plan,
      createdBranches: [...createdBranches],
      sourceBranch: plan.sourceBranch,
    });

    const verification = verifyAutoresearchFinalizationMaterialization({
      cwd,
      plan,
      createdBranches,
    });
    if (!verification.ok) {
      throw new Error(describeAutoresearchFinalizationVerificationFailure(verification));
    }

    appendLedgerEvent(
      cwd,
      createLedgerEventEntry(
        campaignEvents.acceptFinalize(
          normalizeInlineReason(input.reason) ??
            "local finalization branches materialized and verified",
        ),
      ),
    );
    const status = buildAutoresearchRuntimeStatus(cwd, { persistSnapshot: true });

    writeAutoresearchMaterializationPlan(cwd, {
      ...plan,
      approval: {
        ...plan.approval,
        state: "materialized",
      },
      materialization: {
        status: "succeeded",
        createdBranches: [...createdBranches],
        verifiedAt,
        failureReason: null,
      },
    });

    const next = inspectAutoresearchFinalization({
      cwd,
      status,
      trunkRef: input.trunkRef,
    });
    return {
      ...next,
      createdBranches: [...createdBranches],
      verification,
    };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    try {
      checkoutAutoresearchBranch(cwd, plan.sourceBranch, true);
    } catch {
      // Best effort: the original source branch may already be checked out.
    }

    if (!creationCompleted) {
      rollbackAutoresearchMaterializationBranches(
        cwd,
        uniqueStrings(
          [...createdBranches, pendingBranch].filter((value): value is string => Boolean(value)),
        ),
      );
      persistAutoresearchMaterializationFailure(cwd, plan, [], failureReason);
    } else {
      persistAutoresearchMaterializationFailure(cwd, plan, createdBranches, failureReason);
    }
    throw error;
  }
}

export function verifyAutoresearchFinalizationMaterialization(input: {
  cwd: string;
  plan: AutoresearchFinalizationPlanV1;
  createdBranches?: readonly string[];
}): AutoresearchFinalizationVerificationResult {
  const cwd = path.resolve(input.cwd);
  const plan = input.plan;
  const groupedFiles = uniqueStrings(plan.groups.flatMap((group) => group.files));
  const finalTreeFiles = listEffectiveGroupFiles(cwd, plan.baseRef, plan.finalTree);
  const groupedFileSet = new Set(groupedFiles);
  const finalTreeFileSet = new Set(finalTreeFiles);
  const missingFinalTreeFiles = finalTreeFiles.filter((file) => !groupedFileSet.has(file));
  const unexpectedFinalTreeFiles = groupedFiles.filter((file) => !finalTreeFileSet.has(file));
  const blobMismatches: string[] = [];
  const branchFileMismatches: string[] = [];
  const nonIndependentBranches: string[] = [];
  const sessionArtifactLeaks: string[] = [];
  const emptyBranches: string[] = [];
  const createdBranchSet = new Set(
    input.createdBranches ?? plan.groups.map((group) => group.branchName),
  );

  for (const group of plan.groups) {
    if (!createdBranchSet.has(group.branchName)) {
      branchFileMismatches.push(`${group.branchName}: branch was not created`);
      continue;
    }

    const branchFilesWithSession = listBranchCommitFiles(cwd, group.branchName);
    const branchSessionFiles = branchFilesWithSession.filter((file) =>
      isAutoresearchSessionArtifactPath(file),
    );
    sessionArtifactLeaks.push(...branchSessionFiles.map((file) => `${group.branchName}:${file}`));

    const branchFiles = branchFilesWithSession.filter(
      (file) => !isAutoresearchSessionArtifactPath(file),
    );
    if (branchFiles.length === 0) {
      emptyBranches.push(group.branchName);
    }
    if (!sameStringArray(branchFiles, group.files)) {
      branchFileMismatches.push(
        `${group.branchName}: expected ${group.files.join(", ")} but saw ${branchFiles.join(", ") || "(none)"}`,
      );
    }

    const parentCommit = readSingleParentCommit(cwd, group.branchName);
    if (parentCommit !== plan.baseRef) {
      nonIndependentBranches.push(group.branchName);
    }

    for (const file of group.files) {
      const branchBlob = tryResolveGitPathObject(cwd, group.branchName, file);
      const finalTreeBlob = tryResolveGitPathObject(cwd, plan.finalTree, file);
      if (branchBlob !== finalTreeBlob) {
        blobMismatches.push(`${group.branchName}:${file}`);
      }
    }
  }

  const unionMatchesFinalTree =
    missingFinalTreeFiles.length === 0 &&
    unexpectedFinalTreeFiles.length === 0 &&
    blobMismatches.length === 0;

  return {
    ok:
      unionMatchesFinalTree &&
      branchFileMismatches.length === 0 &&
      nonIndependentBranches.length === 0 &&
      sessionArtifactLeaks.length === 0 &&
      emptyBranches.length === 0,
    unionMatchesFinalTree,
    missingFinalTreeFiles,
    unexpectedFinalTreeFiles,
    blobMismatches,
    branchFileMismatches,
    nonIndependentBranches,
    sessionArtifactLeaks,
    emptyBranches,
  };
}

export function requireFreshAutoresearchFinalizationPlan(
  inspection: InspectAutoresearchFinalizationResult,
  action: "approve" | "materialize",
): AutoresearchFinalizationPlanV1 {
  if (!inspection.plan || inspection.planStatus.reuse !== "reused" || !inspection.git) {
    throw new Error(
      `Cannot ${action} finalization without a fresh plan; use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=plan first.`,
    );
  }
  return inspection.plan;
}

export function validateStoredAutoresearchFinalizationPlan(
  cwd: string,
  plan: AutoresearchFinalizationPlanV1,
): void {
  if (plan.groups.length === 0) {
    throw new Error("Finalization plan must include at least one group.");
  }
  if (plan.groupsJsonDraft.base !== plan.baseRef) {
    throw new Error("Finalization plan draft base no longer matches plan.baseRef.");
  }
  if (plan.groupsJsonDraft.final_tree !== plan.finalTree) {
    throw new Error("Finalization plan draft final_tree no longer matches plan.finalTree.");
  }
  if (plan.groupsJsonDraft.trunk !== plan.trunkRef) {
    throw new Error("Finalization plan draft trunk no longer matches plan.trunkRef.");
  }
  if (plan.groupsJsonDraft.goal !== plan.goalSlug) {
    throw new Error("Finalization plan draft goal no longer matches plan.goalSlug.");
  }

  const seenFiles = new Set<string>();
  let previousCommit = plan.baseRef;
  for (const [index, group] of plan.groups.entries()) {
    const expectedIndex = index + 1;
    if (group.index !== expectedIndex) {
      throw new Error(
        `Finalization group index ${group.index} does not match position ${expectedIndex}.`,
      );
    }
    const expectedBranchName = `autoresearch/${plan.goalSlug}/${String(expectedIndex).padStart(2, "0")}-${group.slug}`;
    if (group.branchName !== expectedBranchName) {
      throw new Error(
        `Finalization group ${expectedIndex} branch ${group.branchName} does not match deterministic branch ${expectedBranchName}.`,
      );
    }
    if (!group.commits.includes(group.lastCommit)) {
      throw new Error(`Finalization group ${expectedIndex} commits must include lastCommit.`);
    }

    ensureCommitReachableFrom(cwd, group.lastCommit, plan.finalTree, group.lastCommit);
    ensureCommitDescendsFrom(cwd, previousCommit, group.lastCommit, group.lastCommit);

    const expectedFiles = listEffectiveGroupFiles(cwd, previousCommit, group.lastCommit);
    if (!sameStringArray(group.files, expectedFiles)) {
      throw new Error(
        `Finalization group ${expectedIndex} files no longer match the current repo history.`,
      );
    }
    if (group.files.length === 0) {
      throw new Error(`Finalization group ${expectedIndex} has no non-session files.`);
    }
    for (const file of group.files) {
      if (isAutoresearchSessionArtifactPath(file)) {
        throw new Error(
          `Finalization group ${expectedIndex} still includes session artifact ${file}.`,
        );
      }
      if (seenFiles.has(file)) {
        throw new Error(`File ${JSON.stringify(file)} appears in multiple finalization groups.`);
      }
      seenFiles.add(file);
    }
    previousCommit = group.lastCommit;
  }

  if (plan.groups.at(-1)?.lastCommit !== plan.finalTree) {
    throw new Error("Finalization plan does not reach the current final tree.");
  }

  const finalTreeFiles = listEffectiveGroupFiles(cwd, plan.baseRef, plan.finalTree);
  if (
    !sameStringArray(uniqueStrings(plan.groups.flatMap((group) => group.files)), finalTreeFiles)
  ) {
    throw new Error("Finalization groups do not cover the source branch final tree exactly.");
  }
}

export function assertAutoresearchFinalizeControlSelected(
  status: AutoresearchRuntimeStatus,
  action: "approve" | "materialize",
): void {
  if (status.control.kind !== "finalize") {
    throw new Error(
      `Cannot ${action} finalization while control state is ${status.control.kind}; select finalize with autoresearch_runtime_control first.`,
    );
  }
}

function createAutoresearchMaterializationBranch(
  cwd: string,
  plan: AutoresearchFinalizationPlanV1,
  group: AutoresearchFinalizationGroupV1,
): void {
  checkoutAutoresearchDetached(cwd, plan.baseRef);
  runGitCommand(cwd, ["checkout", "--quiet", "-b", group.branchName]);

  for (const file of group.files) {
    applyAutoresearchMaterializedFile(cwd, group.lastCommit, file);
  }

  const staged = spawnGit(cwd, ["diff", "--cached", "--quiet"]);
  if (staged.status === 0) {
    throw new Error(`Finalization group ${group.index} would create an empty review commit.`);
  }

  runGitCommand(cwd, ["commit", "--quiet", "-m", group.title, "-m", group.body]);
}

function applyAutoresearchMaterializedFile(cwd: string, commitRef: string, file: string): void {
  if (tryResolveGitPathObject(cwd, commitRef, file) !== null) {
    runGitCommand(cwd, ["checkout", commitRef, "--", file], { trim: false });
    return;
  }
  runGitCommand(cwd, ["rm", "--quiet", "--ignore-unmatch", "--", file], { trim: false });
}

function persistAutoresearchMaterializationFailure(
  cwd: string,
  plan: AutoresearchFinalizationPlanV1,
  createdBranches: readonly string[],
  failureReason: string,
): void {
  try {
    writeAutoresearchMaterializationPlan(cwd, {
      ...plan,
      materialization: {
        status: "failed",
        createdBranches: [...createdBranches],
        verifiedAt: null,
        failureReason,
      },
    });
  } catch {
    // Best effort only: preserve the original failure over plan-write issues.
  }
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  if (sortedLeft.length !== sortedRight.length) {
    return false;
  }
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

export function normalizeInlineReason(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0 ? normalized : null;
}

function writeAutoresearchMaterializationPlan(
  cwd: string,
  plan: AutoresearchFinalizationPlanV1,
): void {
  const planPath = path.join(path.resolve(cwd), AUTORESEARCH_FINALIZATION_PLAN_FILE);
  mkdirSync(path.dirname(planPath), { recursive: true });
  writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

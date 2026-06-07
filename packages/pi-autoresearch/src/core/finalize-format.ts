import type {
  ApproveAutoresearchFinalizationPlanResult,
  AutoresearchFinalizationPlanReuse,
  AutoresearchFinalizationVerificationResult,
  ExecuteAutoresearchFinalizationResult,
  InspectAutoresearchFinalizationResult,
  LoadAutoresearchFinalizationPlanStateResult,
  MaterializeAutoresearchFinalizationPlanResult,
} from "./finalize-model.ts";
import { AUTORESEARCH_FINALIZE_TOOL_NAME } from "./runtime.ts";

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

export function formatAutoresearchFinalizationResult(
  result:
    | ExecuteAutoresearchFinalizationResult
    | InspectAutoresearchFinalizationResult
    | ApproveAutoresearchFinalizationPlanResult
    | MaterializeAutoresearchFinalizationPlanResult,
): string {
  const plan = result.plan;
  const verification = "verification" in result ? result.verification : null;
  const disposition = "disposition" in result ? result.disposition : "status";
  const action = "action" in result ? result.action : "status";

  return [
    "# PI-AUTORESEARCH FINALIZE",
    "",
    `- cwd: ${result.cwd}`,
    `- action: ${action}`,
    `- disposition: ${disposition}`,
    `- machine state: ${result.status.runtimeProjection.state}`,
    `- control state: ${result.status.control.kind}`,
    `- plan path: ${result.planPath}`,
    `- plan reuse: ${formatAutoresearchFinalizationPlanReuse(result.planStatus.reuse)}`,
    `- plan discard reason: ${result.planStatus.discardedReason ?? "(none)"}`,
    plan ? `- source branch: ${plan.sourceBranch}` : "- source branch: (none)",
    plan ? `- trunk ref: ${plan.trunkRef}` : "- trunk ref: (none)",
    plan ? `- base ref: ${plan.baseRef}` : "- base ref: (none)",
    plan ? `- final tree: ${plan.finalTree}` : "- final tree: (none)",
    plan ? `- groups: ${plan.groups.length}` : "- groups: 0",
    plan ? `- approval state: ${plan.approval.state}` : "- approval state: (none)",
    plan ? `- approval reason: ${plan.approval.reason ?? "(none)"}` : "- approval reason: (none)",
    plan
      ? `- materialization status: ${plan.materialization.status}`
      : "- materialization status: (none)",
    plan
      ? `- materialization failure: ${plan.materialization.failureReason ?? "(none)"}`
      : "- materialization failure: (none)",
    `- created branches: ${formatCreatedBranches(plan?.materialization.createdBranches ?? [])}`,
    `- next step: ${result.nextStep}`,
    ...(verification
      ? [
          "",
          "## Verification",
          `- ok: ${verification.ok ? "yes" : "no"}`,
          `- union matches final tree: ${verification.unionMatchesFinalTree ? "yes" : "no"}`,
          `- missing final-tree files: ${formatCreatedBranches(verification.missingFinalTreeFiles)}`,
          `- unexpected final-tree files: ${formatCreatedBranches(verification.unexpectedFinalTreeFiles)}`,
          `- blob mismatches: ${formatCreatedBranches(verification.blobMismatches)}`,
          `- branch file mismatches: ${formatCreatedBranches(verification.branchFileMismatches)}`,
          `- non-independent branches: ${formatCreatedBranches(verification.nonIndependentBranches)}`,
          `- session artifact leaks: ${formatCreatedBranches(verification.sessionArtifactLeaks)}`,
          `- empty branches: ${formatCreatedBranches(verification.emptyBranches)}`,
        ]
      : []),
    ...(plan
      ? [
          "",
          "## Planned groups",
          ...plan.groups.map(
            (group) =>
              `- [${group.index}] ${group.branchName} <- ${group.lastCommit.slice(0, 12)} (${group.files.length} files)`,
          ),
        ]
      : []),
  ].join("\n");
}

export function describeAutoresearchFinalizationNextStep(
  state: LoadAutoresearchFinalizationPlanStateResult,
): string {
  if (!state.plan || state.planStatus.reuse !== "reused") {
    if (state.planStatus.exists && state.planStatus.reuse !== "reused") {
      return `Use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=plan to refresh the current finalization plan.`;
    }
    if (
      state.status.runtimeProjection.state === "finalize_candidate" ||
      state.status.control.kind === "finalize"
    ) {
      return `Use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=plan to generate a checked finalization plan.`;
    }
    return `Choose finalize with autoresearch_runtime_control once the runtime is finalize-worthy, then use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=plan.`;
  }

  if (
    state.plan.approval.state === "materialized" &&
    state.plan.materialization.status === "succeeded"
  ) {
    return "Local review branches are ready; the bounded runtime finalization slice is complete.";
  }

  if (state.status.control.kind !== "finalize") {
    return "Set autoresearch_runtime_control to finalize before approving or materializing the current plan.";
  }

  if (state.plan.approval.state === "pending") {
    return `Use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=approve to record explicit operator approval.`;
  }

  if (state.plan.materialization.status === "failed") {
    return `Clean the repo intentionally, inspect any created branches, then rerun ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=materialize.`;
  }

  if (state.plan.approval.state === "approved") {
    return `Use ${AUTORESEARCH_FINALIZE_TOOL_NAME} with action=materialize to create local review branches from ${state.plan.baseRef.slice(0, 12)}.`;
  }

  return `Inspect the plan and continue with ${AUTORESEARCH_FINALIZE_TOOL_NAME}.`;
}

export function describeAutoresearchFinalizationVerificationFailure(
  verification: AutoresearchFinalizationVerificationResult,
): string {
  const problems: string[] = [];
  if (verification.missingFinalTreeFiles.length > 0) {
    problems.push(`missing final-tree files: ${verification.missingFinalTreeFiles.join(", ")}`);
  }
  if (verification.unexpectedFinalTreeFiles.length > 0) {
    problems.push(
      `unexpected final-tree files: ${verification.unexpectedFinalTreeFiles.join(", ")}`,
    );
  }
  if (verification.blobMismatches.length > 0) {
    problems.push(`blob mismatches: ${verification.blobMismatches.join(", ")}`);
  }
  if (verification.branchFileMismatches.length > 0) {
    problems.push(`branch file mismatches: ${verification.branchFileMismatches.join("; ")}`);
  }
  if (verification.nonIndependentBranches.length > 0) {
    problems.push(`non-independent branches: ${verification.nonIndependentBranches.join(", ")}`);
  }
  if (verification.sessionArtifactLeaks.length > 0) {
    problems.push(`session artifact leaks: ${verification.sessionArtifactLeaks.join(", ")}`);
  }
  if (verification.emptyBranches.length > 0) {
    problems.push(`empty branches: ${verification.emptyBranches.join(", ")}`);
  }
  return problems.length > 0
    ? `Finalization verification failed — ${problems.join(" | ")}`
    : "Finalization verification failed.";
}

function formatCreatedBranches(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

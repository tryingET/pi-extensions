import {
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE,
  AUTORESEARCH_LEARNING_EXPORT_FILE,
  AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
} from "./runtime-constants.ts";
import type { AutoresearchMatrixCampaignArtifactSummary } from "./runtime-matrix.ts";

export function formatAutoresearchSetupGuideLines(cwd: string): string[] {
  return [
    `- configure a bounded segment: ${AUTORESEARCH_CAMPAIGN_START_TOOL_NAME}({ cwd: ${JSON.stringify(cwd)}, objective: "<bounded objective>", runMode: "plan_only", peerMode: "plan", candidatePolicy: { mode: "worktree", keep: "preserve_branch", discard: "suggest_cleanup", rewind: "reset_worktree_to_base" } })`,
    `- lower-level setup plan: ${AUTORESEARCH_SETUP_TOOL_NAME}({ cwd: ${JSON.stringify(cwd)}, action: "plan", name: "<campaign-name>", metricName: "<metric-name>", direction: "lower", benchmarkCommand: "<command that prints METRIC name=value>" })`,
    "- boundary: setup guidance is read-only until the operator sends an explicit setup/baseline/bounded-loop call.",
  ];
}

export function formatAutoresearchGuidedCandidateJourneyLines(cwd: string): string[] {
  return [
    `- bind candidate (read-only plan): ${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({ cwd: ${JSON.stringify(cwd)}, candidateWorktree: "<candidate-worktree>", action: "plan_run" })`,
    `- measure after bind review: ${AUTORESEARCH_RUN_TOOL_NAME}({ cwd: ${JSON.stringify(cwd)}, description: "Measure bound candidate", candidateSource: "candidate_peer_spawn", candidateWorktree: "<candidate-worktree>", candidateBranch: "<candidate-branch>", candidateBaseRef: "<base-ref>", candidateDiffSummary: "<controller-verified diff>", candidateFilesChanged: ["<path>"] })`,
    `- export measured packet inventory: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${JSON.stringify(cwd)}, action: "candidate_result_export", outPath: "${AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE}" })`,
    "- inspect packet inventory in /autoresearch export until exported packet counts and export_visibility_blockers are visible and complete.",
    `- final owner review handoff after complete packet inventory: autoresearch_live_supervision({ action: "review_candidate_wave", taskId: <ak-task-id>, cwd: ${JSON.stringify(cwd)}, objective: "<candidate-wave-objective>", direction: "lower" })`,
    "- boundary: these are exact next legal calls only; export is measured inventory inspection and review is final owner decision; the dashboard does not spawn a candidate, run benchmarks, mutate worktrees, write AK/KES evidence, or promote.",
  ];
}

export function formatAutoresearchAuthorityHandoffLines(cwd: string): string[] {
  const cwdLiteral = JSON.stringify(cwd);
  return [
    `- closeout packet: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "closeout" })`,
    `- AK evidence packet: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "ak_evidence", akTaskId: <ak-task-id> }) -> review the returned suggested evidence_record(...) call; pi-autoresearch does not call evidence_record itself.`,
    `- learning_export/KES adapter: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "learning_export", outPath: "${AUTORESEARCH_LEARNING_EXPORT_FILE}" }) -> autoresearch_learning_kes_adapter({ action: "plan", packetPath: "${AUTORESEARCH_LEARNING_EXPORT_FILE}" })`,
    `- Oracle evidence export: ${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "oracle_evidence_export", outPath: "${AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE}" })`,
    `- DSPx owner preflight command: dspx oracle autoresearch-evidence publish-preflight --packet ${AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE} --target shared-postgres --publication-label retained --out <autoresearch_oracle_publication_preflight.json> --json; run this from the DSPx owner surface before any shared Oracle write.`,
    "- boundary: these are next-call handoffs only; dashboard rendering does not run exports, call AK/KES/Oracle, mutate external authority, or change promotion state.",
  ];
}

export function formatAutoresearchMatrixCampaignSummaryLines(
  summary: AutoresearchMatrixCampaignArtifactSummary,
): string[] {
  if (!hasAutoresearchMatrixCampaignProgress(summary)) {
    return [
      "- no matrix campaign artifacts discovered under .autoresearch/campaigns or .autoresearch/matrix-campaign",
      `- export_visibility_blockers: ${summary.exportVisibilityBlockers.value} (target=0; ${summary.exportVisibilityBlockers.status})`,
      `- boundary: ${summary.boundary}`,
    ];
  }

  return [
    `- campaigns: ${summary.campaignCount}; cells: ${summary.completedCellCount}/${summary.cellCount}; selected: ${summary.selectedCellCount}; lanes: ${summary.candidateLaneCount}; exported packets: ${summary.exportedPacketCount}`,
    `- ${summary.openCandidateReview.summary}`,
    `- open candidate next legal action: ${summary.openCandidateReview.nextLegalAction}`,
    `- metric: ${summary.metricName ?? "(unknown)"} (${summary.metricDirection ?? "unknown"} is better; target=${summary.metricTarget ?? "none"})`,
    `- latest artifact: ${summary.latestArtifactPath ?? "(unknown)"}`,
    `- export_visibility_blockers: ${summary.exportVisibilityBlockers.value} (target=0; ${summary.exportVisibilityBlockers.status})`,
    ...summary.cells
      .slice(0, 12)
      .map(
        (cell) =>
          `- ${cell.cellId}: posture=${cell.posture}; lanes=${cell.laneProgress}; selected=${cell.selectedLaneId ?? "none"}; next=${cell.nextLegalAction}`,
      ),
    ...summary.nextLegalActions.slice(0, 5).map((action) => `- next legal action: ${action}`),
    `- boundary: ${summary.boundary}`,
  ];
}

export function hasAutoresearchMatrixCampaignProgress(
  summary: AutoresearchMatrixCampaignArtifactSummary,
): boolean {
  return summary.artifacts.length > 0 || summary.cells.length > 0 || summary.campaignCount > 0;
}

export function formatAutoresearchDashboardMode(
  summary: AutoresearchMatrixCampaignArtifactSummary,
): "matrix_campaign" | "runtime_segment" {
  return hasAutoresearchMatrixCampaignProgress(summary) ? "matrix_campaign" : "runtime_segment";
}

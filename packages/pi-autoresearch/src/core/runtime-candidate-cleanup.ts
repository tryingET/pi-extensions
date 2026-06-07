import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { AUTORESEARCH_EVENT_LEDGER_FILE } from "./ledger.ts";
import { AUTORESEARCH_RUNTIME_SNAPSHOT_FILE } from "./resume.ts";
import { buildAutoresearchSegmentCloseout } from "./runtime-closeout.ts";
import {
  AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION,
  AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE,
  AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR,
  AUTORESEARCH_DASHBOARD_EXPORT_FILE,
} from "./runtime-constants.ts";
import { discoverAutoresearchMatrixCampaignArtifacts } from "./runtime-matrix.ts";
import type { AutoresearchCandidateInventoryCleanupPlan } from "./runtime-model.ts";
import { assertPathInsideDirectory } from "./runtime-path-safety.ts";

function relativeAutoresearchPath(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath).replaceAll(path.sep, "/");
}

const AUTORESEARCH_CANDIDATE_CLEANUP_PATHS = [
  "autoresearch.jsonl",
  AUTORESEARCH_EVENT_LEDGER_FILE,
  AUTORESEARCH_RUNTIME_SNAPSHOT_FILE,
  AUTORESEARCH_DASHBOARD_EXPORT_FILE,
  ".autoresearch/campaigns",
  ".autoresearch/matrix-campaign",
  AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR,
  AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE,
] as const;

export function buildAutoresearchCandidateInventoryCleanupPlan(input: {
  cwd: string;
  archiveLabel?: string;
}): AutoresearchCandidateInventoryCleanupPlan {
  return buildAutoresearchCandidateInventoryCleanupPlanInternal({
    cwd: input.cwd,
    archiveLabel: input.archiveLabel,
    mode: "plan",
  });
}

export function applyAutoresearchCandidateInventoryCleanup(input: {
  cwd: string;
  archiveLabel?: string;
  operatorConfirmation?: string;
}): AutoresearchCandidateInventoryCleanupPlan {
  if (input.operatorConfirmation !== AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION) {
    throw new Error(
      `candidate inventory cleanup requires operatorConfirmation=${JSON.stringify(
        AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION,
      )}`,
    );
  }
  const target = resolveAutoresearchCandidateCleanupArchive({
    cwd: input.cwd,
    archiveLabel: input.archiveLabel,
  });
  if (existsSync(target.archiveDir)) {
    throw new Error(`candidate inventory cleanup archive already exists: ${target.archiveDir}`);
  }
  const beforePlan = buildAutoresearchCandidateInventoryCleanupPlanInternal({
    cwd: target.cwd,
    archiveLabel: target.archiveLabel,
    mode: "plan",
  });
  const pathPlan = discoverAutoresearchCandidateCleanupPaths(target.cwd, target.archiveDir);
  for (const destinationPath of pathPlan.destinationPaths) {
    if (existsSync(destinationPath)) {
      throw new Error(`candidate inventory cleanup destination already exists: ${destinationPath}`);
    }
  }

  mkdirSync(target.archiveDir, { recursive: true });
  writeFileSync(
    path.join(target.archiveDir, "cleanup-preflight.json"),
    `${JSON.stringify(beforePlan, null, 2)}\n`,
    "utf8",
  );

  for (const item of pathPlan.existing) {
    mkdirSync(path.dirname(item.destinationPath), { recursive: true });
    renameSync(item.sourcePath, item.destinationPath);
  }

  const applied: AutoresearchCandidateInventoryCleanupPlan = {
    ...beforePlan,
    mode: "applied",
    archivedPaths: pathPlan.existingPaths,
    skippedMissingPaths: pathPlan.missingPaths,
    after: buildAutoresearchCandidateCleanupAfter(target.cwd),
  };
  writeFileSync(
    path.join(target.archiveDir, "cleanup-summary.json"),
    `${JSON.stringify(applied, null, 2)}\n`,
    "utf8",
  );
  return applied;
}

function buildAutoresearchCandidateInventoryCleanupPlanInternal(input: {
  cwd: string;
  archiveLabel?: string;
  mode: "plan" | "applied";
}): AutoresearchCandidateInventoryCleanupPlan {
  const target = resolveAutoresearchCandidateCleanupArchive({
    cwd: input.cwd,
    archiveLabel: input.archiveLabel,
  });
  const closeout = buildAutoresearchSegmentCloseout(target.cwd);
  const matrix = discoverAutoresearchMatrixCampaignArtifacts(target.cwd);
  const pathPlan = discoverAutoresearchCandidateCleanupPaths(target.cwd, target.archiveDir);
  const candidateRunCount = closeout.runs.filter((run) => run.status === "candidate").length;
  const checksFailedOrCrashCount = closeout.runs.filter(
    (run) => run.status === "checks_failed" || run.status === "crash",
  ).length;
  return {
    kind: "autoresearch.candidate_inventory_cleanup_plan.v1",
    cwd: target.cwd,
    mode: input.mode,
    archiveDir: target.relativeArchiveDir,
    confirmationRequired: AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION,
    before: {
      runCount: closeout.runCount,
      successfulRunCount: closeout.successfulRunCount,
      candidateRunCount,
      checksFailedOrCrashCount,
      openCandidateReviewCellCount: matrix.openCandidateReview.openCellCount,
      candidatePacketInventoryCount: matrix.openCandidateReview.packetInventoryItemCount,
    },
    archivedPaths: pathPlan.existingPaths,
    skippedMissingPaths: pathPlan.missingPaths,
    rootCause:
      "The status widget reads cwd-root autoresearch receipts while candidate review surfaces read .autoresearch matrix/candidate-result artifacts; both projection surfaces must be closed to clear stale candidate status.",
    multiOrderEffect:
      "Archive rather than delete local projections so production cleanup resets operator UX without losing audit/recovery context; never merge, promote, write AK/KES evidence, or delete external worktrees from this package-owned cleanup.",
    boundary:
      "Candidate inventory cleanup archives local pi-autoresearch projection files under cwd/.autoresearch/closed-candidates only. It does not mutate AK/KES/Oracle, merge/apply candidates, delete external worktrees, or remove git branches.",
  };
}

function resolveAutoresearchCandidateCleanupArchive(input: {
  cwd: string;
  archiveLabel?: string;
}): {
  cwd: string;
  archiveLabel: string;
  archiveDir: string;
  relativeArchiveDir: string;
} {
  const cwd = path.resolve(input.cwd);
  const archiveRoot = path.resolve(cwd, ".autoresearch", "closed-candidates");
  const archiveLabel = input.archiveLabel?.trim() || buildAutoresearchCleanupArchiveLabel();
  if (
    path.isAbsolute(archiveLabel) ||
    archiveLabel.includes("/") ||
    archiveLabel.includes("\\") ||
    archiveLabel.includes("..") ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(archiveLabel)
  ) {
    throw new Error(
      "candidate inventory cleanup archiveLabel must be a safe local slug (letters, numbers, dot, underscore, or hyphen; no path separators or traversal)",
    );
  }
  const archiveDir = path.resolve(archiveRoot, archiveLabel);
  assertPathInsideDirectory({
    candidate: archiveDir,
    root: archiveRoot,
    label: "candidate inventory cleanup archive",
  });
  return {
    cwd,
    archiveLabel,
    archiveDir,
    relativeArchiveDir: relativeAutoresearchPath(cwd, archiveDir),
  };
}

function discoverAutoresearchCandidateCleanupPaths(
  cwd: string,
  archiveDir: string,
): {
  existing: Array<{ relativePath: string; sourcePath: string; destinationPath: string }>;
  existingPaths: string[];
  missingPaths: string[];
  destinationPaths: string[];
} {
  const existing: Array<{ relativePath: string; sourcePath: string; destinationPath: string }> = [];
  const missingPaths: string[] = [];
  const destinationPaths: string[] = [];
  for (const relativePath of AUTORESEARCH_CANDIDATE_CLEANUP_PATHS) {
    const sourcePath = path.resolve(cwd, relativePath);
    const destinationPath = path.resolve(archiveDir, relativePath);
    assertPathInsideDirectory({
      candidate: destinationPath,
      root: archiveDir,
      label: "candidate inventory cleanup destination",
    });
    destinationPaths.push(destinationPath);
    if (!existsSync(sourcePath)) {
      missingPaths.push(relativePath);
      continue;
    }
    existing.push({ relativePath, sourcePath, destinationPath });
  }
  return {
    existing,
    existingPaths: existing.map((item) => item.relativePath),
    missingPaths,
    destinationPaths,
  };
}

function buildAutoresearchCandidateCleanupAfter(
  cwd: string,
): AutoresearchCandidateInventoryCleanupPlan["after"] {
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const matrix = discoverAutoresearchMatrixCampaignArtifacts(cwd);
  return {
    runCount: closeout.runCount,
    successfulRunCount: closeout.successfulRunCount,
    candidateRunCount: closeout.runs.filter((run) => run.status === "candidate").length,
    openCandidateReviewCellCount: matrix.openCandidateReview.openCellCount,
    candidatePacketInventoryCount: matrix.openCandidateReview.packetInventoryItemCount,
  };
}

function buildAutoresearchCleanupArchiveLabel(): string {
  return new Date().toISOString().replace(/[.:]/gu, "-");
}

export function formatAutoresearchCandidateInventoryCleanupPlan(
  plan: AutoresearchCandidateInventoryCleanupPlan,
): string {
  const afterLines = plan.after
    ? [
        "",
        "## After cleanup",
        `- runs: ${plan.after.runCount}/${plan.after.successfulRunCount} ok`,
        `- candidates: ${plan.after.candidateRunCount}`,
        `- open review cells: ${plan.after.openCandidateReviewCellCount}`,
        `- packet inventory refs: ${plan.after.candidatePacketInventoryCount}`,
      ]
    : [];
  const archivedPathHeading = plan.mode === "plan" ? "## Would archive paths" : "## Archived paths";
  return [
    "# PI-AUTORESEARCH CANDIDATE INVENTORY CLEANUP",
    "",
    `- mode: ${plan.mode}`,
    `- cwd: ${plan.cwd}`,
    `- archive: ${plan.archiveDir}`,
    "",
    "## Before cleanup",
    `- runs: ${plan.before.runCount}/${plan.before.successfulRunCount} ok`,
    `- candidates: ${plan.before.candidateRunCount}`,
    `- failed/crashed: ${plan.before.checksFailedOrCrashCount}`,
    `- open review cells: ${plan.before.openCandidateReviewCellCount}`,
    `- packet inventory refs: ${plan.before.candidatePacketInventoryCount}`,
    "",
    "## Apply gate",
    `- required confirmation: ${plan.confirmationRequired}`,
    "",
    archivedPathHeading,
    ...(plan.archivedPaths.length > 0 ? plan.archivedPaths.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Missing cleanup paths",
    ...(plan.skippedMissingPaths.length > 0
      ? plan.skippedMissingPaths.map((item) => `- ${item}`)
      : ["- none"]),
    "",
    "## Root cause",
    plan.rootCause,
    "",
    "## Multi-order effect",
    plan.multiOrderEffect,
    ...afterLines,
    "",
    "## Boundary",
    plan.boundary,
  ].join("\n");
}

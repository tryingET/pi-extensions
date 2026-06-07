import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildAutoresearchSegmentCloseout } from "./runtime-closeout.ts";
import {
  AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE,
  AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR,
} from "./runtime-constants.ts";
import { formatMetricValue } from "./runtime-format.ts";
import type {
  AutoresearchCandidateResultExportResult,
  AutoresearchCandidateResultPacket,
} from "./runtime-model.ts";
import { resolveAutoresearchPacketExportPath } from "./runtime-packet-export-paths.ts";
import { formatCandidateBindingLines } from "./runtime-status-format.ts";

function resolveAutoresearchCandidateResultExportPath(cwd: string, outPath?: string): string {
  return resolveAutoresearchPacketExportPath({
    cwd,
    outPath,
    defaultPath: AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE,
    label: "candidate result export",
  });
}

export function writeAutoresearchCandidateResultPacket(input: {
  cwd: string;
  outPath?: string;
  overwrite?: boolean;
}): AutoresearchCandidateResultExportResult {
  const packet = buildAutoresearchCandidateResultPacket(input.cwd);
  const outputPath = resolveAutoresearchCandidateResultExportPath(input.cwd, input.outPath);
  if (existsSync(outputPath) && input.overwrite !== true) {
    throw new Error(
      `candidate result export already exists; pass overwrite=true to replace it: ${outputPath}`,
    );
  }
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  const defaultCandidateWaveDir = path.resolve(
    input.cwd,
    AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR,
  );
  const usesDefaultCandidateWaveDir = path.dirname(outputPath) === defaultCandidateWaveDir;
  return {
    exportKind: "autoresearch.candidate_result_export.v1",
    path: outputPath,
    packet,
    suggestedReviewCall: `autoresearch_live_supervision({ action: "review_candidate_wave", taskId: <ak-task-id>, cwd: ${JSON.stringify(input.cwd)}, objective: "<candidate-wave-objective>", direction: "lower", candidateResultPacketPaths: [${JSON.stringify(outputPath)}] })`,
    suggestedAggregateReviewCall: usesDefaultCandidateWaveDir
      ? `autoresearch_live_supervision({ action: "review_candidate_wave", taskId: <ak-task-id>, cwd: ${JSON.stringify(input.cwd)}, objective: "<candidate-wave-objective>", direction: "lower" })`
      : null,
    effect: {
      localFileWritten: true,
      candidateLifecycleMutated: false,
      worktreeMutated: false,
      akCalled: false,
      kesWritten: false,
      promotionStateChanged: false,
    },
    authorityBoundary:
      "Local candidate-result packet export only; candidate lifecycle, worktree mutation, AK/KES/evidence, and promotion remain external owner-surface actions.",
  };
}

export function formatAutoresearchCandidateResultExportResult(
  result: AutoresearchCandidateResultExportResult,
): string {
  return [
    "# PI-AUTORESEARCH CANDIDATE RESULT EXPORT",
    "",
    `- export kind: ${result.exportKind}`,
    `- packet kind: ${result.packet.packetKind}`,
    `- path: ${result.path}`,
    `- candidate: ${result.packet.candidate?.branch ?? result.packet.candidate?.worktreePath ?? "(none)"}`,
    `- candidate lifecycle mutated: ${result.effect.candidateLifecycleMutated ? "yes" : "no"}`,
    `- worktree mutated: ${result.effect.worktreeMutated ? "yes" : "no"}`,
    `- AK called: ${result.effect.akCalled ? "yes" : "no"}`,
    `- KES written: ${result.effect.kesWritten ? "yes" : "no"}`,
    `- promotion state changed: ${result.effect.promotionStateChanged ? "yes" : "no"}`,
    `- boundary: ${result.authorityBoundary}`,
    "",
    "## Suggested aggregate review call seed",
    "```ts",
    result.suggestedReviewCall,
    "```",
    ...(result.suggestedAggregateReviewCall
      ? [
          "",
          "## Suggested default-discovery aggregate review call",
          "Use after all approved lanes export under .autoresearch/candidate-wave/.",
          "```ts",
          result.suggestedAggregateReviewCall,
          "```",
        ]
      : []),
  ].join("\n");
}

export function buildAutoresearchCandidateResultPacket(
  cwd: string,
): AutoresearchCandidateResultPacket {
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const candidateRun = [...closeout.runs]
    .reverse()
    .find((run) => Boolean(run.experiment?.candidate));
  const candidate = candidateRun?.experiment?.candidate ?? null;
  const candidateLabel =
    candidate?.branch ??
    candidate?.worktreePath ??
    candidate?.diffSummary ??
    "(no candidate binding)";
  const resultSummary = candidate
    ? `Candidate ${candidateLabel} measured as ${closeout.empiricalDecisionClass}; ${closeout.recommendedAction}.`
    : `No visible candidate binding is present; current empirical decision is ${closeout.empiricalDecisionClass}.`;

  return {
    packetKind: "autoresearch.candidate_result.v1",
    adapterContractVersion: 1,
    targetKinds: ["candidate_review", "task_system", "evidence", "issue_tracker"],
    cwd: closeout.cwd,
    campaign: closeout.campaign,
    candidate,
    candidateRun: candidateRun ?? null,
    empiricalDecisionClass: closeout.empiricalDecisionClass,
    recommendedAction: closeout.recommendedAction,
    resultSummary,
    closeout,
    adapterBoundary:
      "Candidate result packet is non-mutating and adapter-ready; candidate lifecycle, review, merge, and promotion remain owned by visible peer/review/task systems.",
  };
}

export function formatAutoresearchCandidateResultPacket(
  packet: AutoresearchCandidateResultPacket,
): string {
  const candidateLines = packet.candidate
    ? formatCandidateBindingLines(packet.candidate)
    : ["- candidate: (none)"];
  const runLine = packet.candidateRun
    ? `- candidate run: iteration ${packet.candidateRun.iteration ?? "?"}; empirical ${packet.candidateRun.empiricalDecisionClass}; metric ${formatMetricValue(packet.candidateRun.metric, packet.closeout.metricUnit)}`
    : "- candidate run: (none)";

  return [
    "# PI-AUTORESEARCH CANDIDATE RESULT PACKET",
    "",
    `- packet kind: ${packet.packetKind}`,
    `- adapter contract version: ${packet.adapterContractVersion}`,
    `- target kinds: ${packet.targetKinds.join(", ")}`,
    `- cwd: ${packet.cwd}`,
    `- campaign: ${packet.campaign ?? "(unnamed)"}`,
    `- empirical decision: ${packet.empiricalDecisionClass}`,
    `- recommended action: ${packet.recommendedAction}`,
    `- adapter boundary: ${packet.adapterBoundary}`,
    "",
    "## Result summary",
    packet.resultSummary,
    "",
    "## Candidate",
    ...candidateLines,
    "",
    "## Candidate run",
    runLine,
  ].join("\n");
}

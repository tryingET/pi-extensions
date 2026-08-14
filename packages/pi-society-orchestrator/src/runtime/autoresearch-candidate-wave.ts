// ---
// summary: "Candidate-wave management: wave counts and packet directories, off-limit checks, lane selection, planned/reviewed wave management, review packets, owner-decision forms, and candidate-wave review."
// read_when:
//   - "Changing candidate-wave lanes, review packets, owner-decision forms, or off-limit violation checks."
// ---

import * as fs from "node:fs";
import * as path from "node:path";
import { resolveAutoresearchLiveSupervisionIdentity } from "./autoresearch-live-supervision.ts";
import {
  escapeRegExp,
  formatToolCall,
  isRecord,
  nonEmptyStrings,
  optionalNumber,
  optionalString,
  stringArrayFrom,
} from "./autoresearch-runner-utils.ts";
import { buildAutoresearchCampaignPeerRunnerHandoffContract } from "./autoresearch-supervisor-runner.ts";
import type {
  AutoresearchCandidateReviewPacketChainMetric,
  AutoresearchCandidateReviewPacketChainRef,
  AutoresearchCandidateWaveLane,
  AutoresearchCandidateWaveManagement,
  AutoresearchCandidateWaveOwnerDecisionForm,
  AutoresearchCandidateWaveOwnerDecisionInterviewPayload,
  AutoresearchCandidateWaveOwnerDecisionOption,
  AutoresearchCandidateWaveOwnerDecisionPrimaryUi,
  AutoresearchCandidateWavePacketDiscovery,
  AutoresearchCandidateWaveReliabilityRecovery,
  AutoresearchCandidateWaveReliabilityRecoveryPosture,
  AutoresearchCandidateWaveRequest,
  AutoresearchCandidateWaveResultInput,
  AutoresearchCandidateWaveReview,
  AutoresearchCandidateWaveReviewLane,
  AutoresearchCandidateWaveReviewPacket,
  AutoresearchCandidateWaveReviewRequest,
  AutoresearchLevel2CandidateBinding,
  AutoresearchLevel2CandidateBindingLane,
  AutoresearchOwnerReviewRoute,
  AutoresearchReviewPacketAuthorityBoundary,
  AutoresearchReviewPacketDispositionOption,
} from "./autoresearch-types.ts";
export const AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR =
  ".autoresearch/candidate-wave" as const;

export function resolveCandidateWaveCount(
  input: Pick<AutoresearchCandidateWaveRequest, "candidateObjectives" | "candidateCount">,
): number {
  const fromObjectives = input.candidateObjectives?.length ?? 0;
  const resolved = input.candidateCount ?? (fromObjectives > 0 ? fromObjectives : 3);
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 6) {
    throw new Error(
      `candidateCount must be an integer between 1 and 6, received: ${String(input.candidateCount)}`,
    );
  }
  return resolved;
}

export function resolveCandidateWavePacketDirectory(value: string | undefined): string {
  const raw = value?.trim() || AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR;
  if (path.isAbsolute(raw)) {
    throw new Error("candidatePacketDirectory must be repo-relative under .autoresearch/.");
  }
  const normalized = path.posix.normalize(raw.replace(/\\/gu, "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    !(normalized === ".autoresearch" || normalized.startsWith(".autoresearch/"))
  ) {
    throw new Error("candidatePacketDirectory must stay under .autoresearch/.");
  }
  return normalized;
}

export function defaultCandidateObjective(index: number, objective: string): string {
  const templates = [
    `Try the smallest surgical candidate patch for: ${objective}`,
    `Try an alternative implementation strategy for: ${objective}`,
    `Try a UX/status/evidence-oriented candidate patch for: ${objective}`,
    `Try a risk-reducing simplification candidate for: ${objective}`,
    `Try a measurement/instrumentation candidate that improves confidence for: ${objective}`,
    `Try a conservative cleanup candidate that removes friction for: ${objective}`,
  ];
  return templates[index] ?? `Try bounded candidate ${index + 1} for: ${objective}`;
}

export function normalizeReviewToken(value: unknown): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/gu, "_")
    : "";
}

export function candidateWaveChecksAcceptable(checksStatus: unknown): boolean {
  const normalized = normalizeReviewToken(checksStatus);
  if (normalized.length === 0) return true;
  return ["pass", "passed", "ok", "success", "succeeded", "none", "no_checks"].includes(normalized);
}

export function candidateWaveStatusDecision(
  status: unknown,
): "keep" | "more_samples" | "discard" | "rewind" | "blocked" | "unknown" {
  const normalized = normalizeReviewToken(status);
  if (normalized.length === 0) return "unknown";
  if (
    [
      "candidate_improvement",
      "threshold_satisfied",
      "threshold_preserved",
      "candidate_review_ready",
      "keep",
      "candidate",
    ].includes(normalized)
  ) {
    return "keep";
  }
  if (["insufficient_samples", "possible_noise", "calibration_signal"].includes(normalized)) {
    return "more_samples";
  }
  if (normalized === "candidate_neutral") return "rewind";
  if (
    normalized.includes("regression") ||
    normalized.includes("fail") ||
    normalized.includes("crash") ||
    normalized.includes("blocked") ||
    normalized.includes("discard") ||
    normalized === "measurement_invalid" ||
    normalized === "threshold_regressed" ||
    normalized === "checks_failed" ||
    normalized === "missing_packet" ||
    normalized === "baseline_drift"
  ) {
    return "discard";
  }
  return "unknown";
}

export function candidateWaveRunnerLineage(
  input: AutoresearchCandidateWaveResultInput,
  cwd: string,
): {
  ok: boolean;
  reason: string;
} {
  if (input.candidateSource !== "candidate_peer_spawn") {
    return {
      ok: false,
      reason: `process_violation: candidate source is ${input.candidateSource ?? "missing"}, expected candidate_peer_spawn`,
    };
  }
  if (!input.candidateWorktree || input.candidateWorktree.trim().length === 0) {
    return { ok: false, reason: "process_violation: missing external candidate worktree" };
  }
  if (path.resolve(input.candidateWorktree) === path.resolve(cwd)) {
    return {
      ok: false,
      reason: "process_violation: candidate worktree must be distinct from controller cwd",
    };
  }
  if (!input.candidateBranch || input.candidateBranch.trim().length === 0) {
    return { ok: false, reason: "process_violation: missing candidate branch" };
  }
  if (!input.candidateBaseRef || input.candidateBaseRef.trim().length === 0) {
    return { ok: false, reason: "process_violation: missing candidate base ref" };
  }
  if (!input.candidateFilesChanged || input.candidateFilesChanged.length === 0) {
    return { ok: false, reason: "process_violation: missing candidate changed-files proof" };
  }
  return {
    ok: true,
    reason:
      input.candidatePeerRunId || input.candidateRunnerId
        ? "verified candidate_peer_spawn worktree lineage with runner id"
        : "verified candidate_peer_spawn worktree lineage",
  };
}

export function normalizeCandidateReviewPath(value: string, cwd: string): string {
  const raw = value.trim().replace(/\\/gu, "/");
  if (raw.length === 0) return "";
  const repoRelative = path.isAbsolute(raw) ? path.relative(cwd, raw).replace(/\\/gu, "/") : raw;
  const normalized = path.posix.normalize(repoRelative).replace(/^\.\//u, "");
  return normalized === "." ? "" : normalized.replace(/\/$/u, "");
}

export function candidatePathMatchesOffLimitSpec(
  changedPath: string,
  offLimitSpec: string,
): boolean {
  if (changedPath.length === 0 || offLimitSpec.length === 0) return false;
  if (!offLimitSpec.includes("*")) {
    return changedPath === offLimitSpec || changedPath.startsWith(`${offLimitSpec}/`);
  }

  if (offLimitSpec.endsWith("/**")) {
    const prefix = offLimitSpec.slice(0, -"/**".length);
    if (changedPath === prefix || changedPath.startsWith(`${prefix}/`)) return true;
  }

  let pattern = "";
  for (let index = 0; index < offLimitSpec.length; index += 1) {
    const char = offLimitSpec[index];
    if (char === "*" && offLimitSpec[index + 1] === "*") {
      pattern += ".*";
      index += 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else {
      pattern += escapeRegExp(char);
    }
  }
  return new RegExp(`^${pattern}$`, "u").test(changedPath);
}

export function candidateFilesChangedOffLimitViolations(input: {
  cwd: string;
  candidateFilesChanged: readonly string[] | undefined;
  offLimits: readonly string[];
}): string[] {
  const offLimitSpecs = input.offLimits
    .map((spec) => normalizeCandidateReviewPath(spec, input.cwd))
    .filter((spec) => spec.length > 0);
  if (offLimitSpecs.length === 0) return [];

  return [...(input.candidateFilesChanged ?? [])]
    .map((filePath) => normalizeCandidateReviewPath(filePath, input.cwd))
    .filter((filePath) =>
      offLimitSpecs.some((spec) => candidatePathMatchesOffLimitSpec(filePath, spec)),
    );
}

export function candidateWaveLaneSelectable(
  input: AutoresearchCandidateWaveResultInput,
  cwd: string,
  offLimits: readonly string[] = [],
): {
  selectable: boolean;
  reason: string;
} {
  if (typeof input.metric !== "number" || !Number.isFinite(input.metric)) {
    return { selectable: false, reason: "missing finite metric" };
  }
  if (!candidateWaveChecksAcceptable(input.checksStatus)) {
    return { selectable: false, reason: `checks status is ${input.checksStatus}` };
  }
  const decision = candidateWaveStatusDecision(input.status);
  if (
    decision === "discard" ||
    decision === "rewind" ||
    decision === "blocked" ||
    decision === "unknown"
  ) {
    return { selectable: false, reason: `status is ${input.status ?? "unknown"}` };
  }
  const offLimitViolations = candidateFilesChangedOffLimitViolations({
    cwd,
    candidateFilesChanged: input.candidateFilesChanged,
    offLimits,
  });
  if (offLimitViolations.length > 0) {
    return {
      selectable: false,
      reason: `process_violation: off-limits path drift in changed files: ${offLimitViolations.join(", ")}`,
    };
  }

  const lineage = candidateWaveRunnerLineage(input, cwd);
  if (!lineage.ok) {
    return { selectable: false, reason: lineage.reason };
  }
  return {
    selectable: true,
    reason: `finite metric with ${decision} decision posture and ${lineage.reason}`,
  };
}

export function sortCandidateWaveReviewLanes(
  lanes: AutoresearchCandidateWaveReviewLane[],
  direction: "lower" | "higher",
): AutoresearchCandidateWaveReviewLane[] {
  const selectable = lanes
    .filter((lane) => lane.selectable && lane.metric !== null)
    .sort((a, b) =>
      direction === "lower" ? (a.metric ?? 0) - (b.metric ?? 0) : (b.metric ?? 0) - (a.metric ?? 0),
    );
  const rankByLane = new Map(selectable.map((lane, index) => [lane.laneId, index + 1]));
  return lanes.map((lane) => ({ ...lane, rank: rankByLane.get(lane.laneId) ?? null }));
}

export function candidateWaveSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48);
  return slug || "candidate-wave";
}

export function candidateWaveId(input: { taskId: number; objective: string }): string {
  return `task-${input.taskId}-${candidateWaveSlug(input.objective)}`;
}

export function buildPlannedCandidateWaveManagement(input: {
  taskId: number;
  objective: string;
  lanes: readonly AutoresearchCandidateWaveLane[];
  aggregateReviewCall: string;
}): AutoresearchCandidateWaveManagement {
  return {
    kind: "autoresearch.candidate_wave_management.v1",
    waveId: candidateWaveId(input),
    posture: "planned_not_launched",
    completedLaneCount: 0,
    expectedLaneCount: input.lanes.length,
    laneStates: input.lanes.map((lane) => ({
      laneId: lane.laneId,
      state: "planned",
      candidateResultPacketPath: lane.candidateResultPacketPath,
      selectable: false,
      metric: null,
      nextStep:
        "Launch only if explicitly approved, then bind, measure, and export the lane packet.",
    })),
    finalOnlyScoring: true,
    controllerMeasurementRequired: true,
    handoffContract: buildAutoresearchCampaignPeerRunnerHandoffContract(),
    nonSelectedLanePolicy:
      "After owner selection, send explicit stop/cancel guidance for non-selected visible peers; do not merge, delete, or reset their worktrees from this plan.",
    fanInChecklist: [
      "Use visible candidate_peer_spawn calls only for approved lanes.",
      "Treat controller-inline implementation patches as a process violation for campaign-style implementation work.",
      "Treat PEER_FINAL as communication until the controller binds and measures the worktree through pi-autoresearch.",
      "Export one autoresearch.candidate_result.v1 packet per planned lane before final scoring.",
      "Run the explicit aggregate review call so missing planned lanes remain visible and gate selection.",
    ],
    exactNextCalls: [input.aggregateReviewCall],
  };
}

export function buildReviewedCandidateWaveManagement(input: {
  taskId: number;
  objective: string;
  lanes: readonly AutoresearchCandidateWaveReviewLane[];
  plannedLanesIncomplete: boolean;
  winner: AutoresearchCandidateWaveReviewLane | null;
  exactNextCalls: readonly string[];
}): AutoresearchCandidateWaveManagement {
  const completedLaneCount = input.lanes.filter(
    (lane) => normalizeReviewToken(lane.status) !== "missing_packet",
  ).length;
  const posture = input.plannedLanesIncomplete
    ? "waiting_for_planned_lanes"
    : input.winner
      ? "ready_for_owner_selection"
      : "no_selectable_candidate";
  return {
    kind: "autoresearch.candidate_wave_management.v1",
    waveId: candidateWaveId(input),
    posture,
    completedLaneCount,
    expectedLaneCount: input.lanes.length,
    laneStates: input.lanes.map((lane) => {
      const missing = normalizeReviewToken(lane.status) === "missing_packet";
      return {
        laneId: lane.laneId,
        state: missing
          ? "packet_missing"
          : lane.selectable
            ? "measured_exported_selectable"
            : "measured_exported_not_selectable",
        candidateResultPacketPath: lane.sourcePacketPath,
        selectable: lane.selectable,
        metric: lane.metric,
        nextStep: missing
          ? "Wait for controller measurement and candidate_result_export, or explicitly replan the wave without this lane."
          : lane.selectable
            ? "Eligible for final-only scoring after all explicit planned lanes are exported."
            : "Not selectable; inspect status/check posture before rerun or discard planning.",
      };
    }),
    finalOnlyScoring: true,
    controllerMeasurementRequired: true,
    handoffContract: buildAutoresearchCampaignPeerRunnerHandoffContract(),
    nonSelectedLanePolicy: input.winner
      ? `After owner approval for ${input.winner.laneId}, stop/cancel non-selected visible peers explicitly and leave cleanup/merge/reset to owner-approved lifecycle plans.`
      : "No selected lane yet; do not stop/cancel or clean up lanes as if a winner exists.",
    fanInChecklist: [
      "Score only controller-measured pi-autoresearch candidate-result packets, never raw peer claims.",
      "Treat any controller-inline patching that bypassed candidate_peer_spawn and candidate worktree measurement as a process violation, not a selectable lane.",
      "Do not recommend owner selection while any explicit planned lane is missing its packet.",
      "Keep missing, failed, blocked, and non-selectable lanes visible in the review report.",
      "After owner selection, issue explicit stop/cancel guidance for non-selected active peers before any merge/promotion work.",
    ],
    exactNextCalls: input.exactNextCalls,
  };
}

export function buildCandidateWaveReliabilityRecovery(input: {
  cwd: string;
  lanes: readonly AutoresearchCandidateWaveReviewLane[];
  winner: AutoresearchCandidateWaveReviewLane | null;
  aggregateReviewCall: string;
}): AutoresearchCandidateWaveReliabilityRecovery {
  const missingOrStalledLanes = input.lanes.filter(
    (lane) => normalizeReviewToken(lane.status) === "missing_packet",
  );
  const nonSelectedLanes = input.winner
    ? input.lanes.filter((lane) => lane.selectable && lane.laneId !== input.winner?.laneId)
    : [];
  const posture: AutoresearchCandidateWaveReliabilityRecoveryPosture =
    missingOrStalledLanes.length > 0
      ? "missing_or_stalled_lane_recovery_required"
      : input.winner
        ? nonSelectedLanes.length > 0
          ? "selection_ready_with_non_selected_lane_guidance"
          : "complete"
        : "no_selectable_lane_recovery_required";
  const latePacketPolicy =
    "If a late candidate-result packet appears after this review, do not promote or select from stale output; rerun the same review_candidate_wave aggregate call so the late lane is scored with the full explicit lane set.";

  return {
    kind: "autoresearch.candidate_wave_reliability_recovery.v1",
    posture,
    missingOrStalledLaneIds: missingOrStalledLanes.map((lane) => lane.laneId),
    latePacketPolicy,
    nonSelectedLaneIds: nonSelectedLanes.map((lane) => lane.laneId),
    laneRecovery: input.lanes.map((lane) => {
      const missing = normalizeReviewToken(lane.status) === "missing_packet";
      if (missing) {
        return {
          laneId: lane.laneId,
          kind: "missing_or_stalled_packet",
          packetPath: lane.sourcePacketPath,
          planOnly: true,
          guidance:
            "Treat this as a missing/stalled/late lane: wait for controller measurement plus candidate_result_export, or explicitly replan without this lane before any owner selection.",
          exactNextCalls: [
            ...(lane.sourcePacketPath
              ? [
                  formatToolCall("autoresearch_runtime_status", {
                    cwd: input.cwd,
                    action: "candidate_result_export",
                    outPath: lane.sourcePacketPath,
                  }),
                ]
              : []),
            input.aggregateReviewCall,
          ],
        };
      }
      if (input.winner && lane.laneId === input.winner.laneId) {
        return {
          laneId: lane.laneId,
          kind: "selected_candidate",
          packetPath: lane.sourcePacketPath,
          planOnly: true,
          guidance:
            "Selected by recommendation only; owner review must still choose a plan-only lifecycle action before any promotion/merge work.",
          exactNextCalls: input.aggregateReviewCall ? [input.aggregateReviewCall] : [],
        };
      }
      if (input.winner && lane.selectable) {
        return {
          laneId: lane.laneId,
          kind: "non_selected_stop_cancel",
          packetPath: lane.sourcePacketPath,
          planOnly: true,
          guidance:
            "Non-selected selectable lane: after owner approval of the winner, issue explicit stop/cancel guidance for the visible peer/worktree; do not merge, delete, reset, or promote from this review.",
          exactNextCalls: [],
        };
      }
      return {
        laneId: lane.laneId,
        kind: input.winner ? "not_selectable_rerun_or_discard" : "late_packet_reconcile",
        packetPath: lane.sourcePacketPath,
        planOnly: true,
        guidance:
          "Not selectable in this review; plan a rerun, discard, or late-packet reconciliation through owner-approved review, not hidden execution.",
        exactNextCalls: [input.aggregateReviewCall],
      };
    }),
    summary:
      posture === "missing_or_stalled_lane_recovery_required"
        ? "Missing/stalled lanes gate final owner selection until exported or owner-replanned."
        : posture === "selection_ready_with_non_selected_lane_guidance"
          ? "Selection is ready for owner review and non-selected lanes have plan-only stop/cancel guidance."
          : posture === "complete"
            ? "All reviewed lanes have concrete plan-only reliability guidance."
            : "No lane is selectable; use plan-only rerun/discard/late-packet recovery guidance.",
    boundaries: [
      "Reliability recovery is plan-only; it launches no peers, runs no benchmarks, writes no evidence, and applies no promotion or cleanup.",
      "Missing, stalled, or late lanes are recovered by explicit candidate_result_export plus aggregate review, or by owner-approved replanning without the lane.",
      "Non-selected lane stop/cancel is guidance for visible peer/worktree lifecycle only after owner approval; this review does not perform that lifecycle action.",
    ],
  };
}

export function resolveCandidateResultPacketPath(cwd: string, packetPath: string): string {
  const trimmed = packetPath.trim();
  if (trimmed.length === 0) {
    throw new Error("candidateResultPacketPaths cannot contain empty paths.");
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
}

export function laneIdFromCandidateResultPacketPath(resolvedPath: string): string {
  const base = path.basename(resolvedPath);
  return base.endsWith(".candidate-result.json")
    ? base.slice(0, -".candidate-result.json".length)
    : path.basename(resolvedPath, path.extname(resolvedPath));
}

export function candidateResultInputFromPacketPath(
  cwd: string,
  packetPath: string,
): AutoresearchCandidateWaveResultInput {
  const resolvedPath = resolveCandidateResultPacketPath(cwd, packetPath);
  if (!fs.existsSync(resolvedPath)) {
    const laneId = laneIdFromCandidateResultPacketPath(resolvedPath);
    return {
      laneId,
      objective: `Missing candidate-result packet for ${laneId}`,
      status: "missing_packet",
      checksStatus: "unknown",
      sourcePacketPath: resolvedPath,
      caveat:
        "Candidate-result packet was not found. The lane may still be running, failed before export, or was not approved/launched.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read candidate result packet at ${resolvedPath}: ${message}`);
  }

  if (!isRecord(parsed) || parsed.packetKind !== "autoresearch.candidate_result.v1") {
    throw new Error(
      `Candidate result packet at ${resolvedPath} must have packetKind=autoresearch.candidate_result.v1.`,
    );
  }

  const candidate = isRecord(parsed.candidate) ? parsed.candidate : null;
  const candidateRun = isRecord(parsed.candidateRun) ? parsed.candidateRun : null;
  const experiment =
    candidateRun && isRecord(candidateRun.experiment) ? candidateRun.experiment : null;
  const closeout = isRecord(parsed.closeout) ? parsed.closeout : null;
  const closeoutStatus = closeout && isRecord(closeout.status) ? closeout.status : null;
  const status =
    optionalString(parsed.empiricalDecisionClass) ?? optionalString(candidateRun?.status);
  const checks = optionalString(candidateRun?.checks);
  const laneId =
    optionalString(experiment?.hypothesisId) ??
    optionalString(candidate?.branch) ??
    laneIdFromCandidateResultPacketPath(resolvedPath);

  return {
    laneId,
    objective:
      optionalString(experiment?.hypothesis) ??
      optionalString(candidateRun?.description) ??
      optionalString(parsed.resultSummary),
    metric: optionalNumber(candidateRun?.metric),
    status,
    checksStatus: checks,
    confidence: optionalNumber(closeoutStatus?.confidence),
    candidateSource: optionalString(candidate?.source),
    candidateWorktree: optionalString(candidate?.worktreePath),
    candidateBranch: optionalString(candidate?.branch),
    candidateBaseRef: optionalString(candidate?.baseRef),
    candidateDiffSummary: optionalString(candidate?.diffSummary),
    candidateFilesChanged: stringArrayFrom(candidate?.filesChanged),
    candidatePeerRunId: optionalString(candidate?.peerRunId),
    candidateRunnerId: optionalString(candidate?.runnerId),
    sourcePacketPath: resolvedPath,
    caveat: optionalString(parsed.resultSummary),
  };
}

export function buildCandidateWaveBindCall(
  cwd: string,
  winner: AutoresearchCandidateWaveReviewLane,
): string | null {
  if (!winner.candidateWorktree) return null;
  return formatToolCall("autoresearch_candidate_bind", {
    cwd,
    action: "plan_run",
    candidateWorktree: winner.candidateWorktree,
    candidateBaseRef: winner.candidateBaseRef ?? "<verify-base-ref>",
  });
}

export function buildCandidateWaveMoreSamplesCall(
  cwd: string,
  winner: AutoresearchCandidateWaveReviewLane,
): string {
  const candidateWorktree = winner.candidateWorktree ?? "<candidate-worktree>";
  return formatToolCall("autoresearch_runtime_run", {
    cwd,
    runKind: "ordinary",
    description: `Collect another sample for ${winner.laneId}`,
    hypothesisId: winner.laneId,
    hypothesis: winner.objective ?? `More samples for ${winner.laneId}`,
    candidateSource: winner.candidateWorktree ? "candidate_peer_spawn" : "manual",
    candidateWorktree,
    candidateBranch: winner.candidateBranch ?? "<candidate-branch>",
    candidateBaseRef: winner.candidateBaseRef ?? "<candidate-base-ref>",
    candidateDiffSummary: winner.candidateDiffSummary ?? "<controller-verified-diff-summary>",
    candidateFilesChanged:
      winner.candidateFilesChanged.length > 0 ? winner.candidateFilesChanged : ["<changed-files>"],
  });
}

export function buildLevel2CandidateBinding(
  lanes: readonly AutoresearchCandidateWaveReviewLane[],
  packetDiscovery: AutoresearchCandidateWavePacketDiscovery,
): AutoresearchLevel2CandidateBinding {
  const laneCounts = new Map<string, number>();
  for (const lane of lanes) laneCounts.set(lane.laneId, (laneCounts.get(lane.laneId) ?? 0) + 1);
  const duplicateLaneIds = [...laneCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([laneId]) => laneId);
  const duplicateSet = new Set(duplicateLaneIds);
  const expectedLaneCount =
    packetDiscovery.mode === "explicit"
      ? packetDiscovery.candidateResultPacketPaths.length
      : lanes.length;

  const bindingLanes = lanes.map((lane): AutoresearchLevel2CandidateBindingLane => {
    const blockers: string[] = [];
    const packetPresent = Boolean(
      lane.sourcePacketPath && normalizeReviewToken(lane.status) !== "missing_packet",
    );
    if (!packetPresent && packetDiscovery.mode === "explicit") blockers.push("missing_packet");
    if (duplicateSet.has(lane.laneId)) blockers.push("duplicate_lane");
    if (lane.candidatePeerRunId && !packetPresent) blockers.push("peer_assertion_without_packet");
    const bindingStatus: AutoresearchLevel2CandidateBindingLane["bindingStatus"] = duplicateSet.has(
      lane.laneId,
    )
      ? "blocked_duplicate_lane"
      : !packetPresent && packetDiscovery.mode === "explicit"
        ? "blocked_missing_packet"
        : lane.candidatePeerRunId && !packetPresent
          ? "peer_assertion_only"
          : packetPresent
            ? "bound_controller_verified_packet"
            : "manual_input_review_only";

    return {
      laneId: lane.laneId,
      bindingKey: `${lane.laneId}:${lane.sourcePacketPath ?? "manual"}`,
      sourcePacketPath: lane.sourcePacketPath,
      candidateSource: lane.candidateSource,
      candidatePeerRunId: lane.candidatePeerRunId,
      candidateRunnerId: lane.candidateRunnerId,
      controllerVerifiedFacts: {
        packetPresent,
        metricPresent: lane.metric !== null,
        checksStatus: lane.checksStatus,
        candidateWorktree: lane.candidateWorktree,
        candidateBranch: lane.candidateBranch,
        candidateBaseRef: lane.candidateBaseRef,
        candidateFilesChanged: lane.candidateFilesChanged,
      },
      peerAssertions: {
        peerRunId: lane.candidatePeerRunId,
        runnerId: lane.candidateRunnerId,
        status: lane.status,
        caveat: lane.caveat,
      },
      bindingStatus,
      blockers,
    };
  });
  const missingLaneIds = bindingLanes
    .filter((lane) => lane.bindingStatus === "blocked_missing_packet")
    .map((lane) => lane.laneId);
  const peerAssertionOnlyLaneIds = bindingLanes
    .filter((lane) => lane.bindingStatus === "peer_assertion_only")
    .map((lane) => lane.laneId);
  const blockerCount = bindingLanes.reduce((sum, lane) => sum + lane.blockers.length, 0);
  const controllerVerifiedLaneCount = bindingLanes.filter(
    (lane) => lane.bindingStatus === "bound_controller_verified_packet",
  ).length;

  return {
    kind: "autoresearch.level2_candidate_binding.v1",
    metric: {
      name: "level2_candidate_binding_blockers",
      direction: "lower",
      target: 0,
      value: blockerCount,
      status: blockerCount === 0 ? "target_met" : "blocked",
    },
    expectedLaneCount,
    boundLaneCount: bindingLanes.length,
    controllerVerifiedLaneCount,
    missingLaneIds,
    duplicateLaneIds,
    peerAssertionOnlyLaneIds,
    lanes: bindingLanes,
    boundaries: [
      "Binding candidate results to lanes does not make peer/intercom text durable evidence.",
      "Controller-verified facts come from candidate-result packets or explicit inline review input; owner evidence writes remain separate.",
      "Missing, duplicate, or peer-assertion-only lanes fail closed before owner selection can be treated as complete.",
    ],
    nextStep:
      blockerCount === 0
        ? "Proceed to review_candidate_wave owner selection using bound controller-verified candidate facts."
        : "Resolve level-2 candidate binding blockers before claiming fan-in completion or owner selection readiness.",
  };
}

export function buildReviewPacketDispositionOptions(): AutoresearchReviewPacketDispositionOption[] {
  return [
    {
      option: "ignore",
      posture: "owner_review_required",
      description: "Leave the lane/cell unselected after review; no lifecycle action is implied.",
      forbiddenWithoutOwnerToken: ["cleanup", "branch deletion", "evidence write"],
    },
    {
      option: "inspect further",
      posture: "owner_review_required",
      description: "Open packet, diff, receipts, and dashboard context before deciding.",
      forbiddenWithoutOwnerToken: ["benchmark", "merge", "promotion"],
    },
    {
      option: "fold into synthesis",
      posture: "owner_review_required",
      description:
        "Use ideas as review input for a later synthesized patch; do not treat the lane as selected.",
      forbiddenWithoutOwnerToken: ["cherry-pick", "merge", "promotion"],
    },
    {
      option: "cherry-pick after review",
      posture: "owner_review_required",
      description: "Possible only after owner review names exact commits/files and rollback.",
      forbiddenWithoutOwnerToken: ["cherry-pick", "push", "evidence write"],
    },
    {
      option: "merge after review",
      posture: "owner_review_required",
      description:
        "Possible only after explicit promotion token, validation, and owner-approved rollback.",
      forbiddenWithoutOwnerToken: ["merge", "push", "release", "promotion"],
    },
  ];
}

export function buildReviewPacketAuthorityBoundary(input: {
  selectionAuthority: AutoresearchReviewPacketAuthorityBoundary["selectionAuthority"];
}): AutoresearchReviewPacketAuthorityBoundary {
  return {
    durableEvidence: false,
    promotionAuthority: false,
    selectionAuthority: input.selectionAuthority,
    forbiddenActions: [
      "peer launch",
      "benchmark execution",
      "candidate-result export",
      "AK/KES/Oracle/DSPx/Prompt Vault/ROCS write",
      "cleanup or branch deletion",
      "merge, push, PR, release, or promotion",
    ],
    requiredOwnerTokens: ["ak_owner_write", "candidate_cleanup", "promotion"],
    boundary:
      "Review packets are non-authoritative owner-review inputs. They do not select winners, write durable evidence, clean up worktrees, merge, release, or promote.",
  };
}

export function buildCandidateReviewPacketChainMetric(input: {
  refs: readonly AutoresearchCandidateReviewPacketChainRef[];
  sourceMetricName: string;
  sourceMetricStatus: string;
  requireSelectedPacketRefs?: boolean;
}): AutoresearchCandidateReviewPacketChainMetric {
  const missingPackets = input.refs.filter((ref) => !ref.packetPresent).length;
  const sourceBlocked = input.sourceMetricStatus === "blocked" ? 1 : 0;
  const selectedMissing = input.requireSelectedPacketRefs
    ? input.refs.filter((ref) => ref.selected && !ref.sourcePacketPath).length
    : 0;
  const value = missingPackets + sourceBlocked + selectedMissing;
  return {
    name: "candidate_review_packet_chain_blockers",
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
    sourceMetricName: input.sourceMetricName,
    sourceMetricStatus: input.sourceMetricStatus,
  };
}

export function buildCandidateReviewPacketChainRefs(input: {
  binding: AutoresearchLevel2CandidateBinding;
  selectedLaneId: string | null;
  cellId?: string | null;
}): AutoresearchCandidateReviewPacketChainRef[] {
  return input.binding.lanes.map((lane) => ({
    cellId: input.cellId ?? null,
    laneId: lane.laneId,
    sourcePacketPath: lane.sourcePacketPath,
    packetPresent: lane.controllerVerifiedFacts.packetPresent,
    selected: Boolean(input.selectedLaneId && lane.laneId === input.selectedLaneId),
    bindingStatus: lane.bindingStatus,
  }));
}

export function buildCandidateWaveReviewPacket(input: {
  review: Pick<
    AutoresearchCandidateWaveReview,
    "kind" | "level2CandidateBinding" | "recommendation" | "lanes"
  >;
}): AutoresearchCandidateWaveReviewPacket {
  const candidateResultPacketRefs = buildCandidateReviewPacketChainRefs({
    binding: input.review.level2CandidateBinding,
    selectedLaneId: input.review.recommendation.laneId,
  });
  return {
    kind: "autoresearch.review_candidate_wave_packet.v1",
    generatedFrom: "bound_candidate_results",
    candidateWaveReviewKind: input.review.kind,
    laneDispositionOptions: buildReviewPacketDispositionOptions(),
    bindingMetric: input.review.level2CandidateBinding.metric,
    candidateResultPacketRefs,
    packetChainMetric: buildCandidateReviewPacketChainMetric({
      refs: candidateResultPacketRefs,
      sourceMetricName: input.review.level2CandidateBinding.metric.name,
      sourceMetricStatus: input.review.level2CandidateBinding.metric.status,
    }),
    recommendedLaneId: input.review.recommendation.laneId,
    selectableLaneCount: input.review.lanes.filter((lane) => lane.selectable).length,
    nextLegalActions: input.review.recommendation.exactNextCalls,
    authorityBoundary: buildReviewPacketAuthorityBoundary({
      selectionAuthority: "recommendation_only",
    }),
  };
}

export function buildCandidateWaveReviewNextCalls(input: {
  cwd: string;
  winner: AutoresearchCandidateWaveReviewLane | null;
}): string[] {
  const { cwd, winner } = input;
  if (!winner) return [];

  const calls: string[] = [];
  const bindCall = buildCandidateWaveBindCall(cwd, winner);
  if (bindCall) calls.push(bindCall);
  const targetCurrentLaneCall = buildCandidateWaveMoreSamplesCall(cwd, winner);
  calls.push(targetCurrentLaneCall);
  calls.push(
    formatToolCall("autoresearch_candidate_decision", {
      cwd,
      action: "plan_keep",
    }),
  );
  calls.push(targetCurrentLaneCall);
  calls.push(
    formatToolCall("autoresearch_candidate_decision", {
      cwd,
      action: "plan_discard",
    }),
  );
  if (winner.candidateWorktree || winner.candidateBaseRef) {
    calls.push(targetCurrentLaneCall);
    calls.push(
      formatToolCall("autoresearch_candidate_decision", {
        cwd,
        action: "plan_rewind",
      }),
    );
  }
  return calls;
}

export function buildCandidateWaveOwnerDecisionOptions(input: {
  cwd: string;
  winner: AutoresearchCandidateWaveReviewLane | null;
}): AutoresearchCandidateWaveOwnerDecisionOption[] {
  const { cwd, winner } = input;
  if (!winner) return [];
  const bindCall = buildCandidateWaveBindCall(cwd, winner);
  const moreSamplesCall = buildCandidateWaveMoreSamplesCall(cwd, winner);
  const targetCurrentLaneCall = moreSamplesCall;
  const keepCalls = [
    ...(bindCall ? [bindCall] : []),
    targetCurrentLaneCall,
    formatToolCall("autoresearch_candidate_decision", { cwd, action: "plan_keep" }),
  ];
  const options: AutoresearchCandidateWaveOwnerDecisionOption[] = [
    {
      optionId: "plan_keep_recommended",
      laneId: winner.laneId,
      label: `Plan keep for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the owner accepts this candidate after reviewing packet evidence and local diff; run the included measurement call first if this lane is not already the latest pi-autoresearch candidate.",
      exactNextCalls: keepCalls,
    },
    {
      optionId: "collect_more_samples",
      laneId: winner.laneId,
      label: `Collect another measured sample for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the metric/check evidence is promising but still under-sampled or noisy.",
      exactNextCalls: [moreSamplesCall],
    },
    {
      optionId: "plan_discard",
      laneId: winner.laneId,
      label: `Plan discard for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the owner rejects this candidate; run the included measurement call first if this lane is not already current, then discard planning remains non-mutating.",
      exactNextCalls: [
        targetCurrentLaneCall,
        formatToolCall("autoresearch_candidate_decision", { cwd, action: "plan_discard" }),
      ],
    },
  ];
  if (winner.candidateWorktree || winner.candidateBaseRef) {
    options.push({
      optionId: "plan_rewind",
      laneId: winner.laneId,
      label: `Plan rewind for ${winner.laneId}`,
      posture: "owner_gate_required",
      rationale:
        "Use when the owner wants a plan to reset the candidate worktree; run the included measurement call first if this lane is not already current, then rewind remains plan-only here.",
      exactNextCalls: [
        targetCurrentLaneCall,
        formatToolCall("autoresearch_candidate_decision", { cwd, action: "plan_rewind" }),
      ],
    });
  }
  return options;
}

export function buildAutoresearchOwnerReviewRoute(input: {
  scopeLabel: string;
  aggregateReviewCall?: string;
}): AutoresearchOwnerReviewRoute {
  return {
    primaryUi: {
      surface: "pi-autoresearch_html_dashboard",
      slashCommand: "/autoresearch export",
      fallbackSlashCommand: "/autoresearch overlay",
      summary:
        "Open the pi-autoresearch HTML dashboard first for run history, receipts, metrics, candidate context, and packet evidence; use the overlay when a browser export is not desirable.",
    },
    decisionUi: {
      surface: "pi-autoresearch_candidate_decision_workbench",
      slashCommand: "/autoresearch review",
      summary:
        "Use pi-autoresearch's candidate decision workbench only for final plan-only keep, discard, rewind, more-samples, or finalize decisions after dashboard and packet review.",
    },
    reviewFlow: [
      `Review ${input.scopeLabel} through /autoresearch export before lifecycle decisions.`,
      "Use /autoresearch overlay only as the live TUI fallback when browser export is not desirable.",
      ...(input.aggregateReviewCall
        ? [
            `Run aggregate review after dashboard inspection if the packet set changed: ${input.aggregateReviewCall}`,
          ]
        : []),
      "Use /autoresearch review only for the final candidate lifecycle decision; no merge, cleanup, evidence write, or promotion is implied.",
    ],
    boundary:
      "Dashboard/export/overlay/review surfaces are owner-review affordances only; they do not launch peers, run benchmarks, mutate worktrees, write AK/KES/evidence, merge, or promote.",
  };
}

export function buildCandidateWaveOwnerDecisionForm(input: {
  reviewObjective: string;
  winner: AutoresearchCandidateWaveReviewLane | null;
  ownerDecisionOptions: readonly AutoresearchCandidateWaveOwnerDecisionOption[];
}): AutoresearchCandidateWaveOwnerDecisionForm | null {
  const { reviewObjective, winner, ownerDecisionOptions } = input;
  if (!winner || ownerDecisionOptions.length === 0) return null;
  const recommendedOptionId =
    candidateWaveStatusDecision(winner.status) === "more_samples"
      ? "collect_more_samples"
      : "plan_keep_recommended";
  const title = `Owner decision for candidate wave: ${reviewObjective}`;
  const description =
    "Choose one plan-only next step after reviewing packet evidence, candidate diff, and validation. The form is advisory UI data only; executing calls remains explicit.";
  const options = ownerDecisionOptions.map((option) => ({
    optionId: option.optionId,
    label: option.label,
    recommended: option.optionId === recommendedOptionId,
    rationale: option.rationale,
    exactNextCalls: option.exactNextCalls,
  }));
  const interviewQuestions: AutoresearchCandidateWaveOwnerDecisionInterviewPayload = {
    title,
    description,
    questions: [
      {
        id: "candidate_wave_owner_decision",
        type: "single",
        question: `Select the next plan-only action for ${winner.laneId}.`,
        options: options.map((option) => ({
          label: `${option.label}${option.recommended ? " (recommended)" : ""}`,
          value: option.optionId,
          content: {
            lang: "md",
            source: [
              `**Posture:** owner_gate_required`,
              `**Rationale:** ${option.rationale}`,
              "",
              "**Exact next calls:**",
              ...option.exactNextCalls.map((call) => `- \`${call}\``),
            ].join("\n"),
          },
        })),
        ...(recommendedOptionId
          ? {
              recommended: {
                optionId: recommendedOptionId,
                rationale:
                  "Recommended from candidate-wave packet review; owner must still approve.",
              },
            }
          : {}),
        weight: "critical",
      },
    ],
  };
  const primaryUi: AutoresearchCandidateWaveOwnerDecisionPrimaryUi = {
    surface: "pi-autoresearch_candidate_decision_workbench",
    summary:
      "Use pi-autoresearch's existing candidate decision workbench as the primary owner UI after the reviewed lane is current.",
    slashCommand: "/autoresearch review",
    exactPreparationCalls:
      ownerDecisionOptions.find((option) => option.optionId === "collect_more_samples")
        ?.exactNextCalls ?? [],
  };
  return {
    kind: "autoresearch.candidate_wave_owner_decision_form.v1",
    title,
    description,
    questionId: "candidate_wave_owner_decision",
    recommendedOptionId,
    options,
    primaryUi,
    interviewQuestions,
    interviewCall: formatToolCall("interview", {
      questions: JSON.stringify(interviewQuestions),
    }),
    boundary:
      "This owner-decision form does not apply worktree lifecycle actions, write AK/KES/evidence, merge, promote, or mutate candidate state. The interview payload is a fallback for sessions where the pi-autoresearch candidate decision UI is unavailable.",
  };
}

export function discoverDefaultCandidateResultPacketPaths(cwd: string): string[] {
  const defaultDir = path.resolve(cwd, AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR);
  if (!fs.existsSync(defaultDir)) return [];
  return fs
    .readdirSync(defaultDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".candidate-result.json"))
    .map((entry) => `${AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR}/${entry.name}`)
    .sort();
}

export function candidateResultInputsFromReviewRequest(
  input: AutoresearchCandidateWaveReviewRequest,
  cwd: string,
): {
  candidateResults: AutoresearchCandidateWaveResultInput[];
  packetDiscovery: AutoresearchCandidateWavePacketDiscovery;
} {
  const supplied = [...(input.candidateResults ?? [])];
  const explicitPacketPaths = nonEmptyStrings(input.candidateResultPacketPaths);
  const defaultDirectory = path.resolve(cwd, AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR);
  const discoveredPacketPaths =
    explicitPacketPaths.length === 0 && supplied.length === 0
      ? discoverDefaultCandidateResultPacketPaths(cwd)
      : [];
  const packetPaths = explicitPacketPaths.length > 0 ? explicitPacketPaths : discoveredPacketPaths;
  const fromPackets = packetPaths.map((packetPath) =>
    candidateResultInputFromPacketPath(cwd, packetPath),
  );
  const mode =
    explicitPacketPaths.length > 0 ? "explicit" : supplied.length > 0 ? "manual" : "default";
  const message =
    mode === "explicit"
      ? `Using ${packetPaths.length} explicit candidate-result packet path(s).`
      : mode === "manual"
        ? "Using inline candidate results; default packet discovery was not mixed in."
        : `Discovered ${packetPaths.length} default candidate-result packet(s) under ${defaultDirectory}.`;

  return {
    candidateResults: [...supplied, ...fromPackets],
    packetDiscovery: {
      mode,
      defaultDirectory,
      candidateResultPacketPaths: packetPaths,
      message,
    },
  };
}

export function reviewAutoresearchCandidateWave(
  input: AutoresearchCandidateWaveReviewRequest,
): AutoresearchCandidateWaveReview {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("review_candidate_wave requires a non-empty objective.");
  }
  const { candidateResults, packetDiscovery } = candidateResultInputsFromReviewRequest(
    input,
    identity.cwd,
  );
  if (candidateResults.length === 0) {
    throw new Error(
      `review_candidate_wave requires at least one candidate result or packet path; no default candidate-result packets were found under ${packetDiscovery.defaultDirectory}. Export lanes with candidate_result_export to ${AUTORESEARCH_CANDIDATE_WAVE_DEFAULT_PACKET_DIR}/<lane>.candidate-result.json or pass candidateResultPacketPaths explicitly.`,
    );
  }
  const direction = input.direction ?? "lower";
  const offLimits = nonEmptyStrings(input.offLimits);
  const lanes = sortCandidateWaveReviewLanes(
    candidateResults.map((candidate) => {
      const selectable = candidateWaveLaneSelectable(candidate, identity.cwd, offLimits);
      return {
        laneId: candidate.laneId || "candidate-unknown",
        objective: candidate.objective?.trim() || null,
        metric:
          typeof candidate.metric === "number" && Number.isFinite(candidate.metric)
            ? candidate.metric
            : null,
        status: candidate.status || "unknown",
        checksStatus: candidate.checksStatus || "unknown",
        confidence:
          typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
            ? candidate.confidence
            : null,
        candidateSource: candidate.candidateSource || null,
        candidateWorktree: candidate.candidateWorktree || null,
        candidateBranch: candidate.candidateBranch || null,
        candidateBaseRef: candidate.candidateBaseRef || null,
        candidateDiffSummary: candidate.candidateDiffSummary || null,
        candidateFilesChanged: [...(candidate.candidateFilesChanged ?? [])],
        candidatePeerRunId: candidate.candidatePeerRunId || null,
        candidateRunnerId: candidate.candidateRunnerId || null,
        sourcePacketPath: candidate.sourcePacketPath || null,
        caveat: candidate.caveat || null,
        rank: null,
        selectable: selectable.selectable,
        selectionReason: selectable.reason,
      };
    }),
    direction,
  );
  const winner = lanes.find((lane) => lane.rank === 1) ?? null;
  const missingPlannedLanes =
    packetDiscovery.mode === "explicit"
      ? lanes.filter((lane) => normalizeReviewToken(lane.status) === "missing_packet")
      : [];
  const plannedLanesIncomplete = missingPlannedLanes.length > 0;
  const selectableWinner = plannedLanesIncomplete ? null : winner;
  const exactNextCalls = buildCandidateWaveReviewNextCalls({
    cwd: identity.cwd,
    winner: selectableWinner,
  });
  const ownerDecisionOptions = buildCandidateWaveOwnerDecisionOptions({
    cwd: identity.cwd,
    winner: selectableWinner,
  });
  const ownerDecisionForm = buildCandidateWaveOwnerDecisionForm({
    reviewObjective: objective,
    winner: selectableWinner,
    ownerDecisionOptions,
  });
  const management = buildReviewedCandidateWaveManagement({
    taskId: identity.taskId,
    objective,
    lanes,
    plannedLanesIncomplete,
    winner: selectableWinner,
    exactNextCalls,
  });
  const level2CandidateBinding = buildLevel2CandidateBinding(lanes, packetDiscovery);
  const aggregateReviewPayload: Record<string, unknown> = {
    action: "review_candidate_wave",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
  };
  if (packetDiscovery.candidateResultPacketPaths.length > 0) {
    aggregateReviewPayload.candidateResultPacketPaths = packetDiscovery.candidateResultPacketPaths;
  }
  if (offLimits.length > 0) aggregateReviewPayload.offLimits = offLimits;
  const aggregateReviewCall = formatToolCall(
    "autoresearch_live_supervision",
    aggregateReviewPayload,
  );
  const ownerReviewRoute = buildAutoresearchOwnerReviewRoute({
    scopeLabel: `candidate wave ${objective}`,
    aggregateReviewCall,
  });
  const reliabilityRecovery = buildCandidateWaveReliabilityRecovery({
    cwd: identity.cwd,
    lanes,
    winner: selectableWinner,
    aggregateReviewCall,
  });
  const recommendation: AutoresearchCandidateWaveReview["recommendation"] = plannedLanesIncomplete
    ? {
        posture: "planned_lanes_incomplete",
        laneId: null,
        reason: `${missingPlannedLanes.length} explicit planned lane(s) are missing candidate-result packets: ${missingPlannedLanes.map((lane) => lane.laneId).join(", ")}. Final owner selection is gated until every planned lane is measured/exported or the owner replans the wave without that lane.`,
        exactNextCalls,
        ownerDecisionOptions,
        ownerDecisionForm,
      }
    : winner
      ? {
          posture: "owner_selection_required",
          laneId: winner.laneId,
          reason: `Best selectable ${direction}-is-better metric is ${winner.metric}. Owner must still approve keep/finalize.`,
          exactNextCalls,
          ownerDecisionOptions,
          ownerDecisionForm,
        }
      : {
          posture: "no_selectable_candidate",
          laneId: null,
          reason: "No candidate had finite metrics with passing status/check gates.",
          exactNextCalls,
          ownerDecisionOptions,
          ownerDecisionForm,
        };
  const reviewPacket = buildCandidateWaveReviewPacket({
    review: {
      kind: "autoresearch.candidate_wave_review.v1",
      level2CandidateBinding,
      recommendation,
      lanes,
    },
  });

  return {
    kind: "autoresearch.candidate_wave_review.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    direction,
    lanes,
    packetDiscovery,
    recommendation,
    management,
    reliabilityRecovery,
    level2CandidateBinding,
    reviewPacket,
    ownerReviewRoute,
    nextStep: plannedLanesIncomplete
      ? "Wait for every explicit planned lane to reach controller-measured candidate_result_export, or rerun review_candidate_wave with a deliberately revised packet path set after owner replanning."
      : winner
        ? `Review ${winner.laneId}, then use autoresearch_candidate_decision plan_keep/plan_discard/plan_rewind or collect more samples.`
        : "Reject or rerun candidate lanes; no winner is selectable from the supplied results.",
    boundaries: [
      "This review compares supplied candidate-result summaries and/or exported pi-autoresearch candidate-result packets; it does not verify raw peer output by itself.",
      "When no inline results or packet paths are supplied, review_candidate_wave only auto-discovers existing packets under the default candidate-wave packet directory.",
      "Missing candidate-result packet paths are surfaced as non-selectable missing_packet lanes when paths are supplied explicitly, so partial candidate waves remain reviewable.",
      "Explicit planned packet paths gate final owner selection until every planned lane has a controller-measured pi-autoresearch candidate-result packet or the owner deliberately replans the lane set.",
      "Level-2 candidate binding separates peer assertions from controller-verified packet facts before fan-in can be treated as complete.",
      "pi-autoresearch receipts and candidate-result packets remain the measurement source for each candidate.",
      "The recommendation is not promotion authority; owner approval and external promotion gates remain required.",
    ],
  };
}

// ---
// summary: "Post-fan-in finalizer: token request and apply command packets, authorized cleanup gate, lane selection from reviews, and finalizeAutoresearchPostFanin."
// read_when:
//   - "Changing post-fan-in finalizer token/apply packets or the authorized finalizer cleanup gate."
// ---

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import {
  buildCandidateReviewPacketChainMetric,
  reviewAutoresearchCandidateWave,
} from "./autoresearch-candidate-wave.ts";
import type { SessionIdentity } from "./autoresearch-live-supervision.ts";
import { resolveAutoresearchLiveSupervisionIdentity } from "./autoresearch-live-supervision.ts";
import { nonEmptyStrings, shellQuote } from "./autoresearch-runner-utils.ts";
import { reviewAutoresearchMatrixCampaign } from "./autoresearch-supervisor-runner.ts";
import type {
  AutoresearchAuthorizedFinalizerCleanupGate,
  AutoresearchCandidateReviewPacketChainRef,
  AutoresearchCandidateWaveReview,
  AutoresearchMatrixCampaignReview,
  AutoresearchPostFaninFinalizerApplyCommandPacket,
  AutoresearchPostFaninFinalizerCloseoutReceipt,
  AutoresearchPostFaninFinalizerContract,
  AutoresearchPostFaninFinalizerPreflightCheck,
  AutoresearchPostFaninFinalizerRequest,
  AutoresearchPostFaninFinalizerResult,
  AutoresearchPostFaninFinalizerTokenRequestPacket,
  AutoresearchPostFaninValidationEvidence,
} from "./autoresearch-types.ts";
export type AutoresearchPostFaninSelectedLane = {
  cellId: string | null;
  laneId: string;
  candidateBranch: string | null;
  candidateWorktree: string | null;
  candidateBaseRef: string | null;
  sourcePacketPath: string | null;
  filesChanged: readonly string[];
};

export function stableFinalizerHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

export function normalizeRepoPath(value: string): string {
  return value.trim().replace(/\\/gu, "/").replace(/^\.\//u, "");
}

export function offLimitPatternMatches(pattern: string, filePath: string): boolean {
  const normalizedPattern = normalizeRepoPath(pattern);
  const normalizedFile = normalizeRepoPath(filePath);
  if (normalizedPattern.length === 0) return false;
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.endsWith("/")) {
    return normalizedFile.startsWith(normalizedPattern);
  }
  return normalizedFile === normalizedPattern || normalizedFile.startsWith(`${normalizedPattern}/`);
}

export function filesMatchingOffLimits(
  files: readonly string[],
  offLimits: readonly string[],
): string[] {
  return files
    .map(normalizeRepoPath)
    .filter((filePath) => offLimits.some((pattern) => offLimitPatternMatches(pattern, filePath)));
}

export function intersectNormalizedFiles(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const rightSet = new Set(right.map(normalizeRepoPath));
  return left.map(normalizeRepoPath).filter((filePath) => rightSet.has(filePath));
}

export function selectedLaneFromCandidateReview(
  review: AutoresearchCandidateWaveReview,
  requestedLaneId?: string,
): AutoresearchPostFaninSelectedLane | null {
  const laneId = review.recommendation.laneId ?? requestedLaneId;
  if (!laneId) return null;
  const lane = review.lanes.find((candidate) => candidate.laneId === laneId);
  if (!lane) return null;
  return {
    cellId: null,
    laneId: lane.laneId,
    candidateBranch: lane.candidateBranch,
    candidateWorktree: lane.candidateWorktree,
    candidateBaseRef: lane.candidateBaseRef,
    sourcePacketPath: lane.sourcePacketPath,
    filesChanged: lane.candidateFilesChanged,
  };
}

export function selectedLanesFromMatrixReview(
  review: AutoresearchMatrixCampaignReview,
): AutoresearchPostFaninSelectedLane[] {
  return review.cells.flatMap((cell) => {
    const laneId = cell.selectedLaneId;
    if (!laneId) return [];
    const lane = cell.candidateWaveReview.lanes.find((candidate) => candidate.laneId === laneId);
    if (!lane) return [];
    return [
      {
        cellId: cell.cellId,
        laneId: lane.laneId,
        candidateBranch: lane.candidateBranch,
        candidateWorktree: lane.candidateWorktree,
        candidateBaseRef: lane.candidateBaseRef,
        sourcePacketPath: lane.sourcePacketPath,
        filesChanged: lane.candidateFilesChanged,
      },
    ];
  });
}

export function buildPostFaninFinalizerTokenRequestPacket(input: {
  identity: SessionIdentity;
  sourceReview: AutoresearchPostFaninFinalizerRequest["sourceReview"];
  objective: string;
  authorizationToken: string;
  selectedLanes: readonly AutoresearchPostFaninSelectedLane[];
  validation: AutoresearchPostFaninValidationEvidence;
  blockerCount: number;
  reviewReady: boolean;
  reviewPosture: string;
  sourceMetricName: string;
  sourceMetricStatus: string;
  sourceReviewPacketKind:
    | "autoresearch.review_candidate_wave_packet.v1"
    | "autoresearch.review_matrix_campaign_packet.v1"
    | "missing_review_packet";
  packetChainRefs: readonly AutoresearchCandidateReviewPacketChainRef[];
}): AutoresearchPostFaninFinalizerTokenRequestPacket {
  const selectedCandidateResultPacketRefs = input.selectedLanes
    .map((lane) => lane.sourcePacketPath)
    .filter((packetPath): packetPath is string => Boolean(packetPath));
  return {
    kind: "autoresearch.post_fanin_finalizer_token_request.v1",
    sourceReview: input.sourceReview,
    exactTaskId: input.identity.taskId,
    exactCwd: input.identity.cwd,
    objective: input.objective,
    requiredTokenName: "finalize_post_fanin",
    exactAuthorizationToken: input.authorizationToken,
    requestExecution: "not_executed_by_orchestrator",
    candidateResultPacketRefs: selectedCandidateResultPacketRefs,
    reviewResultReference: {
      sourceReview: input.sourceReview,
      posture: input.reviewPosture,
      selectedLaneIds: input.selectedLanes.map((lane) => `${lane.cellId ?? "wave"}/${lane.laneId}`),
    },
    metricPosture: {
      name: "level2_finalizer_token_request_blockers",
      direction: "lower",
      target: 0,
      value: input.blockerCount,
      status: input.blockerCount === 0 ? "target_met" : "blocked",
      sourceMetricName: input.sourceMetricName,
      sourceMetricStatus: input.sourceMetricStatus,
    },
    packetChainTrace: {
      sourceReviewPacketKind: input.sourceReviewPacketKind,
      candidateResultPacketRefs: input.packetChainRefs,
      selectedCandidateResultPacketRefs,
      metric: buildCandidateReviewPacketChainMetric({
        refs: input.packetChainRefs,
        sourceMetricName: input.sourceMetricName,
        sourceMetricStatus: input.sourceMetricStatus,
        requireSelectedPacketRefs: true,
      }),
    },
    permittedFinalizerScope: {
      selectedLanes: input.selectedLanes.map((lane) => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        sourcePacketPath: lane.sourcePacketPath,
        filesChanged: lane.filesChanged.map(normalizeRepoPath),
      })),
      validationCommand: input.validation.command.trim() || null,
      applyCommandsWithheldUntilToken: true,
    },
    separateOwnerTokensRequired: ["candidate_cleanup", "promotion", "ak_owner_write"],
    boundaries: [
      "This is a finalize_post_fanin token request only; it emits no apply command packet until the exact token is supplied.",
      "candidate_cleanup is separate and required before peer tab/session closure, worktree removal, or branch deletion.",
      "promotion is separate and required before cherry-pick, merge, push, PR, release, or promotion.",
      "ak_owner_write is separate and required before durable AK evidence/task/decision/direction writes.",
      "Peer/intercom text and candidate-result packets remain review inputs, not durable evidence.",
      input.reviewReady
        ? "Review posture is ready for requesting a finalizer token."
        : "Review posture is not ready; resolve review/preflight blockers before requesting authorization.",
    ],
    nextLegalActions:
      input.blockerCount === 0
        ? [
            "Owner may copy the exact finalize_post_fanin token into a deliberate finalize_post_fanin call to expose finalizer apply commands only.",
            "Run validation again in the apply lane before any commit decision; merge/release/promotion remains forbidden without a separate promotion token.",
            "Keep candidate cleanup requests separate; routine candidate peer tab/session closure plus worktree removal or branch deletion requires candidate_cleanup, but does not need separate AK evidence unless it is campaign closeout evidence or a boundary exception.",
          ]
        : [
            "Resolve preflight/review blockers and rerun finalize_post_fanin token-request preparation.",
            "Do not infer finalize_post_fanin, candidate_cleanup, or promotion authorization from this blocked request.",
          ],
  };
}

export function buildPostFaninFinalizerApplyCommandPacket(input: {
  identity: SessionIdentity;
  sourceReview: AutoresearchPostFaninFinalizerRequest["sourceReview"];
  objective: string;
  authorizationToken: string;
  selectedLanes: readonly AutoresearchPostFaninSelectedLane[];
  validation: AutoresearchPostFaninValidationEvidence;
}): AutoresearchPostFaninFinalizerApplyCommandPacket {
  const selectedFiles = [
    ...new Set(input.selectedLanes.flatMap((lane) => lane.filesChanged.map(normalizeRepoPath))),
  ].sort();
  const fileArgs = selectedFiles.map(shellQuote).join(" ");
  const commands = [
    `git -C ${shellQuote(input.identity.cwd)} status --short`,
    ...input.selectedLanes.map(
      (lane) =>
        `git -C ${shellQuote(lane.candidateWorktree ?? "<missing-candidate-worktree>")} diff --name-only ${shellQuote(lane.candidateBaseRef ?? "<missing-base-ref>")}...HEAD -- ${lane.filesChanged.map((file) => shellQuote(normalizeRepoPath(file))).join(" ")}`,
    ),
    ...input.selectedLanes.map(
      (lane) =>
        `git -C ${shellQuote(input.identity.cwd)} checkout ${shellQuote(lane.candidateBranch ?? "<missing-candidate-branch>")} -- ${lane.filesChanged.map((file) => shellQuote(normalizeRepoPath(file))).join(" ")}`,
    ),
    input.validation.command,
    `git -C ${shellQuote(input.identity.cwd)} status --short -- ${fileArgs}`,
    `git -C ${shellQuote(input.identity.cwd)} add -- ${fileArgs}`,
    `git -C ${shellQuote(input.identity.cwd)} commit -m ${shellQuote(`autoresearch finalizer: ${input.objective}`)}`,
    `git -C ${shellQuote(input.identity.cwd)} status --short`,
  ];

  return {
    kind: "autoresearch.post_fanin_finalizer_apply_command_packet.v1",
    exactTaskId: input.identity.taskId,
    exactCwd: input.identity.cwd,
    sourceReview: input.sourceReview,
    authorizationToken: input.authorizationToken,
    authorizationRequired: true,
    applyExecution: "not_executed_by_orchestrator",
    selectedLanes: input.selectedLanes.map((lane) => ({
      cellId: lane.cellId,
      laneId: lane.laneId,
      candidateBranch: lane.candidateBranch ?? "<missing-candidate-branch>",
      candidateWorktree: lane.candidateWorktree ?? "<missing-candidate-worktree>",
      candidateBaseRef: lane.candidateBaseRef ?? "<missing-base-ref>",
      sourcePacketPath: lane.sourcePacketPath ?? "<missing-source-packet>",
      filesChanged: lane.filesChanged.map(normalizeRepoPath),
    })),
    exactCommands: commands,
    rollbackNotes: [
      "The orchestrator did not run these commands; rollback belongs to the explicit controller/apply lane that executes them.",
      "If validation or post-apply status fails, stop before commit or revert the explicit commit in the controller lane.",
      "Do not delete candidate worktrees or non-selected lanes from this finalizer packet; lifecycle cleanup needs a separate candidate_cleanup token.",
      "Do not merge, push, release, or promote from this finalizer packet; promotion requires a separate promotion token.",
    ],
    boundary:
      "This packet is an exact explicit finalizer-apply recipe only; pi-society-orchestrator does not checkout, merge, commit, clean, delete, promote, or write evidence from finalizer construction, and this packet carries no candidate_cleanup or promotion authority.",
  };
}

export function findForbiddenFinalizerCleanupPromotionCommandMatches(
  packet: AutoresearchPostFaninFinalizerApplyCommandPacket | null,
): string[] {
  const forbiddenPatterns = [
    /\b(?:merge|push|rebase|tag|release|publish)\b/iu,
    /\b(?:worktree\s+remove|branch\s+-d|branch\s+-D|rm\s+-rf|rm\s+-r)\b/iu,
    /promotion|candidate_cleanup/iu,
  ];
  return (packet?.exactCommands ?? []).filter((command) =>
    forbiddenPatterns.some((pattern) => pattern.test(command)),
  );
}

export function buildAuthorizedFinalizerCleanupGate(input: {
  exactApplyCommandPacket: AutoresearchPostFaninFinalizerApplyCommandPacket | null;
  finalizedWithToken: boolean;
}): AutoresearchAuthorizedFinalizerCleanupGate {
  const forbiddenCommandMatches = findForbiddenFinalizerCleanupPromotionCommandMatches(
    input.exactApplyCommandPacket,
  );
  return {
    name: "authorized_finalizer_cleanup_blockers",
    direction: "lower",
    target: 0,
    value: forbiddenCommandMatches.length,
    status: forbiddenCommandMatches.length === 0 ? "target_met" : "blocked",
    finalizedWithToken: input.finalizedWithToken,
    cleanupAuthorized: false,
    candidatePeerTabClosureIncludedInCleanup: true,
    cleanupEvidenceRequired: false,
    promotionAuthorized: false,
    requiredSeparateTokens: ["candidate_cleanup", "promotion"],
    forbiddenCommandMatches,
    proofs: [
      "finalize_post_fanin authorization only exposes finalizer apply commands; it does not authorize candidate cleanup",
      "candidate_cleanup includes routine candidate peer tab/session closure, worktree removal, branch deletion, reset, and non-selected lane cleanup",
      "routine candidate cleanup does not require separate AK evidence unless it is the campaign/task closeout evidence or a boundary exception",
      "promotion remains required before merge, push, PR, release, publish, tag, or promotion authority handoff",
      input.exactApplyCommandPacket
        ? "authorized finalizer apply packet was scanned for cleanup/promotion command leakage"
        : "no finalizer apply packet was emitted, so cleanup/promotion commands remain absent",
    ],
  };
}

export function finalizeAutoresearchPostFanin(
  input: AutoresearchPostFaninFinalizerRequest,
): AutoresearchPostFaninFinalizerResult {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("post-fan-in finalizer requires a non-empty objective.");
  }
  const direction = input.direction ?? "lower";
  const offLimits = nonEmptyStrings(input.offLimits);
  const dirtyFiles = nonEmptyStrings(input.dirtyFiles);
  const validation = input.validation ?? { command: "", status: "missing" as const };

  const candidateReview =
    input.sourceReview === "review_candidate_wave"
      ? reviewAutoresearchCandidateWave({
          ...identity,
          objective,
          direction,
          candidateResultPacketPaths: input.candidateResultPacketPaths,
        })
      : null;
  const matrixReview =
    input.sourceReview === "review_matrix_campaign"
      ? reviewAutoresearchMatrixCampaign({
          ...identity,
          objective,
          direction,
          metricName: input.metricName,
          metricThreshold: input.metricThreshold,
          scenarios: input.scenarios,
          hypotheses: input.hypotheses,
          candidateCountPerCell: input.candidateCountPerCell,
          offLimits,
        })
      : null;
  const selectedLanes = candidateReview
    ? [selectedLaneFromCandidateReview(candidateReview, input.selectedLaneId)].filter(
        (lane): lane is AutoresearchPostFaninSelectedLane => lane !== null,
      )
    : selectedLanesFromMatrixReview(matrixReview as AutoresearchMatrixCampaignReview);
  const selectedFiles = [
    ...new Set(selectedLanes.flatMap((lane) => lane.filesChanged.map(normalizeRepoPath))),
  ].sort();
  const selectedLaneMatches =
    (!input.selectedLaneId || selectedLanes.some((lane) => lane.laneId === input.selectedLaneId)) &&
    (!input.selectedCellId || selectedLanes.some((lane) => lane.cellId === input.selectedCellId));
  const reviewReady = candidateReview
    ? candidateReview.recommendation.posture === "owner_selection_required"
    : matrixReview?.posture === "ready_for_matrix_owner_review";
  const reviewPosture = candidateReview
    ? candidateReview.recommendation.posture
    : (matrixReview?.posture ?? "missing_review");
  const sourceMetricName = candidateReview
    ? candidateReview.reviewPacket.bindingMetric.name
    : (matrixReview?.reviewPacket.wholeMatrixMetricPosture.name ??
      input.metricName ??
      "unknown_metric");
  const sourceMetricStatus = candidateReview
    ? candidateReview.reviewPacket.bindingMetric.status
    : (matrixReview?.reviewPacket.wholeMatrixMetricPosture.status ?? "blocked");
  const sourceReviewPacketKind = candidateReview
    ? candidateReview.reviewPacket.kind
    : (matrixReview?.reviewPacket.kind ?? "missing_review_packet");
  const packetChainRefs = candidateReview
    ? candidateReview.reviewPacket.candidateResultPacketRefs
    : (matrixReview?.reviewPacket.candidateResultPacketRefs ?? []);
  const packetPaths = selectedLanes
    .map((lane) => lane.sourcePacketPath)
    .filter((packetPath): packetPath is string => Boolean(packetPath));
  const missingPacketPaths = selectedLanes.filter(
    (lane) => !lane.sourcePacketPath || !fs.existsSync(lane.sourcePacketPath),
  );
  const reviewedAtEpochMs =
    typeof input.reviewedAtEpochMs === "number" && Number.isFinite(input.reviewedAtEpochMs)
      ? input.reviewedAtEpochMs
      : null;
  const stalePacketPaths =
    reviewedAtEpochMs === null
      ? []
      : packetPaths.filter(
          (packetPath) =>
            fs.existsSync(packetPath) && fs.statSync(packetPath).mtimeMs > reviewedAtEpochMs,
        );
  const offLimitMatches = filesMatchingOffLimits(selectedFiles, offLimits);
  const dirtyOverlap = intersectNormalizedFiles(selectedFiles, dirtyFiles);
  const missingLaneProof = selectedLanes.filter(
    (lane) =>
      !lane.candidateBranch ||
      !lane.candidateWorktree ||
      !lane.candidateBaseRef ||
      lane.filesChanged.length === 0,
  );
  const fingerprint = stableFinalizerHash({
    taskId: identity.taskId,
    cwd: identity.cwd,
    sourceReview: input.sourceReview,
    objective,
    selectedLanes: selectedLanes.map((lane) => ({
      cellId: lane.cellId,
      laneId: lane.laneId,
      packet: lane.sourcePacketPath,
      files: lane.filesChanged.map(normalizeRepoPath).sort(),
    })),
    validationCommand: validation.command,
    offLimits,
  });
  const authorizationToken = `authorize-post-fanin-finalizer:${fingerprint}`;

  const checks: AutoresearchPostFaninFinalizerPreflightCheck[] = [
    {
      name: "finals_present",
      status:
        reviewReady && selectedLanes.length > 0 && missingPacketPaths.length === 0
          ? "passed"
          : "blocked",
      summary:
        reviewReady && selectedLanes.length > 0 && missingPacketPaths.length === 0
          ? `${selectedLanes.length} selected lane final packet(s) are present.`
          : "Fan-in review is not ready or selected final packet evidence is missing.",
      evidence: [
        `reviewReady=${reviewReady ? "yes" : "no"}`,
        `selectedLanes=${selectedLanes.map((lane) => `${lane.cellId ?? "wave"}/${lane.laneId}`).join(", ") || "none"}`,
        ...missingPacketPaths.map(
          (lane) =>
            `missing packet for ${lane.cellId ?? "wave"}/${lane.laneId}: ${lane.sourcePacketPath ?? "none"}`,
        ),
      ],
    },
    {
      name: "validation_passed",
      status:
        validation.status === "passed" && validation.command.trim().length > 0
          ? "passed"
          : "blocked",
      summary:
        validation.status === "passed" && validation.command.trim().length > 0
          ? `Validation passed via ${validation.command}.`
          : "Validation evidence is missing or failed.",
      evidence: [
        `status=${validation.status}`,
        `command=${validation.command || "missing"}`,
        ...(validation.artifactPath ? [`artifact=${validation.artifactPath}`] : []),
        ...(validation.summary ? [`summary=${validation.summary}`] : []),
      ],
    },
    {
      name: "off_limits_clean",
      status: offLimitMatches.length === 0 ? "passed" : "blocked",
      summary:
        offLimitMatches.length === 0
          ? "Selected lane changed files do not intersect off-limits specs."
          : `Selected lane changed files intersect off-limits specs: ${offLimitMatches.join(", ")}`,
      evidence: [
        `offLimits=${offLimits.join(", ") || "none"}`,
        `selectedFiles=${selectedFiles.join(", ") || "none"}`,
      ],
    },
    {
      name: "dirty_overlap_clean",
      status: dirtyOverlap.length === 0 ? "passed" : "blocked",
      summary:
        dirtyOverlap.length === 0
          ? "No supplied dirty parent/controller files overlap selected lane changes."
          : `Dirty overlap blocks apply: ${dirtyOverlap.join(", ")}`,
      evidence: [
        `dirtyFiles=${dirtyFiles.join(", ") || "none"}`,
        `selectedFiles=${selectedFiles.join(", ") || "none"}`,
      ],
    },
    {
      name: "selected_lane_consistent",
      status: selectedLaneMatches && missingLaneProof.length === 0 ? "passed" : "blocked",
      summary:
        selectedLaneMatches && missingLaneProof.length === 0
          ? "Selected lane identity, branch/worktree/base, and changed-file proof are consistent."
          : "Selected lane identity or lineage proof is inconsistent.",
      evidence: [
        `requestedCell=${input.selectedCellId ?? "not specified"}`,
        `requestedLane=${input.selectedLaneId ?? "not specified"}`,
        `selected=${selectedLanes.map((lane) => `${lane.cellId ?? "wave"}/${lane.laneId}`).join(", ") || "none"}`,
        ...missingLaneProof.map(
          (lane) => `missing lineage proof for ${lane.cellId ?? "wave"}/${lane.laneId}`,
        ),
      ],
    },
    {
      name: "review_artifacts_current",
      status: stalePacketPaths.length === 0 ? "passed" : "blocked",
      summary:
        stalePacketPaths.length === 0
          ? "Selected packet artifacts are not newer than the supplied review timestamp."
          : `Review is stale; packet artifact(s) changed after review: ${stalePacketPaths.join(", ")}`,
      evidence: [
        `reviewedAtEpochMs=${input.reviewedAtEpochMs ?? "not supplied"}`,
        ...stalePacketPaths.map((packetPath) => `stale=${packetPath}`),
      ],
    },
  ];
  const blockerCount = checks.filter((check) => check.status === "blocked").length;
  const preflightPassed = blockerCount === 0;
  const wrongAuthorization =
    Boolean(input.applyAuthorizationToken) && input.applyAuthorizationToken !== authorizationToken;
  const contract: AutoresearchPostFaninFinalizerContract = {
    kind: "autoresearch.post_fanin_finalizer_contract.v1",
    sourceReview: input.sourceReview,
    taskId: identity.taskId,
    cwd: identity.cwd,
    objective,
    applyPosture: "explicit_authorization_required",
    exactAuthorizationToken: authorizationToken,
    requiredPreflightChecks: [
      "finals_present",
      "validation_passed",
      "off_limits_clean",
      "dirty_overlap_clean",
      "selected_lane_consistent",
      "review_artifacts_current",
    ],
    outcomes: ["committed_cleaned", "review_blocked", "failed_closed"],
    boundary:
      "Post-fan-in finalization is a governed preflight plus exact command packet surface; apply/commit/cleanup requires the exact authorization token and still runs outside this orchestrator helper.",
  };
  const tokenRequestBlockerCount = blockerCount + (wrongAuthorization ? 1 : 0);
  const finalizerTokenRequest = buildPostFaninFinalizerTokenRequestPacket({
    identity,
    sourceReview: input.sourceReview,
    objective,
    authorizationToken,
    selectedLanes,
    validation,
    blockerCount: tokenRequestBlockerCount,
    reviewReady,
    reviewPosture,
    sourceMetricName,
    sourceMetricStatus,
    sourceReviewPacketKind,
    packetChainRefs,
  });
  const exactApplyCommandPacket =
    preflightPassed && input.applyAuthorizationToken === authorizationToken
      ? buildPostFaninFinalizerApplyCommandPacket({
          identity,
          sourceReview: input.sourceReview,
          objective,
          authorizationToken,
          selectedLanes,
          validation,
        })
      : null;
  const finalizedWithToken =
    preflightPassed && input.applyAuthorizationToken === authorizationToken;
  const authorizedFinalizerCleanupGate = buildAuthorizedFinalizerCleanupGate({
    exactApplyCommandPacket,
    finalizedWithToken,
  });
  const outcome: AutoresearchPostFaninFinalizerResult["outcome"] =
    !preflightPassed || wrongAuthorization || authorizedFinalizerCleanupGate.status === "blocked"
      ? "failed_closed"
      : finalizedWithToken
        ? "committed_cleaned"
        : "review_blocked";
  const manualResidueValue =
    outcome === "committed_cleaned" ? 0 : Math.max(1, blockerCount + (wrongAuthorization ? 1 : 0));
  const closeoutBlockedReasons = [
    ...checks.filter((check) => check.status === "blocked").map((check) => check.summary),
    ...(wrongAuthorization
      ? ["Supplied applyAuthorizationToken did not match contract token."]
      : []),
    ...authorizedFinalizerCleanupGate.forbiddenCommandMatches.map(
      (command) => `Forbidden cleanup/promotion command leaked into finalizer packet: ${command}`,
    ),
  ];
  const closeoutReceipt: AutoresearchPostFaninFinalizerCloseoutReceipt = {
    kind: "autoresearch.post_fanin_finalizer_closeout_receipt.v1",
    status: outcome,
    execution: "receipt_only_no_mutation",
    taskId: identity.taskId,
    cwd: identity.cwd,
    sourceReview: input.sourceReview,
    validation: {
      command: validation.command.trim().length > 0 ? validation.command : null,
      status: validation.status,
      summary: validation.summary ?? null,
      artifactPath: validation.artifactPath ?? null,
    },
    finalizerApply: {
      posture: exactApplyCommandPacket ? "commands_prepared_not_executed" : "withheld",
      commandCount: exactApplyCommandPacket?.exactCommands.length ?? 0,
      authorizationTokenAccepted: finalizedWithToken,
    },
    evidenceHandoff: {
      posture: "owner_surface_required",
      exactRecordCall: null,
      boundary:
        "AK evidence is intentionally outside the finalizer apply packet; use an exact owner-approved evidence_record/ak command after finalizer closeout review.",
    },
    cleanupHandoff: {
      posture: "separate_candidate_cleanup_gate_required",
      authorizedByFinalizer: false,
      requiredTrigger: "lifecycle_v2_disposition_proof_archive_and_cleanup_authorization",
    },
    blockedReasons: closeoutBlockedReasons,
    recoveryNotes:
      outcome === "failed_closed"
        ? [
            "Do not run finalizer apply, evidence, cleanup, merge, or promotion commands from this failed receipt.",
            "Resolve blocked preflight/authorization state, rerun fan-in review if artifacts changed, then request a fresh finalizer token.",
          ]
        : outcome === "review_blocked"
          ? [
              "Preflight passed; request explicit owner authorization with the exact finalize_post_fanin token before apply commands are used.",
            ]
          : [
              "Apply commands were prepared but not executed by orchestrator; record evidence and cleanup only through their separate owner gates after external apply succeeds.",
            ],
    nonActions: [
      "No finalizer command was executed by pi-society-orchestrator.",
      "No AK evidence/task write was executed by pi-society-orchestrator.",
      "No candidate cleanup, worktree deletion, merge, push, PR, release, or promotion was executed by pi-society-orchestrator.",
    ],
  };

  return {
    kind: "autoresearch.post_fanin_finalizer_result.v1",
    outcome,
    contract,
    preflight: {
      status: preflightPassed ? "passed" : "blocked",
      checks,
      blockerCount: tokenRequestBlockerCount,
    },
    manualPostFaninResidue: {
      name: "manual_post_fanin_residue",
      direction: "lower",
      target: 0,
      value: manualResidueValue,
      status: manualResidueValue === 0 ? "target_met" : "blocked",
    },
    authorizedFinalizerCleanupGate,
    finalizerTokenRequest,
    exactApplyCommandPacket,
    closeoutReceipt,
    nextStep:
      outcome === "committed_cleaned"
        ? "Exact finalize_post_fanin token accepted; run the emitted finalizer apply command packet deliberately in the controller/apply lane only if still intended. Cleanup requires candidate_cleanup, and merge/release/promotion requires promotion. The orchestrator has not executed it."
        : outcome === "review_blocked"
          ? "Preflight passed and a finalize_post_fanin token request was prepared, but apply commands are withheld until the exact authorization token is supplied deliberately."
          : wrongAuthorization
            ? "Fail closed: supplied applyAuthorizationToken did not match the contract token. Re-run preflight and authorize explicitly if still intended."
            : "Fail closed: resolve preflight blockers, rerun fan-in review/finalizer, and do not apply hidden promotion or cleanup.",
    boundaries: [
      "No checkout, merge, commit, cleanup, worktree deletion, evidence write, AK/KES/Prompt Vault/ROCS mutation, or promotion was executed by this finalizer.",
      "Missing finals, failed validation, off-limits drift, dirty overlap, selected-lane mismatch, stale packets, wrong authorization, and cleanup/promotion command leakage fail closed.",
      "The exact apply command packet is communication for an explicit owner-approved finalizer apply lane; it is not durable evidence, completion authority, candidate_cleanup authority, or promotion authority.",
    ],
  };
}

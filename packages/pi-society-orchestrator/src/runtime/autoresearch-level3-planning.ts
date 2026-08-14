// ---
// summary: "Level-3 manifest preflight, slice-sequence dry-run, candidate lifecycle, measure/export/review, matrix-cell runner, and authorized finalizer cleanup planners (pure move from autoresearch-supervisor-runner.ts)."
// read_when:
//   - "Changing level-3 manifest policy gates, candidate lifecycle planning, measurement/export/review planning, or finalizer cleanup authorization."
// ---

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  candidatePathMatchesOffLimitSpec,
  candidateResultInputFromPacketPath,
  normalizeCandidateReviewPath,
  reviewAutoresearchCandidateWave,
} from "./autoresearch-candidate-wave.ts";
import type { SessionIdentity } from "./autoresearch-live-supervision.ts";
import { resolveAutoresearchLiveSupervisionIdentity } from "./autoresearch-live-supervision.ts";
import { LEVEL2_PACKET_LEVEL1_FALLBACK } from "./autoresearch-matrix-campaign.ts";
import { finalizeAutoresearchPostFanin } from "./autoresearch-post-fanin-finalizer.ts";
import {
  exactStringList,
  formatToolCall,
  isRecord,
  metricStatus,
  nonEmptyStrings,
  optionalNumber,
  optionalString,
  readJsonFile,
  sha256StableJson,
  stableJson,
  stringArrayFrom,
} from "./autoresearch-runner-utils.ts";
import type {
  AutoresearchLevel3AuthorizedFinalizerCleanupPlan,
  AutoresearchLevel3AuthorizedFinalizerCleanupRequest,
  AutoresearchLevel3CampaignManifestPreflight,
  AutoresearchLevel3CampaignTransitionReceipt,
  AutoresearchLevel3CandidateLifecycleLane,
  AutoresearchLevel3CleanupCommandPacket,
  AutoresearchLevel3CleanupResourcesInput,
  AutoresearchLevel3IntegrationCloseoutEvidence,
  AutoresearchLevel3ManifestPreflightRequest,
  AutoresearchLevel3MatrixCellRunner,
  AutoresearchLevel3MatrixCellRunnerCell,
  AutoresearchLevel3MatrixCellRunnerCellState,
  AutoresearchLevel3MeasureExportReviewLane,
  AutoresearchLevel3MeasureExportReviewPlan,
  AutoresearchLevel3MeasureExportReviewRequest,
  AutoresearchLevel3PolicyGatePreflight,
  AutoresearchLevel3PolicyPosture,
  AutoresearchLevel3SliceSequenceCellState,
  AutoresearchLevel3SliceSequenceDryRun,
  AutoresearchLevel3SliceSequenceDryRunRequest,
  AutoresearchLevel3SliceSequenceState,
  AutoresearchLevel3VisibleCandidateLifecyclePlan,
  AutoresearchLevel3VisibleCandidateLifecycleRequest,
} from "./autoresearch-types.ts";

const LEVEL3_POLICY_GATE_SPECS: readonly {
  gate: AutoresearchLevel3PolicyGatePreflight["gate"];
  requiredPolicy: readonly string[];
  boundary: string;
}[] = [
  {
    gate: "launchVisibleCandidatePeers",
    requiredPolicy: ["token_required", "policy_or_token_required", "manifest_allowed"],
    boundary:
      "Visible candidate launch is allowed only by accepted manifest policy or launch token.",
  },
  {
    gate: "runMeasurements",
    requiredPolicy: ["manifest_allowed", "policy_or_token_required"],
    boundary: "Measurement execution must route through pi-autoresearch seams.",
  },
  {
    gate: "exportCandidateResults",
    requiredPolicy: ["manifest_allowed", "policy_or_token_required"],
    boundary: "Candidate-result exports are review inputs, not durable evidence.",
  },
  {
    gate: "generateReviewPackets",
    requiredPolicy: ["true", "manifest_allowed"],
    boundary: "Review packet generation is non-authoritative and does not choose promotion.",
  },
  {
    gate: "prepareFinalizerTokenRequest",
    requiredPolicy: ["true", "manifest_allowed"],
    boundary: "Finalizer-token request preparation does not execute finalizer actions.",
  },
  {
    gate: "applyFinalizer",
    requiredPolicy: ["token_required"],
    boundary: "Finalizer application requires the exact finalize_post_fanin token.",
  },
  {
    gate: "cleanupCandidates",
    requiredPolicy: ["token_required", "token_required_or_manifest_allowed"],
    boundary: "Cleanup requires exact cleanup policy/token naming worktrees and branches.",
  },
  {
    gate: "recordAkEvidence",
    requiredPolicy: ["ak_owner_write_required"],
    boundary: "AK evidence writes require exact AK owner-write policy and projection key.",
  },
  {
    gate: "completeAkTask",
    requiredPolicy: ["ak_owner_write_required"],
    boundary: "AK task completion requires task/cwd/manifest hash matching.",
  },
  {
    gate: "mergeReleasePromotion",
    requiredPolicy: ["promotion_token_required"],
    boundary: "Merge, release, and promotion require a separate promotion token.",
  },
];

function resolveLevel3Manifest(input: AutoresearchLevel3ManifestPreflightRequest): {
  manifest: unknown;
  manifestPath: string | null;
} {
  if (input.manifest !== undefined) return { manifest: input.manifest, manifestPath: null };
  if (input.manifestPath && input.manifestPath.trim().length > 0) {
    const resolved = path.isAbsolute(input.manifestPath)
      ? input.manifestPath
      : path.resolve(input.cwd, input.manifestPath);
    return { manifest: readJsonFile(resolved), manifestPath: resolved };
  }
  return { manifest: null, manifestPath: null };
}

function buildLevel3PolicyGatePreflight(policy: Record<string, unknown> | null): {
  gates: AutoresearchLevel3PolicyGatePreflight[];
  blockers: string[];
} {
  const blockers: string[] = [];
  const gates = LEVEL3_POLICY_GATE_SPECS.map((spec) => {
    const value = policy?.[spec.gate];
    const accepted = spec.requiredPolicy.some((allowed) => {
      if (allowed === "true") return value === true;
      return value === allowed;
    });
    const missing = value === undefined;
    const posture: AutoresearchLevel3PolicyPosture = missing
      ? "blocked_missing_policy"
      : accepted
        ? "allowed_by_manifest_policy"
        : "blocked_invalid_policy";
    if (posture !== "allowed_by_manifest_policy") {
      blockers.push(
        `${spec.gate} policy is ${missing ? "missing" : `invalid (${String(value)})`}; expected one of ${spec.requiredPolicy.join(", ")}.`,
      );
    }
    return {
      gate: spec.gate,
      posture,
      value,
      requiredPolicy: spec.requiredPolicy,
      boundary: spec.boundary,
    };
  });
  return { gates, blockers };
}

export function buildAutoresearchLevel3ManifestPreflight(
  input: AutoresearchLevel3ManifestPreflightRequest,
): AutoresearchLevel3CampaignManifestPreflight {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const { manifest, manifestPath } = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const blockers: string[] = [];
  const manifestRecord = isRecord(manifest) ? manifest : null;
  if (!manifestRecord) blockers.push("manifest is required and must be a JSON object.");

  const kind = manifestRecord?.kind;
  if (manifestRecord && kind !== "autoresearch.level3_campaign_manifest.v1") {
    blockers.push("manifest.kind must be autoresearch.level3_campaign_manifest.v1.");
  }
  const manifestTaskId = manifestRecord?.taskId;
  if (manifestRecord && manifestTaskId !== identity.taskId) {
    blockers.push(`manifest.taskId must exactly match ${identity.taskId}.`);
  }
  const manifestCwd = optionalString(manifestRecord?.cwd);
  if (manifestRecord && (!manifestCwd || path.resolve(manifestCwd) !== identity.cwd)) {
    blockers.push(`manifest.cwd must exactly resolve to ${identity.cwd}.`);
  }
  const campaignId = optionalString(manifestRecord?.campaignId) ?? null;
  if (manifestRecord && !campaignId) blockers.push("manifest.campaignId is required.");
  const autonomyLevel = optionalNumber(manifestRecord?.autonomyLevel) ?? null;
  if (manifestRecord && autonomyLevel !== 3) blockers.push("manifest.autonomyLevel must be 3.");

  const primaryMetric = isRecord(manifestRecord?.primaryMetric)
    ? manifestRecord.primaryMetric
    : null;
  const primaryMetricName = optionalString(primaryMetric?.name) ?? null;
  if (manifestRecord && !primaryMetricName)
    blockers.push("manifest.primaryMetric.name is required.");

  const filesInScope = stringArrayFrom(manifestRecord?.filesInScope);
  const offLimits = stringArrayFrom(manifestRecord?.offLimits);
  const rawFilesInScope = manifestRecord?.filesInScope;
  const rawOffLimits = manifestRecord?.offLimits;
  const slices = Array.isArray(manifestRecord?.slices) ? manifestRecord.slices : [];
  if (manifestRecord && !Array.isArray(rawFilesInScope)) {
    blockers.push("manifest.filesInScope must be an array of strings.");
  }
  if (manifestRecord && !Array.isArray(rawOffLimits)) {
    blockers.push("manifest.offLimits must be an array of strings.");
  }
  if (manifestRecord && !Array.isArray(manifestRecord.slices)) {
    blockers.push("manifest.slices must be an array.");
  }
  const normalizedOffLimits = offLimits.map((spec) =>
    normalizeCandidateReviewPath(spec, identity.cwd),
  );
  const offLimitDrift = filesInScope
    .map((filePath) => normalizeCandidateReviewPath(filePath, identity.cwd))
    .filter((filePath) =>
      normalizedOffLimits.some((spec) => candidatePathMatchesOffLimitSpec(filePath, spec)),
    );
  if (offLimitDrift.length > 0) {
    blockers.push(`manifest.filesInScope overlaps offLimits: ${offLimitDrift.join(", ")}.`);
  }

  const policy = isRecord(manifestRecord?.policy) ? manifestRecord.policy : null;
  if (manifestRecord && !policy) blockers.push("manifest.policy is required.");
  const policyPreflight = buildLevel3PolicyGatePreflight(policy);
  const manifestHash = manifestRecord ? sha256StableJson(manifestRecord) : null;
  const schemaBlockers = blockers.length;
  const policyBlockers = policyPreflight.blockers.length;
  const uxBlockers = manifestHash && policyPreflight.gates.length > 0 ? 0 : 1;
  const allBlockers = [...blockers, ...policyPreflight.blockers];
  if (uxBlockers > 0)
    allBlockers.push("preflight UX requires manifest hash and policy gate rendering.");
  const totalBlockers = allBlockers.length;

  return {
    kind: "autoresearch.level3_campaign_manifest_preflight.v1",
    manifestKind:
      kind === "autoresearch.level3_campaign_manifest.v1"
        ? "autoresearch.level3_campaign_manifest.v1"
        : "invalid_or_missing",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestPath,
    manifestHash,
    readOnly: true,
    execution: "not_executed_by_orchestrator",
    metric: {
      name: "level3_manifest_preflight_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      manifestSchemaBlockers: {
        name: "manifest_schema_blockers",
        direction: "lower",
        target: 0,
        value: schemaBlockers,
        status: metricStatus(schemaBlockers),
      },
      manifestPolicyGateBlockers: {
        name: "manifest_policy_gate_blockers",
        direction: "lower",
        target: 0,
        value: policyBlockers,
        status: metricStatus(policyBlockers),
      },
      manifestPreflightUxBlockers: {
        name: "manifest_preflight_ux_blockers",
        direction: "lower",
        target: 0,
        value: uxBlockers,
        status: metricStatus(uxBlockers),
      },
    },
    schema: {
      campaignId,
      autonomyLevel,
      primaryMetricName,
      sliceCount: slices.length,
      fileScopeCount: filesInScope.length,
      offLimitsCount: offLimits.length,
    },
    policyGates: policyPreflight.gates,
    blockers: allBlockers,
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Review and accept the durable manifest before any level-3 action-consuming runner step.",
            "Proceed to Slice 2 dry-run sequencing only; do not launch peers from Slice 1 preflight.",
            LEVEL2_PACKET_LEVEL1_FALLBACK,
          ]
        : [
            "Fix manifest schema/policy blockers and rerun level3_manifest_preflight.",
            "Do not launch peers, run measurements, cleanup, write AK evidence, or promote while preflight is blocked.",
            LEVEL2_PACKET_LEVEL1_FALLBACK,
          ],
    nonActions: [
      "No candidate_peer_spawn call was executed.",
      "No autoresearch measurement, candidate-result export, review, or finalizer action was executed.",
      "No cleanup, branch deletion, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, or promotion was executed.",
    ],
    level2FallbackRoute: LEVEL2_PACKET_LEVEL1_FALLBACK,
    boundaries: [
      "Level-3 manifest preflight is read-only; manifest acceptance is separate from chat text and peer reports.",
      "Policy gates render authorization posture only; dangerous actions still require later stage-specific execution surfaces.",
      "The manifest hash is an audit anchor, not durable evidence until projected through AK owner-write policy.",
    ],
  };
}

function level3NodeId(value: unknown, fallback: string): string {
  return optionalString(isRecord(value) ? value.id : undefined) ?? fallback;
}

function level3NodeDependencies(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [...stringArrayFrom(value.dependsOn), ...stringArrayFrom(value.dependencies)].filter(
    (item, index, items) => item.trim().length > 0 && items.indexOf(item) === index,
  );
}

function level3NodeMetricName(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const direct = optionalString(value.metric);
  if (direct) return direct;
  return isRecord(value.metric) ? (optionalString(value.metric.name) ?? null) : null;
}

function level3NodeMetricDirection(value: unknown): "lower" | "higher" | null {
  if (!isRecord(value)) return null;
  const metric = isRecord(value.metric) ? value.metric : null;
  const direction = optionalString(metric?.direction) ?? optionalString(value.direction);
  return direction === "higher" ? "higher" : direction === "lower" ? "lower" : null;
}

function level3NodeMetricTarget(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const metric = isRecord(value.metric) ? value.metric : null;
  return optionalNumber(metric?.target) ?? optionalNumber(value.metricThreshold) ?? null;
}

function level3CandidateCount(value: unknown, fallback: number): number {
  const raw = isRecord(value)
    ? (optionalNumber(value.candidateCountPerCell) ?? optionalNumber(value.candidateCount))
    : undefined;
  const resolved = raw ?? fallback;
  return Number.isInteger(resolved) && resolved >= 1 && resolved <= 6 ? resolved : fallback;
}

function level3NodeRequiredPolicyGates(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return [
    ...stringArrayFrom(value.requiredPolicyGates),
    ...stringArrayFrom(value.requiresPolicyGates),
    ...stringArrayFrom(value.policyGates),
  ].filter((item, index, items) => item.trim().length > 0 && items.indexOf(item) === index);
}

function buildLevel3SliceSequenceNodes(manifest: unknown): {
  nodes: {
    sliceId: string;
    cellId: string;
    nodeId: string;
    raw: unknown;
    dependencies: readonly string[];
    metricName: string | null;
    requiredPolicyGates: readonly string[];
  }[];
  schemaBlockers: string[];
} {
  if (!isRecord(manifest) || !Array.isArray(manifest.slices)) {
    return { nodes: [], schemaBlockers: ["manifest.slices must be available for sequencing."] };
  }
  const schemaBlockers: string[] = [];
  const nodes: ReturnType<typeof buildLevel3SliceSequenceNodes>["nodes"] = [];
  manifest.slices.forEach((slice, sliceIndex) => {
    const sliceId = level3NodeId(slice, `slice-${String(sliceIndex + 1).padStart(2, "0")}`);
    const sliceDependencies = level3NodeDependencies(slice);
    const slicePolicyGates = level3NodeRequiredPolicyGates(slice);
    const sliceMetricName = level3NodeMetricName(slice);
    const hasExplicitCells =
      isRecord(slice) && Array.isArray(slice.cells) && slice.cells.length > 0;
    const cells =
      hasExplicitCells && isRecord(slice) && Array.isArray(slice.cells) ? slice.cells : [slice];
    cells.forEach((cell, cellIndex) => {
      const cellId = hasExplicitCells
        ? level3NodeId(cell, `${sliceId}:cell-${String(cellIndex + 1).padStart(2, "0")}`)
        : sliceId;
      nodes.push({
        sliceId,
        cellId,
        nodeId: cellId,
        raw: cell,
        dependencies: [...sliceDependencies, ...level3NodeDependencies(cell)].filter(
          (item, index, items) => item.trim().length > 0 && items.indexOf(item) === index,
        ),
        metricName: level3NodeMetricName(cell) ?? sliceMetricName,
        requiredPolicyGates: [...slicePolicyGates, ...level3NodeRequiredPolicyGates(cell)].filter(
          (item, index, items) => item.trim().length > 0 && items.indexOf(item) === index,
        ),
      });
    });
  });
  if (nodes.length === 0)
    schemaBlockers.push("manifest.slices must contain at least one slice/cell.");
  const duplicates = nodes
    .map((node) => node.nodeId)
    .filter((nodeId, index, items) => items.indexOf(nodeId) !== index);
  if (duplicates.length > 0) {
    schemaBlockers.push(
      `manifest slice/cell ids must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}.`,
    );
  }
  return { nodes, schemaBlockers };
}

function policyPostureForRequiredGates(
  requiredPolicyGates: readonly string[],
  preflight: AutoresearchLevel3CampaignManifestPreflight,
): { posture: AutoresearchLevel3PolicyPosture; blockers: string[] } {
  if (requiredPolicyGates.length === 0) return { posture: "not_requested", blockers: [] };
  const blockers: string[] = [];
  for (const gate of requiredPolicyGates) {
    const preflightGate = preflight.policyGates.find((item) => item.gate === gate);
    if (!preflightGate) {
      blockers.push(`required policy gate ${gate} is not recognized by level-3 preflight.`);
    } else if (preflightGate.posture !== "allowed_by_manifest_policy") {
      blockers.push(`required policy gate ${gate} is ${preflightGate.posture}.`);
    }
  }
  return {
    posture: blockers.length === 0 ? "allowed_by_manifest_policy" : "blocked_missing_policy",
    blockers,
  };
}

export function buildAutoresearchLevel3SliceSequenceDryRun(
  input: AutoresearchLevel3SliceSequenceDryRunRequest,
): AutoresearchLevel3SliceSequenceDryRun {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const nodesResult = buildLevel3SliceSequenceNodes(resolved.manifest);
  const orderedStates: AutoresearchLevel3SliceSequenceCellState[] = [];
  const blockers: string[] = [];
  const readyIds = new Set<string>();
  const nodeIds = new Set(nodesResult.nodes.map((node) => node.nodeId));

  if (preflight.metric.status !== "target_met") {
    blockers.push("manifest preflight is blocked; sequencing dry-run fails closed.");
  }
  blockers.push(...nodesResult.schemaBlockers);

  nodesResult.nodes.forEach((node, index) => {
    const missingDependencies = node.dependencies.filter((dependency) => !nodeIds.has(dependency));
    const blockedDependencies = node.dependencies.filter(
      (dependency) => nodeIds.has(dependency) && !readyIds.has(dependency),
    );
    const policy = policyPostureForRequiredGates(node.requiredPolicyGates, preflight);
    const nodeBlockers = [
      ...missingDependencies.map((dependency) => `missing dependency ${dependency}`),
      ...blockedDependencies.map((dependency) => `blocked dependency ${dependency}`),
      ...policy.blockers,
    ];
    const preflightBlocked = preflight.metric.status !== "target_met";
    if (preflightBlocked) nodeBlockers.push("manifest preflight blocked");
    const state: AutoresearchLevel3SliceSequenceState =
      nodeBlockers.length === 0 ? "ready" : "blocked";
    if (state === "ready") readyIds.add(node.nodeId);
    orderedStates.push({
      sliceId: node.sliceId,
      cellId: node.cellId,
      order: index + 1,
      state,
      dependencies: node.dependencies,
      missingDependencies,
      blockedDependencies,
      policyPosture: policy.posture,
      metricName: node.metricName,
      nextLegalAction:
        state === "ready"
          ? "Owner may proceed to the next level-3 dry-run stage; lower-plane actions remain withheld."
          : "Resolve dependency or preflight/policy blockers, then rerun the slice sequence dry-run.",
      blockers: nodeBlockers,
    });
  });

  const orderingBlockers = orderedStates.reduce(
    (count, state) => count + state.missingDependencies.length + state.blockedDependencies.length,
    nodesResult.schemaBlockers.length,
  );
  const recoveryBlockers =
    orderedStates.length > 0 && preflight.level2FallbackRoute.length > 0 ? 0 : 1;
  const receiptBlockers = preflight.manifestHash && orderedStates.length > 0 ? 0 : 1;
  const stateBlockers = orderedStates.reduce((count, state) => count + state.blockers.length, 0);
  const totalBlockers = preflight.metric.value + stateBlockers + receiptBlockers + recoveryBlockers;
  if (stateBlockers > 0) {
    blockers.push(
      ...orderedStates.flatMap((state) =>
        state.blockers.map((blocker) => `${state.cellId}: ${blocker}`),
      ),
    );
  }
  if (receiptBlockers > 0)
    blockers.push("dry-run receipts require a manifest hash and at least one ordered slice/cell.");
  if (recoveryBlockers > 0)
    blockers.push(
      "dry-run recovery UX requires blocked-state guidance and a level-2 fallback route.",
    );

  const receiptPolicyPosture: AutoresearchLevel3CampaignTransitionReceipt["policyPosture"] =
    preflight.metric.status !== "target_met"
      ? "blocked_preflight"
      : orderedStates.some((state) => state.state === "blocked")
        ? "blocked_dependencies_or_policy"
        : "dry_run_no_lower_plane_actions";
  const receipts = preflight.manifestHash
    ? orderedStates.map(
        (state, index): AutoresearchLevel3CampaignTransitionReceipt => ({
          kind: "autoresearch.level3_campaign_transition_receipt.v1",
          nonAuthoritative: true,
          durableEvidence: false,
          manifestHash: preflight.manifestHash as string,
          taskId: identity.taskId,
          cwd: identity.cwd,
          transitionName: "level3_slice_sequence_dry_run",
          policyPosture: receiptPolicyPosture,
          inputRefs: {
            manifestPath: resolved.manifestPath,
            sliceId: state.sliceId,
            cellId: state.cellId,
            dependencies: state.dependencies,
          },
          outputRefs: {
            packetKind: "autoresearch.level3_slice_sequence_dry_run.v1",
            state: state.state,
            receiptIndex: index + 1,
          },
          metricPosture: {
            name:
              state.state === "ready"
                ? "dry_run_receipt_blockers"
                : "autonomous_slice_sequence_blockers",
            direction: "lower",
            target: 0,
            status: state.state === "ready" ? "target_met" : "blocked",
          },
          nextState: state.state,
          rollbackHint: preflight.level2FallbackRoute,
        }),
      )
    : [];

  return {
    kind: "autoresearch.level3_slice_sequence_dry_run.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestKind: preflight.manifestKind,
    manifestPath: resolved.manifestPath,
    manifestHash: preflight.manifestHash,
    readOnly: true,
    execution: "not_executed_by_orchestrator",
    preflight,
    metric: {
      name: "autonomous_slice_sequence_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      sliceOrderingBlockers: {
        name: "slice_ordering_blockers",
        direction: "lower",
        target: 0,
        value: orderingBlockers,
        status: metricStatus(orderingBlockers),
      },
      dryRunReceiptBlockers: {
        name: "dry_run_receipt_blockers",
        direction: "lower",
        target: 0,
        value: receiptBlockers,
        status: metricStatus(receiptBlockers),
      },
      sliceSequenceRecoveryBlockers: {
        name: "slice_sequence_recovery_blockers",
        direction: "lower",
        target: 0,
        value: recoveryBlockers,
        status: metricStatus(recoveryBlockers),
      },
    },
    orderedStates,
    receipts,
    blockers: [...new Set(blockers)],
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Review the dry-run state and receipts; continue only to owner-approved visible level-3 surfaces.",
            "Rerun this dry-run after manifest edits before any lower-plane action is considered.",
            preflight.level2FallbackRoute,
          ]
        : [
            "Resolve blocked slice/cell dependencies, policy, or manifest preflight blockers and rerun the dry-run.",
            "Use the safe rerun command shown in this result after manifest repair.",
            preflight.level2FallbackRoute,
          ],
    safeRerunCommand: formatToolCall("autoresearch_live_supervision", {
      action: "level3_slice_sequence_dry_run",
      taskId: identity.taskId,
      cwd: identity.cwd,
      ...(resolved.manifestPath
        ? { level3ManifestPath: resolved.manifestPath }
        : { level3Manifest: "<inline manifest>" }),
    }),
    level2FallbackRoute: preflight.level2FallbackRoute,
    nonActions: [
      "Dry-run only: no peer launch, lower-plane runtime call, candidate-result export, review/finalizer call, cleanup, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, or promotion was exposed or executed.",
      "Transition receipts are local audit/review inputs only and are not AK evidence.",
    ],
    boundaries: [
      "Slice sequencing dry-run computes ready/blocked state from the accepted manifest shape and preflight output only.",
      "Transition receipts are non-authoritative and become durable evidence only through a future exact AK owner-write gate.",
      "Blocked states show rerun and level-2 fallback routes instead of exposing action-consuming calls.",
    ],
  };
}

function buildLevel3LaunchAuthorization(input: {
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  preflight: AutoresearchLevel3CampaignManifestPreflight;
  suppliedToken?: string;
}): AutoresearchLevel3VisibleCandidateLifecyclePlan["launchAuthorization"] {
  const requiredToken = `launch_visible_candidate_lanes task:${input.taskId} cwd:${input.cwd} manifest:${input.manifestHash ?? "missing"}`;
  const launchGate = input.preflight.policyGates.find(
    (gate) => gate.gate === "launchVisibleCandidatePeers",
  );
  const manifestAllowed = launchGate?.value === "manifest_allowed";
  const suppliedTokenAccepted = input.suppliedToken === requiredToken;
  return {
    posture: manifestAllowed
      ? "allowed_by_manifest_policy"
      : suppliedTokenAccepted
        ? "allowed_by_exact_token"
        : "blocked_missing_policy_or_token",
    requiredToken,
    suppliedTokenAccepted,
  };
}

function buildLevel3CandidateLifecycleLaneSpecs(manifest: unknown): {
  sliceId: string | null;
  cellId: string | null;
  laneId: string;
  objective: string;
  metricName: string | null;
  metricDirection: "lower" | "higher";
  metricTarget: number | null;
  filesInScope: readonly string[];
  offLimits: readonly string[];
}[] {
  const manifestRecord = isRecord(manifest) ? manifest : {};
  const manifestFiles = stringArrayFrom(manifestRecord.filesInScope);
  const manifestOffLimits = stringArrayFrom(manifestRecord.offLimits);
  const manifestPrimaryMetric = isRecord(manifestRecord.primaryMetric)
    ? manifestRecord.primaryMetric
    : null;
  const manifestMetricName = optionalString(manifestPrimaryMetric?.name) ?? null;
  const manifestMetricDirection =
    optionalString(manifestPrimaryMetric?.direction) === "higher" ? "higher" : "lower";
  const manifestMetricTarget = optionalNumber(manifestPrimaryMetric?.target) ?? null;
  const matrixRecord = isRecord(manifestRecord.matrix) ? manifestRecord.matrix : null;
  const manifestCandidateCountPerCell = level3CandidateCount(matrixRecord ?? manifestRecord, 1);
  const nodes = buildLevel3SliceSequenceNodes(manifest).nodes;
  const cellScopedLanes = nodes.flatMap((node) => {
    const raw = isRecord(node.raw) ? node.raw : {};
    const explicitCellLanes = Array.isArray(raw.candidateLanes) ? raw.candidateLanes : [];
    return explicitCellLanes.map((lane, index) => {
      const rawLane = isRecord(lane) ? lane : {};
      const localLaneId = level3NodeId(lane, `candidate-${String(index + 1).padStart(2, "0")}`);
      const laneFiles = stringArrayFrom(rawLane.filesInScope);
      const cellFiles = stringArrayFrom(raw.filesInScope);
      const laneOffLimits = stringArrayFrom(rawLane.offLimits);
      const cellOffLimits = stringArrayFrom(raw.offLimits);
      return {
        sliceId: node.sliceId,
        cellId: node.cellId,
        laneId: `${node.cellId}-${localLaneId}`,
        metricName: level3NodeMetricName(rawLane) ?? node.metricName ?? manifestMetricName,
        metricDirection:
          level3NodeMetricDirection(rawLane) ??
          level3NodeMetricDirection(raw) ??
          manifestMetricDirection,
        metricTarget:
          level3NodeMetricTarget(rawLane) ?? level3NodeMetricTarget(raw) ?? manifestMetricTarget,
        objective:
          optionalString(rawLane.objective) ??
          optionalString(raw.objective) ??
          optionalString(manifestRecord.objective) ??
          `Run visible candidate lifecycle for ${node.cellId}/${localLaneId}.`,
        filesInScope:
          laneFiles.length > 0 ? laneFiles : cellFiles.length > 0 ? cellFiles : manifestFiles,
        offLimits:
          laneOffLimits.length > 0
            ? laneOffLimits
            : cellOffLimits.length > 0
              ? cellOffLimits
              : manifestOffLimits,
      };
    });
  });
  if (cellScopedLanes.length > 0) return cellScopedLanes;

  const explicitLanes = Array.isArray(manifestRecord.candidateLanes)
    ? manifestRecord.candidateLanes
    : [];
  if (explicitLanes.length > 0) {
    return explicitLanes
      .map((lane, index) => ({
        sliceId: null,
        cellId: null,
        laneId: level3NodeId(lane, `candidate-${String(index + 1).padStart(2, "0")}`),
        metricName:
          level3NodeMetricName(lane) ??
          optionalString(isRecord(lane) ? lane.metricName : undefined) ??
          manifestMetricName,
        metricDirection: level3NodeMetricDirection(lane) ?? manifestMetricDirection,
        metricTarget: level3NodeMetricTarget(lane) ?? manifestMetricTarget,
        objective:
          optionalString(isRecord(lane) ? lane.objective : undefined) ??
          optionalString(manifestRecord.objective) ??
          "Run the declared level-3 candidate lane.",
        filesInScope: stringArrayFrom(isRecord(lane) ? lane.filesInScope : undefined),
        offLimits: stringArrayFrom(isRecord(lane) ? lane.offLimits : undefined),
      }))
      .map((lane) => ({
        ...lane,
        filesInScope: lane.filesInScope.length > 0 ? lane.filesInScope : manifestFiles,
        offLimits: lane.offLimits.length > 0 ? lane.offLimits : manifestOffLimits,
      }));
  }

  return nodes.flatMap((node) => {
    const count = level3CandidateCount(node.raw, manifestCandidateCountPerCell);
    return Array.from({ length: count }, (_, index) => ({
      sliceId: node.sliceId,
      cellId: node.cellId,
      laneId: `${node.cellId}-candidate-${String(index + 1).padStart(2, "0")}`,
      metricName: node.metricName ?? manifestMetricName,
      metricDirection: level3NodeMetricDirection(node.raw) ?? manifestMetricDirection,
      metricTarget: level3NodeMetricTarget(node.raw) ?? manifestMetricTarget,
      objective:
        optionalString(isRecord(node.raw) ? node.raw.objective : undefined) ??
        optionalString(manifestRecord.objective) ??
        `Run visible candidate lifecycle for ${node.cellId}.`,
      filesInScope: manifestFiles,
      offLimits: manifestOffLimits,
    }));
  });
}

export function buildAutoresearchLevel3VisibleCandidateLifecyclePlan(
  input: AutoresearchLevel3VisibleCandidateLifecycleRequest,
): AutoresearchLevel3VisibleCandidateLifecyclePlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const authorization = buildLevel3LaunchAuthorization({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    preflight,
    suppliedToken: input.launchAuthorizationToken,
  });
  const laneSpecs = buildLevel3CandidateLifecycleLaneSpecs(resolved.manifest);
  const duplicateLaneIds = laneSpecs
    .map((lane) => lane.laneId)
    .filter((laneId, index, items) => items.indexOf(laneId) !== index);
  const bindings = [...(input.candidateBindings ?? [])];
  const duplicateBindingIds = bindings
    .map((binding) => binding.laneId)
    .filter((laneId, index, items) => items.indexOf(laneId) !== index);
  const bindingsByLane = new Map(bindings.map((binding) => [binding.laneId, binding]));
  const launchAllowed = authorization.posture !== "blocked_missing_policy_or_token";
  const launchPolicyBlockers =
    preflight.metric.status === "target_met" && launchAllowed && input.parentPeerTarget
      ? duplicateLaneIds.length
      : 1 + duplicateLaneIds.length;

  const lanes = laneSpecs.map((lane) => {
    const binding = bindingsByLane.get(lane.laneId) ?? null;
    const blockers: string[] = [];
    if (preflight.metric.status !== "target_met") blockers.push("manifest preflight blocked");
    if (!launchAllowed)
      blockers.push(
        "missing accepted launchVisibleCandidatePeers manifest policy or exact launch token",
      );
    if (!input.parentPeerTarget)
      blockers.push(
        "parentPeerTarget is required before visible candidate launch calls are exposed",
      );
    if (duplicateLaneIds.includes(lane.laneId))
      blockers.push("duplicate manifest candidate lane id");
    if (!binding) blockers.push("missing candidate worktree binding for lane");
    if (duplicateBindingIds.includes(lane.laneId))
      blockers.push("duplicate candidate binding for lane");
    if (binding) {
      if (!binding.candidateWorktree) blockers.push("candidate binding missing worktree");
      if (!binding.candidateBranch) blockers.push("candidate binding missing branch");
      if (!binding.candidateBaseRef) blockers.push("candidate binding missing base ref");
    }
    const launchPosture: AutoresearchLevel3CandidateLifecycleLane["launchPosture"] = !launchAllowed
      ? "blocked_missing_launch_policy_or_token"
      : !input.parentPeerTarget
        ? "blocked_missing_parent_peer_target"
        : "ready_visible_candidate_peer_spawn_call";
    const peerPayload = {
      objective: lane.objective,
      cwd: identity.cwd,
      parentPeerTarget: input.parentPeerTarget,
      filesInScope: lane.filesInScope,
      offLimits: lane.offLimits,
      constraints: [
        "visible candidate lane only",
        `AK task ${identity.taskId}`,
        `manifest ${preflight.manifestHash ?? "missing"}`,
      ],
    };
    return {
      sliceId: lane.sliceId,
      cellId: lane.cellId,
      laneId: lane.laneId,
      objective: lane.objective,
      metricName: lane.metricName,
      metricDirection: lane.metricDirection,
      metricTarget: lane.metricTarget,
      filesInScope: lane.filesInScope,
      offLimits: lane.offLimits,
      launchPosture,
      candidatePeerCall:
        launchPosture === "ready_visible_candidate_peer_spawn_call" &&
        preflight.metric.status === "target_met" &&
        launchAllowed &&
        Boolean(input.parentPeerTarget) &&
        !duplicateLaneIds.includes(lane.laneId)
          ? formatToolCall("candidate_peer_spawn", peerPayload)
          : null,
      bindingPosture: duplicateBindingIds.includes(lane.laneId)
        ? "blocked_duplicate_binding"
        : binding
          ? "bound_visible_candidate_worktree"
          : "blocked_missing_binding",
      binding,
      cleanupPosture: "plan_only_cleanup_token_required",
      cleanupPlan: [
        "Do not close peer tabs/sessions, remove worktrees, delete branches, reset, or clean candidates from this lifecycle plan.",
        "Prepare exact candidate_cleanup token naming peer sessions/tabs, worktrees, and branches before cleanup.",
      ],
      blockers,
    } satisfies AutoresearchLevel3CandidateLifecycleLane;
  });

  const bindingBlockers = lanes.reduce(
    (count, lane) =>
      count +
      (lane.bindingPosture === "bound_visible_candidate_worktree" && lane.blockers.length === 0
        ? 0
        : lane.blockers.filter((blocker) =>
            /binding|duplicate|worktree|branch|base ref/u.test(blocker),
          ).length),
    0,
  );
  const cleanupBlockers = lanes.every(
    (lane) => lane.cleanupPosture === "plan_only_cleanup_token_required",
  )
    ? 0
    : 1;
  const totalBlockers =
    preflight.metric.value + launchPolicyBlockers + bindingBlockers + cleanupBlockers;
  const blockers = [
    ...(preflight.metric.status === "target_met"
      ? []
      : ["manifest preflight is blocked; visible candidate lifecycle fails closed."]),
    ...duplicateLaneIds.map((laneId) => `duplicate manifest candidate lane id ${laneId}`),
    ...duplicateBindingIds.map((laneId) => `duplicate candidate binding for lane ${laneId}`),
    ...lanes.flatMap((lane) => lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`)),
  ];

  return {
    kind: "autoresearch.level3_visible_candidate_lifecycle_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestKind: preflight.manifestKind,
    manifestPath: resolved.manifestPath,
    manifestHash: preflight.manifestHash,
    readOnly: true,
    execution: "not_executed_by_orchestrator",
    preflight,
    launchAuthorization: authorization,
    metric: {
      name: "candidate_lifecycle_automation_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      visibleLaunchPolicyBlockers: {
        name: "visible_launch_policy_blockers",
        direction: "lower",
        target: 0,
        value: launchPolicyBlockers,
        status: metricStatus(launchPolicyBlockers),
      },
      candidateBindingLifecycleBlockers: {
        name: "candidate_binding_lifecycle_blockers",
        direction: "lower",
        target: 0,
        value: bindingBlockers,
        status: metricStatus(bindingBlockers),
      },
      candidateCleanupPolicyBlockers: {
        name: "candidate_cleanup_policy_blockers",
        direction: "lower",
        target: 0,
        value: cleanupBlockers,
        status: metricStatus(cleanupBlockers),
      },
    },
    lanes,
    blockers: [...new Set(blockers)],
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Review visible candidate_peer_spawn calls and bound worktree lineage; execute launch only through the visible tool surface if still intended.",
            "After candidate work completes, route measurement/export/review through the next authorized level-3 slice; this plan does not run them.",
            "Cleanup remains plan-only until exact candidate_cleanup policy/token names peer tabs/sessions, worktrees, and branches.",
          ]
        : [
            "Resolve launch policy/token, parentPeerTarget, duplicate/missing lane bindings, or manifest preflight blockers and rerun this plan.",
            "Do not launch peers, measure/export/review, cleanup, write AK evidence, or promote while lifecycle planning is blocked.",
          ],
    nonActions: [
      "No candidate_peer_spawn call was executed by the orchestrator; visible calls are returned as owner-reviewable text only when authorized.",
      "No autoresearch_runtime_run, candidate_result_export, review, finalizer, cleanup, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, or promotion was executed.",
    ],
    boundaries: [
      "Visible candidate launch requires accepted manifest launch policy or exact launch_visible_candidate_lanes token; chat text and peer reports do not authorize launch.",
      "Candidate bindings are controller-verified lineage inputs, not durable evidence or winner selection.",
      "Cleanup is a plan-only posture here; peer tab/session closure, worktree removal, and branch deletion require separate candidate_cleanup authority.",
    ],
  };
}

export function buildAutoresearchLevel3MeasureExportReviewPlan(
  input: AutoresearchLevel3MeasureExportReviewRequest,
): AutoresearchLevel3MeasureExportReviewPlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const lifecycle = buildAutoresearchLevel3VisibleCandidateLifecyclePlan(input);
  const runGate = preflight.policyGates.find((gate) => gate.gate === "runMeasurements");
  const exportGate = preflight.policyGates.find((gate) => gate.gate === "exportCandidateResults");
  const reviewGate = preflight.policyGates.find((gate) => gate.gate === "generateReviewPackets");
  const measurementAllowed = runGate?.posture === "allowed_by_manifest_policy";
  const exportAllowed = exportGate?.posture === "allowed_by_manifest_policy";
  const reviewAllowed = reviewGate?.posture === "allowed_by_manifest_policy";
  const packetDir = normalizeCandidateReviewPath(
    input.candidateResultPacketDirectory ?? ".autoresearch/level3-measure-export-review",
    identity.cwd,
  );
  const lanes = lifecycle.lanes.map((lane): AutoresearchLevel3MeasureExportReviewLane => {
    const blockers: string[] = [];
    if (lifecycle.metric.status !== "target_met") blockers.push("candidate lifecycle plan blocked");
    if (!measurementAllowed) blockers.push("runMeasurements manifest policy is not allowed");
    if (!exportAllowed) blockers.push("exportCandidateResults manifest policy is not allowed");
    if (!reviewAllowed) blockers.push("generateReviewPackets manifest policy is not allowed");
    if (!lane.binding?.candidateWorktree) blockers.push("missing candidate worktree binding");
    const packetPath = lane.cellId
      ? `${packetDir}/${lane.cellId}/${lane.laneId}.candidate-result.json`
      : `${packetDir}/${lane.laneId}.candidate-result.json`;
    const ready = blockers.length === 0;
    return {
      sliceId: lane.sliceId,
      cellId: lane.cellId,
      laneId: lane.laneId,
      metricName: lane.metricName,
      metricDirection: lane.metricDirection,
      metricTarget: lane.metricTarget,
      measurementPosture: ready ? "ready_manifest_approved" : "blocked",
      exportPosture: ready ? "ready_manifest_approved" : "blocked",
      reviewPosture: ready ? "ready_manifest_approved" : "blocked",
      candidateWorktree: lane.binding?.candidateWorktree ?? null,
      candidateBranch: lane.binding?.candidateBranch ?? null,
      runtimeRunCall: ready
        ? formatToolCall("autoresearch_runtime_run", {
            cwd: lane.binding?.candidateWorktree,
            metricName: lane.metricName ?? "candidate_measure_export_review_blockers",
            direction: lane.metricDirection,
            metricThreshold: lane.metricTarget ?? undefined,
            sourceManifestHash: preflight.manifestHash,
          })
        : null,
      candidateResultExportCall: ready
        ? formatToolCall("autoresearch_runtime_status", {
            cwd: lane.binding?.candidateWorktree,
            action: "candidate_result_export",
            outPath: packetPath,
          })
        : null,
      reviewInputPacketPath: packetPath,
      blockers,
    };
  });
  const measurementPolicyBlockers = measurementAllowed ? 0 : 1;
  const candidateExportBindingBlockers =
    (exportAllowed ? 0 : 1) +
    lanes.reduce((count, lane) => count + (lane.candidateWorktree ? 0 : 1), 0);
  const reviewPacketAuthorityBlockers = reviewAllowed ? 0 : 1;
  const laneBlockers = lanes.reduce((count, lane) => count + lane.blockers.length, 0);
  const totalBlockers =
    preflight.metric.value +
    lifecycle.metric.value +
    measurementPolicyBlockers +
    candidateExportBindingBlockers +
    reviewPacketAuthorityBlockers +
    laneBlockers;
  const aggregateReviewCall =
    totalBlockers === 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "review_candidate_wave",
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective:
            optionalString(isRecord(resolved.manifest) ? resolved.manifest.objective : undefined) ??
            "Review level-3 measured candidates.",
          candidateResultPacketPaths: lanes.map((lane) => lane.reviewInputPacketPath),
        })
      : null;
  return {
    kind: "autoresearch.level3_measure_export_review_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    execution: "not_executed_by_orchestrator",
    preflight,
    lifecycle,
    metric: {
      name: "candidate_measure_export_review_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      measurementPolicyBlockers: {
        name: "measurement_policy_blockers",
        direction: "lower",
        target: 0,
        value: measurementPolicyBlockers,
        status: metricStatus(measurementPolicyBlockers),
      },
      candidateExportBindingBlockers: {
        name: "candidate_export_binding_blockers",
        direction: "lower",
        target: 0,
        value: candidateExportBindingBlockers,
        status: metricStatus(candidateExportBindingBlockers),
      },
      reviewPacketAuthorityBlockers: {
        name: "review_packet_authority_blockers",
        direction: "lower",
        target: 0,
        value: reviewPacketAuthorityBlockers,
        status: metricStatus(reviewPacketAuthorityBlockers),
      },
    },
    lanes,
    aggregateReviewCall,
    blockers: [
      ...new Set([
        ...(preflight.metric.status === "target_met" ? [] : ["manifest preflight blocked"]),
        ...(lifecycle.metric.status === "target_met"
          ? []
          : ["visible candidate lifecycle plan blocked"]),
        ...lanes.flatMap((lane) => lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`)),
      ]),
    ],
    nextLegalActions:
      totalBlockers === 0
        ? [
            "Execute the manifest-approved measurement/export calls only through pi-autoresearch owner seams when ready.",
            "Run the aggregate review call only after candidate-result packets exist; review packets remain non-authoritative.",
          ]
        : [
            "Resolve manifest policy, candidate lifecycle, binding, or packet blockers and rerun the level-3 measure/export/review plan.",
          ],
    nonActions: [
      "No measurement, candidate-result export, or review was executed by this planner; it only emits manifest-approved call packets.",
      "No AK evidence/task write, cleanup, finalizer, merge, release, or promotion was executed.",
    ],
    boundaries: [
      "Measurement/export/review calls are routed only through pi-autoresearch seams and only when manifest policy permits them.",
      "Candidate-result packets and review packets are non-authoritative review inputs, not durable evidence or promotion authority.",
      "Stale/missing/duplicate packet cases must fail closed before owner selection or closeout.",
    ],
  };
}

export function buildAutoresearchLevel3MatrixCellRunner(
  input: AutoresearchLevel3MeasureExportReviewRequest,
): AutoresearchLevel3MatrixCellRunner {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const manifestRecord = isRecord(resolved.manifest) ? resolved.manifest : {};
  const objective =
    optionalString(manifestRecord.objective) ?? "Run the level-3 matrix/cell campaign.";
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const dryRun = buildAutoresearchLevel3SliceSequenceDryRun({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
    manifestPath: resolved.manifestPath ?? undefined,
  });
  const lifecycle = buildAutoresearchLevel3VisibleCandidateLifecyclePlan({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
    manifestPath: resolved.manifestPath ?? undefined,
  });
  const measureExportReview = buildAutoresearchLevel3MeasureExportReviewPlan({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
    manifestPath: resolved.manifestPath ?? undefined,
  });
  const lifecycleByLane = new Map(lifecycle.lanes.map((lane) => [lane.laneId, lane]));
  const orderedCellIds = [
    ...new Set(
      lifecycle.lanes.map((lane) => lane.cellId ?? lane.sliceId ?? "campaign").filter(Boolean),
    ),
  ];
  const sequenceByCell = new Map(dryRun.orderedStates.map((state) => [state.cellId, state]));
  const cells = orderedCellIds.map((cellId): AutoresearchLevel3MatrixCellRunnerCell => {
    const lifecycleLanes = lifecycle.lanes.filter(
      (lane) => (lane.cellId ?? lane.sliceId ?? "campaign") === cellId,
    );
    const measureLanes = measureExportReview.lanes.filter(
      (lane) => (lane.cellId ?? lane.sliceId ?? "campaign") === cellId,
    );
    const firstLifecycleLane = lifecycleLanes[0];
    const firstMeasureLane = measureLanes[0];
    const reviewCandidateWaveCall =
      measureLanes.length > 0
        ? formatToolCall("autoresearch_live_supervision", {
            action: "review_candidate_wave",
            taskId: identity.taskId,
            cwd: identity.cwd,
            objective: firstLifecycleLane?.objective ?? objective,
            direction: firstMeasureLane?.metricDirection ?? "lower",
            candidateResultPacketPaths: measureLanes.map((lane) => lane.reviewInputPacketPath),
            offLimits: firstLifecycleLane?.offLimits ?? [],
          })
        : null;
    const candidateWaveReview = reviewCandidateWaveCall
      ? reviewAutoresearchCandidateWave({
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective: firstLifecycleLane?.objective ?? objective,
          direction: firstMeasureLane?.metricDirection ?? "lower",
          candidateResultPacketPaths: measureLanes.map((lane) => lane.reviewInputPacketPath),
          offLimits: firstLifecycleLane?.offLimits ?? [],
        })
      : null;
    const launchCalls = lifecycleLanes
      .filter((lane) => lane.bindingPosture !== "bound_visible_candidate_worktree")
      .map((lane) => lane.candidatePeerCall)
      .filter((call): call is string => Boolean(call));
    const measureExportCalls = measureLanes.flatMap((lane) =>
      lane.measurementPosture === "ready_manifest_approved"
        ? [lane.runtimeRunCall, lane.candidateResultExportCall].filter((call): call is string =>
            Boolean(call),
          )
        : [],
    );
    const laneRows = measureLanes.map((measureLane) => {
      const lifecycleLane = lifecycleByLane.get(measureLane.laneId);
      const packetPath = measureLane.reviewInputPacketPath;
      const packetExists = fs.existsSync(path.resolve(identity.cwd, packetPath));
      const selected = candidateWaveReview?.recommendation.laneId === measureLane.laneId;
      return {
        laneId: measureLane.laneId,
        launchPosture:
          lifecycleLane?.launchPosture ?? ("blocked_missing_launch_policy_or_token" as const),
        bindingPosture: lifecycleLane?.bindingPosture ?? ("blocked_missing_binding" as const),
        measurementPosture: measureLane.measurementPosture,
        packetPath,
        packetExists,
        selected,
        nextLegalCall: !lifecycleLane?.binding
          ? (lifecycleLane?.candidatePeerCall ?? null)
          : !packetExists && measureLane.runtimeRunCall
            ? measureLane.runtimeRunCall
            : packetExists
              ? reviewCandidateWaveCall
              : measureLane.candidateResultExportCall,
      };
    });
    const launchReadyLaneCount = lifecycleLanes.filter(
      (lane) =>
        lane.candidatePeerCall && lane.launchPosture === "ready_visible_candidate_peer_spawn_call",
    ).length;
    const boundLaneCount = lifecycleLanes.filter(
      (lane) => lane.bindingPosture === "bound_visible_candidate_worktree",
    ).length;
    const measureReadyLaneCount = measureLanes.filter(
      (lane) => lane.measurementPosture === "ready_manifest_approved",
    ).length;
    const packetReadyLaneCount = laneRows.filter((lane) => lane.packetExists).length;
    const sequenceState = sequenceByCell.get(cellId);
    const baseBlockers = [
      ...(preflight.metric.status === "target_met" ? [] : ["manifest preflight blocked"]),
      ...(sequenceState?.state === "blocked"
        ? sequenceState.blockers.map((blocker) => `sequence blocked: ${blocker}`)
        : []),
      ...lifecycleLanes.flatMap((lane) =>
        lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`),
      ),
      ...measureLanes.flatMap((lane) =>
        lane.blockers.map((blocker) => `${lane.laneId}: ${blocker}`),
      ),
    ];
    const state: AutoresearchLevel3MatrixCellRunnerCellState =
      preflight.metric.status !== "target_met" || sequenceState?.state === "blocked"
        ? "blocked_preflight_or_sequence"
        : boundLaneCount === 0 && launchReadyLaneCount > 0
          ? "ready_to_launch_visible_candidates"
          : boundLaneCount < lifecycleLanes.length
            ? "waiting_for_candidate_bindings"
            : measureReadyLaneCount > 0 && packetReadyLaneCount < measureLanes.length
              ? "ready_for_measure_export"
              : packetReadyLaneCount < measureLanes.length
                ? "waiting_for_candidate_result_packets"
                : candidateWaveReview?.recommendation.posture === "owner_selection_required"
                  ? "selected_for_matrix_review"
                  : "cell_rerun_required";
    const stateBlockers =
      state === "ready_to_launch_visible_candidates" ||
      state === "ready_for_measure_export" ||
      state === "selected_for_matrix_review"
        ? []
        : state === "waiting_for_candidate_bindings"
          ? [`${lifecycleLanes.length - boundLaneCount} lane(s) missing candidate bindings`]
          : state === "waiting_for_candidate_result_packets"
            ? [`${measureLanes.length - packetReadyLaneCount} lane packet(s) missing`]
            : state === "cell_rerun_required"
              ? [candidateWaveReview?.recommendation.reason ?? "no selectable candidate"]
              : [];
    return {
      sliceId: firstLifecycleLane?.sliceId ?? null,
      cellId,
      objective: firstLifecycleLane?.objective ?? objective,
      state,
      metricName: firstMeasureLane?.metricName ?? firstLifecycleLane?.metricName ?? null,
      metricDirection:
        firstMeasureLane?.metricDirection ?? firstLifecycleLane?.metricDirection ?? "lower",
      metricTarget: firstMeasureLane?.metricTarget ?? firstLifecycleLane?.metricTarget ?? null,
      laneCount: lifecycleLanes.length,
      launchReadyLaneCount,
      boundLaneCount,
      measureReadyLaneCount,
      packetReadyLaneCount,
      selectedLaneId: candidateWaveReview?.recommendation.laneId ?? null,
      launchCalls,
      measureExportCalls,
      reviewCandidateWaveCall,
      blockers: [...new Set([...baseBlockers, ...stateBlockers])],
      lanes: laneRows,
    };
  });
  const selectedCells = cells.filter((cell) => cell.state === "selected_for_matrix_review").length;
  const blockedCells = cells.filter(
    (cell) =>
      cell.state === "blocked_preflight_or_sequence" || cell.state === "cell_rerun_required",
  ).length;
  const cellBlockerCount = cells.reduce((count, cell) => count + cell.blockers.length, 0);
  const totalBlockers =
    preflight.metric.value +
    dryRun.metric.value +
    lifecycle.metric.value +
    measureExportReview.metric.value +
    cellBlockerCount;
  const selectedPacketPaths = cells.flatMap((cell) =>
    cell.lanes.filter((lane) => lane.selected).map((lane) => lane.packetPath),
  );
  const aggregateReviewCall =
    selectedCells === cells.length && cells.length > 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "review_candidate_wave",
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective,
          candidateResultPacketPaths: selectedPacketPaths,
        })
      : null;
  const finalizerPlanCall =
    selectedCells === cells.length && cells.length > 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "level3_authorized_finalizer_cleanup_plan",
          taskId: identity.taskId,
          cwd: identity.cwd,
          objective,
          sourceReview: "review_matrix_campaign",
          ...(resolved.manifestPath
            ? { level3ManifestPath: resolved.manifestPath }
            : { level3Manifest: "<same accepted inline manifest>" }),
          candidateResultPacketPaths: selectedPacketPaths,
          finalizerAuthorizationToken: "<exact finalize_post_fanin token required>",
          cleanupAuthorizationToken: "<exact candidate_cleanup token required>",
        })
      : null;
  const nextLegalActions = [
    ...cells.flatMap((cell) => {
      if (cell.state === "ready_to_launch_visible_candidates") return cell.launchCalls;
      if (cell.state === "ready_for_measure_export") return cell.measureExportCalls;
      if (cell.state === "selected_for_matrix_review" && cell.reviewCandidateWaveCall)
        return [cell.reviewCandidateWaveCall];
      return [];
    }),
    ...(aggregateReviewCall ? [aggregateReviewCall] : []),
    ...(finalizerPlanCall ? [finalizerPlanCall] : []),
  ];
  return {
    kind: "autoresearch.level3_matrix_cell_runner.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestKind: preflight.manifestKind,
    manifestPath: resolved.manifestPath,
    manifestHash: preflight.manifestHash,
    execution: "not_executed_by_orchestrator",
    preflight,
    dryRun,
    lifecycle,
    measureExportReview,
    metric: {
      name: "level3_matrix_cell_runner_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      readyToLaunchCells: cells.filter(
        (cell) => cell.state === "ready_to_launch_visible_candidates",
      ).length,
      boundCells: cells.filter((cell) => cell.boundLaneCount === cell.laneCount).length,
      measureExportReadyCells: cells.filter((cell) => cell.state === "ready_for_measure_export")
        .length,
      packetReadyCells: cells.filter((cell) => cell.packetReadyLaneCount === cell.laneCount).length,
      selectedCells,
      blockedCells,
    },
    cells,
    aggregateReviewCall,
    finalizerPlanCall,
    nextLegalActions,
    blockers: [
      ...new Set([
        ...preflight.blockers,
        ...dryRun.blockers,
        ...lifecycle.blockers,
        ...measureExportReview.blockers,
        ...cells.flatMap((cell) => cell.blockers.map((blocker) => `${cell.cellId}: ${blocker}`)),
      ]),
    ],
    nonActions: [
      "The unified matrix/cell runner did not spawn peers; it exposes visible candidate_peer_spawn calls only as next legal actions.",
      "The runner did not execute autoresearch_candidate_bind, autoresearch_runtime_run, candidate_result_export, review, finalizer, cleanup, AK evidence, merge, release, or promotion actions.",
      "Peer reports and candidate-result packets remain review inputs, not durable authority or promotion approval.",
    ],
    boundaries: [
      "This is the Level-3 matrix/cell state machine above existing gated seams: launch -> bind -> measure/export -> review -> select/finalize-plan.",
      "Visible candidate launch still requires manifest policy or exact token plus the visible candidate_peer_spawn surface.",
      "Measurement/export/review calls are surfaced only after controller-verified candidate bindings and manifest policy allow them.",
      "Finalizer, cleanup, AK evidence, and promotion remain exact-gated owner surfaces and are never applied by this runner.",
    ],
  };
}

function resolveLevel3CleanupResources(input: {
  cwd: string;
  manifest: unknown;
  cleanupResources?: AutoresearchLevel3CleanupResourcesInput;
  reviewedPeerRunIds: readonly string[];
}): {
  peerRunIds: string[];
  peerTabsOrSessions: string[];
  worktrees: string[];
  branches: string[];
  manifestExact: boolean;
  missing: string[];
} {
  const manifestRecord = isRecord(input.manifest) ? input.manifest : null;
  const policy = isRecord(manifestRecord?.cleanupPolicy) ? manifestRecord.cleanupPolicy : null;
  const manifestPeerRunIds = exactStringList(policy?.exactPeerRunIds);
  const manifestPeers = [
    ...exactStringList(policy?.exactPeerTabsOrSessions),
    ...exactStringList(policy?.exactPeerSessions),
    ...exactStringList(policy?.exactPeerTabs),
  ];
  const manifestWorktrees = exactStringList(policy?.exactWorktrees);
  const manifestBranches = exactStringList(policy?.exactBranches);
  const suppliedPeerRunIds = nonEmptyStrings(input.cleanupResources?.peerRunIds);
  const suppliedPeers = nonEmptyStrings(input.cleanupResources?.peerTabsOrSessions);
  const suppliedWorktrees = nonEmptyStrings(input.cleanupResources?.worktrees);
  const suppliedBranches = nonEmptyStrings(input.cleanupResources?.branches);
  const peerRunIds = suppliedPeerRunIds.length > 0 ? suppliedPeerRunIds : manifestPeerRunIds;
  const peerTabsOrSessions = suppliedPeers.length > 0 ? suppliedPeers : manifestPeers;
  const worktrees = suppliedWorktrees.length > 0 ? suppliedWorktrees : manifestWorktrees;
  const branches = suppliedBranches.length > 0 ? suppliedBranches : manifestBranches;
  const sorted = (items: readonly string[]) =>
    [...new Set(items.map((item) => item.trim()))].sort();
  const same = (left: readonly string[], right: readonly string[]) =>
    stableJson(sorted(left)) === stableJson(sorted(right));
  const reviewedPeerRunIds = sorted(input.reviewedPeerRunIds);
  const peerRunIdsMatchReview =
    reviewedPeerRunIds.length > 0 && same(peerRunIds, reviewedPeerRunIds);
  const manifestExact =
    manifestPeerRunIds.length > 0 &&
    manifestPeers.length > 0 &&
    manifestWorktrees.length > 0 &&
    manifestBranches.length > 0 &&
    peerRunIdsMatchReview &&
    same(peerRunIds, manifestPeerRunIds) &&
    same(peerTabsOrSessions, manifestPeers) &&
    same(worktrees, manifestWorktrees) &&
    same(branches, manifestBranches);
  const missing = [
    ...(reviewedPeerRunIds.length === 0 ? ["peer run ids from reviewed candidate packets"] : []),
    ...(peerRunIds.length === 0 ? ["peer run ids"] : []),
    ...(reviewedPeerRunIds.length > 0 && !peerRunIdsMatchReview
      ? ["peer run ids matching reviewed candidate packets"]
      : []),
    ...(peerTabsOrSessions.length === 0 ? ["peer tabs/sessions"] : []),
    ...(worktrees.length === 0 ? ["worktrees"] : []),
    ...(branches.length === 0 ? ["branches"] : []),
  ];
  return {
    peerRunIds: sorted(peerRunIds),
    peerTabsOrSessions: sorted(peerTabsOrSessions),
    worktrees: sorted(
      worktrees.map((item) => (path.isAbsolute(item) ? item : path.resolve(input.cwd, item))),
    ),
    branches: sorted(branches),
    manifestExact,
    missing,
  };
}

function buildLevel3FinalizerToken(input: {
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  postFaninToken: string;
}): string {
  const digest = createHash("sha256")
    .update(
      `${input.taskId}\0${path.resolve(input.cwd)}\0${input.manifestHash ?? "missing"}\0${input.postFaninToken}`,
    )
    .digest("hex")
    .slice(0, 24);
  return `level3:finalize_post_fanin:task:${input.taskId}:manifest:${input.manifestHash ?? "missing"}:sha256:${digest}`;
}

function buildLevel3CleanupToken(input: {
  taskId: number;
  cwd: string;
  manifestHash: string | null;
  resources: Pick<
    ReturnType<typeof resolveLevel3CleanupResources>,
    "peerRunIds" | "peerTabsOrSessions" | "worktrees" | "branches"
  >;
}): string {
  const digest = createHash("sha256")
    .update(
      stableJson({
        taskId: input.taskId,
        cwd: path.resolve(input.cwd),
        manifestHash: input.manifestHash ?? "missing",
        peerRunIds: input.resources.peerRunIds,
        peerTabsOrSessions: input.resources.peerTabsOrSessions,
        worktrees: input.resources.worktrees,
        branches: input.resources.branches,
      }),
    )
    .digest("hex")
    .slice(0, 24);
  return `level3:candidate_cleanup:task:${input.taskId}:manifest:${input.manifestHash ?? "missing"}:sha256:${digest}`;
}

function buildLevel3CleanupCommandPacket(input: {
  identity: SessionIdentity;
  manifestHash: string;
  gateReference: string;
  cleanupTrigger: AutoresearchLevel3CleanupCommandPacket["cleanupTrigger"];
  resources: Pick<
    ReturnType<typeof resolveLevel3CleanupResources>,
    "peerRunIds" | "peerTabsOrSessions" | "worktrees" | "branches"
  >;
}): AutoresearchLevel3CleanupCommandPacket {
  const candidateLifecycleStatusCall = formatToolCall("candidate_peer_closeout", {
    action: "status",
    peerRunIds: input.resources.peerRunIds,
  });
  const candidateLifecyclePlanCall = formatToolCall("candidate_peer_closeout", {
    action: "plan",
    peerRunIds: input.resources.peerRunIds,
    taskId: input.identity.taskId,
    cleanupTrigger: input.cleanupTrigger,
  });
  return {
    kind: "autoresearch.level3_candidate_lifecycle_closeout_handoff.v2",
    exactTaskId: input.identity.taskId,
    exactCwd: input.identity.cwd,
    manifestHash: input.manifestHash,
    gateReference: input.gateReference,
    authorizationRequired: false,
    cleanupExecution: "not_executed_by_orchestrator",
    cleanupExecutionAuthorized: false,
    cleanupTrigger: input.cleanupTrigger,
    exactPeerRunIds: input.resources.peerRunIds,
    exactPeerTabsOrSessions: input.resources.peerTabsOrSessions,
    exactWorktrees: input.resources.worktrees,
    exactBranches: input.resources.branches,
    candidateLifecycleStatusCall,
    candidateLifecyclePlanCall,
    exactCommands: [],
    forbiddenPromotionCommandMatches: [],
    boundary:
      "This packet is a lifecycle-v2 closeout handoff only. It emits no process, worktree, branch, or registry-v1 cleanup command and carries no merge, push, PR, release, promotion, or AK-write authority.",
  };
}

export function buildAutoresearchLevel3AuthorizedFinalizerCleanupPlan(
  input: AutoresearchLevel3AuthorizedFinalizerCleanupRequest,
): AutoresearchLevel3AuthorizedFinalizerCleanupPlan {
  const identity = resolveAutoresearchLiveSupervisionIdentity(input);
  const resolved = resolveLevel3Manifest({ ...input, cwd: identity.cwd });
  const preflight = buildAutoresearchLevel3ManifestPreflight({
    ...input,
    cwd: identity.cwd,
    manifest: resolved.manifest,
  });
  const objective = input.objective.trim();
  if (objective.length === 0) {
    throw new Error("level3_authorized_finalizer_cleanup_plan requires a non-empty objective.");
  }
  const sourceReview = input.sourceReview ?? "review_candidate_wave";
  const finalizerProbe = finalizeAutoresearchPostFanin({
    ...identity,
    objective,
    sourceReview,
    direction: input.direction,
    metricName: input.metricName,
    metricThreshold: input.metricThreshold,
    candidateResultPacketPaths: input.candidateResultPacketPaths,
    scenarios: input.scenarios,
    hypotheses: input.hypotheses,
    candidateCountPerCell: input.candidateCountPerCell,
    selectedLaneId: input.selectedLaneId,
    selectedCellId: input.selectedCellId,
    validation: input.validation,
    offLimits: input.offLimits,
    dirtyFiles: input.dirtyFiles,
    reviewedAtEpochMs: input.reviewedAtEpochMs,
  });
  const requiredFinalizerToken = buildLevel3FinalizerToken({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    postFaninToken: finalizerProbe.contract.exactAuthorizationToken,
  });
  const finalizerTokenMissing = !input.finalizerAuthorizationToken;
  const finalizerTokenWrong =
    Boolean(input.finalizerAuthorizationToken) &&
    input.finalizerAuthorizationToken !== requiredFinalizerToken;
  const finalizerTokenAccepted =
    preflight.metric.status === "target_met" &&
    finalizerProbe.preflight.status === "passed" &&
    input.finalizerAuthorizationToken === requiredFinalizerToken;
  const finalizer = finalizerTokenAccepted
    ? finalizeAutoresearchPostFanin({
        ...identity,
        objective,
        sourceReview,
        direction: input.direction,
        metricName: input.metricName,
        metricThreshold: input.metricThreshold,
        candidateResultPacketPaths: input.candidateResultPacketPaths,
        scenarios: input.scenarios,
        hypotheses: input.hypotheses,
        candidateCountPerCell: input.candidateCountPerCell,
        selectedLaneId: input.selectedLaneId,
        selectedCellId: input.selectedCellId,
        validation: input.validation,
        offLimits: input.offLimits,
        dirtyFiles: input.dirtyFiles,
        reviewedAtEpochMs: input.reviewedAtEpochMs,
        applyAuthorizationToken: finalizerProbe.contract.exactAuthorizationToken,
      })
    : finalizerProbe;
  const reviewedPeerRunIds = nonEmptyStrings(input.candidateResultPacketPaths)
    .map((packetPath) => candidateResultInputFromPacketPath(identity.cwd, packetPath))
    .map((candidate) => candidate.candidatePeerRunId)
    .filter((peerRunId): peerRunId is string => Boolean(peerRunId));
  const resources = resolveLevel3CleanupResources({
    cwd: identity.cwd,
    manifest: resolved.manifest,
    cleanupResources: input.cleanupResources,
    reviewedPeerRunIds,
  });
  const requiredCleanupToken = buildLevel3CleanupToken({
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    resources,
  });
  const cleanupGate = preflight.policyGates.find((gate) => gate.gate === "cleanupCandidates");
  const cleanupManifestPolicyAccepted =
    preflight.metric.status === "target_met" &&
    cleanupGate?.value === "token_required_or_manifest_allowed" &&
    resources.manifestExact &&
    resources.missing.length === 0;
  const integrationCloseout: AutoresearchLevel3IntegrationCloseoutEvidence = {
    status: input.integrationCloseout?.status ?? "missing",
    ...(input.integrationCloseout?.commit ? { commit: input.integrationCloseout.commit } : {}),
    ...(input.integrationCloseout?.summary ? { summary: input.integrationCloseout.summary } : {}),
  };
  const integrationCloseoutSuccessful = integrationCloseout.status === "successful";
  const successfulIntegrationPlanReady =
    finalizerTokenAccepted && integrationCloseoutSuccessful && resources.missing.length === 0;
  const cleanupTokenWrong =
    Boolean(input.cleanupAuthorizationToken) &&
    input.cleanupAuthorizationToken !== requiredCleanupToken;
  const cleanupTokenAccepted = input.cleanupAuthorizationToken === requiredCleanupToken;
  const cleanupGateAccepted =
    finalizerTokenAccepted &&
    resources.missing.length === 0 &&
    (cleanupTokenAccepted || cleanupManifestPolicyAccepted) &&
    !cleanupTokenWrong;
  const lifecyclePlanReady = cleanupGateAccepted || successfulIntegrationPlanReady;
  const cleanupTrigger: AutoresearchLevel3CleanupCommandPacket["cleanupTrigger"] =
    cleanupTokenAccepted
      ? "candidate_cleanup_token"
      : successfulIntegrationPlanReady
        ? "successful_integration_closeout"
        : "exact_manifest_policy";
  const cleanupCommandPacket = lifecyclePlanReady
    ? buildLevel3CleanupCommandPacket({
        identity,
        manifestHash: preflight.manifestHash ?? "missing",
        gateReference: cleanupTokenAccepted
          ? requiredCleanupToken
          : successfulIntegrationPlanReady
            ? "non_authorizing_successful_integration_closeout"
            : "manifest_cleanup_policy",
        cleanupTrigger,
        resources,
      })
    : null;
  const finalizerTokenBlockers =
    preflight.metric.value +
    finalizer.preflight.blockerCount +
    (finalizerTokenAccepted ? 0 : 1) +
    (finalizer.authorizedFinalizerCleanupGate.status === "blocked" ? 1 : 0);
  const cleanupGateBlockers =
    resources.missing.length +
    (lifecyclePlanReady ? 0 : 1) +
    (cleanupCommandPacket?.forbiddenPromotionCommandMatches.length ?? 0);
  const rollbackBlockers = preflight.manifestHash && finalizer.finalizerTokenRequest ? 0 : 1;
  const totalBlockers = finalizerTokenBlockers + cleanupGateBlockers + rollbackBlockers;
  const blockers = [
    ...(preflight.metric.status === "target_met" ? [] : ["manifest preflight is blocked"]),
    ...(finalizer.preflight.status === "passed"
      ? []
      : ["post-fan-in finalizer preflight is blocked"]),
    ...(finalizerTokenMissing ? ["missing exact finalize_post_fanin level-3 token"] : []),
    ...(finalizerTokenWrong
      ? ["wrong finalize_post_fanin token for task/cwd/manifest/review scope"]
      : []),
    ...resources.missing.map((item) => `cleanup resource set missing exact ${item}`),
    ...(cleanupTokenWrong ? ["wrong candidate_cleanup token for exact cleanup resources"] : []),
    ...(!cleanupTokenAccepted && !cleanupManifestPolicyAccepted && !successfulIntegrationPlanReady
      ? [
          "lifecycle closeout planning requires exact candidate_cleanup token, successful integration closeout with reviewed peer identities and exact resources, or accepted manifest cleanup policy; none authorize deletion",
        ]
      : []),
    ...(finalizerTokenAccepted
      ? []
      : ["cleanup is blocked until the exact finalizer token is accepted"]),
    ...(cleanupCommandPacket?.forbiddenPromotionCommandMatches ?? []).map(
      (command) => `cleanup packet contains forbidden promotion command: ${command}`,
    ),
  ];
  const rollbackReceipt: AutoresearchLevel3CampaignTransitionReceipt = {
    kind: "autoresearch.level3_campaign_transition_receipt.v1",
    nonAuthoritative: true,
    durableEvidence: false,
    manifestHash: preflight.manifestHash ?? "missing",
    taskId: identity.taskId,
    cwd: identity.cwd,
    transitionName: "level3_authorized_finalizer_cleanup_plan",
    policyPosture:
      totalBlockers === 0
        ? "dry_run_no_lower_plane_actions"
        : preflight.metric.status === "target_met"
          ? "blocked_dependencies_or_policy"
          : "blocked_preflight",
    inputRefs: {
      manifestPath: resolved.manifestPath,
      sliceId: "slice-5",
      cellId: "authorized-finalizer-cleanup",
      dependencies: ["review_candidate_wave_or_review_matrix_campaign", "finalize_post_fanin"],
    },
    outputRefs: {
      packetKind: "autoresearch.level3_authorized_finalizer_cleanup_plan.v1",
      state: totalBlockers === 0 ? "ready" : "blocked",
      receiptIndex: 1,
    },
    metricPosture: {
      name: "authorized_finalizer_cleanup_blockers",
      direction: "lower",
      target: 0,
      status: metricStatus(totalBlockers),
    },
    nextState: totalBlockers === 0 ? "ready" : "blocked",
    rollbackHint:
      stringArrayFrom(isRecord(resolved.manifest) ? resolved.manifest.rollback : undefined)[0] ??
      preflight.level2FallbackRoute,
  };
  return {
    kind: "autoresearch.level3_authorized_finalizer_cleanup_plan.v1",
    taskId: identity.taskId,
    cwd: identity.cwd,
    manifestHash: preflight.manifestHash,
    execution: "not_executed_by_orchestrator",
    preflight,
    finalizer,
    finalizerAuthorization: {
      requiredTokenName: "finalize_post_fanin",
      requiredToken: requiredFinalizerToken,
      suppliedTokenAccepted: finalizerTokenAccepted,
      posture: finalizerTokenAccepted
        ? "accepted_exact_token"
        : finalizerTokenWrong
          ? "blocked_wrong_token"
          : "blocked_missing_token",
    },
    cleanupAuthorization: {
      requiredTokenName: "candidate_cleanup",
      requiredToken: requiredCleanupToken,
      suppliedTokenAccepted: cleanupTokenAccepted,
      manifestPolicyAccepted: cleanupManifestPolicyAccepted,
      cleanupExecutionAuthorized: false,
      posture: lifecyclePlanReady
        ? cleanupTokenAccepted
          ? "accepted_exact_token"
          : successfulIntegrationPlanReady
            ? "lifecycle_plan_ready_successful_integration"
            : "accepted_exact_manifest_policy"
        : resources.missing.length > 0
          ? "blocked_missing_exact_resources"
          : cleanupTokenWrong
            ? "blocked_wrong_token"
            : "blocked_missing_token_or_exact_policy",
    },
    metric: {
      name: "authorized_finalizer_cleanup_blockers",
      direction: "lower",
      target: 0,
      value: totalBlockers,
      status: metricStatus(totalBlockers),
    },
    cellMetrics: {
      finalizerTokenApplicationBlockers: {
        name: "finalizer_token_application_blockers",
        direction: "lower",
        target: 0,
        value: finalizerTokenBlockers,
        status: metricStatus(finalizerTokenBlockers),
      },
      cleanupExecutionGateBlockers: {
        name: "cleanup_execution_gate_blockers",
        direction: "lower",
        target: 0,
        value: cleanupGateBlockers,
        status: metricStatus(cleanupGateBlockers),
      },
      postFaninRollbackBlockers: {
        name: "post_fanin_rollback_blockers",
        direction: "lower",
        target: 0,
        value: rollbackBlockers,
        status: metricStatus(rollbackBlockers),
      },
    },
    finalizerApplyCommandPacket: finalizer.exactApplyCommandPacket,
    cleanupCommandPacket,
    integrationCloseout,
    rollbackReceipt,
    blockers: [...new Set(blockers)],
    nextLegalActions:
      totalBlockers === 0
        ? [
            integrationCloseoutSuccessful
              ? "Run the lifecycle-v2 status and plan calls from the closeout handoff; execute only after the exact resource generation reaches cleanup_authorized."
              : "Review the finalizer packet and lifecycle-v2 closeout handoff; successful integration alone does not authorize candidate deletion.",
            "Keep merge, release, PR, push, promotion, and AK evidence/task writes behind separate promotion and ak_owner_write tokens.",
          ]
        : [
            "Resolve manifest, review freshness, dirty/off-limits, exact finalizer token, and exact cleanup policy/token blockers before any post-fan-in action.",
            "Use the rollback receipt hint and fall back to level-2 review/finalizer packet surfaces while blocked.",
          ],
    nonActions: [
      "No candidate_peer_spawn, autoresearch_runtime_run, candidate_result_export, review, finalizer apply, cleanup, AK/KES/Oracle/DSPx/Prompt Vault/ROCS write, merge, release, PR, push, or promotion was executed by this planner.",
      "The candidate closeout packet is a lifecycle-v2 status/plan handoff only; it emits no process, worktree, branch, or registry-v1 cleanup command.",
    ],
    boundaries: [
      "finalize_post_fanin authorizes only finalizer scope for the exact task/cwd/manifest/review packet chain; it does not authorize cleanup, promotion, or AK writes.",
      "candidate_cleanup names the intended closeout resources but cannot replace lifecycle-v2 owner review, integration proof, verified archive, exact cleanup authorization, or terminal receipts.",
      "Dirty overlap, off-limits drift, stale review artifacts, wrong tokens, missing exact cleanup resources, and promotion command leakage fail closed.",
      "Rollback receipt is visible and non-authoritative; receipts/packets become durable evidence only through separate ak_owner_write.",
    ],
  };
}

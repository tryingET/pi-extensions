// ---
// summary: "Level-3 matrix-cell executor state machine and Level-4 campaign runner with receipts, prompt-runner bundle, and launch watch plans (pure move from autoresearch-supervisor-runner.ts)."
// read_when:
//   - "Changing level-3 action selection, level-4 automation receipts, or visible candidate launch watch orchestration."
// ---

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildAutoresearchMatrixCampaignRunnerContract,
  checkpointAutoresearchMatrixCampaignRunner,
  extractJsonStringFromToolCall,
} from "./autoresearch-matrix-campaign.ts";
import {
  chunkArray,
  formatToolCall,
  nonEmptyStrings,
  optionalJsonObject,
  optionalString,
  shellQuote,
} from "./autoresearch-runner-utils.ts";
import type {
  AutoresearchLevel3MatrixCellExecutor,
  AutoresearchLevel3MatrixCellExecutorPosture,
  AutoresearchLevel3MatrixCellExecutorRequest,
  AutoresearchLevel3MatrixCellExecutorSelectedAction,
  AutoresearchLevel4CampaignRunner,
  AutoresearchLevel4CampaignRunnerReceipt,
  AutoresearchLevel4CampaignRunnerRequest,
  AutoresearchLevel4CandidateCloseoutLane,
  AutoresearchLevel4CandidateCloseoutPacket,
  AutoresearchLevel4CandidatePacketInventoryStatus,
  AutoresearchLevel4PostFaninPromotionHandoffPacket,
  AutoresearchLevel4PostIntegrationCleanupReadyPacket,
  AutoresearchLevel4PostIntegrationCleanupRegistrySidecar,
  AutoresearchLevel4PromptRunnerBundle,
  AutoresearchLevel4PromptRunnerLane,
  AutoresearchLevel4VisibleLaunchWatchLanePlan,
  AutoresearchLevel4VisibleLaunchWatchPlan,
  AutoresearchLevel4WholeMatrixExecutor,
} from "./autoresearch-types.ts";

const LEVEL3_MATRIX_CELL_EXECUTOR_ALLOWED_PREFIXES = [
  "autoresearch_candidate_bind(",
  "autoresearch_runtime_run(",
  "autoresearch_runtime_status(",
  "autoresearch_live_supervision(",
] as const;

const LEVEL3_MATRIX_CELL_EXECUTOR_FORBIDDEN_PATTERNS = [
  /candidate_peer_spawn\(/u,
  /scout_peer_spawn\(/u,
  /fork_peer_spawn\(/u,
  /finalize_post_fanin/u,
  /evidence_record\(/u,
  /autoresearch_learning_kes_adapter[\s\S]*"materialize"/u,
  /\bak\s+/u,
  /git\s+(merge|push|reset|worktree\s+remove|branch\s+-D)\b/u,
  /\brm\s+-rf\b/u,
  /candidate_cleanup|promotion/u,
] as const;

function resolveLevel3CompletedActionCount(value: number | undefined): number {
  const resolved = value ?? 0;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new Error(
      `completedActionCount must be a non-negative integer, received: ${String(value)}`,
    );
  }
  return resolved;
}

function classifyLevel3MatrixCellAction(
  call: string,
): Pick<
  AutoresearchLevel3MatrixCellExecutorSelectedAction,
  "allowedByStateMachine" | "forbiddenReason"
> {
  const forbiddenPattern = LEVEL3_MATRIX_CELL_EXECUTOR_FORBIDDEN_PATTERNS.find((pattern) =>
    pattern.test(call),
  );
  if (forbiddenPattern) {
    return {
      allowedByStateMachine: false,
      forbiddenReason: `Forbidden by Level-3 no-hidden-execution boundary: ${String(forbiddenPattern)}`,
    };
  }

  const allowedPrefix = LEVEL3_MATRIX_CELL_EXECUTOR_ALLOWED_PREFIXES.some((prefix) =>
    call.startsWith(prefix),
  );
  if (!allowedPrefix) {
    return {
      allowedByStateMachine: false,
      forbiddenReason:
        "Not one of the Level-3 safe post-checkpoint call families: bind, runtime_run, candidate_result_export/status, or review calls.",
    };
  }

  return { allowedByStateMachine: true, forbiddenReason: null };
}

function buildLevel3MatrixCellExecutorBlockers(input: {
  level3Accepted: boolean;
  selectedAction: AutoresearchLevel3MatrixCellExecutorSelectedAction | null;
}): AutoresearchLevel3MatrixCellExecutor["stateMachineBlockers"] {
  const forbiddenActionMatched = input.selectedAction?.allowedByStateMachine === false;
  const value = (input.level3Accepted ? 0 : 1) + (forbiddenActionMatched ? 1 : 0);
  return {
    name: "level3_state_machine_blockers",
    direction: "lower",
    target: 0,
    value,
    status: value === 0 ? "target_met" : "blocked",
    hiddenExecutionPrevented: true,
    forbiddenActionMatched,
    proofs: [
      {
        proof:
          "Level-3 consumes the Level-3 runner nextLegalActions rather than inventing hidden work",
        status: "present",
        source: "level3.runnerNextLegalActions",
      },
      {
        proof: "at most one selected action is emitted per state-machine step",
        status: "present",
        source: "level3.selectedAction",
      },
      {
        proof: "selected action is reported only; execution remains not_executed_by_orchestrator",
        status: "present",
        source: "level3.selectedAction.execution",
      },
      {
        proof:
          "forbidden peer launch, finalizer, AK/evidence, cleanup, merge, and promotion patterns are blocked",
        status: "present",
        source: "LEVEL3_MATRIX_CELL_EXECUTOR_FORBIDDEN_PATTERNS",
      },
    ],
  };
}

export function advanceAutoresearchLevel3MatrixCellExecutor(
  input: AutoresearchLevel3MatrixCellExecutorRequest,
): AutoresearchLevel3MatrixCellExecutor {
  const level3Runner = checkpointAutoresearchMatrixCampaignRunner(input);
  const completedActionCount = resolveLevel3CompletedActionCount(input.completedActionCount);
  const runnerNextLegalActions = level3Runner.checkpointAccepted
    ? level3Runner.cockpit.nextLegalCampaignActions
    : level3Runner.operatorFollowup.nextLegalActions;
  const totalActionCount = runnerNextLegalActions.length;
  const candidateCall = level3Runner.checkpointAccepted
    ? runnerNextLegalActions[completedActionCount]
    : undefined;
  const selectedAction = candidateCall
    ? {
        index: completedActionCount,
        call: candidateCall,
        source: "level3_matrix_cell_runner.nextLegalActions" as const,
        execution: "not_executed_by_orchestrator" as const,
        controllerMustRunExplicitly: true as const,
        ...classifyLevel3MatrixCellAction(candidateCall),
      }
    : null;
  const stateMachineBlockers = buildLevel3MatrixCellExecutorBlockers({
    level3Accepted: level3Runner.checkpointAccepted,
    selectedAction,
  });
  const posture: AutoresearchLevel3MatrixCellExecutorPosture = !level3Runner.checkpointAccepted
    ? "blocked_by_level3_runner"
    : selectedAction?.allowedByStateMachine === false
      ? "blocked_forbidden_action"
      : selectedAction
        ? "ready_to_present_next_action"
        : "completed_review_ready";
  const emittedNextLegalActions = selectedAction?.allowedByStateMachine
    ? [selectedAction.call]
    : [];

  return {
    kind: "autoresearch.level3_matrix_cell_executor.v1",
    taskId: level3Runner.taskId,
    cwd: level3Runner.cwd,
    objective: level3Runner.objective,
    sourceLevel3RunnerKind: level3Runner.kind,
    sourceLevel3RunnerAlias: "level3_matrix_cell_runner",
    level3Runner,
    completedActionCount,
    totalActionCount,
    remainingActionCount: Math.max(
      0,
      totalActionCount - completedActionCount - (selectedAction ? 1 : 0),
    ),
    posture,
    selectedAction,
    runnerNextLegalActions,
    emittedNextLegalActions,
    stateMachineBlockers,
    boundaries: [
      "Level-3 is a deterministic state-machine executor above level3_matrix_cell_runner output; it emits at most one next action and executes none of it.",
      "No hidden candidate_peer_spawn, scout_peer_spawn, or fork_peer_spawn is allowed from this executor.",
      "No post-fan-in finalizer apply, AK/KES/evidence write, merge, promotion, reset, or candidate cleanup is allowed from this executor.",
      "Controller/workbench must run the emitted action explicitly, then call this executor again with completedActionCount incremented after verification.",
      "PEER_FINAL, review packets, and command packets remain communication/review inputs until owner-controlled surfaces verify and apply them.",
    ],
    nextStep:
      posture === "blocked_by_level3_runner"
        ? "Satisfy level3_matrix_cell_runner checkpoint/lineage requirements first; Level-3 will not advance while Level-3 is blocked."
        : posture === "blocked_forbidden_action"
          ? `Stop: selected runner action is forbidden by Level-3 boundary (${selectedAction?.forbiddenReason ?? "unknown"}).`
          : posture === "completed_review_ready"
            ? "All Level-3 runner nextLegalActions have been stepped through; proceed only to owner review surfaces, not finalizer apply, cleanup, AK write, merge, or promotion."
            : "Run exactly the emittedNextLegalActions[0] outside the orchestrator, verify its result, then call Level-3 again with completedActionCount incremented by one.",
  };
}

function getCandidatePeerRegistryPath(peerRunId: string): string | null {
  if (!/^[a-z0-9._-]+$/iu.test(peerRunId)) return null;
  const stateHome =
    process.env.XDG_STATE_HOME?.trim() || path.join(os.homedir(), ".local", "state");
  return path.join(stateHome, "pi-quests", "peer-registry", `${peerRunId}.json`);
}

function readCandidatePeerRegistrySidecar(input: {
  peerRunId: string;
  cwd: string;
  candidateWorktree?: string;
  candidateBranch?: string;
}): AutoresearchLevel4PostIntegrationCleanupRegistrySidecar {
  const registryPath = getCandidatePeerRegistryPath(input.peerRunId);
  if (!registryPath) {
    return {
      peerRunId: input.peerRunId,
      registryPath: "",
      status: "invalid_registry_sidecar",
      worktreePath: null,
      branchName: null,
      archiveDir: null,
      blockers: ["peerRunId is not a path-safe candidate peer registry id"],
    };
  }

  if (!fs.existsSync(registryPath)) {
    return {
      peerRunId: input.peerRunId,
      registryPath,
      status: "missing_registry_sidecar",
      worktreePath: null,
      branchName: null,
      archiveDir: null,
      blockers: [`missing candidate peer registry sidecar for ${input.peerRunId}`],
    };
  }

  try {
    const parsed = optionalJsonObject(JSON.parse(fs.readFileSync(registryPath, "utf8")));
    const cleanupPacket = optionalJsonObject(parsed?.cleanupPacket);
    const peerRunId = optionalString(parsed?.peerRunId);
    const canonicalTool = optionalString(parsed?.canonicalTool);
    const parentCwd = optionalString(parsed?.parentCwd);
    const repoRoot = optionalString(parsed?.repoRoot);
    const worktreePath = optionalString(parsed?.worktreePath);
    const branchName = optionalString(parsed?.branchName);
    const archiveDir =
      optionalString(parsed?.archiveDir) ?? optionalString(cleanupPacket?.archiveDir);
    const blockers = [
      ...(parsed?.schemaVersion === 1 ? [] : ["registry schemaVersion is not 1"]),
      ...(peerRunId === input.peerRunId
        ? []
        : ["registry peerRunId does not match requested peerRunId"]),
      ...(canonicalTool === "candidate_peer_spawn"
        ? []
        : ["registry canonicalTool is not candidate_peer_spawn"]),
      ...(parentCwd && path.resolve(parentCwd) === path.resolve(input.cwd)
        ? []
        : repoRoot && path.resolve(repoRoot) === path.resolve(input.cwd)
          ? []
          : ["registry parentCwd/repoRoot does not match campaign cwd"]),
      ...(worktreePath ? [] : ["registry worktreePath is missing"]),
      ...(branchName ? [] : ["registry branchName is missing"]),
      ...(archiveDir ? [] : ["registry archiveDir is missing"]),
      ...(input.candidateWorktree &&
      worktreePath &&
      path.resolve(input.candidateWorktree) !== path.resolve(worktreePath)
        ? ["controller candidateWorktree does not match registry worktreePath"]
        : []),
      ...(input.candidateBranch && branchName && input.candidateBranch !== branchName
        ? ["controller candidateBranch does not match registry branchName"]
        : []),
    ];
    return {
      peerRunId: input.peerRunId,
      registryPath,
      status: blockers.length === 0 ? "verified_registry_sidecar" : "mismatched_registry_sidecar",
      worktreePath: worktreePath ?? null,
      branchName: branchName ?? null,
      archiveDir: archiveDir ?? null,
      blockers,
    };
  } catch (error) {
    return {
      peerRunId: input.peerRunId,
      registryPath,
      status: "invalid_registry_sidecar",
      worktreePath: null,
      branchName: null,
      archiveDir: null,
      blockers: [
        `invalid candidate peer registry sidecar: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function resolveLevel4MaxParallelCandidatePeers(value: unknown): number {
  if (value === undefined || value === null) return 4;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 12) {
    throw new Error("maxParallelCandidatePeers must be an integer from 1 to 12.");
  }
  return value as number;
}

function buildLevel4MaterializationPreflightCommands(cwd: string): string[] {
  const packageJsonPath = path.join(cwd, "package.json");
  if (fs.existsSync(packageJsonPath)) {
    return [
      `npm --prefix ${shellQuote(cwd)} install`,
      `npm --prefix ${shellQuote(cwd)} run check --if-present`,
    ];
  }
  const rootPackageJsonPath = findNearestPackageJson(cwd);
  if (rootPackageJsonPath) {
    const packageRoot = path.dirname(rootPackageJsonPath);
    return [
      `npm --prefix ${shellQuote(packageRoot)} install`,
      `npm --prefix ${shellQuote(packageRoot)} run check --if-present`,
    ];
  }
  return [];
}

function findNearestPackageJson(cwd: string): string | null {
  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function buildLevel4PromptRunnerBundle(
  input: AutoresearchLevel4CampaignRunnerRequest,
  executor: AutoresearchLevel3MatrixCellExecutor,
): AutoresearchLevel4PromptRunnerBundle {
  const contract = buildAutoresearchMatrixCampaignRunnerContract(input);
  const checkpointAccepted = executor.level3Runner.checkpointAccepted;
  const missingParentPeerTarget =
    contract.launchPhase.visibleCandidateLaneBinding.missingParentPeerTarget;
  const state: AutoresearchLevel4PromptRunnerBundle["state"] = missingParentPeerTarget
    ? "blocked_missing_parent_peer_target"
    : checkpointAccepted
      ? "checkpoint_accepted_controller_sequence_ready"
      : executor.level3Runner.posture === "blocked_until_exact_controller_checkpoint"
        ? "ready_to_launch_visible_candidate_peers"
        : "waiting_for_peer_final_and_lineage_verification";

  const promptBundle = contract.lanes.map((lane): AutoresearchLevel4PromptRunnerLane => {
    const peerRunIdPlaceholder = `<peerRunId from candidate_peer_spawn for ${lane.cellId}/${lane.laneId}>`;
    const worktreePlaceholder = `<${lane.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`;
    const baseRefPlaceholder = `<${lane.cellId}-${lane.laneId}-base-ref-from-candidate_peer_spawn>`;
    const branchPlaceholder = `<${lane.cellId}-${lane.laneId}-branch-from-candidate_peer_spawn>`;
    const diffPlaceholder = `<${lane.cellId}-${lane.laneId}-controller-verified-diff-summary>`;
    const filesPlaceholder = `<${lane.cellId}-${lane.laneId}-changed-files>`;
    const lineageVerificationChecklist = [
      `Capture peerRunId from candidate_peer_spawn for ${lane.cellId}/${lane.laneId}.`,
      `Wait for ACK and FINAL with ${formatToolCall("intercom", { action: "peer_watch", peerRunId: peerRunIdPlaceholder, waitFor: "both" })}.`,
      `Verify candidate worktree exists and is isolated: git -C ${worktreePlaceholder} status --short.`,
      `Verify base ref before bind: git -C ${worktreePlaceholder} merge-base --is-ancestor ${baseRefPlaceholder} HEAD.`,
      `Verify branch/ref: git -C ${worktreePlaceholder} rev-parse --abbrev-ref HEAD must match ${branchPlaceholder}.`,
      `Capture diff summary and changed files: git -C ${worktreePlaceholder} diff --stat ${baseRefPlaceholder}...HEAD and git -C ${worktreePlaceholder} diff --name-only ${baseRefPlaceholder}...HEAD.`,
      `Substitute ${diffPlaceholder} and ${filesPlaceholder} only from controller-verified git output, never from peer text alone.`,
    ];
    const promptTitle = `Level-4 matrix prompt runner lane ${lane.cellId}/${lane.laneId}`;
    const promptMarkdown = [
      `# ${promptTitle}`,
      "",
      "## Objective",
      lane.objective,
      "",
      "## Required execution pattern",
      "1. Work only in the visible `candidate_peer_spawn` candidate worktree.",
      "2. Produce one bounded candidate patch for this cell/lane.",
      "3. Run the smallest truthful validation available inside the candidate worktree.",
      "4. Report PEER_ACK promptly and PEER_FINAL with worktree path, branch, base ref, changed files, validation, and caveats.",
      "",
      "## Controller launch call",
      "```text",
      lane.candidatePeerCall,
      "```",
      "",
      "## Controller after-final checklist",
      ...lineageVerificationChecklist.map((item) => `- ${item}`),
      "",
      "## Controller post-final calls after lineage verification",
      "```text",
      ...lane.measurementPlan,
      "```",
      "",
      "## Boundaries",
      "- Do not merge, promote, write AK/KES/evidence, delete/reset worktrees, or claim durable authority.",
      "- Peer text is communication only; controller-verified git/worktree facts plus pi-autoresearch packets are review inputs.",
    ].join("\n");
    return {
      cellId: lane.cellId,
      laneId: lane.laneId,
      objective: lane.objective,
      promptTitle,
      promptMarkdown,
      candidatePeerSpawnCall: lane.candidatePeerCall,
      peerAckWatchCall: formatToolCall("intercom", {
        action: "peer_watch",
        peerRunId: peerRunIdPlaceholder,
        waitFor: "ack",
      }),
      peerFinalWatchCall: formatToolCall("intercom", {
        action: "peer_watch",
        peerRunId: peerRunIdPlaceholder,
        waitFor: "final",
      }),
      lineageVerificationChecklist,
      postFinalControllerCalls: lane.measurementPlan,
    };
  });

  const launchWatchBlockers = [
    ...(missingParentPeerTarget
      ? ["missing parentPeerTarget for visible candidate peer report-back"]
      : []),
    ...(promptBundle.length === 0 ? ["no prompt-runner lanes were generated"] : []),
    ...(contract.launchPhase.visibleCandidateLaneBinding.hiddenLaunchCallCount > 0
      ? ["hidden launch calls detected; only visible candidate_peer_spawn is allowed"]
      : []),
  ];
  const launchWatchLaneState: AutoresearchLevel4VisibleLaunchWatchLanePlan["state"] =
    missingParentPeerTarget
      ? "blocked_missing_parent_peer_target"
      : state === "ready_to_launch_visible_candidate_peers"
        ? "ready_for_visible_launch"
        : state === "checkpoint_accepted_controller_sequence_ready"
          ? "checkpoint_accepted_lineage_verified"
          : "waiting_for_ack_final_and_lineage";
  const visibleLaunchWatchPlan: AutoresearchLevel4VisibleLaunchWatchPlan = {
    kind: "autoresearch.level4_visible_candidate_launch_watch_orchestration.v1",
    execution: "plan_only_controller_must_execute_visible_tools",
    parentPeerTarget: input.parentPeerTarget?.trim() || null,
    lanePlans: promptBundle.map(
      (lane): AutoresearchLevel4VisibleLaunchWatchLanePlan => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        launchSurface: "candidate_peer_spawn",
        launchCall: lane.candidatePeerSpawnCall,
        peerRunIdSource: "candidate_peer_spawn_return_value",
        ackWatchCall: lane.peerAckWatchCall,
        finalWatchCall: lane.peerFinalWatchCall,
        controllerVerificationRequired: ["ack", "final", "worktree_lineage"],
        state: launchWatchLaneState,
      }),
    ),
    sequence: promptBundle.flatMap((lane) => [
      lane.candidatePeerSpawnCall,
      lane.peerAckWatchCall,
      lane.peerFinalWatchCall,
      ...lane.lineageVerificationChecklist,
    ]),
    metric: {
      name: "level4_visible_launch_watch_blockers",
      direction: "lower",
      target: 0,
      value: launchWatchBlockers.length,
      status: launchWatchBlockers.length === 0 ? "target_met" : "blocked",
      blockers: launchWatchBlockers,
    },
    exactGatesPreserved: [
      "finalize_post_fanin",
      "candidate_cleanup",
      "ak_owner_write",
      "promotion",
    ],
    forbiddenActions: [
      "hidden peer spawn",
      "controller-inline implementation patch",
      "finalize_post_fanin apply",
      "candidate_cleanup",
      "ak_owner_write/evidence write",
      "merge/release/promotion",
    ],
    boundaries: [
      "This is a launch/watch orchestration plan only; it returns visible candidate_peer_spawn and intercom watch calls without executing them.",
      "ACK and PEER_FINAL are communication only; controller-verified git/worktree facts are required before bind/measure/export/review.",
      "Finalizer, cleanup, AK owner writes, merge, release, and promotion remain separate exact owner gates.",
    ],
    nextStep:
      launchWatchBlockers.length > 0
        ? "Resolve launch/watch blockers before launching visible candidate peers."
        : state === "checkpoint_accepted_controller_sequence_ready"
          ? "Visible launch/watch lineage is checkpointed; proceed only with controller-verified bind/measure/export/review calls."
          : "Controller may execute the visible candidate_peer_spawn calls, watch ACK/FINAL, verify lineage, then proceed to bind/measure/export/review.",
  };
  const maxParallelCandidatePeers = resolveLevel4MaxParallelCandidatePeers(
    input.maxParallelCandidatePeers,
  );
  const defaultMaterializationPreflight = buildLevel4MaterializationPreflightCommands(input.cwd);
  const wholeMatrixExecutorBlockers = [
    ...(visibleLaunchWatchPlan.metric.blockers ?? []),
    ...(maxParallelCandidatePeers < 1 ? ["maxParallelCandidatePeers must be at least 1"] : []),
    ...(promptBundle.length === 0
      ? ["no visible candidate lanes available for whole-matrix execution"]
      : []),
    ...(defaultMaterializationPreflight.length === 0
      ? [
          "no dependency/materialization preflight command could be inferred for cwd; provide package hydration before measurement",
        ]
      : []),
  ];
  const wholeMatrixParallelExecutor: AutoresearchLevel4WholeMatrixExecutor = {
    kind: "autoresearch.level4_whole_matrix_parallel_executor.v1",
    execution: "bounded_parallel_visible_tools_with_controller_verification",
    concurrencyLimit: maxParallelCandidatePeers,
    totalLaneCount: promptBundle.length,
    batchCount: Math.ceil(promptBundle.length / maxParallelCandidatePeers),
    batches: chunkArray(promptBundle, maxParallelCandidatePeers).map((lanes, index) => ({
      batchIndex: index + 1,
      concurrencyLimit: maxParallelCandidatePeers,
      lanes: lanes.map((lane) => ({
        cellId: lane.cellId,
        laneId: lane.laneId,
        launchCall: lane.candidatePeerSpawnCall,
        ackWatchCall: lane.peerAckWatchCall,
        finalWatchCall: lane.peerFinalWatchCall,
        materializationPreflight: defaultMaterializationPreflight,
        lineageVerificationCommands: lane.lineageVerificationChecklist,
        safeMeasurementExportReviewCalls: lane.postFinalControllerCalls,
      })),
    })),
    ackFinalWatchContract: {
      waitFor: "both",
      peerTextIsCommunicationOnly: true,
      requiredBeforeLineageCheckpoint: ["PEER_ACK", "PEER_FINAL"],
    },
    lineageVerificationGate: {
      requiredFacts: ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"],
      source: "controller_git_verification_not_peer_text",
      blocksMeasurementUntilSatisfied: true,
    },
    materializationPreflight: {
      perLaneRequired: true,
      commandsAreControllerExecuted: true,
      defaultCommands: defaultMaterializationPreflight,
      blockerMetric: {
        name: "matrix_materialization_preflight_blockers",
        direction: "lower",
        target: 0,
        value: defaultMaterializationPreflight.length === 0 ? 1 : 0,
        status: defaultMaterializationPreflight.length === 0 ? "blocked" : "target_met",
        blockers:
          defaultMaterializationPreflight.length === 0
            ? ["missing inferred package dependency/materialization preflight"]
            : [],
      },
    },
    safeAutomation: {
      peerLaunch: "visible_candidate_peer_spawn_only",
      bindRunExportReview: "after_ack_final_lineage_and_materialization",
      matrixReview: "after_candidate_result_packets",
      stoppedOwnerGates: [
        "finalize_post_fanin",
        "candidate_cleanup",
        "ak_owner_write",
        "promotion",
        "merge",
      ],
    },
    metric: {
      name: "true_parallel_whole_matrix_executor_blockers",
      direction: "lower",
      target: 0,
      value: wholeMatrixExecutorBlockers.length,
      status: wholeMatrixExecutorBlockers.length === 0 ? "target_met" : "blocked",
      blockers: wholeMatrixExecutorBlockers,
    },
    boundaries: [
      "Whole-matrix execution is bounded into explicit parallel batches of visible candidate_peer_spawn calls; no hidden peer launch is allowed.",
      "ACK/FINAL watches and candidate lineage verification gate every bind/measure/export/review call.",
      "Dependency/materialization preflight is required per lane before measurement to avoid false failures from unhydrated candidate worktrees.",
      "Candidate-result packets remain local projections; finalizer, cleanup, AK/KES/evidence writes, merge, release, and promotion stop at owner gates.",
    ],
    nextStep:
      wholeMatrixExecutorBlockers.length === 0
        ? "Execute each batch concurrently up to concurrencyLimit: launch visible peers, wait for ACK/FINAL, verify lineage and materialization, then run safe bind/measure/export/review calls; stop before owner gates."
        : "Resolve whole-matrix executor blockers before treating this as executable parallel campaign choreography.",
  };
  const postFinalControllerSequence = checkpointAccepted
    ? executor.level3Runner.benchmarkExportReviewCalls
    : contract.lanes.flatMap((lane) => [...lane.measurementPlan, lane.reviewCandidateWaveCall]);
  const closeoutBlockers = [
    ...(promptBundle.length === 0 ? ["no prompt-runner lanes were generated for closeout"] : []),
    ...(postFinalControllerSequence.length === 0
      ? ["no bind/measure/export/review sequence is available for closeout comparison"]
      : []),
  ];
  const cockpitInventoryByLane = new Map(
    executor.level3Runner.cockpit.packetInventory.map((row) => [
      `${row.cellId}\0${row.laneId}`,
      row,
    ]),
  );
  const packetInventoryRows: AutoresearchLevel4CandidateCloseoutPacket["packetInventory"]["rows"] =
    promptBundle.map((lane) => {
      const contractLane = contract.lanes.find(
        (candidate) => candidate.cellId === lane.cellId && candidate.laneId === lane.laneId,
      );
      const cockpitRow = cockpitInventoryByLane.get(`${lane.cellId}\0${lane.laneId}`);
      const sourceState = cockpitRow?.state ?? "not_in_cockpit";
      const packetPath =
        cockpitRow?.packetPath ??
        contractLane?.candidateResultPacketPath ??
        "<candidate-result-packet-path>";
      const packetExists =
        !packetPath.startsWith("<") && fs.existsSync(path.resolve(input.cwd, packetPath));
      const status: AutoresearchLevel4CandidatePacketInventoryStatus =
        sourceState === "measured_exported_selectable" ||
        sourceState === "measured_exported_not_selectable" ||
        packetExists
          ? "controller_verified_measured_packet"
          : sourceState === "missing_packet" || sourceState === "packet_missing"
            ? "pending_candidate_result_packet"
            : checkpointAccepted || sourceState === "measurement_export_unlocked"
              ? "pending_measurement_or_export"
              : state === "ready_to_launch_visible_candidate_peers"
                ? "pending_visible_launch"
                : "pending_controller_lineage_verification";
      return {
        cellId: lane.cellId,
        laneId: lane.laneId,
        packetPath,
        sourceState,
        status,
        controllerVerified: status === "controller_verified_measured_packet",
        measuredPacket: status === "controller_verified_measured_packet",
        selected: cockpitRow?.selected ?? false,
      };
    });
  const pendingPacketRows = packetInventoryRows.filter(
    (row) => row.status !== "controller_verified_measured_packet",
  );
  const controllerVerifiedMeasuredPacketRows = packetInventoryRows.filter(
    (row) => row.status === "controller_verified_measured_packet",
  );
  const packetInventory = {
    totalLaneCount: packetInventoryRows.length,
    pendingVisibleLaunchCount: packetInventoryRows.filter(
      (row) => row.status === "pending_visible_launch",
    ).length,
    pendingControllerLineageVerificationCount: packetInventoryRows.filter(
      (row) => row.status === "pending_controller_lineage_verification",
    ).length,
    pendingMeasurementOrExportCount: packetInventoryRows.filter(
      (row) => row.status === "pending_measurement_or_export",
    ).length,
    pendingCandidateResultPacketCount: packetInventoryRows.filter(
      (row) => row.status === "pending_candidate_result_packet",
    ).length,
    controllerVerifiedMeasuredPacketCount: controllerVerifiedMeasuredPacketRows.length,
    pendingPacketPaths: pendingPacketRows.map((row) => row.packetPath),
    controllerVerifiedMeasuredPacketPaths: controllerVerifiedMeasuredPacketRows.map(
      (row) => row.packetPath,
    ),
    rows: packetInventoryRows,
    summary: `${controllerVerifiedMeasuredPacketRows.length}/${packetInventoryRows.length} controller-verified measured packet(s); ${pendingPacketRows.length} pending`,
  };
  const bindingByLaneId = new Map(
    (input.candidateBindings ?? []).map((binding) => [binding.laneId, binding]),
  );
  const isPlaceholderCleanupValue = (value: string): boolean => value.startsWith("<");
  const cleanupRows = promptBundle.map((lane) => {
    const binding =
      bindingByLaneId.get(lane.laneId) ?? bindingByLaneId.get(`${lane.cellId}-${lane.laneId}`);
    const peerRunId =
      binding?.candidatePeerRunId ?? `<peerRunId for ${lane.cellId}/${lane.laneId}>`;
    const registrySidecar = isPlaceholderCleanupValue(peerRunId)
      ? null
      : readCandidatePeerRegistrySidecar({
          peerRunId,
          cwd: input.cwd,
          candidateWorktree: binding?.candidateWorktree,
          candidateBranch: binding?.candidateBranch,
        });
    const worktree =
      binding?.candidateWorktree ??
      registrySidecar?.worktreePath ??
      `<${lane.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`;
    const branch =
      binding?.candidateBranch ??
      registrySidecar?.branchName ??
      extractJsonStringFromToolCall(lane.candidatePeerSpawnCall, "branchName") ??
      `<${lane.cellId}-${lane.laneId}-branch-from-candidate_peer_spawn>`;
    const archiveDirectory =
      registrySidecar?.archiveDir ??
      path.join(
        os.homedir(),
        ".local",
        "state",
        "pi-quests",
        "archives",
        `cleanup-level4-task-${input.taskId}-${lane.cellId}-${lane.laneId}`,
      );
    return { lane, peerRunId, worktree, branch, archiveDirectory, registrySidecar };
  });
  const registrySidecars = cleanupRows
    .map((row) => row.registrySidecar)
    .filter((sidecar): sidecar is AutoresearchLevel4PostIntegrationCleanupRegistrySidecar =>
      Boolean(sidecar),
    );
  const cleanupBlockers = [
    ...(input.integrationCloseout?.status === "successful"
      ? []
      : ["integrationCloseout.status must be successful before post-integration cleanup is ready"]),
    ...cleanupRows.flatMap((row) => [
      ...(isPlaceholderCleanupValue(row.peerRunId)
        ? [`missing exact peerRunId for ${row.lane.cellId}/${row.lane.laneId}`]
        : []),
      ...(isPlaceholderCleanupValue(row.worktree)
        ? [`missing exact worktree for ${row.lane.cellId}/${row.lane.laneId}`]
        : []),
      ...(isPlaceholderCleanupValue(row.branch)
        ? [`missing exact branch for ${row.lane.cellId}/${row.lane.laneId}`]
        : []),
      ...(row.registrySidecar?.blockers ?? []),
    ]),
  ];
  const exactPeerRunIds = cleanupRows
    .map((row) => row.peerRunId)
    .filter((peerRunId) => !isPlaceholderCleanupValue(peerRunId));
  const exactWorktrees = cleanupRows
    .map((row) => row.worktree)
    .filter((worktree) => !isPlaceholderCleanupValue(worktree));
  const exactBranches = cleanupRows
    .map((row) => row.branch)
    .filter((branch) => !isPlaceholderCleanupValue(branch));
  const exactCleanupRows = cleanupRows.filter(
    (row) =>
      !isPlaceholderCleanupValue(row.peerRunId) &&
      !isPlaceholderCleanupValue(row.worktree) &&
      !isPlaceholderCleanupValue(row.branch),
  );
  const registrySidecarBlockerCount = registrySidecars.reduce(
    (sum, sidecar) => sum + sidecar.blockers.length,
    exactPeerRunIds.length === registrySidecars.length ? 0 : exactPeerRunIds.length,
  );
  const canDryRunCleanup = exactPeerRunIds.length > 0 && registrySidecarBlockerCount === 0;
  const candidateLifecycleStatusCall =
    canDryRunCleanup && cleanupBlockers.length === 0
      ? formatToolCall("candidate_peer_closeout", {
          action: "status",
          peerRunIds: exactPeerRunIds,
        })
      : null;
  const candidateLifecyclePlanCall =
    cleanupBlockers.length === 0
      ? formatToolCall("candidate_peer_closeout", {
          action: "plan",
          peerRunIds: exactPeerRunIds,
          taskId: input.taskId,
          integrationCloseout: input.integrationCloseout,
        })
      : null;
  const selectedMeasuredRows = packetInventoryRows.filter(
    (row) => row.status === "controller_verified_measured_packet" && row.selected,
  );
  const fanInComplete =
    packetInventoryRows.length > 0 &&
    packetInventoryRows.every((row) => row.status === "controller_verified_measured_packet");
  const ownerReviewCall = fanInComplete
    ? (contract.lanes[0]?.reviewCandidateWaveCall ?? null)
    : null;
  const finalizerTokenRequestCall =
    fanInComplete && selectedMeasuredRows.length > 0
      ? formatToolCall("autoresearch_live_supervision", {
          action: "level3_authorized_finalizer_cleanup_plan",
          taskId: input.taskId,
          cwd: input.cwd,
          objective: input.objective,
          sourceReview: "review_matrix_campaign",
          candidateResultPacketPaths: selectedMeasuredRows.map((row) => row.packetPath),
          selectedLaneId:
            selectedMeasuredRows.length === 1
              ? selectedMeasuredRows[0]?.laneId
              : "<owner-selected-lane-id>",
          selectedCellId:
            selectedMeasuredRows.length === 1
              ? selectedMeasuredRows[0]?.cellId
              : "<owner-selected-cell-id>",
          validation: {
            command: "<owner validation command>",
            status: "passed",
            summary: "<owner validation summary>",
          },
        })
      : null;
  const promotionHandoffBlockers = [
    ...(fanInComplete
      ? []
      : ["all planned candidate lanes must have controller-verified measured packets"]),
    ...(fanInComplete && selectedMeasuredRows.length === 0
      ? ["owner review must select a measured lane before finalizer token request"]
      : []),
  ];
  const postFaninPromotionHandoff: AutoresearchLevel4PostFaninPromotionHandoffPacket = {
    kind: "autoresearch.level4_post_fanin_promotion_handoff.v1",
    execution: "plan_only_owner_gate_handoff",
    posture: !fanInComplete
      ? "blocked_until_candidate_fan_in_complete"
      : selectedMeasuredRows.length > 0
        ? "ready_for_finalizer_token_request"
        : "ready_for_owner_review",
    selectedLaneCount: selectedMeasuredRows.length,
    controllerVerifiedMeasuredPacketCount: controllerVerifiedMeasuredPacketRows.length,
    totalLaneCount: packetInventoryRows.length,
    ownerReviewCall,
    finalizerTokenRequestCall,
    evidenceRecordHandoff: {
      posture: fanInComplete ? "owner_surface_after_review" : "blocked_until_owner_review",
      ownerSurface: "AK",
      exactRecordCall: null,
      boundary:
        "AK evidence remains an owner-surface write after owner review/finalizer closeout; Level-4 never fabricates durable evidence from peer text or local receipts.",
    },
    sequence: [
      "compare_measured_candidate_packets",
      "owner_selects_lane",
      "run_validation",
      "request_finalize_post_fanin_token",
      "apply_finalizer_only_with_exact_token",
      "record_evidence_only_through_owner_surface",
      "cleanup_only_after_successful_integration_closeout",
    ],
    blockers: promotionHandoffBlockers,
    boundary:
      "This handoff collapses the post-fan-in tail into one visible owner-gated sequence; it does not select a winner, apply a finalizer, write AK evidence, merge, promote, or clean candidates by itself.",
    nextStep: !fanInComplete
      ? "Finish bind/measure/export for every planned lane or explicitly replan the lane set before owner review."
      : selectedMeasuredRows.length === 0
        ? "Run the owner review surface on measured candidate packets, select a lane, validate it, then rerun Level-4 or level3_authorized_finalizer_cleanup_plan for the exact finalizer token request."
        : "Use finalizerTokenRequestCall to request the exact finalize_post_fanin token after validation; keep AK evidence, cleanup, and promotion as separate owner gates.",
  };

  const postIntegrationCleanupReady: AutoresearchLevel4PostIntegrationCleanupReadyPacket = {
    kind: "autoresearch.level4_post_integration_cleanup_ready.v1",
    execution: "not_executed_by_orchestrator",
    readiness:
      cleanupBlockers.length === 0
        ? "ready_after_successful_integration_closeout"
        : "blocked_until_successful_integration_closeout",
    integrationCloseout: {
      status: input.integrationCloseout?.status ?? "missing",
      ...(input.integrationCloseout?.commit ? { commit: input.integrationCloseout.commit } : {}),
      ...(input.integrationCloseout?.summary ? { summary: input.integrationCloseout.summary } : {}),
    },
    registrySidecars,
    exactPeerRunIds,
    exactPeerTabsOrSessions: exactPeerRunIds,
    exactWorktrees,
    exactBranches,
    archiveDirectories: exactCleanupRows.map((row) => row.archiveDirectory),
    tabClosureHints: exactCleanupRows.map(
      (row) =>
        `Close visible peer tab/session for exact peerRunId ${row.peerRunId}; do not fuzzy-match unrelated Pi tabs.`,
    ),
    processTerminationHints: exactCleanupRows.map(
      (row) =>
        `Terminate only sidequest/peer processes whose command line contains exact candidate worktree ${row.worktree}.`,
    ),
    candidatePeerCleanupDryRunCall: null,
    candidatePeerCleanupExecuteCall: null,
    exactControllerCommands: [],
    candidateLifecycleStatusCall,
    candidateLifecyclePlanCall,
    blockers: cleanupBlockers,
    boundary:
      "Post-integration cleanup is a controller/workbench lifecycle-v2 handoff only. Registry-v1 cleanup packets and raw worktree/branch deletion commands are never emitted; owner review, exact integration proof when accepted, restoration-verified archive, cleanup authorization, and lifecycle-v2 execution remain separate required transitions.",
    nextStep:
      cleanupBlockers.length === 0
        ? "Run candidateLifecycleStatusCall, then candidateLifecyclePlanCall. Execute cleanup only through the lifecycle-v2 closeout surface after its exact resource generation reaches cleanup_authorized."
        : exactPeerRunIds.length > 0
          ? "Resolve candidate peer registry sidecar and integration-closeout blockers before a lifecycle-v2 closeout plan is prepared."
          : "Capture exact candidate_peer_spawn peerRunIds plus controller-verified worktrees/branches before any lifecycle-v2 closeout plan is prepared.",
  };
  const candidateCloseoutPacket: AutoresearchLevel4CandidateCloseoutPacket = {
    kind: "autoresearch.level4_visible_candidate_closeout_packet.v1",
    execution: "plan_only_controller_verified_closeout",
    durableEvidence: false,
    laneCount: promptBundle.length,
    lanes: promptBundle.map((lane): AutoresearchLevel4CandidateCloseoutLane => {
      const contractLane = contract.lanes.find(
        (candidate) => candidate.cellId === lane.cellId && candidate.laneId === lane.laneId,
      );
      const worktreePlaceholder = `<${lane.cellId}-${lane.laneId}-worktree-from-candidate_peer_spawn>`;
      const baseRefPlaceholder = `<${lane.cellId}-${lane.laneId}-base-ref-from-candidate_peer_spawn>`;
      return {
        cellId: lane.cellId,
        laneId: lane.laneId,
        objective: lane.objective,
        launch: {
          surface: "candidate_peer_spawn",
          call: lane.candidatePeerSpawnCall,
          workspaceName: extractJsonStringFromToolCall(
            lane.candidatePeerSpawnCall,
            "workspaceName",
          ),
          branchName: extractJsonStringFromToolCall(lane.candidatePeerSpawnCall, "branchName"),
        },
        watch: {
          ackCall: lane.peerAckWatchCall,
          finalCall: lane.peerFinalWatchCall,
          status: checkpointAccepted
            ? "pending_controller_verification"
            : "pending_controller_execution",
        },
        lineage: {
          peerFinalIsCommunicationOnly: true,
          requiredFacts: ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"],
          verificationCommands: [
            `git -C ${worktreePlaceholder} rev-parse --abbrev-ref HEAD`,
            `git -C ${worktreePlaceholder} merge-base --is-ancestor ${baseRefPlaceholder} HEAD`,
            `git -C ${worktreePlaceholder} status --short`,
            `git -C ${worktreePlaceholder} diff --stat ${baseRefPlaceholder}...HEAD`,
            `git -C ${worktreePlaceholder} diff --name-only ${baseRefPlaceholder}...HEAD`,
          ],
        },
        scopeReview: {
          filesInScope: nonEmptyStrings(input.filesInScope),
          offLimits: nonEmptyStrings(input.offLimits),
          status: "pending_controller_verification",
        },
        validation: {
          peerClaimStatus: "communication_only",
          controllerValidationStatus: "pending_controller_verification",
          candidateResultPacketPath:
            contractLane?.candidateResultPacketPath ?? "<candidate-result-packet-path>",
        },
        recommendation: {
          disposition: "pending_controller_review",
          options: ["integrate_after_review", "reject", "retry", "inspect_further"],
          requiredBeforeIntegrate: [
            "ACK and FINAL observed through intercom peer_watch",
            "worktree, branch, baseRef, diff summary, and changed files verified by controller git commands",
            "off-limits drift checked against filesInScope/offLimits",
            "smallest truthful validation rerun or explicitly marked unavailable by controller",
            "candidate-result packet exported and reviewed before integration selection",
          ],
        },
        rollbackNotes: [
          "Do not delete candidate resources before controller closeout is accepted.",
          "Rollback integration by reverting only the selected candidate patch; retain rejected lane packet paths as review inputs until cleanup is authorized.",
        ],
      };
    }),
    packetInventory,
    postIntegrationCleanupReady,
    postFaninPromotionHandoff,
    comparison: {
      status: checkpointAccepted ? "ready_for_review_packet" : "pending_candidate_result_packets",
      aggregateReviewCall: contract.lanes[0]?.reviewCandidateWaveCall ?? null,
      reviewRequiresControllerVerifiedPackets: true,
    },
    metric: {
      name: "level4_candidate_closeout_packet_blockers",
      direction: "lower",
      target: 0,
      value: closeoutBlockers.length,
      status: closeoutBlockers.length === 0 ? "target_met" : "blocked",
      blockers: closeoutBlockers,
    },
    notAuthority: [
      "This packet is not AK/KES/evidence authority and does not complete the task.",
      "This packet does not select, merge, promote, release, or clean up candidates.",
      "Peer ACK/FINAL text remains communication only until controller git/worktree verification is recorded in the controller flow.",
    ],
    nextStep:
      closeoutBlockers.length > 0
        ? "Resolve closeout packet blockers before using Level-4 output for candidate comparison."
        : "Use this closeout packet as the controller checklist after PEER_FINAL: verify lineage, export candidate-result packets, run review_candidate_wave, then decide integrate/reject/retry at the owner gate.",
  };
  const blockerValue = Math.max(
    visibleLaunchWatchPlan.metric.value,
    wholeMatrixParallelExecutor.metric.value,
    candidateCloseoutPacket.metric.value,
  );

  return {
    kind: "autoresearch.level4_prompt_runner_bundle.v1",
    pattern: [
      "generate_prompt_bundle",
      "candidate_peer_spawn",
      "peer_watch_ack_final",
      "controller_verify_lineage",
      "bind_measure_export_review",
      "review_matrix_campaign",
      "stop_at_owner_gates",
    ],
    state,
    promptBundle,
    visibleCandidatePeerSpawnCalls: contract.launchPhase.launchCalls,
    peerWatchCalls: promptBundle.flatMap((lane) => [
      lane.peerAckWatchCall,
      lane.peerFinalWatchCall,
    ]),
    visibleLaunchWatchPlan,
    wholeMatrixParallelExecutor,
    candidateCloseoutPacket,
    controllerLineageVerification: {
      peerFinalIsCommunicationOnly: true,
      requiredFacts: ["worktree", "branch", "baseRef", "diffSummary", "filesChanged"],
      checklist: [
        "Do not checkpoint on PEER_FINAL text alone; verify worktree, branch, base ref, diff summary, and changed files in the controller.",
        "Bind only controller-verified candidate worktrees through autoresearch_candidate_bind.",
        "Measure only from candidate worktrees; controller-inline implementation patches are a process violation.",
      ],
    },
    postFinalControllerSequence,
    metric: {
      name: "whole_matrix_execution_glue_blockers",
      direction: "lower",
      target: 0,
      value: blockerValue,
      status: blockerValue === 0 ? "target_met" : "blocked",
      proofs: [
        {
          proof: "prompt bundle generated for each matrix lane",
          status: promptBundle.length > 0 ? "present" : "blocked",
          source: "promptRunnerBundle.promptBundle",
        },
        {
          proof: "visible candidate_peer_spawn calls are the only launch surface",
          status:
            contract.launchPhase.visibleCandidateLaneBinding.hiddenLaunchCallCount === 0
              ? "present"
              : "blocked",
          source: "contract.launchPhase.launchCalls",
        },
        {
          proof: "ACK/FINAL watch calls are explicit controller steps",
          status: promptBundle.length > 0 ? "present" : "blocked",
          source: "promptRunnerBundle.peerWatchCalls",
        },
        {
          proof: "controller lineage verification separates peer communication from measured facts",
          status: "present",
          source: "promptRunnerBundle.controllerLineageVerification",
        },
        {
          proof:
            "bind/measure/export/review sequence is derived from existing Level-2/Level-3 packet surfaces",
          status: postFinalControllerSequence.length > 0 ? "present" : "blocked",
          source: checkpointAccepted
            ? "level3Runner.benchmarkExportReviewCalls"
            : "contract.lanes[].measurementPlan",
        },
        {
          proof: "structured candidate closeout packet is available for controller comparison",
          status: candidateCloseoutPacket.metric.status === "target_met" ? "present" : "blocked",
          source: "promptRunnerBundle.candidateCloseoutPacket",
        },
      ],
    },
    boundaries: [
      "Level-4 prompt runner automates the proven Target-3 prompt matrix pattern; it does not create a new authority ledger.",
      "candidate_peer_spawn launches remain visible peer/worktree launches; hidden scout/fork/controller-inline implementation is not allowed.",
      "intercom ACK/FINAL is communication only; controller git/worktree verification supplies lineage facts for binding.",
      "The candidate closeout packet is a controller checklist and comparison substrate, not AK/KES/evidence authority.",
      "pi-autoresearch remains owner of measurement, candidate-result export, and empirical review packets.",
      "review/finalizer/cleanup/AK/promotion gates stay separate exact owner gates.",
    ],
    nextStep:
      state === "blocked_missing_parent_peer_target"
        ? "Provide parentPeerTarget so the visible prompt-runner matrix can launch candidate_peer_spawn lanes."
        : state === "checkpoint_accepted_controller_sequence_ready"
          ? "Run the controller-verified bind/measure/export/review sequence from the prompt runner bundle; stop at owner gates."
          : "Launch visible candidate_peer_spawn lanes from the prompt bundle, watch ACK/FINAL, verify lineage, then supply the exact checkpoint token.",
  };
}

function resolveLevel4ReceiptPath(input: AutoresearchLevel4CampaignRunnerRequest): string {
  if (input.level4ReceiptPath) {
    const resolved = path.resolve(input.cwd, input.level4ReceiptPath);
    const cwdResolved = path.resolve(input.cwd);
    if (!resolved.startsWith(`${cwdResolved}${path.sep}`) && resolved !== cwdResolved) {
      throw new Error("level4ReceiptPath must stay under cwd.");
    }
    return resolved;
  }
  return path.join(input.cwd, ".autoresearch", "level4-campaign-runner-receipts.jsonl");
}

function loadLevel4Receipts(receiptPath: string): AutoresearchLevel4CampaignRunnerReceipt[] {
  if (!fs.existsSync(receiptPath)) return [];
  return fs
    .readFileSync(receiptPath, "utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AutoresearchLevel4CampaignRunnerReceipt);
}

function appendLevel4Receipts(
  receiptPath: string,
  receipts: readonly AutoresearchLevel4CampaignRunnerReceipt[],
): void {
  if (receipts.length === 0) return;
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.appendFileSync(
    receiptPath,
    `${receipts.map((receipt) => JSON.stringify(receipt)).join("\n")}\n`,
  );
}

function classifyLevel4Disposition(
  call: string,
  input: AutoresearchLevel4CampaignRunnerRequest,
): AutoresearchLevel4CampaignRunnerReceipt["disposition"] {
  if (/finalize_post_fanin|promotion|ak_owner_write|evidence_record\(/u.test(call)) {
    return "blocked_dangerous_gate";
  }
  if (
    /candidate_cleanup|candidate_peer_cleanup|worktree\s+remove|branch\s+-D|rm\s+-rf/u.test(call)
  ) {
    return "blocked_dangerous_gate";
  }
  if (/autoresearch_runtime_run|candidate_result_export|autoresearch_runtime_status/u.test(call)) {
    return input.allowMeasureExportReview === true
      ? "executed_by_level4"
      : "awaiting_external_controller";
  }
  if (/review_candidate_wave|review_matrix_campaign/u.test(call)) {
    return input.allowReviewGeneration === true
      ? "executed_by_level4"
      : "awaiting_external_controller";
  }
  return "awaiting_external_controller";
}

export function runAutoresearchLevel4CampaignRunner(
  input: AutoresearchLevel4CampaignRunnerRequest,
): AutoresearchLevel4CampaignRunner {
  const receiptPath = resolveLevel4ReceiptPath(input);
  const loadedReceipts = loadLevel4Receipts(receiptPath);
  const completedActionCount = Math.max(
    resolveLevel3CompletedActionCount(input.completedActionCount),
    loadedReceipts.length,
  );
  const maxAutomatedActions = input.maxAutomatedActions ?? 1;
  if (
    !Number.isInteger(maxAutomatedActions) ||
    maxAutomatedActions < 1 ||
    maxAutomatedActions > 25
  ) {
    throw new Error("maxAutomatedActions must be an integer from 1 to 25.");
  }

  const newReceipts: AutoresearchLevel4CampaignRunnerReceipt[] = [];
  let executor = advanceAutoresearchLevel3MatrixCellExecutor({
    ...input,
    completedActionCount,
  });
  let posture: AutoresearchLevel4CampaignRunner["posture"] =
    executor.posture === "blocked_by_level3_runner" ? "blocked_by_level3" : "complete_review_ready";

  for (let i = 0; i < maxAutomatedActions; i += 1) {
    const action = executor.selectedAction;
    if (!action) {
      posture =
        executor.posture === "blocked_by_level3_runner"
          ? "blocked_by_level3"
          : "complete_review_ready";
      break;
    }
    if (!action.allowedByStateMachine) {
      posture = "blocked_dangerous_gate";
      break;
    }
    const disposition = classifyLevel4Disposition(action.call, input);
    const receipt: AutoresearchLevel4CampaignRunnerReceipt = {
      kind: "autoresearch.level4_campaign_runner_receipt.v1",
      receiptId: createHash("sha256")
        .update(`${input.taskId}\0${input.cwd}\0${action.index}\0${action.call}`)
        .digest("hex"),
      actionIndex: action.index,
      call: action.call,
      disposition,
      executedAtEpochMs: Date.now(),
      summary:
        disposition === "executed_by_level4"
          ? "Level-4 accepted and automated this safe action, then persisted a resumable receipt."
          : disposition === "awaiting_external_controller"
            ? "Level-4 stopped at an action that requires an external controller/tool seam result."
            : "Level-4 preserved an exact dangerous-action gate and did not execute this action.",
    };
    newReceipts.push(receipt);
    if (disposition !== "executed_by_level4") {
      posture =
        disposition === "blocked_dangerous_gate"
          ? "blocked_dangerous_gate"
          : "awaiting_external_controller";
      break;
    }
    executor = advanceAutoresearchLevel3MatrixCellExecutor({
      ...input,
      completedActionCount: action.index + 1,
    });
    posture = "advanced_safe_actions";
  }

  appendLevel4Receipts(receiptPath, newReceipts);
  const finalCompletedActionCount =
    completedActionCount +
    newReceipts.filter((receipt) => receipt.disposition === "executed_by_level4").length;
  const blockerValue =
    posture === "blocked_by_level3" || posture === "blocked_dangerous_gate" ? 1 : 0;
  const promptRunnerBundle = buildLevel4PromptRunnerBundle(input, executor);
  const nextLegalActions =
    posture === "blocked_by_level3" &&
    promptRunnerBundle.state === "ready_to_launch_visible_candidate_peers"
      ? promptRunnerBundle.visibleCandidatePeerSpawnCalls
      : executor.emittedNextLegalActions;
  return {
    kind: "autoresearch.level4_autoresearch_campaign_runner.v1",
    taskId: input.taskId,
    cwd: input.cwd,
    objective: input.objective,
    sourceLevel3Executor: executor,
    promptRunnerBundle,
    receiptPath,
    loadedReceiptCount: loadedReceipts.length,
    newReceipts,
    completedActionCount: finalCompletedActionCount,
    posture,
    metric: {
      name: "level4_autoresearch_automation_blockers",
      direction: "lower",
      target: 0,
      value: blockerValue,
      status: blockerValue === 0 ? "target_met" : "blocked",
    },
    exactGatesPreserved: [
      "finalize_post_fanin",
      "candidate_cleanup",
      "promotion",
      "ak_owner_write",
    ],
    nextLegalActions,
    boundaries: [
      "Level-4 is above Level-3: it consumes Level-3 state-machine output and records resumable receipts.",
      "Level-4 now carries the prompt-runner matrix bundle from the proven Target-3 pattern: prompt bundle -> visible candidate_peer_spawn -> ACK/FINAL watch -> controller lineage verification -> bind/measure/export/review.",
      "Level-4 may automate only explicitly allowed safe measure/export/review steps. Candidate cleanup and lifecycle-v2 effects are never executed by Level-4.",
      "Finalizer apply, pre-closeout cleanup, AK evidence/task writes, merge, release, and promotion are never inferred from Level-4 automation.",
      "Visible peer text remains communication only; Level-4 receipts are resumability receipts, not durable AK evidence.",
    ],
    nextStep:
      posture === "awaiting_external_controller"
        ? "Run or bind the awaiting external controller action, then rerun Level-4; receipts make the loop resumable."
        : posture === "blocked_dangerous_gate"
          ? "Stop at the preserved exact gate; obtain the required owner token or closeout evidence before continuing."
          : posture === "blocked_by_level3"
            ? "Resolve the Level-3 checkpoint/runner blockers first."
            : posture === "complete_review_ready"
              ? "Level-4 has no remaining safe Level-3 action to automate; proceed to owner review and exact gated closeout."
              : "Level-4 advanced safe actions and wrote receipts; rerun to continue or inspect owner review gates.",
  };
}

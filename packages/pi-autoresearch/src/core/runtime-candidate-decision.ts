import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { shellSingleQuote } from "./runtime-autoplan.ts";
import { normalizeAutoresearchCandidateLifecyclePolicy } from "./runtime-candidate-policy.ts";
import { buildAutoresearchCandidateResultPacket } from "./runtime-candidate-result.ts";
import {
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
} from "./runtime-constants.ts";
import { formatMetricInterpretation } from "./runtime-format.ts";
import {
  buildAutoresearchMetricReadinessReview,
  describeMetricThresholdCaveat,
} from "./runtime-metric-readiness.ts";
import type {
  AutoresearchCandidateArtifactStatus,
  AutoresearchCandidateBinding,
  AutoresearchCandidateDecisionAction,
  AutoresearchCandidateDecisionConfirmation,
  AutoresearchCandidateDecisionSummary,
  AutoresearchCandidateDecisionWorkbench,
  AutoresearchCandidateLifecycleDecision,
  AutoresearchCandidateLifecyclePolicy,
  AutoresearchMetricReadinessReview,
  AutoresearchRuntimeStatus,
  AutoresearchSegmentSummary,
  BuildAutoresearchCandidateDecisionInput,
} from "./runtime-model.ts";
import {
  describeAutoresearchBaselineDriftRisk,
  describeLatestCloseoutChecks,
} from "./runtime-status-format.ts";

export function buildAutoresearchCandidateDecisionWorkbench(
  input: BuildAutoresearchCandidateDecisionInput,
): AutoresearchCandidateDecisionWorkbench {
  const cwd = path.resolve(input.cwd);
  const action = input.action ?? "status";
  const candidatePolicy = normalizeAutoresearchCandidateLifecyclePolicy(input.candidatePolicy);
  const candidateResult = buildAutoresearchCandidateResultPacket(cwd);
  const status = candidateResult.closeout.status;
  const candidate = summarizeCandidateForDecision(candidateResult.candidate, cwd);
  const candidateRun = candidateResult.candidateRun;
  const confidenceNoiseInterpretation = formatMetricInterpretation(
    status.currentSegment.metricInterpretation,
    status.currentSegment.metricUnit,
  );
  const baselineDriftRisk = describeAutoresearchBaselineDriftRisk(status);
  const checksStatus =
    candidateRun?.checks ?? describeLatestCloseoutChecks(candidateResult.closeout);
  const recommendedDecision = chooseAutoresearchCandidateLifecycleDecision({
    action,
    candidate,
    status,
  });
  const recommendationReason = explainAutoresearchCandidateLifecycleDecision({
    action,
    decision: recommendedDecision,
    status,
    candidate,
  });
  const exactNextCalls = buildAutoresearchCandidateDecisionNextCalls({
    cwd,
    action,
    decision: recommendedDecision,
    candidate,
    status,
  });
  const metricReadiness = buildAutoresearchMetricReadinessReview(status);
  const plannedCommands = buildAutoresearchCandidateDecisionCommandPlan({
    cwd,
    action,
    candidatePolicy,
    candidate,
  });
  const confirmation = buildAutoresearchCandidateDecisionConfirmation({
    action,
    decision: recommendedDecision,
    candidate,
    status,
    metricReadiness,
    plannedCommands,
  });

  return {
    cwd,
    action,
    candidatePolicy,
    candidate,
    empirical: {
      classification: status.empiricalPosture.classification,
      empiricalDecisionClass: candidateResult.empiricalDecisionClass,
      promotionReady: status.empiricalPosture.promotionReady,
      confidence: status.currentSegment.confidence,
      confidenceNoiseInterpretation,
      checksStatus,
      baselineDriftRisk,
    },
    metricReadiness,
    recommendedDecision,
    recommendationReason,
    confirmation,
    exactNextCalls,
    plannedCommands,
    boundaryWarnings: [...AUTORESEARCH_CANDIDATE_DECISION_BOUNDARY_WARNINGS],
    status,
    candidateResult,
  };
}

const AUTORESEARCH_CANDIDATE_DECISION_BOUNDARY_WARNINGS = [
  "worktree lifecycle is the candidate keep/discard/rewind primitive; this workbench only plans commands",
  "Replay Fabric is observer/history/recovery-clue only and does not accept, discard, or rewind candidates",
  "ASC rewind is live Pi/session recovery only, not candidate lifecycle authority",
  "durable promotion belongs to external owner surfaces such as AK/KES/adapters after explicit review",
  "this surface does not merge, delete worktrees, reset worktrees, spawn peers, write evidence, or promote",
] as const;

function buildAutoresearchCandidateDecisionConfirmation(input: {
  action: AutoresearchCandidateDecisionAction;
  decision: AutoresearchCandidateLifecycleDecision;
  candidate: AutoresearchCandidateDecisionSummary | null;
  status: AutoresearchRuntimeStatus;
  metricReadiness: AutoresearchMetricReadinessReview;
  plannedCommands: readonly string[];
}): AutoresearchCandidateDecisionConfirmation {
  const required = input.action !== "status";
  const lifecycleVerb = input.action.replace(/^plan_/u, "");
  const candidateLabel = input.candidate?.label ?? "unbound-candidate";
  const riskLevel: AutoresearchCandidateDecisionConfirmation["riskLevel"] = !required
    ? "none"
    : input.action === "plan_keep"
      ? "review_gate"
      : "destructive_external";
  const blockedReasons: string[] = [];
  if (required && !input.candidate) {
    blockedReasons.push("no controller-verified candidate is bound in the current segment");
  }
  if (input.action === "plan_keep" && isAutoresearchCandidateArtifactMissing(input.candidate)) {
    blockedReasons.push(
      `candidate artifact status is ${input.candidate?.artifactStatus}; re-bind or re-measure before external keep/finalize decisions`,
    );
  }
  if (input.action === "plan_keep" && !input.status.empiricalPosture.promotionReady) {
    blockedReasons.push("requested keep, but empirical posture is not promotion-ready");
  }
  if (
    required &&
    input.decision !== "keep" &&
    input.decision !== "discard" &&
    input.decision !== "rewind" &&
    input.decision !== "finalize"
  ) {
    blockedReasons.push(
      `recommended decision is ${input.decision}; collect more evidence or rebaseline before applying lifecycle commands`,
    );
  }
  if (input.action === "plan_keep") {
    blockedReasons.push(
      ...input.metricReadiness.blockedReasons.map((reason) => `metric readiness: ${reason}`),
    );
  }

  const checklist = required
    ? [
        `candidate binding reviewed: ${candidateLabel}`,
        `candidate artifact status reviewed: ${input.candidate?.artifactStatus ?? "unbound"}`,
        `empirical posture reviewed: ${input.status.empiricalPosture.classification}; promotion ready=${input.status.empiricalPosture.promotionReady ? "yes" : "no"}`,
        `metric threshold reviewed: ${describeMetricThresholdCaveat(input.status.currentSegment)}`,
        `metric readiness reviewed: ${input.metricReadiness.classification}; ${input.metricReadiness.summary}`,
        `planned command count reviewed: ${input.plannedCommands.length}`,
        "planned commands are copied/applied outside pi-autoresearch only after operator approval",
        "durable evidence, learning, merge, promotion, and rollback remain owner-routed external actions",
      ]
    : [
        "status inspection only; no lifecycle command is being planned",
        `candidate artifact status: ${input.candidate?.artifactStatus ?? "unbound"}`,
        `metric threshold posture: ${describeMetricThresholdCaveat(input.status.currentSegment)}`,
        `metric readiness posture: ${input.metricReadiness.classification}; ${input.metricReadiness.summary}`,
        "use keep/discard/rewind only after reviewing candidate binding and empirical posture",
      ];

  return {
    required,
    riskLevel,
    exactConfirmationPhrase: required
      ? `confirm autoresearch ${lifecycleVerb} ${candidateLabel}`
      : "(none; status inspection only)",
    checklist,
    blockedReasons,
    nextHumanAction:
      blockedReasons.length > 0
        ? "resolve confirmation blockers before applying any external lifecycle command"
        : required
          ? "read the checklist, type or copy the exact confirmation phrase into the external review surface, then apply only the selected external commands"
          : "inspect status and choose keep/discard/rewind only if the candidate binding and empirical posture warrant it",
  };
}

function summarizeCandidateForDecision(
  binding: AutoresearchCandidateBinding | null,
  cwd: string,
): AutoresearchCandidateDecisionSummary | null {
  if (!binding) return null;
  const label =
    binding.branch ??
    binding.worktreePath ??
    binding.diffSummary ??
    binding.source ??
    "bound candidate";
  const worktreeExists = binding.worktreePath ? existsSync(binding.worktreePath) : null;
  const branchExists = binding.branch ? gitLocalBranchExists(cwd, binding.branch) : null;
  const artifactStatus = classifyAutoresearchCandidateArtifactStatus({
    worktreeExists,
    branchExists,
  });
  return {
    source: binding.source,
    worktreePath: binding.worktreePath,
    branch: binding.branch,
    baseRef: binding.baseRef,
    diffSummary: binding.diffSummary,
    filesChanged: [...binding.filesChanged],
    label,
    worktreeExists,
    branchExists,
    artifactStatus,
  };
}

function gitLocalBranchExists(cwd: string, branch: string): boolean {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0;
}

function classifyAutoresearchCandidateArtifactStatus(input: {
  worktreeExists: boolean | null;
  branchExists: boolean | null;
}): AutoresearchCandidateArtifactStatus {
  if (input.worktreeExists === true || input.branchExists === true) return "available";
  const worktreeMissing = input.worktreeExists === false;
  const branchMissing = input.branchExists === false;
  if (worktreeMissing && branchMissing) return "missing_worktree_and_branch";
  if (worktreeMissing) return "missing_worktree";
  if (branchMissing) return "missing_branch";
  return "unknown";
}

function isAutoresearchCandidateArtifactMissing(
  candidate: AutoresearchCandidateDecisionSummary | null,
): boolean {
  return Boolean(
    candidate?.source === "candidate_peer_spawn" &&
      candidate.artifactStatus !== "available" &&
      candidate.artifactStatus !== "unknown",
  );
}

function chooseAutoresearchCandidateLifecycleDecision(input: {
  action: AutoresearchCandidateDecisionAction;
  candidate: AutoresearchCandidateDecisionSummary | null;
  status: AutoresearchRuntimeStatus;
}): AutoresearchCandidateLifecycleDecision {
  if (!input.candidate) return "no_candidate_bound_yet";
  const artifactMissing = isAutoresearchCandidateArtifactMissing(input.candidate);
  if (input.action === "plan_discard") return "discard";
  if (input.action === "plan_rewind") return "rewind";
  if (input.action === "plan_keep") return artifactMissing ? "rebind_candidate" : "keep";
  if (
    input.status.runtimeProjection.state === "finalize_candidate" ||
    input.status.control.kind === "finalize"
  ) {
    return artifactMissing ? "rebind_candidate" : "finalize";
  }

  const posture = input.status.empiricalPosture.classification;
  const decision = input.status.currentSegment.empiricalDecisionClass;
  if (posture === "baseline_drift_suspected" || decision === "baseline_drift") return "rebaseline";
  if (
    decision === "candidate_regression" ||
    decision === "threshold_regressed" ||
    decision === "checks_failed" ||
    decision === "measurement_invalid"
  ) {
    return "discard";
  }
  if (decision === "candidate_neutral") return "rewind";
  if (
    decision === "candidate_improvement" ||
    decision === "threshold_satisfied" ||
    decision === "threshold_preserved"
  ) {
    if (!input.status.empiricalPosture.promotionReady) return "collect_more_samples";
    return artifactMissing ? "rebind_candidate" : "keep";
  }
  if (posture === "candidate_review_ready") return artifactMissing ? "rebind_candidate" : "keep";
  return "collect_more_samples";
}

function explainAutoresearchCandidateLifecycleDecision(input: {
  action: AutoresearchCandidateDecisionAction;
  decision: AutoresearchCandidateLifecycleDecision;
  status: AutoresearchRuntimeStatus;
  candidate: AutoresearchCandidateDecisionSummary | null;
}): string {
  if (!input.candidate) {
    return "No controller-verified candidate binding exists in the current segment; bind a candidate before keep/discard/rewind decisions.";
  }
  if (isAutoresearchCandidateArtifactMissing(input.candidate) && input.action !== "plan_discard") {
    return `Candidate evidence exists, but live candidate artifacts are stale (${input.candidate.artifactStatus}); re-bind or re-measure a current worktree before keep/finalize/rewind guidance.`;
  }
  if (input.action === "plan_keep") {
    return input.status.empiricalPosture.promotionReady
      ? "Requested keep plan and empirical posture is promotion-ready; preserve the worktree/branch and plan finalization externally."
      : "Requested keep plan is shown read-only, but empirical posture is not promotion-ready; collect more samples or rebaseline before durable promotion.";
  }
  if (input.action === "plan_discard") {
    return "Requested discard plan; cleanup remains operator-confirmed and receipts stay available for review.";
  }
  if (input.action === "plan_rewind") {
    return "Requested rewind plan; reset/recreate commands are proposed only and must be applied explicitly by the operator.";
  }
  switch (input.decision) {
    case "keep":
      return "Candidate evidence is promising enough for a keep/review path; no merge or promotion is automatic.";
    case "discard":
      return "Candidate evidence is invalid, failing, or regressive; discard or diagnose before another optimization run.";
    case "rewind":
      return "Candidate is neutral or not useful enough to keep; rewind the worktree only after explicit operator confirmation.";
    case "rebaseline":
      return "Baseline drift is suspected; rebaseline before deciding whether this candidate is a true improvement.";
    case "collect_more_samples":
      return "Candidate evidence exists but is under-sampled, noisy, calibration-only, or inconclusive.";
    case "rebind_candidate":
      return "Candidate receipt evidence exists, but live worktree/branch artifacts are missing; re-bind or re-measure before lifecycle action.";
    case "finalize":
      return "Candidate can move toward finalization through the explicit finalization owner surface.";
    case "no_candidate_bound_yet":
      return "No candidate binding exists yet.";
  }
}

function formatAutoresearchRebaselineRunCall(input: {
  cwd: string;
  description: string;
  segment: AutoresearchSegmentSummary;
}): string {
  const segment = input.segment;
  const fields = [
    `cwd: ${JSON.stringify(input.cwd)}`,
    `description: ${JSON.stringify(input.description)}`,
    `reconfigure: true`,
    `name: ${JSON.stringify(segment.name ?? "<campaign>")}`,
    `metricName: ${JSON.stringify(segment.metricName ?? "<metric>")}`,
    `metricUnit: ${JSON.stringify(segment.metricUnit)}`,
    `direction: ${JSON.stringify(segment.direction ?? "lower")}`,
    ...(segment.metricThreshold === null
      ? []
      : [`metricThreshold: ${JSON.stringify(segment.metricThreshold)}`]),
    `benchmarkCommand: ${JSON.stringify(segment.benchmarkCommand ?? "bash autoresearch.sh")}`,
    `checksCommand: ${JSON.stringify(segment.checksCommand)}`,
  ];
  return `${AUTORESEARCH_RUN_TOOL_NAME}({ ${fields.join(", ")} })`;
}

function buildAutoresearchCandidateDecisionNextCalls(input: {
  cwd: string;
  action: AutoresearchCandidateDecisionAction;
  decision: AutoresearchCandidateLifecycleDecision;
  candidate: AutoresearchCandidateDecisionSummary | null;
  status: AutoresearchRuntimeStatus;
}): string[] {
  const cwdLiteral = JSON.stringify(input.cwd);
  const calls = [
    `${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "candidate_result" })`,
  ];
  if (!input.candidate) {
    calls.push(
      `${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({ cwd: ${cwdLiteral}, candidateWorktree: "<worktree>", candidateBaseRef: "<base-ref>", action: "plan_run" })`,
    );
    return calls;
  }
  if (input.decision === "rebind_candidate") {
    calls.push(
      `${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME}({ cwd: ${cwdLiteral}, candidateWorktree: "<current-worktree>", candidateBaseRef: ${JSON.stringify(input.candidate?.baseRef ?? "<base-ref>")}, action: "plan_run" })`,
    );
  } else if (input.decision === "keep") {
    calls.push(
      `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan_keep" })`,
    );
    calls.push(`${AUTORESEARCH_FINALIZE_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan" })`);
  } else if (input.decision === "finalize") {
    calls.push(`${AUTORESEARCH_FINALIZE_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan" })`);
  } else if (input.decision === "discard") {
    calls.push(
      `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan_discard" })`,
    );
  } else if (input.decision === "rewind") {
    calls.push(
      `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "plan_rewind" })`,
    );
  } else if (input.decision === "rebaseline") {
    calls.push(
      formatAutoresearchRebaselineRunCall({
        cwd: input.cwd,
        description: "Rebaseline before candidate decision",
        segment: input.status.currentSegment,
      }),
    );
  } else if (input.decision === "collect_more_samples") {
    calls.push(
      `${AUTORESEARCH_RUN_TOOL_NAME}({ cwd: ${cwdLiteral}, description: "Collect another ordinary candidate sample" })`,
    );
  }
  calls.push(`${AUTORESEARCH_STATUS_TOOL_NAME}({ cwd: ${cwdLiteral}, action: "closeout" })`);
  return calls;
}

function buildAutoresearchCandidateDecisionCommandPlan(input: {
  cwd: string;
  action: AutoresearchCandidateDecisionAction;
  candidatePolicy: AutoresearchCandidateLifecyclePolicy;
  candidate: AutoresearchCandidateDecisionSummary | null;
}): string[] {
  const candidate = input.candidate;
  if (!candidate) return [];
  if (isAutoresearchCandidateArtifactMissing(candidate) && input.action === "plan_keep") {
    return [
      `# candidate artifact status is ${candidate.artifactStatus}; re-bind or re-measure a current candidate worktree before keep/finalize commands`,
    ];
  }
  const worktree = candidate.worktreePath;
  const baseRef = candidate.baseRef;
  if (input.action === "plan_keep") {
    return worktree
      ? [`git -C ${shellSingleQuote(worktree)} status --short # read-only pre-review check`]
      : [];
  }
  if (input.action === "plan_discard") {
    const commands: string[] = [];
    if (worktree) {
      commands.push(
        `git -C ${shellSingleQuote(input.cwd)} worktree remove ${shellSingleQuote(worktree)} # plan only; run only after explicit operator confirmation`,
      );
    }
    if (candidate.branch) {
      commands.push(
        `git -C ${shellSingleQuote(input.cwd)} branch -D ${shellSingleQuote(candidate.branch)} # plan only; only after receipts/review no longer need the branch`,
      );
    }
    if (commands.length === 0 && input.candidatePolicy.discard === "suggest_cleanup") {
      commands.push("# no worktree/branch known; inspect candidate_result before cleanup");
    }
    if (candidate.artifactStatus !== "available" && candidate.artifactStatus !== "unknown") {
      commands.push(
        `# candidate artifact status is ${candidate.artifactStatus}; cleanup may already be complete`,
      );
    }
    return commands;
  }
  if (input.action === "plan_rewind") {
    if (input.candidatePolicy.rewind === "reset_worktree_to_base") {
      return worktree && baseRef
        ? [
            `git -C ${shellSingleQuote(worktree)} reset --hard ${shellSingleQuote(baseRef)} # plan only; destructive if applied`,
          ]
        : [
            "# rewind requires a candidate worktree path and base ref before a reset command can be planned",
          ];
    }
    return worktree && baseRef
      ? [
          `git -C ${shellSingleQuote(input.cwd)} worktree remove ${shellSingleQuote(worktree)} # plan only; run only after explicit confirmation`,
          `git -C ${shellSingleQuote(input.cwd)} worktree add ${shellSingleQuote(worktree)} ${shellSingleQuote(baseRef)} # plan only; recreates candidate worktree from base`,
        ]
      : [
          "# recreate rewind requires a candidate worktree path and base ref before commands can be planned",
        ];
  }
  return [];
}

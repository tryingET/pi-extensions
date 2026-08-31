// summary: freezes visible-peer tool parameter schemas, request contracts, and candidate admission failure projection.
// read_when:
//   - changing sidequest tool schemas, peer request shapes, or candidate admission failure output.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { CandidateAdmissionPrerequisiteError } from "../src/candidatePeerAdmission.ts";

export type PiToolParameters = Parameters<ExtensionAPI["registerTool"]>[0]["parameters"];
export type PiToolContext = Parameters<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>[4];
export type SidequestRole = "scout" | "reviewer";
export type SidequestReportBack = "intercom" | "manual" | "none";
export type CandidatePeerReportBack = SidequestReportBack;
export type ForkPeerSpawnRequest = {
  objective?: string;
  cwd?: string;
  reportBack?: SidequestReportBack;
  parentPeerTarget?: string;
};

export type FreshHandoffSpawnRequest = {
  goal?: string;
  cwd?: string;
};

export type SidequestContext = {
  campaignGoal?: string;
  primaryMetric?: string;
  currentBest?: string;
  blocker?: string;
  filesInScope?: string[];
  offLimits?: string[];
  constraints?: string[];
  artifactsToRead?: string[];
  currentFindings?: string[];
};

export type SidequestSpawnRequest = {
  role?: SidequestRole;
  objective?: string;
  cwd?: string;
  reportBack?: SidequestReportBack;
  parentPeerTarget?: string;
  context?: SidequestContext;
  dod?: string[];
};

export type CandidatePeerSpawnRequest = {
  objective?: string;
  cwd?: string;
  baseRef?: string;
  branchName?: string;
  workspaceRoot?: string;
  workspaceName?: string;
  filesInScope?: string[];
  offLimits?: string[];
  constraints?: string[];
  dod?: string[];
  reportBack?: CandidatePeerReportBack;
  parentPeerTarget?: string;
  requireCleanParent?: boolean;
  reuseExisting?: boolean;
};

export type CandidatePeerCleanupRequest = {
  peerRunIds?: string[];
  execute?: boolean;
  closeVisibleResources?: boolean;
  integrationCloseoutStatus?: "successful" | "failed" | "missing";
};

export type CandidatePeerCloseoutRequest = {
  action?:
    | "status"
    | "plan"
    | "execute_authorized"
    | "janitor_status"
    | "janitor_execute_authorized";
  peerRunIds?: string[];
  repoRoot?: string;
  overdueAfterMs?: number;
  taskId?: number;
  integrationCloseout?: {
    status?: "successful" | "failed" | "missing";
    commit?: string;
    summary?: string;
  };
  cleanupTrigger?: string;
};

function asPiToolParameters(schema: unknown): PiToolParameters {
  return schema as PiToolParameters;
}

export const reportBackParameter = Type.Optional(
  Type.Union([Type.Literal("intercom"), Type.Literal("manual"), Type.Literal("none")], {
    description:
      "Report-back mode. Controller-spawned quest tools default to intercom. Use manual or none only for intentionally unsupervised/manual-visible peers; they will not emit PEER_ACK/PEER_FINAL and peer_watch will have nothing to watch.",
  }),
);

export const forkPeerSpawnParameters = asPiToolParameters(
  Type.Object({
    objective: Type.String({
      description: "Required non-empty prompt for the forked-context peer.",
    }),
    cwd: Type.Optional(
      Type.String({
        description: "Workspace cwd for the visible forked peer. Defaults to ctx.cwd.",
      }),
    ),
    reportBack: reportBackParameter,
    parentPeerTarget: Type.Optional(
      Type.String({ description: "Exact parent peer target/session id for intercom report-back." }),
    ),
  }),
);

export const freshHandoffSpawnParameters = asPiToolParameters(
  Type.Object({
    goal: Type.Optional(
      Type.String({
        description:
          "Optional goal for the clean continuation. Defaults to continuing unfinished operator-directed work from the verified next legal step.",
      }),
    ),
    cwd: Type.Optional(
      Type.String({
        description: "Target workspace for the clean Pi session. Defaults to ctx.cwd.",
      }),
    ),
  }),
);

export const scoutPeerSpawnParameters = asPiToolParameters(
  Type.Object({
    role: Type.Optional(
      Type.Union([Type.Literal("scout"), Type.Literal("reviewer")], {
        description: "Visible scout peer role. Defaults to scout.",
      }),
    ),
    objective: Type.String({ description: "Required non-empty scouting/review objective." }),
    cwd: Type.Optional(
      Type.String({
        description: "Workspace cwd for the visible scout peer. Defaults to ctx.cwd.",
      }),
    ),
    reportBack: reportBackParameter,
    parentPeerTarget: Type.Optional(
      Type.String({ description: "Exact parent peer target/session id for intercom report-back." }),
    ),
    context: Type.Optional(
      Type.Object({
        campaignGoal: Type.Optional(Type.String()),
        primaryMetric: Type.Optional(Type.String()),
        currentBest: Type.Optional(Type.String()),
        blocker: Type.Optional(Type.String()),
        filesInScope: Type.Optional(Type.Array(Type.String())),
        offLimits: Type.Optional(Type.Array(Type.String())),
        constraints: Type.Optional(Type.Array(Type.String())),
        artifactsToRead: Type.Optional(Type.Array(Type.String())),
        currentFindings: Type.Optional(Type.Array(Type.String())),
      }),
    ),
    dod: Type.Optional(
      Type.Array(Type.String({ description: "Additional request-specific DoD items." })),
    ),
  }),
);

export const visibleLoopCloseoutResolutionParameters = Type.Object({
  resolution: Type.String({
    description: "satisfied, explicitly_deferred, or not_required",
  }),
  evidence: Type.Array(
    Type.Object({
      kind: Type.String({ description: "command, artifact, receipt, or owner_defer" }),
      ref: Type.String({
        description:
          "Host-correlatable reference: bash toolCallId, ASC live-proof runId, or canonical repo-relative owner-artifact path.",
      }),
      status: Type.String({ description: "passed, verified, or recorded" }),
    }),
    { description: "Typed closeout evidence entries." },
  ),
});

export const visibleLoopChildCompleteToolParameters = asPiToolParameters(
  Type.Object({
    configPath: Type.String({
      description: "Exact visible-loop config path from the internal completion command/tool.",
    }),
    iteration: Type.Number({
      description: "The visible-loop iteration that just completed.",
    }),
    candidateCloseout: Type.Optional(
      Type.Object({
        candidateId: Type.String(),
        reflection: visibleLoopCloseoutResolutionParameters,
        liveRuntimeProof: visibleLoopCloseoutResolutionParameters,
        insightPromotion: visibleLoopCloseoutResolutionParameters,
      }),
    ),
  }),
);

export const candidatePeerCleanupParameters = asPiToolParameters(
  Type.Object({
    peerRunIds: Type.Array(Type.String(), {
      description:
        "Exact candidate peer run ids to clean up from registry sidecars. The tool never fuzzy-matches resources.",
    }),
    execute: Type.Optional(
      Type.Boolean({
        description:
          "When false or omitted, return the historical registry-v1 dry-run projection. true is permanently blocked; use candidate lifecycle v2 for executable cleanup.",
      }),
    ),
    closeVisibleResources: Type.Optional(
      Type.Boolean({
        description:
          "Historical projection only. This option cannot authorize v1 execution and remains visible solely for packet inspection.",
      }),
    ),
    integrationCloseoutStatus: Type.Optional(
      Type.Union([Type.Literal("successful"), Type.Literal("failed"), Type.Literal("missing")], {
        description:
          "Historical compatibility field only. No value authorizes registry-v1 execution.",
      }),
    ),
  }),
);

export const candidatePeerCloseoutParameters = asPiToolParameters(
  Type.Object({
    action: Type.Union([
      Type.Literal("status"),
      Type.Literal("plan"),
      Type.Literal("execute_authorized"),
      Type.Literal("janitor_status"),
      Type.Literal("janitor_execute_authorized"),
    ]),
    peerRunIds: Type.Optional(
      Type.Array(Type.String(), {
        description: "Exact peer-run aliases. Required for status, plan, and execute_authorized.",
      }),
    ),
    repoRoot: Type.Optional(
      Type.String({
        description:
          "Absolute normalized owner repository root. Required for both janitor actions.",
      }),
    ),
    overdueAfterMs: Type.Optional(
      Type.Number({ description: "Reporting interval only; age never authorizes cleanup." }),
    ),
    taskId: Type.Optional(
      Type.Number({
        description: "Non-authorizing planning context echoed for controller review.",
      }),
    ),
    integrationCloseout: Type.Optional(
      Type.Object({
        status: Type.Union([
          Type.Literal("successful"),
          Type.Literal("failed"),
          Type.Literal("missing"),
        ]),
        commit: Type.Optional(Type.String()),
        summary: Type.Optional(Type.String()),
      }),
    ),
    cleanupTrigger: Type.Optional(
      Type.String({ description: "Non-authorizing controller handoff context." }),
    ),
  }),
);

export const candidatePeerSpawnParameters = asPiToolParameters(
  Type.Object({
    objective: Type.String({
      description:
        "Required non-empty candidate mutation objective. It must exactly match the pre-authorized lifecycle-v2 permit after trimming; do not paraphrase it.",
    }),
    cwd: Type.Optional(Type.String({ description: "Parent/controller cwd. Defaults to ctx.cwd." })),
    baseRef: Type.Optional(Type.String({ description: "Git base ref. Defaults to HEAD." })),
    branchName: Type.Optional(
      Type.String({ description: "Candidate branch name. Defaults to candidatepeer/<slug>." }),
    ),
    workspaceRoot: Type.Optional(
      Type.String({ description: "Root directory for generated candidate peer worktrees." }),
    ),
    workspaceName: Type.Optional(Type.String({ description: "Worktree directory name." })),
    filesInScope: Type.Optional(Type.Array(Type.String())),
    offLimits: Type.Optional(Type.Array(Type.String())),
    constraints: Type.Optional(Type.Array(Type.String())),
    dod: Type.Optional(Type.Array(Type.String())),
    reportBack: reportBackParameter,
    parentPeerTarget: Type.Optional(
      Type.String({ description: "Exact parent peer target/session id for intercom report-back." }),
    ),
    requireCleanParent: Type.Optional(
      Type.Boolean({ description: "Fail closed if the parent checkout has uncommitted changes." }),
    ),
    reuseExisting: Type.Optional(
      Type.Boolean({ description: "Reuse an existing verified worktree at the requested path." }),
    ),
  }),
);

export function classifyCandidateAdmissionFailure(error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  const prerequisiteFailure = error instanceof CandidateAdmissionPrerequisiteError;
  const nextAction = prerequisiteFailure
    ? "Ask the owner/controller to authorize or reconcile exactly one lifecycle-v2 permit for this exact repository and trimmed objective. Retry only after the owner confirms admission state changed."
    : "Ask the owner/controller to inspect and reconcile lifecycle-v2 admission state. Retry only after the owner confirms admission state changed.";
  const effectDisposition = prerequisiteFailure ? "confirmed_no_effects" : "effect_indeterminate";
  const effectSummary = prerequisiteFailure
    ? "Admission was blocked before reservation, worktree creation, or peer launch."
    : "No worktree or peer launch was attempted, but admission state may require owner reconciliation.";
  return {
    message: `${reason}. ${effectSummary} Do not retry this request unchanged. This surface cannot create or authorize permits. ${nextAction}`,
    details: {
      reasonCode: prerequisiteFailure ? error.code : "candidate_admission_reconciliation_required",
      ...(prerequisiteFailure
        ? { matchingAuthorizedPermitCount: error.matchingAuthorizedPermitCount }
        : {}),
      ownerActionRequired: true,
      retryDisposition: "blocked_until_owner_state_change",
      retryableWithoutOwnerStateChange: false,
      effectDisposition,
      admissionEffectDisposition: effectDisposition,
      worktreeEffectDisposition: "confirmed_no_effects",
      launchEffectDisposition: "confirmed_no_effects",
      nextAction,
    },
  };
}

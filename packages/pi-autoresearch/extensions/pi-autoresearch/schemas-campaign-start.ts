// ---
// summary: "Defines TypeBox inputs for campaign start, candidate intake and decisions, bounded loops, and foreground resume apply."
// read_when:
//   - "Changing campaign setup or run controls, candidate policy fields, loop budgets, or resume authorization parameters."
// ---
import { Type } from "typebox";
import {
  autoplanPlannerSchema,
  candidateBindingSourceSchema,
  directionSchema,
  nullableStringSchema,
  stringArraySchema,
} from "./schemas-common.ts";

const loopPeerModeSchema = Type.Union(
  [
    Type.Literal("off"),
    Type.Literal("plan"),
    Type.Literal("launch_scout"),
    Type.Literal("launch_candidate"),
    Type.Literal("launch_fork"),
  ],
  {
    description:
      "Peer handoff policy after the bounded loop. launch_* returns an exact canonical peer tool call for explicit controller dispatch; pi-autoresearch does not auto-spawn peers.",
  },
);

const campaignStartSetupModeSchema = Type.Union(
  [Type.Literal("autoplan"), Type.Literal("prompt_vault_setup")],
  {
    description:
      "How the front door should prepare the setup decision. autoplan is local and fast; prompt_vault_setup also requests the governed setup packet through the package-owned decision runner.",
  },
);

const campaignStartRunModeSchema = Type.Union(
  [Type.Literal("plan_only"), Type.Literal("baseline"), Type.Literal("bounded_loop")],
  {
    description:
      "How far to execute the supervised campaign front door: plan only, run the first baseline, or enter a bounded loop.",
  },
);

const campaignStartCandidatePolicySchema = Type.Object({
  mode: Type.Optional(
    Type.Literal("worktree", {
      description: "Use isolated git worktrees as the candidate lifecycle primitive.",
    }),
  ),
  keep: Type.Optional(
    Type.Union([Type.Literal("preserve_branch"), Type.Literal("plan_review_branch")], {
      description: "Keep policy after a promising run; no merge or promotion is automatic.",
    }),
  ),
  discard: Type.Optional(
    Type.Union([Type.Literal("suggest_cleanup"), Type.Literal("delete_worktree_after_confirm")], {
      description:
        "Discard policy after a rejected run; receipts remain, and cleanup requires explicit operator confirmation.",
    }),
  ),
  rewind: Type.Optional(
    Type.Union(
      [Type.Literal("reset_worktree_to_base"), Type.Literal("recreate_worktree_from_base")],
      {
        description:
          "Candidate rewind policy for worktree state. ASC rewind remains live session recovery, not candidate authority.",
      },
    ),
  ),
});

export const candidateBindSchema = Type.Object({
  cwd: Type.Optional(
    Type.String({ description: "Optional cwd override for candidate intake planning." }),
  ),
  action: Type.Optional(
    Type.Union([Type.Literal("status"), Type.Literal("plan_run")], {
      description: "Inspect a candidate worktree and prepare the exact measurement call.",
    }),
  ),
  candidateSource: Type.Optional(candidateBindingSourceSchema),
  candidateWorktree: Type.Optional(
    Type.String({
      description:
        "Candidate worktree/path to inspect. Defaults to cwd so /autoresearch bind current works.",
    }),
  ),
  candidateBranch: Type.Optional(
    Type.String({ description: "Controller-verified candidate branch/ref override." }),
  ),
  candidateBaseRef: Type.Optional(
    Type.String({
      description: "Controller-verified base ref for diff and later rewind planning.",
    }),
  ),
  description: Type.Optional(
    Type.String({ description: "Measurement description for the planned runtime run call." }),
  ),
});

const candidateDecisionActionSchema = Type.Union(
  [
    Type.Literal("status"),
    Type.Literal("plan_keep"),
    Type.Literal("plan_discard"),
    Type.Literal("plan_rewind"),
  ],
  {
    description:
      "Inspect current candidate lifecycle posture or produce a read-only plan for keep, discard, or rewind.",
  },
);

export const candidateDecisionSchema = Type.Object({
  cwd: Type.Optional(
    Type.String({
      description: "Optional cwd override for candidate lifecycle decision planning.",
    }),
  ),
  action: Type.Optional(candidateDecisionActionSchema),
  candidatePolicy: Type.Optional(campaignStartCandidatePolicySchema),
});

export const campaignStartSchema = Type.Object({
  cwd: Type.Optional(
    Type.String({ description: "Optional cwd override for the supervised campaign front door." }),
  ),
  objective: Type.String({ description: "Bounded optimization objective for the campaign." }),
  setupMode: Type.Optional(campaignStartSetupModeSchema),
  runMode: Type.Optional(campaignStartRunModeSchema),
  maxIterations: Type.Optional(
    Type.Number({ description: "Maximum loop iterations when runMode=bounded_loop.", minimum: 1 }),
  ),
  maxWallClockMinutes: Type.Optional(
    Type.Number({ description: "Optional wall-clock budget in minutes.", minimum: 0.01 }),
  ),
  planner: Type.Optional(autoplanPlannerSchema),
  filesInScope: Type.Optional(stringArraySchema),
  offLimits: Type.Optional(stringArraySchema),
  constraints: Type.Optional(stringArraySchema),
  benchmarkCommand: Type.Optional(
    Type.String({ description: "Optional benchmark command override." }),
  ),
  checksCommand: Type.Optional(nullableStringSchema),
  metricName: Type.Optional(Type.String({ description: "Optional primary metric name override." })),
  metricUnit: Type.Optional(Type.String({ description: "Optional primary metric unit override." })),
  direction: Type.Optional(directionSchema),
  metricThreshold: Type.Optional(
    Type.Number({
      description: "Optional explicit success threshold for threshold-style metrics.",
    }),
  ),
  materializeDspxIntent: Type.Optional(
    Type.Boolean({
      description: "When planner=dspx_program, write the local DSPx intent artifact.",
    }),
  ),
  runDspxProgramGen: Type.Optional(
    Type.Boolean({
      description:
        "When planner=dspx_program, run the bounded local DSPx program-gen command and use its behavior_results.json as the campaign plan.",
    }),
  ),
  dspxProgramGenTimeoutSeconds: Type.Optional(
    Type.Number({ description: "DSPx program-gen timeout seconds.", minimum: 1 }),
  ),
  dspxIntentPath: Type.Optional(
    Type.String({ description: "Optional repo-relative or absolute DSPx intent path." }),
  ),
  dspxOutdir: Type.Optional(
    Type.String({ description: "Optional repo-relative or absolute DSPx program-gen output dir." }),
  ),
  dspxBehaviorPath: Type.Optional(
    Type.String({
      description: "Optional DSPx behavior_results.json path for advisory setup input.",
    }),
  ),
  description: Type.Optional(
    Type.String({ description: "Baseline or first-loop run description." }),
  ),
  allowOverwriteScripts: Type.Optional(
    Type.Boolean({ description: "Allow overwriting existing autoresearch scripts." }),
  ),
  reconfigure: Type.Optional(
    Type.Boolean({
      description:
        "Append a new config segment even if one is already configured; direct campaign-start execution fails closed without this when the requested metric/benchmark differs from the active segment.",
    }),
  ),
  timeoutSeconds: Type.Optional(
    Type.Number({ description: "Benchmark timeout seconds.", minimum: 1 }),
  ),
  checksTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Checks timeout seconds.", minimum: 1 }),
  ),
  postureCommand: Type.Optional(
    Type.String({ description: "Optional posture command required before benchmark execution." }),
  ),
  postureTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Posture command timeout seconds.", minimum: 1 }),
  ),
  decisionGoal: Type.Optional(
    Type.String({
      description: "When set, request governed next-hypothesis decisions in loop mode.",
    }),
  ),
  decisionConstraints: Type.Optional(stringArraySchema),
  decisionFilesInScope: Type.Optional(stringArraySchema),
  decisionOffLimits: Type.Optional(stringArraySchema),
  decisionIdeasBacklog: Type.Optional(stringArraySchema),
  decisionAsiNotes: Type.Optional(stringArraySchema),
  decisionDeadEndMemory: Type.Optional(stringArraySchema),
  stopOn: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("baseline"),
        Type.Literal("candidate"),
        Type.Literal("keep"),
        Type.Literal("discard"),
        Type.Literal("crash"),
        Type.Literal("checks_failed"),
        Type.Literal("blocked"),
        Type.Literal("rebaseline"),
        Type.Literal("finalize"),
      ]),
    ),
  ),
  peerMode: Type.Optional(loopPeerModeSchema),
  candidatePolicy: Type.Optional(campaignStartCandidatePolicySchema),
  campaignGoalId: Type.Optional(
    Type.String({
      description: "Optional package-local campaign goal id for foreground continuation.",
    }),
  ),
  campaignGoalIterationBudget: Type.Optional(
    Type.Number({
      description: "Total iteration budget across foreground campaign-goal segments.",
      minimum: 1,
    }),
  ),
  campaignGoalWallClockMinutesBudget: Type.Optional(
    Type.Number({
      description: "Total wall-clock budget across foreground campaign-goal segments.",
      minimum: 0.01,
    }),
  ),
  campaignGoalTokenBudget: Type.Optional(
    Type.Number({
      description: "Optional token-like budget ledger value across foreground segments.",
      minimum: 1,
    }),
  ),
  campaignGoalAutoContinue: Type.Optional(
    Type.Boolean({
      description:
        "When true, keep the package-local campaign goal active after each foreground segment while budget remains so the opt-in session auto-continuation hook can send the next visible follow-up.",
    }),
  ),
});

export const loopSchema = Type.Object({
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for the bounded loop." })),
  goal: Type.String({ description: "Bounded autoresearch loop goal." }),
  maxIterations: Type.Number({
    description: "Required maximum iterations for this bounded loop.",
    minimum: 1,
  }),
  maxWallClockMinutes: Type.Optional(
    Type.Number({ description: "Optional wall-clock budget in minutes.", minimum: 0.01 }),
  ),
  description: Type.Optional(Type.String({ description: "Initial run description." })),
  name: Type.Optional(Type.String({ description: "Campaign name when bootstrapping." })),
  metricName: Type.Optional(Type.String({ description: "Metric name when bootstrapping." })),
  metricUnit: Type.Optional(Type.String({ description: "Metric unit." })),
  direction: Type.Optional(directionSchema),
  metricThreshold: Type.Optional(
    Type.Number({ description: "Optional explicit success threshold when bootstrapping." }),
  ),
  benchmarkCommand: Type.Optional(Type.String({ description: "Benchmark command override." })),
  checksCommand: Type.Optional(nullableStringSchema),
  timeoutSeconds: Type.Optional(
    Type.Number({ description: "Benchmark timeout seconds.", minimum: 1 }),
  ),
  checksTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Checks timeout seconds.", minimum: 1 }),
  ),
  reconfigure: Type.Optional(
    Type.Boolean({ description: "Append a new config receipt before the first loop run." }),
  ),
  postureCommand: Type.Optional(
    Type.String({ description: "Optional posture command required to pass before each run." }),
  ),
  postureTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Posture command timeout seconds.", minimum: 1 }),
  ),
  decisionGoal: Type.Optional(
    Type.String({
      description: "When set, request governed next-hypothesis decisions between runs.",
    }),
  ),
  decisionConstraints: Type.Optional(stringArraySchema),
  decisionFilesInScope: Type.Optional(stringArraySchema),
  decisionOffLimits: Type.Optional(stringArraySchema),
  decisionIdeasBacklog: Type.Optional(stringArraySchema),
  decisionAsiNotes: Type.Optional(stringArraySchema),
  decisionDeadEndMemory: Type.Optional(stringArraySchema),
  stopOn: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Literal("baseline"),
        Type.Literal("candidate"),
        Type.Literal("keep"),
        Type.Literal("discard"),
        Type.Literal("crash"),
        Type.Literal("checks_failed"),
        Type.Literal("blocked"),
        Type.Literal("rebaseline"),
        Type.Literal("finalize"),
      ]),
    ),
  ),
  peerMode: Type.Optional(loopPeerModeSchema),
  campaignGoalId: Type.Optional(
    Type.String({
      description: "Optional package-local campaign goal id for foreground continuation.",
    }),
  ),
  campaignGoalIterationBudget: Type.Optional(
    Type.Number({
      description: "Total iteration budget across foreground campaign-goal segments.",
      minimum: 1,
    }),
  ),
  campaignGoalWallClockMinutesBudget: Type.Optional(
    Type.Number({
      description: "Total wall-clock budget across foreground campaign-goal segments.",
      minimum: 0.01,
    }),
  ),
  campaignGoalTokenBudget: Type.Optional(
    Type.Number({
      description: "Optional token-like budget ledger value across foreground segments.",
      minimum: 1,
    }),
  ),
  campaignGoalAutoContinue: Type.Optional(
    Type.Boolean({
      description:
        "When true, keep the package-local campaign goal active after each foreground segment while budget remains so the opt-in session auto-continuation hook can send the next visible follow-up.",
    }),
  ),
});

export const resumeApplySchema = Type.Object({
  cwd: Type.Optional(
    Type.String({ description: "Optional cwd override for foreground resume apply." }),
  ),
  segmentKey: Type.String({ description: "Exact segmentKey from resume_apply_plan." }),
  runtimeKey: Type.String({ description: "Exact runtimeKey from resume_apply_plan." }),
  maxIterations: Type.Number({
    description: "Required maximum iterations for this foreground resume apply.",
    minimum: 1,
  }),
  maxWallClockMinutes: Type.Number({
    description: "Required wall-clock budget in minutes.",
    minimum: 0.01,
  }),
  operatorConfirmation: Type.String({
    description: 'Must exactly equal "RUN FOREGROUND RESUME".',
  }),
  description: Type.Optional(Type.String({ description: "Initial resumed run description." })),
  timeoutSeconds: Type.Optional(
    Type.Number({ description: "Benchmark timeout seconds.", minimum: 1 }),
  ),
  checksTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Checks timeout seconds.", minimum: 1 }),
  ),
  postureCommand: Type.Optional(
    Type.String({ description: "Optional posture command required to pass before each run." }),
  ),
  postureTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Posture command timeout seconds.", minimum: 1 }),
  ),
});

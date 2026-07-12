// ---
// summary: "Defines TypeBox inputs for runtime status and packet actions, operator controls, and local finalization planning."
// read_when:
//   - "Changing status packet exports, inventory cleanup authorization, control decisions, or finalization workflow inputs."
// ---
import { Type } from "typebox";
import { AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION } from "../../src/core/runtime.ts";
import { nullableStringSchema, stringArraySchema } from "./schemas-common.ts";

const statusActionSchema = Type.Union(
  [
    Type.Literal("status"),
    Type.Literal("dashboard"),
    Type.Literal("setup"),
    Type.Literal("finalize"),
    Type.Literal("closeout"),
    Type.Literal("ak_evidence"),
    Type.Literal("oracle_evidence"),
    Type.Literal("oracle_evidence_export"),
    Type.Literal("learning"),
    Type.Literal("learning_export"),
    Type.Literal("candidate_result"),
    Type.Literal("candidate_result_export"),
    Type.Literal("candidate_inventory_cleanup_plan"),
    Type.Literal("candidate_inventory_cleanup_apply"),
    Type.Literal("resume_plan"),
    Type.Literal("resume_apply_plan"),
    Type.Literal("campaign_goal"),
    Type.Literal("adapter_contracts"),
    Type.Literal("validate_packet"),
  ],
  {
    description:
      "Inspect status, build package-local closeout/evidence/Oracle-ready/learning/candidate-result packets, list adapter packet contracts, validate an adapter packet structurally, or request a governed setup/finalize Prompt Vault packet through the bounded runtime surface.",
  },
);

export const statusSchema = Type.Object({
  action: Type.Optional(statusActionSchema),
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for runtime reporting" })),
  outPath: Type.Optional(
    Type.String({
      description:
        "Optional output path for action=oracle_evidence_export, action=learning_export, or action=candidate_result_export. Must be relative under cwd/.autoresearch; defaults are .autoresearch/oracle_evidence.json, .autoresearch/learning.json, and .autoresearch/candidate-result.json.",
    }),
  ),
  overwrite: Type.Optional(
    Type.Boolean({
      description:
        "Required as true for action=oracle_evidence_export, action=learning_export, or action=candidate_result_export when the target JSON file already exists.",
    }),
  ),
  archiveLabel: Type.Optional(
    Type.String({
      description:
        "Optional archive label for candidate_inventory_cleanup_plan/apply. Defaults to a timestamp under cwd/.autoresearch/closed-candidates/.",
    }),
  ),
  operatorConfirmation: Type.Optional(
    Type.String({
      description: `Required for candidate_inventory_cleanup_apply; must equal ${AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION}.`,
    }),
  ),
  optimizationObjective: Type.Optional(
    Type.String({
      description:
        "Required for action=setup. The bounded optimization objective for the setup packet.",
    }),
  ),
  repoContext: Type.Optional(stringArraySchema),
  filesInScope: Type.Optional(stringArraySchema),
  offLimits: Type.Optional(stringArraySchema),
  benchmarkSurfaces: Type.Optional(stringArraySchema),
  existingArtifacts: Type.Optional(stringArraySchema),
  hardConstraints: Type.Optional(stringArraySchema),
  blockers: Type.Optional(stringArraySchema),
  packet: Type.Optional(
    Type.Unknown({
      description:
        "Required for action=validate_packet. The adapter packet object to validate structurally.",
    }),
  ),
  akTaskId: Type.Optional(
    Type.Number({
      description:
        "Optional AK task id reference for action=setup, or required exact task id for action=ak_evidence.",
      minimum: 1,
    }),
  ),
  akScopeSummary: Type.Optional(stringArraySchema),
  akAllowedPaths: Type.Optional(stringArraySchema),
  akRequiredPaths: Type.Optional(stringArraySchema),
  keptRuns: Type.Optional(stringArraySchema),
  campaignContext: Type.Optional(stringArraySchema),
  mergeBase: Type.Optional(nullableStringSchema),
  trunkTarget: Type.Optional(nullableStringSchema),
  commitSummaries: Type.Optional(stringArraySchema),
  dependencyNotes: Type.Optional(stringArraySchema),
  ideasToLeaveOut: Type.Optional(stringArraySchema),
});

const controlActionSchema = Type.Union(
  [
    Type.Literal("status"),
    Type.Literal("set"),
    Type.Literal("goal_pause"),
    Type.Literal("goal_resume"),
    Type.Literal("goal_complete"),
  ],
  {
    description:
      "Inspect the current operator control overlay, set an explicit continue/rebaseline/finalize/stop decision, or apply an explicit campaign-goal pause/resume/complete control action.",
  },
);

const controlDecisionSchema = Type.Union(
  [
    Type.Literal("continue"),
    Type.Literal("rebaseline"),
    Type.Literal("finalize"),
    Type.Literal("stop"),
  ],
  {
    description: "Explicit operator control decision for the current bounded runtime posture.",
  },
);

export const controlSchema = Type.Object({
  action: Type.Optional(controlActionSchema),
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for control inspection." })),
  decision: Type.Optional(controlDecisionSchema),
  reason: Type.Optional(
    Type.String({
      description: "Optional short reason for the selected control decision.",
    }),
  ),
});

const finalizeActionSchema = Type.Union(
  [
    Type.Literal("status"),
    Type.Literal("plan"),
    Type.Literal("approve"),
    Type.Literal("materialize"),
  ],
  {
    description:
      "Inspect the current finalization plan state, refresh/reuse a plan, record approval, or materialize local review branches.",
  },
);

export const finalizeSchema = Type.Object({
  action: Type.Optional(finalizeActionSchema),
  cwd: Type.Optional(
    Type.String({ description: "Optional cwd override for finalization actions." }),
  ),
  reason: Type.Optional(
    Type.String({
      description: "Optional short reason for approve/materialize actions.",
    }),
  ),
});

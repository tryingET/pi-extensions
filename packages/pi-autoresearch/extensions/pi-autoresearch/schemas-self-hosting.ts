import { Type } from "typebox";
import { nonEmptyStringArraySchema, stringArraySchema } from "./schemas-common.ts";

const vllmCampaignActionSchema = Type.Union(
  [
    Type.Literal("status"),
    Type.Literal("plan"),
    Type.Literal("run_segment_plan"),
    Type.Literal("handoff_prompt"),
  ],
  {
    description:
      "Inspect or plan a bounded workstation vLLM autoresearch campaign cockpit for multi-matrix speed optimization.",
  },
);

export const vllmCampaignSchema = Type.Object({
  action: Type.Optional(vllmCampaignActionSchema),
  cwd: Type.Optional(
    Type.String({
      description:
        "Workstation repo root. Defaults to /home/tryinget/ai-society/softwareco/infra/workstation.",
    }),
  ),
  modelPath: Type.Optional(
    Type.String({
      description: "Local model path to optimize, usually under /data/vllm/hf-cache.",
    }),
  ),
  hardware: Type.Optional(Type.String({ description: "Hardware label for the campaign." })),
  knowledgeBase: Type.Optional(
    Type.String({ description: "Path to Blackwell knowledge base, absolute or relative to cwd." }),
  ),
  objective: Type.Optional(Type.String({ description: "Bounded optimization objective." })),
  maxWallClockMinutes: Type.Optional(Type.Number({ minimum: 0.01 })),
  maxIterations: Type.Optional(Type.Number({ minimum: 1 })),
  maxCellsPerSegment: Type.Optional(Type.Number({ minimum: 1 })),
  targets: Type.Optional(stringArraySchema),
  matrixAxes: Type.Optional(
    Type.Record(Type.String(), Type.Array(Type.String()), {
      description:
        "Optional matrix axes for planning; each key is an axis and each value is the list of values.",
    }),
  ),
  benchmarkProfile: Type.Optional(
    Type.Union([Type.Literal("smoke"), Type.Literal("longcot"), Type.Literal("throughput")]),
  ),
});

const selfHostingActionSchema = Type.Union(
  [
    Type.Literal("status"),
    Type.Literal("prepare_candidate"),
    Type.Literal("run"),
    Type.Literal("start_and_watch"),
    Type.Literal("rollback"),
  ],
  {
    description:
      "Inspect the supervised self-hosting contract, plan/apply the candidate worktree, run one bounded controller/candidate/evaluator wave, stream progress while that bounded wave runs, or record an explicit rollback after external controller rotation.",
  },
);

const selfHostingSuiteRegressionSchema = Type.Object({
  suiteId: Type.String({ description: "Exact locked evaluator suite id." }),
  regressionPercent: Type.Number({
    description:
      "Optional non-critical transfer regression percent to feed into applicability classification for this exact suite.",
    minimum: 0,
  }),
});

const selfHostingApprovalSchema = Type.Union(
  [Type.Literal("operator_review"), Type.Literal("orchestrator_supervision")],
  {
    description: "Explicit external approvals accepted by the supervised self-hosting contract.",
  },
);

const selfHostingPromotionStatusSchema = Type.Union(
  [
    Type.Literal("planned"),
    Type.Literal("approved"),
    Type.Literal("rotated"),
    Type.Literal("superseded"),
  ],
  {
    description:
      "Optional promotion-record status for action=run or action=start_and_watch when a default-promotion candidate should also plan/apply the external promotion record.",
  },
);

export const selfHostingSchema = Type.Object({
  action: Type.Optional(selfHostingActionSchema),
  cwd: Type.Optional(
    Type.String({ description: "Optional cwd override for the supervised self-hosting campaign." }),
  ),
  apply: Type.Optional(
    Type.Boolean({
      description:
        "For action=prepare_candidate or action=rollback. When true, apply the bounded worktree/rollback write instead of only planning it.",
    }),
  ),
  candidateCommand: Type.Optional(nonEmptyStringArraySchema),
  candidateTimeoutMs: Type.Optional(
    Type.Number({
      description:
        "Optional timeout in milliseconds for action=run or action=start_and_watch candidate subprocess execution.",
      minimum: 1,
    }),
  ),
  suiteIds: Type.Optional(
    Type.Array(Type.String({ description: "Exact locked evaluator suite id." }), { minItems: 1 }),
  ),
  suiteTimeoutMs: Type.Optional(
    Type.Number({
      description: "Optional timeout in milliseconds for each locked evaluator suite execution.",
      minimum: 1,
    }),
  ),
  primaryMetricBaseline: Type.Optional(
    Type.Number({
      description:
        "Required for action=run or action=start_and_watch. Baseline metric value used by applicability classification.",
    }),
  ),
  primaryMetricCandidate: Type.Optional(
    Type.Number({
      description:
        "Required for action=run or action=start_and_watch. Candidate metric value used by applicability classification.",
    }),
  ),
  variantTargetProfileImproved: Type.Optional(
    Type.Boolean({
      description:
        "Optional explicit evidence that the declared variant target profile improved during this wave.",
    }),
  ),
  suiteRegressionPercents: Type.Optional(Type.Array(selfHostingSuiteRegressionSchema)),
  approvedBy: Type.Optional(Type.Array(selfHostingApprovalSchema)),
  approvedAt: Type.Optional(
    Type.Number({
      description: "Optional approval timestamp for promotion planning/apply.",
      minimum: 0,
    }),
  ),
  evidenceRefs: Type.Optional(stringArraySchema),
  promotedCandidateRef: Type.Optional(
    Type.String({
      description:
        "Optional promoted candidate ref override for action=run or action=start_and_watch when promotion planning/apply should not default to the candidate HEAD.",
    }),
  ),
  promotionStatus: Type.Optional(selfHostingPromotionStatusSchema),
  promotionApply: Type.Optional(
    Type.Boolean({
      description:
        "Only for action=run or action=start_and_watch. When true, write the promotion record after a default-promotion classification instead of only planning it.",
    }),
  ),
  rollbackReason: Type.Optional(
    Type.String({
      description:
        "Required for action=rollback. Short explicit reason for the external rollback record.",
    }),
  ),
  rolledBackAt: Type.Optional(
    Type.Number({ description: "Optional rollback timestamp for action=rollback.", minimum: 0 }),
  ),
});

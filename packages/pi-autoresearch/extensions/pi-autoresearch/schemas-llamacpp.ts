// ---
// summary: "Defines TypeBox inputs for low-level llama.cpp campaign helpers and the public one-step campaign control surface."
// read_when:
//   - "Changing llama.cpp campaign actions, stage or build selection, AK binding inputs, apply semantics, or projection persistence."
// ---
import { Type } from "typebox";

const campaignActionSchema = Type.Union(
  [
    Type.Literal("plan_matrix"),
    Type.Literal("prepare_fork"),
    Type.Literal("execute_stage"),
    Type.Literal("build_ak_binding"),
    Type.Literal("advance_campaign"),
  ],
  {
    description:
      "Load a typed llama.cpp benchmark campaign manifest, either expand the exact 41/42/43 branch-lane matrix, plan/apply the fork workspace preparation, plan/apply one exact stage invocation, derive one exact AK-ready binding snapshot for an anchored task, or plan/apply one truthful next campaign-local stage step.",
  },
);

const campaignStageSchema = Type.Union(
  [Type.Literal("41"), Type.Literal("42"), Type.Literal("43")],
  {
    description: "Only for action=execute_stage. Select the exact workstation stage to bind.",
  },
);

export const campaignSchema = Type.Object({
  action: Type.Optional(campaignActionSchema),
  cwd: Type.Optional(
    Type.String({
      description:
        "Optional cwd override for manifest loading, fork preparation, and stage execution binding.",
    }),
  ),
  manifestPath: Type.String({
    description: "Path to the checked campaign manifest JSON relative to cwd or absolute.",
  }),
  stage: Type.Optional(campaignStageSchema),
  buildId: Type.Optional(
    Type.String({
      description:
        "Only for action=execute_stage. Exact manifest-listed build id to bind to the selected stage.",
    }),
  ),
  apply: Type.Optional(
    Type.Boolean({
      description:
        "For action=prepare_fork, action=execute_stage, or action=advance_campaign. When true, apply the selected fork/stage/next-step action instead of only printing the plan.",
    }),
  ),
  persistProjection: Type.Optional(
    Type.Boolean({
      description:
        "When true, explicitly write the derived campaign projection artifact even for non-apply plan/status calls. Mutating profiles only.",
    }),
  ),
  taskId: Type.Optional(
    Type.Number({
      description:
        "Only for action=build_ak_binding. Exact AK task id that this manifest campaign should reduce into a compact binding snapshot.",
      minimum: 1,
    }),
  ),
});

const campaignControlActionSchema = Type.Union([Type.Literal("status"), Type.Literal("advance")], {
  description:
    "Inspect the bounded public campaign-control posture for one manifest-driven llama.cpp campaign, or plan/apply exactly one truthful next step without raw stage/build inputs.",
});

export const campaignControlSchema = Type.Object({
  action: Type.Optional(campaignControlActionSchema),
  cwd: Type.Optional(
    Type.String({
      description:
        "Optional cwd override for manifest loading and public campaign-control actions.",
    }),
  ),
  manifestPath: Type.String({
    description: "Path to the checked campaign manifest JSON relative to cwd or absolute.",
  }),
  taskId: Type.Optional(
    Type.Number({
      description:
        "Optional exact AK task id for composing exact-task AK-binding context into the public control snapshot.",
      minimum: 1,
    }),
  ),
  apply: Type.Optional(
    Type.Boolean({
      description:
        "Only for action=advance. When true, apply exactly one truthful next step instead of only planning it.",
    }),
  ),
  persistProjection: Type.Optional(
    Type.Boolean({
      description:
        "When true, explicitly write the derived campaign projection artifact even for non-apply status/advance plans. Mutating profiles only.",
    }),
  ),
});

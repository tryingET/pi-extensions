import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export type PiToolParameters = Parameters<ExtensionAPI["registerTool"]>[0]["parameters"];

export function asPiToolParameters(schema: unknown): PiToolParameters {
  return schema as PiToolParameters;
}

export const stringArraySchema = Type.Array(Type.String());

export const nullableStringSchema = Type.Union([
  Type.String(),
  Type.Null({ description: "Explicitly clear this string value." }),
]);

export const directionSchema = Type.Union([Type.Literal("lower"), Type.Literal("higher")], {
  description: "Whether lower or higher metric values are better.",
});

export const candidateBindingSourceSchema = Type.Union(
  [Type.Literal("candidate_peer_spawn"), Type.Literal("manual")],
  {
    description:
      "Optional source for a visible candidate binding. candidate_peer_spawn means a visible isolated peer/worktree produced the candidate; manual means the controller supplied the candidate binding directly.",
  },
);

export const nonEmptyStringArraySchema = Type.Array(Type.String(), { minItems: 1 });

export const autoplanPlannerSchema = Type.Union(
  [Type.Literal("heuristic"), Type.Literal("dspx_program")],
  {
    description:
      "Planner backend. dspx_program can materialize a DSPx-generated DSPy planner assembly; with runDspxProgramGen=true, pi-autoresearch validates the generated DSPy output before using it as the local campaign plan while remaining the outer controller.",
  },
);

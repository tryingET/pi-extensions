// ---
// summary: "Defines TypeBox inputs for measured runs, peer-assist planning, local autoplan, and runtime setup actions."
// read_when:
//   - "Changing experiment evidence fields, candidate bindings, peer handoffs, planning inputs, or setup execution limits."
// ---
import { Type } from "typebox";
import {
  autoplanPlannerSchema,
  candidateBindingSourceSchema,
  directionSchema,
  nullableStringSchema,
  stringArraySchema,
} from "./schemas-common.ts";

const runKindSchema = Type.Union([Type.Literal("ordinary"), Type.Literal("calibration")], {
  description:
    "Run kind. Calibration runs update timing/noise interpretation but should not be treated as candidate improvements.",
});

export const runSchema = Type.Object({
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for the bounded runtime" })),
  description: Type.String({
    description: "Short description of what this bounded run is trying.",
  }),
  runKind: Type.Optional(runKindSchema),
  hypothesisId: Type.Optional(
    Type.String({
      description:
        "Optional stable hypothesis identifier to bind this run into experiment lineage.",
    }),
  ),
  hypothesis: Type.Optional(
    Type.String({
      description: "Optional hypothesis this run is testing.",
    }),
  ),
  interventionSummary: Type.Optional(
    Type.String({
      description: "Optional short summary of the intervention or candidate being measured.",
    }),
  ),
  expectedPrimaryEffect: Type.Optional(
    Type.String({
      description: "Optional expected effect on the primary metric before the run executes.",
    }),
  ),
  hypothesisTargetFiles: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional files or paths that the hypothesis/intervention concerns.",
    }),
  ),
  experimentRisk: Type.Optional(
    Type.String({
      description: "Optional risk or validity caveat for this experiment run.",
    }),
  ),
  candidateSource: Type.Optional(candidateBindingSourceSchema),
  candidateWorktree: Type.Optional(
    Type.String({
      description:
        "Optional visible candidate worktree/path being evaluated. This binds evidence only; pi-autoresearch does not spawn, merge, or promote the candidate.",
    }),
  ),
  candidateBranch: Type.Optional(
    Type.String({
      description: "Optional candidate branch name or ref supplied by the visible candidate lane.",
    }),
  ),
  candidateBaseRef: Type.Optional(
    Type.String({
      description: "Optional base ref the candidate was produced from.",
    }),
  ),
  candidateDiffSummary: Type.Optional(
    Type.String({
      description: "Optional controller-verified summary of the candidate diff.",
    }),
  ),
  candidateFilesChanged: Type.Optional(
    Type.Array(Type.String(), {
      description: "Optional controller-verified files changed by the candidate.",
    }),
  ),
  name: Type.Optional(
    Type.String({
      description:
        "Campaign name. Required when bootstrapping the first config receipt or reconfiguring the bounded runtime.",
    }),
  ),
  metricName: Type.Optional(
    Type.String({
      description:
        "Primary metric name. Required when bootstrapping the first config receipt or reconfiguring the bounded runtime.",
    }),
  ),
  metricUnit: Type.Optional(
    Type.String({ description: "Primary metric unit (defaults to empty string)." }),
  ),
  direction: Type.Optional(directionSchema),
  metricThreshold: Type.Optional(
    Type.Number({
      description:
        "Optional explicit success threshold. Lower metrics satisfy value<=threshold; higher metrics satisfy value>=threshold. Does not authorize external promotion.",
    }),
  ),
  benchmarkCommand: Type.Optional(
    Type.String({
      description:
        "Benchmark command override. Defaults to the config receipt command or 'bash autoresearch.sh' when present.",
    }),
  ),
  checksCommand: Type.Optional(
    Type.Union([
      Type.String({ description: "Checks command override." }),
      Type.Null({ description: "Pass null to disable checks for this run." }),
    ]),
  ),
  timeoutSeconds: Type.Optional(
    Type.Number({ description: "Benchmark timeout in seconds (default: 600).", minimum: 1 }),
  ),
  checksTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Checks timeout in seconds (default: 300).", minimum: 1 }),
  ),
  postureCommand: Type.Optional(
    Type.String({
      description:
        "Optional machine/workstation posture command that must report safe posture before the benchmark starts.",
    }),
  ),
  postureTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Posture command timeout in seconds (default: 15).", minimum: 1 }),
  ),
  reconfigure: Type.Optional(
    Type.Boolean({
      description:
        "Append a new config receipt before this run. Requires name + metricName and resets the current segment.",
    }),
  ),
  decisionGoal: Type.Optional(
    Type.String({
      description:
        "When set, request a governed Prompt Vault next-hypothesis decision after the run using this bounded goal.",
    }),
  ),
  decisionConstraints: Type.Optional(stringArraySchema),
  decisionFilesInScope: Type.Optional(stringArraySchema),
  decisionOffLimits: Type.Optional(stringArraySchema),
  decisionIdeasBacklog: Type.Optional(stringArraySchema),
  decisionAsiNotes: Type.Optional(stringArraySchema),
  decisionDeadEndMemory: Type.Optional(stringArraySchema),
});

const peerAssistLaneSchema = Type.Union(
  [
    Type.Literal("auto"),
    Type.Literal("none"),
    Type.Literal("scout"),
    Type.Literal("candidate"),
    Type.Literal("fork"),
  ],
  { description: "Peer-assist lane to plan. auto selects from current runtime state." },
);

const reportBackSchema = Type.Union(
  [Type.Literal("intercom"), Type.Literal("manual"), Type.Literal("none")],
  { description: "Visible peer report-back mode." },
);

export const peerAssistSchema = Type.Object({
  cwd: Type.Optional(
    Type.String({ description: "Optional cwd override for peer-assist planning." }),
  ),
  lane: Type.Optional(peerAssistLaneSchema),
  objective: Type.Optional(Type.String({ description: "Optional peer objective override." })),
  targetFiles: Type.Optional(stringArraySchema),
  offLimits: Type.Optional(stringArraySchema),
  constraints: Type.Optional(stringArraySchema),
  reportBack: Type.Optional(reportBackSchema),
  parentPeerTarget: Type.Optional(
    Type.String({ description: "Exact parent peer target/session id for intercom report-back." }),
  ),
});

export const autoplanSchema = Type.Object({
  cwd: Type.Optional(
    Type.String({ description: "Optional cwd override for repo/problem inspection." }),
  ),
  objective: Type.String({
    description: "Optimization objective to turn into a bounded campaign plan.",
  }),
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
  dspxIntentPath: Type.Optional(
    Type.String({ description: "Optional repo-relative or absolute DSPx intent path." }),
  ),
  dspxOutdir: Type.Optional(
    Type.String({ description: "Optional repo-relative or absolute DSPx program-gen output dir." }),
  ),
  dspxBehaviorPath: Type.Optional(
    Type.String({
      description:
        "Optional repo-relative or absolute DSPx behavior_results.json path to read as evidence-only advisory setup input.",
    }),
  ),
});

const setupActionSchema = Type.Union(
  [Type.Literal("plan"), Type.Literal("apply"), Type.Literal("baseline")],
  { description: "Setup action: plan only, apply config receipt only, or apply and run baseline." },
);

export const setupSchema = Type.Object({
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for setup." })),
  action: Type.Optional(setupActionSchema),
  name: Type.String({ description: "Campaign or segment name." }),
  metricName: Type.String({ description: "Primary metric name parsed from METRIC name=value." }),
  metricUnit: Type.Optional(Type.String({ description: "Metric unit." })),
  direction: directionSchema,
  metricThreshold: Type.Optional(
    Type.Number({ description: "Optional explicit success threshold for this metric contract." }),
  ),
  benchmarkCommand: Type.Optional(Type.String({ description: "Benchmark command." })),
  checksCommand: Type.Optional(nullableStringSchema),
  reconfigure: Type.Optional(
    Type.Boolean({ description: "Append a new config segment even if one is already configured." }),
  ),
  description: Type.Optional(Type.String({ description: "Baseline run description." })),
  benchmarkScript: Type.Optional(
    Type.String({
      description: "Optional autoresearch.sh content to write before apply/baseline.",
    }),
  ),
  checksScript: Type.Optional(
    Type.String({
      description: "Optional autoresearch.checks.sh content to write before apply/baseline.",
    }),
  ),
  allowOverwriteScripts: Type.Optional(
    Type.Boolean({ description: "Allow overwriting existing autoresearch scripts." }),
  ),
  postureCommand: Type.Optional(
    Type.String({ description: "Optional posture gate for baseline." }),
  ),
  postureTimeoutSeconds: Type.Optional(Type.Number({ minimum: 1 })),
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 1 })),
  checksTimeoutSeconds: Type.Optional(Type.Number({ minimum: 1 })),
});

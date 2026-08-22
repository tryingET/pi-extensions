// ---
// summary: "Registers the explicit plan/materialize telemetry_learning_kes_adapter tool."
// read_when:
//   - "Changing telemetry review parameters, owner-local KES materialization, or AK handoff behavior."
// ---

import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  buildTelemetryLearningKesAdapterResult,
  TELEMETRY_REVIEW_METRIC_KEYS,
} from "../src/runtime/telemetry-learning-kes-adapter.ts";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

export default function telemetryKesAdapterExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "telemetry_learning_kes_adapter",
    label: "Telemetry Review to KES Candidate",
    description:
      "Validate one digest-bound Pi telemetry review snapshot, evaluate one explicitly scoped trigger, and plan or materialize an owner-local KES Proposal candidate. Does not call AK or promote content.",
    promptSnippet:
      "Bind the snapshot to a subject revision and explicit sample/coverage policy. Supply an owner-authored claim, falsification condition, review trigger, and retirement signal. Plan before materializing.",
    parameters: Type.Object({
      snapshot_path: Type.String({
        description:
          "Explicit path to one pi.telemetry-review-snapshot.v1 file. The telemetry package validates size, file custody, schema, consistency, and digest.",
      }),
      subject: Type.String({
        minLength: 1,
        maxLength: 300,
        description: "Stable repository, package, workflow, or experiment subject identifier.",
      }),
      subject_revision: Type.String({
        minLength: 1,
        maxLength: 200,
        description:
          "Immutable commit, package version, configuration revision, or equivalent subject revision.",
      }),
      configuration_ref: Type.Optional(
        Type.String({
          minLength: 1,
          maxLength: 500,
          description:
            "Optional bounded configuration/profile reference relevant to the observation.",
        }),
      ),
      metric: Type.Union(TELEMETRY_REVIEW_METRIC_KEYS.map((key) => Type.Literal(key))),
      threshold: Type.Number({ minimum: 0 }),
      comparison: Type.Union([
        Type.Literal("above"),
        Type.Literal("at-or-above"),
        Type.Literal("below"),
        Type.Literal("at-or-below"),
      ]),
      coverage_policy: Type.Union([Type.Literal("live-required"), Type.Literal("any-observed")], {
        description:
          "Explicit source-coverage decision. live-required needs minimum_live_events >= 1; any-observed requires minimum_live_events = 0.",
      }),
      minimum_sample_size: Type.Integer({ minimum: 0, maximum: 10_000_000 }),
      minimum_live_events: Type.Integer({ minimum: 0, maximum: 10_000_000 }),
      candidate_claim: Type.String({
        minLength: 1,
        maxLength: 2000,
        description: "Owner-authored candidate claim; telemetry does not author or verify it.",
      }),
      falsification_condition: Type.String({ minLength: 1, maxLength: 1500 }),
      review_trigger: Type.String({ minLength: 1, maxLength: 1000 }),
      retirement_signal: Type.String({ minLength: 1, maxLength: 1000 }),
      action: Type.Optional(
        Type.Union([Type.Literal("plan"), Type.Literal("materialize")], {
          description:
            "Defaults to plan. Materialize fails closed when any review blocker remains.",
        }),
      ),
      session_id: Type.Optional(Type.String({ maxLength: 200 })),
    }),
    async execute(_toolCallId, params) {
      const result = await buildTelemetryLearningKesAdapterResult({
        packageRoot,
        snapshotPath: params.snapshot_path,
        subject: params.subject,
        subjectRevision: params.subject_revision,
        configurationRef: params.configuration_ref,
        metric: params.metric,
        threshold: params.threshold,
        comparison: params.comparison,
        coveragePolicy: params.coverage_policy,
        minimumSampleSize: params.minimum_sample_size,
        minimumLiveEvents: params.minimum_live_events,
        candidateClaim: params.candidate_claim,
        falsificationCondition: params.falsification_condition,
        reviewTrigger: params.review_trigger,
        retirementSignal: params.retirement_signal,
        action: params.action,
        sessionId: params.session_id,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: { data: result },
      };
    },
  });
}

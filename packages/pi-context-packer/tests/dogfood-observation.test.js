/**
summary: "Validate dogfood receipt parsing, calibration, aggregation, redaction, and telemetry."
read_when:
  - "You change dogfood observation schemas, follow-up classes, statuses, or aggregate output."
*/

import assert from "node:assert/strict";
import test from "node:test";
import {
  DOGFOOD_CONTRARY_OMISSION_FOLLOWUP_CLASSES,
  DOGFOOD_OMISSION_FOLLOWUP_CLASS_GUIDANCE,
  DOGFOOD_OMISSION_FOLLOWUP_CLASS_NEXT_ACTIONS,
  DOGFOOD_OMISSION_FOLLOWUP_CLASSES,
  DOGFOOD_USER_OMISSION_FOLLOWUP_CLASSES,
} from "../src/dogfood-followup-classes.js";
import {
  buildDogfoodAggregateEvaluation,
  buildDogfoodObservationEvaluation,
  DOGFOOD_AGGREGATE_EVALUATION_PARAMETERS,
  DOGFOOD_OBSERVATION_EVALUATION_PARAMETERS,
  dogfoodAggregateEvaluationToolResult,
  dogfoodObservationEvaluationToolResult,
  formatDogfoodAggregateEvaluation,
  formatDogfoodObservationEvaluation,
} from "../src/dogfood-observation.js";

test("dogfood follow-up class registry has coherent public and internal projections", () => {
  assert.ok(DOGFOOD_OMISSION_FOLLOWUP_CLASSES.includes("legacy_unspecified"));
  assert.equal(DOGFOOD_USER_OMISSION_FOLLOWUP_CLASSES.includes("legacy_unspecified"), false);
  assert.ok(DOGFOOD_CONTRARY_OMISSION_FOLLOWUP_CLASSES.includes("true_missing_capability"));
  assert.equal(DOGFOOD_CONTRARY_OMISSION_FOLLOWUP_CLASSES.includes("useful_omission"), false);
  assert.match(DOGFOOD_OMISSION_FOLLOWUP_CLASS_GUIDANCE, /true_missing_capability/);
  assert.doesNotMatch(DOGFOOD_OMISSION_FOLLOWUP_CLASS_GUIDANCE, /legacy_unspecified/);
  assert.match(
    DOGFOOD_OMISSION_FOLLOWUP_CLASS_NEXT_ACTIONS.provenance_source_owner_followup,
    /owning surface/,
  );
});

const baseObservation = (overrides = {}) => ({
  kind: "context_pack_dogfood_observation_v1",
  status: "observation_pending",
  packet: {
    objectiveRef: "packet.objective",
    selectedItemCount: 2,
    omittedCandidateCount: 0,
  },
  prediction: {
    expectedLowLevelCallsAvoided: 3,
    packetUtilityRecommendationStatus: "use_packet",
    alreadyLoadedItems: 0,
    freshItemCount: 2,
    duplicateTokensAvoided: 0,
    unwiredProviderOmissions: [],
  },
  observation: {
    activityType: "implementation",
    actualLowLevelReadSearchStatusCalls: 1,
    actualLowLevelCallsAvoided: 3,
    validationCommandsRun: 2,
    duplicateReadsObserved: false,
    omissionFollowupsUsed: [],
    recommendationMatchedOutcome: true,
    notes: "packet avoided duplicate reads",
  },
  countingRule: "Count ad-hoc read/search/list/status probes separately from validation commands.",
  nonAuthorization: "copy-ready packet-local observation template only",
  ...overrides,
});

test("dogfood evaluator classifies matched observations without raw packet content", () => {
  const evaluation = buildDogfoodObservationEvaluation({ observation: baseObservation() });
  const text = formatDogfoodObservationEvaluation(evaluation);

  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.status, "matched");
  assert.equal(evaluation.expectedLowLevelCallsAvoided, 3);
  assert.equal(evaluation.activityType, "implementation");
  assert.equal(evaluation.runtimeContext, "unknown");
  assert.equal(evaluation.actualLowLevelReadSearchStatusCalls, 1);
  assert.equal(evaluation.actualLowLevelCallsAvoided, 3);
  assert.equal(evaluation.validationCommandsRun, 2);
  assert.match(text, /Status: matched/);
  assert.match(text, /Activity type: implementation/);
  assert.match(text, /Runtime context: unknown/);
  assert.match(text, /Validation commands run: 2/);
  assert.match(text, /did not persist evidence/);
  assert.doesNotMatch(JSON.stringify(evaluation), /packet\.sections|provenance|path/);
});

test("dogfood evaluator preserves redacted provider route telemetry", () => {
  const evaluation = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      packet: {
        ...baseObservation().packet,
        providerRoutes: [
          {
            provider: "docs",
            posture: "required",
            routeRole: "selected",
            queryCount: 1,
            selectedQueryCount: 1,
            followupQueryCount: 0,
            seedCount: 1,
            seedCounts: { markdown: 1 },
          },
          {
            provider: "prompt_vault",
            posture: "optional",
            routeRole: "followup",
            queryCount: 2,
            seedCounts: { prompt: 1, free_text: 1 },
          },
        ],
      },
    }),
  });
  const text = formatDogfoodObservationEvaluation(evaluation);

  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.providerRoutes.length, 2);
  assert.equal(evaluation.providerRoutes[0].selectedQueryCount, 1);
  assert.equal(evaluation.providerRoutes[1].totalQueryCount, 2);
  assert.equal(evaluation.providerRoutes[1].selectedQueryCount, 0);
  assert.equal(evaluation.providerRoutes[1].followupQueryCount, 2);
  assert.deepEqual(Object.fromEntries(Object.entries(evaluation.providerRoutes[1].seedCounts)), {
    free_text: 1,
    prompt: 1,
  });
  assert.match(text, /Provider route telemetry/);
  assert.match(text, /docs: role=selected/);
  assert.match(text, /prompt_vault: role=followup/);
});

test("dogfood evaluator rejects invalid provider route counts", () => {
  const evaluation = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      packet: {
        ...baseObservation().packet,
        providerRoutes: [
          {
            provider: "docs",
            posture: "required",
            routeRole: "selected",
            selectedQueryCount: 1.5,
            followupQueryCount: -1,
            seedCount: 1,
            seedCounts: { markdown: 0.5 },
          },
        ],
      },
    }),
  });

  assert.equal(evaluation.ok, false);
  assert.match(evaluation.errors.join("\n"), /selectedQueryCount/);
  assert.match(evaluation.errors.join("\n"), /followupQueryCount/);
  assert.match(evaluation.errors.join("\n"), /seedCounts\[0\]\.markdown/);
});

test("dogfood evaluator rejects provider route selected/follow-up count contradictions", () => {
  const selectedOnFollowup = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      packet: {
        ...baseObservation().packet,
        providerRoutes: [
          {
            provider: "prompt_vault",
            posture: "optional",
            routeRole: "followup",
            totalQueryCount: 7,
            selectedQueryCount: 7,
            followupQueryCount: 0,
          },
        ],
      },
    }),
  });
  const followupOnSelected = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      packet: {
        ...baseObservation().packet,
        providerRoutes: [
          {
            provider: "docs",
            posture: "required",
            routeRole: "selected",
            totalQueryCount: 1,
            selectedQueryCount: 1,
            followupQueryCount: 1,
          },
        ],
      },
    }),
  });

  assert.equal(selectedOnFollowup.ok, false);
  assert.match(selectedOnFollowup.errors.join("\n"), /selectedQueryCount must be zero/);
  assert.equal(followupOnSelected.ok, false);
  assert.match(followupOnSelected.errors.join("\n"), /followupQueryCount must be zero/);
});

test("dogfood evaluator redacts invalid provider route seed-count keys", async () => {
  const result = await dogfoodObservationEvaluationToolResult({
    observation: baseObservation({
      packet: {
        ...baseObservation().packet,
        providerRoutes: [
          {
            provider: "docs",
            posture: "required",
            routeRole: "selected",
            selectedQueryCount: 1,
            seedCounts: { "/tmp/customer-acme TOKEN=secret": 0.5 },
          },
        ],
      },
    }),
  });
  const serialized = JSON.stringify(result.details);

  assert.equal(result.details.dogfoodObservationEvaluation.ok, false);
  assert.match(result.content[0].text, /seedCounts\[0\]/);
  assert.doesNotMatch(result.content[0].text, /TOKEN|customer-acme|\/tmp\//);
  assert.doesNotMatch(serialized, /TOKEN|customer-acme|\/tmp\//);
});

test("dogfood evaluator redacts and truncates malicious provider route labels", async () => {
  const providerRoutes = Array.from({ length: 25 }, (_, index) => {
    const seedCounts = Object.create(null);
    seedCounts[index === 0 ? "/tmp/customer-acme TOKEN=secret" : "markdown"] = 1;
    seedCounts.__proto__ = 1;
    return {
      provider: index === 0 ? "/tmp/customer-acme TOKEN=secret" : `provider-${index}`,
      posture: "optional\n## Forged section",
      routeRole: index === 0 ? "followup" : "selected",
      queryCount: 1,
      seedCount: 1,
      seedCounts,
    };
  });
  const result = await dogfoodObservationEvaluationToolResult({
    observation: baseObservation({
      packet: {
        ...baseObservation().packet,
        providerRoutes,
        providerRoutesTruncated: 3,
      },
    }),
  });
  const evaluation = result.details.dogfoodObservationEvaluation;
  const serialized = JSON.stringify(result.details);

  assert.equal(evaluation.ok, true);
  assert.equal(evaluation.providerRoutes.length, 20);
  assert.equal(evaluation.providerRoutesTruncated, 8);
  assert.doesNotMatch(result.content[0].text, /TOKEN|customer-acme|\/tmp\//);
  assert.doesNotMatch(result.content[0].text, /^## Forged section/m);
  assert.doesNotMatch(serialized, /TOKEN|customer-acme|\/tmp\//);
  assert.equal(evaluation.providerRoutes[1].seedCounts.__proto__, 1);
});

test("dogfood evaluator classifies overestimated and underestimated usefulness from observed avoided calls", () => {
  const overestimated = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      observation: {
        actualLowLevelReadSearchStatusCalls: 4,
        actualLowLevelCallsAvoided: 1,
        duplicateReadsObserved: true,
        omissionFollowupsUsed: ["docs/provider gap"],
        recommendationMatchedOutcome: false,
        notes: "needed more probes than expected",
      },
    }),
  });
  const underestimated = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      observation: {
        actualLowLevelReadSearchStatusCalls: 0,
        actualLowLevelCallsAvoided: 5,
        duplicateReadsObserved: false,
        omissionFollowupsUsed: [],
        recommendationMatchedOutcome: true,
        notes: "packet saved more probes than predicted",
      },
    }),
  });

  assert.equal(overestimated.status, "overestimated");
  assert.equal(underestimated.status, "underestimated");
  assert.equal(overestimated.omissionFollowupsUsed[0], "docs/provider gap");
  assert.equal(overestimated.omissionFollowupClasses[0], "legacy_unspecified");
  assert.equal(overestimated.omissionFollowupClassCounts.legacy_unspecified, 1);
});

async function assertNoSecretLeak(result) {
  const serialized = JSON.stringify(result.details ?? result);
  assert.doesNotMatch(serialized, /TOKEN|customer-acme|\/tmp\//);
  if (result.content?.[0]?.text) {
    assert.doesNotMatch(result.content[0].text, /TOKEN|customer-acme|\/tmp\//);
    assert.doesNotMatch(result.content[0].text, /^## Forged section/m);
  }
}

test("dogfood evaluator normalizes structured omission follow-up classes", async () => {
  const result = await dogfoodObservationEvaluationToolResult({
    observation: baseObservation({
      observation: {
        activityType: "review",
        actualLowLevelReadSearchStatusCalls: 3,
        actualLowLevelCallsAvoided: 1,
        validationCommandsRun: 1,
        duplicateReadsObserved: true,
        omissionFollowupsUsed: [
          {
            provider: "docs",
            reason: "packet omission was useful",
            classification: "useful omission",
          },
          { provider: "sci", reason: "needed symbol lookup", class: "residual-probe" },
          {
            provider: "ak",
            reason: "needed owner surface",
            type: "provenance_source_owner_followup",
          },
          {
            provider: "/tmp/customer-acme",
            reason: "TOKEN=secret",
            classification: "../../forged TOKEN=secret",
          },
        ],
        recommendationMatchedOutcome: false,
        notes: "needed typed follow-up review",
      },
    }),
  });
  const evaluation = result.details.dogfoodObservationEvaluation;

  assert.equal(evaluation.ok, true);
  assert.deepEqual(evaluation.omissionFollowupClasses, [
    "useful_omission",
    "residual_probe",
    "provenance_source_owner_followup",
    "other",
  ]);
  assert.equal(evaluation.omissionFollowupClassCounts.useful_omission, 1);
  assert.equal(evaluation.omissionFollowupClassCounts.residual_probe, 1);
  assert.equal(evaluation.omissionFollowupClassCounts.provenance_source_owner_followup, 1);
  assert.equal(evaluation.omissionFollowupClassCounts.other, 1);
  assert.match(result.content[0].text, /Omission follow-up class counts/);
  assert.match(result.content[0].text, /useful_omission/);
  await assertNoSecretLeak(result);
});

test("dogfood evaluator does not treat healthy typed follow-up classes as contrary signals", () => {
  const evaluation = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      observation: {
        activityType: "validation",
        actualLowLevelReadSearchStatusCalls: 1,
        actualLowLevelCallsAvoided: 3,
        validationCommandsRun: 2,
        duplicateReadsObserved: false,
        omissionFollowupsUsed: [
          {
            provider: "docs",
            reason: "omission was correctly excluded",
            classification: "useful_omission",
          },
          { provider: "test", reason: "validation command", classification: "validation_activity" },
          { provider: "legacy", reason: "missing old field", classification: "legacy_missingness" },
        ],
        recommendationMatchedOutcome: true,
        notes: "typed follow-ups explain healthy non-context activity",
      },
    }),
  });

  assert.equal(evaluation.status, "matched");
  assert.equal(evaluation.omissionFollowupClassCounts.useful_omission, 1);
  assert.equal(evaluation.omissionFollowupClassCounts.validation_activity, 1);
  assert.equal(evaluation.omissionFollowupClassCounts.legacy_missingness, 1);
});

test("dogfood evaluator sends contradictory observations to review instead of matching", () => {
  const evaluation = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      observation: {
        actualLowLevelReadSearchStatusCalls: 999,
        actualLowLevelCallsAvoided: 3,
        duplicateReadsObserved: true,
        omissionFollowupsUsed: [
          {
            provider: "prompt_vault",
            reason: "provider unavailable",
            classification: "provenance_source_owner_followup",
          },
        ],
        recommendationMatchedOutcome: false,
        notes: "equal avoided count conflicts with expensive follow-up",
      },
    }),
  });

  assert.equal(evaluation.status, "needs_review");
  assert.match(evaluation.nextAction, /Review duplicate reads/);
});

test("dogfood evaluator treats residual-only observations as incomplete unless outcome is explicit", () => {
  const incomplete = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      prediction: { ...baseObservation().prediction, expectedLowLevelCallsAvoided: 5 },
      observation: {
        actualLowLevelReadSearchStatusCalls: 1,
        actualLowLevelCallsAvoided: null,
        duplicateReadsObserved: false,
        omissionFollowupsUsed: [],
        recommendationMatchedOutcome: null,
        notes: "residual calls alone do not prove avoided calls",
      },
    }),
  });
  const matched = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      prediction: { ...baseObservation().prediction, expectedLowLevelCallsAvoided: 5 },
      observation: {
        actualLowLevelReadSearchStatusCalls: 1,
        actualLowLevelCallsAvoided: null,
        duplicateReadsObserved: false,
        omissionFollowupsUsed: [],
        recommendationMatchedOutcome: true,
        notes: "human observed packet matched outcome",
      },
    }),
  });

  assert.equal(incomplete.status, "observation_incomplete");
  assert.equal(matched.status, "matched");
});

test("dogfood evaluator reports incomplete observations without claiming evidence", () => {
  const evaluation = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      observation: {
        actualLowLevelReadSearchStatusCalls: null,
        actualLowLevelCallsAvoided: null,
        duplicateReadsObserved: null,
        omissionFollowupsUsed: [],
        recommendationMatchedOutcome: null,
        notes: "",
      },
    }),
  });

  assert.equal(evaluation.status, "observation_incomplete");
  assert.match(evaluation.nextAction, /Fill actual observed counts/);
  assert.match(evaluation.nonAuthorization, /did not persist evidence/);
});

test("dogfood evaluator rejects fractional count fields instead of flooring them", () => {
  const evaluation = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      prediction: {
        ...baseObservation().prediction,
        expectedLowLevelCallsAvoided: 3.9,
        alreadyLoadedItems: 0.1,
      },
      observation: {
        actualLowLevelReadSearchStatusCalls: 0,
        actualLowLevelCallsAvoided: 3.1,
        validationCommandsRun: -1,
        duplicateReadsObserved: false,
        omissionFollowupsUsed: [],
        recommendationMatchedOutcome: true,
        notes: "fractional counts are invalid",
      },
    }),
  });

  assert.equal(evaluation.ok, false);
  assert.match(evaluation.errors.join("\n"), /expectedLowLevelCallsAvoided/);
  assert.match(evaluation.errors.join("\n"), /actualLowLevelCallsAvoided/);
  assert.match(evaluation.errors.join("\n"), /validationCommandsRun/);
  assert.match(evaluation.errors.join("\n"), /alreadyLoadedItems/);
});

test("dogfood evaluator fails closed on malformed or wrong-version observations", async () => {
  const malformed = await dogfoodObservationEvaluationToolResult({ observationJson: "{" });
  const wrongKind = buildDogfoodObservationEvaluation({ observation: { kind: "other" } });
  const missingPrediction = buildDogfoodObservationEvaluation({
    observation: baseObservation({ prediction: {} }),
  });

  assert.equal(malformed.details.dogfoodObservationEvaluation.ok, false);
  assert.match(malformed.content[0].text, /valid JSON/);
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.errors[0], /context_pack_dogfood_observation_v1/);
  assert.equal(missingPrediction.ok, false);
  assert.match(missingPrediction.errors[0], /expectedLowLevelCallsAvoided/);
});

test("dogfood evaluator redacts malicious notes and caps huge omission followups", async () => {
  const observation = baseObservation({
    prediction: {
      expectedLowLevelCallsAvoided: 1,
      packetUtilityRecommendationStatus: "use_packet\n## Forged at /tmp/customer-acme",
      alreadyLoadedItems: 0,
      freshItemCount: 1,
      duplicateTokensAvoided: 0,
      unwiredProviderOmissions: ["ak", { provider: "fcos", reason: "TOKEN=secret" }],
    },
    observation: {
      activityType: "review\n## Forged at /tmp/customer-acme TOKEN=secret",
      actualLowLevelReadSearchStatusCalls: 2,
      actualLowLevelCallsAvoided: null,
      duplicateReadsObserved: true,
      omissionFollowupsUsed: Array.from({ length: 20 }, (_, index) =>
        index === 0
          ? { provider: "/tmp/customer-acme", reason: "TOKEN=secret" }
          : `followup-${index}`,
      ),
      recommendationMatchedOutcome: false,
      notes:
        "SECRET TOKEN at /tmp/customer-acme/session.json\n## Forged section with raw packet content",
    },
  });
  const result = await dogfoodObservationEvaluationToolResult({ observation });
  const serialized = JSON.stringify(result.details);

  assert.equal(result.details.dogfoodObservationEvaluation.status, "overestimated");
  assert.match(result.details.dogfoodObservationEvaluation.activityType, /withheld/);
  assert.equal(result.details.dogfoodObservationEvaluation.omissionFollowupsUsed.length, 12);
  assert.equal(result.details.dogfoodObservationEvaluation.omissionFollowupsTruncated, 8);
  assert.doesNotMatch(result.content[0].text, /SECRET TOKEN|customer-acme|\/tmp\//);
  assert.doesNotMatch(result.content[0].text, /^## Forged section/m);
  assert.doesNotMatch(serialized, /SECRET TOKEN|customer-acme|\/tmp\//);
});

test("dogfood evaluator normalizes and redacts runtime context labels", async () => {
  const sourceLocal = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      observation: { ...baseObservation().observation, runtimeContext: "Source Local" },
    }),
  });
  const malicious = await dogfoodObservationEvaluationToolResult({
    observation: baseObservation({
      observation: {
        ...baseObservation().observation,
        runtimeContext: "live /tmp/customer-acme TOKEN=secret\n## Forged runtime",
      },
    }),
  });
  const serialized = JSON.stringify(malicious.details);

  assert.equal(sourceLocal.runtimeContext, "source_local");
  assert.match(malicious.content[0].text, /Runtime context:/);
  assert.doesNotMatch(malicious.content[0].text, /TOKEN|customer-acme|\/tmp\//);
  assert.doesNotMatch(malicious.content[0].text, /^## Forged runtime/m);
  assert.doesNotMatch(serialized, /TOKEN|customer-acme|\/tmp\//);
});

test("dogfood evaluator rejects oversized JSON and publishes a closed top-level schema", async () => {
  const huge = await dogfoodObservationEvaluationToolResult({
    observationJson: "{".padEnd(65_000, "x"),
  });

  assert.equal(huge.details.dogfoodObservationEvaluation.ok, false);
  assert.match(
    huge.details.dogfoodObservationEvaluation.errors[0],
    /compact evaluator input limit/,
  );
  assert.equal(DOGFOOD_OBSERVATION_EVALUATION_PARAMETERS.additionalProperties, false);
  assert.deepEqual(DOGFOOD_OBSERVATION_EVALUATION_PARAMETERS.anyOf, [
    { required: ["observation"] },
    { required: ["observationJson"] },
  ]);
  assert.equal(
    DOGFOOD_OBSERVATION_EVALUATION_PARAMETERS.properties.observationJson.maxLength,
    64_000,
  );
});

test("dogfood aggregate summarizes repeated redacted observations without promoting evidence", () => {
  const aggregate = buildDogfoodAggregateEvaluation({
    observations: [
      baseObservation({
        observation: { ...baseObservation().observation, runtimeContext: "source_local" },
      }),
      baseObservation({
        prediction: {
          ...baseObservation().prediction,
          expectedLowLevelCallsAvoided: 2,
          unwiredProviderOmissions: ["ak"],
        },
        observation: {
          activityType: "review",
          runtimeContext: "installed_artifact",
          actualLowLevelReadSearchStatusCalls: 0,
          actualLowLevelCallsAvoided: 4,
          validationCommandsRun: 3,
          duplicateReadsObserved: false,
          omissionFollowupsUsed: [],
          recommendationMatchedOutcome: true,
          notes: "saved extra probes",
        },
      }),
      baseObservation({
        prediction: { ...baseObservation().prediction, expectedLowLevelCallsAvoided: 1 },
        observation: {
          activityType: "validation",
          runtimeContext: "live_pi_reloaded",
          actualLowLevelReadSearchStatusCalls: 5,
          actualLowLevelCallsAvoided: 0,
          validationCommandsRun: 1,
          duplicateReadsObserved: true,
          omissionFollowupsUsed: [
            {
              provider: "docs",
              reason: "missing ranking",
              classification: "true_missing_capability",
            },
          ],
          recommendationMatchedOutcome: false,
          notes: "needed docs follow-up",
        },
      }),
    ],
  });

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.status, "ranking_or_provider_gap_suspected");
  assert.equal(aggregate.validReceiptCount, 3);
  assert.equal(aggregate.invalidReceiptCount, 0);
  assert.equal(aggregate.statusCounts.matched, 1);
  assert.equal(aggregate.statusCounts.underestimated, 1);
  assert.equal(aggregate.statusCounts.overestimated, 1);
  assert.equal(aggregate.providerOmissionCounts.ak, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(aggregate.activityTypeCounts)), {
    implementation: 1,
    review: 1,
    validation: 1,
  });
  assert.deepEqual(Object.fromEntries(Object.entries(aggregate.runtimeContextCounts)), {
    installed_artifact: 1,
    live_pi_reloaded: 1,
    source_local: 1,
  });
  assert.equal(aggregate.runtimeCoverage.livePiReloadedCount, 1);
  assert.equal(aggregate.runtimeCoverage.hasLivePiReloadedReceipt, true);
  assert.equal(aggregate.omissionFollowupCounts["docs/missing ranking"], 1);
  assert.equal(aggregate.omissionFollowupClassCounts.true_missing_capability, 1);
  assert.match(aggregate.omissionFollowupClassNextActions.join("\n"), /provider adapters/);
  assert.equal(aggregate.totals.validationCommandsRun, 6);
  assert.equal(aggregate.totals.validationCommandsRecordedCount, 3);
  assert.equal(aggregate.totals.validationCommandsMissingCount, 0);
  assert.match(aggregate.nonAuthorization, /did not persist evidence/);
});

test("dogfood aggregate summarizes provider route telemetry without treating follow-up as selected", () => {
  const observation = baseObservation({
    packet: {
      ...baseObservation().packet,
      providerRoutes: [
        {
          provider: "docs",
          posture: "required",
          routeRole: "selected",
          selectedQueryCount: 1,
          followupQueryCount: 0,
          seedCount: 1,
          seedCounts: { markdown: 1 },
        },
        {
          provider: "prompt_vault",
          posture: "optional",
          routeRole: "followup",
          queryCount: 2,
          seedCount: 2,
          seedCounts: { prompt: 2 },
        },
      ],
      providerRoutesTruncated: 1,
    },
  });
  const priorEvaluation = buildDogfoodObservationEvaluation({ observation });
  const aggregate = buildDogfoodAggregateEvaluation({
    observations: [observation, baseObservation()],
    evaluations: [priorEvaluation],
  });
  const text = formatDogfoodAggregateEvaluation(aggregate);

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.totals.providerRouteCount, 4);
  assert.equal(aggregate.totals.providerRouteSelectedQueryCount, 2);
  assert.equal(aggregate.totals.providerRouteFollowupQueryCount, 4);
  assert.equal(aggregate.totals.providerRouteUnclassifiedQueryCount, 0);
  assert.equal(aggregate.totals.providerRoutesTruncated, 2);
  assert.equal(aggregate.providerRouteCounts.docs, 2);
  assert.equal(aggregate.providerRouteCounts.prompt_vault, 2);
  assert.equal(aggregate.providerRouteRoleCounts.selected, 2);
  assert.equal(aggregate.providerRouteRoleCounts.followup, 2);
  assert.equal(aggregate.providerRouteSeedKindCounts.markdown, 2);
  assert.equal(aggregate.providerRouteSeedKindCounts.prompt, 4);
  assert.equal(aggregate.providerRouteQueryTotals.docs.selectedQueryCount, 2);
  assert.equal(aggregate.providerRouteQueryTotals.prompt_vault.selectedQueryCount, 0);
  assert.equal(aggregate.providerRouteQueryTotals.prompt_vault.followupQueryCount, 4);
  assert.equal(aggregate.providerRouteQueryTotals.prompt_vault.unclassifiedQueryCount, 0);
  assert.match(text, /Provider route query totals/);
  assert.match(
    text,
    /prompt_vault: routes=2, selectedQueries=0, followupQueries=4, unclassifiedQueries=0/,
  );
});

test("dogfood aggregate preserves legacy evaluations without provider route telemetry", () => {
  const priorEvaluation = buildDogfoodObservationEvaluation({ observation: baseObservation() });
  const legacyEvaluation = { ...priorEvaluation };
  delete legacyEvaluation.providerRoutes;
  delete legacyEvaluation.providerRoutesTruncated;
  const aggregate = buildDogfoodAggregateEvaluation({ evaluations: [legacyEvaluation] });

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.totals.providerRouteCount, 0);
  assert.equal(aggregate.totals.providerRouteSelectedQueryCount, 0);
  assert.deepEqual(Object.fromEntries(Object.entries(aggregate.providerRouteCounts)), {});
});

test("dogfood aggregate reports provider route seed-kind truncation", () => {
  const seedCounts = Object.fromEntries(
    Array.from({ length: 14 }, (_, index) => [`kind-${index}`, 1]),
  );
  const aggregate = buildDogfoodAggregateEvaluation({
    observations: [
      baseObservation({
        packet: {
          ...baseObservation().packet,
          providerRoutes: [
            {
              provider: "docs",
              posture: "required",
              routeRole: "selected",
              selectedQueryCount: 1,
              seedCounts,
            },
          ],
        },
      }),
    ],
  });
  const text = formatDogfoodAggregateEvaluation(aggregate);

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.totals.providerRouteSeedCount, 12);
  assert.equal(aggregate.totals.providerRouteSeedCountsTruncated, 2);
  assert.match(text, /2 seed-kind entries truncated/);
});

test("dogfood aggregate preserves unclassified query counts without selected/follow-up inflation", () => {
  const aggregate = buildDogfoodAggregateEvaluation({
    observations: [
      baseObservation({
        packet: {
          ...baseObservation().packet,
          providerRoutes: [
            {
              provider: "legacy",
              posture: "unknown",
              routeRole: "unknown",
              totalQueryCount: 3,
              seedCount: 0,
              seedCounts: {},
            },
          ],
        },
      }),
    ],
  });

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.totals.providerRouteSelectedQueryCount, 0);
  assert.equal(aggregate.totals.providerRouteFollowupQueryCount, 0);
  assert.equal(aggregate.totals.providerRouteUnclassifiedQueryCount, 3);
  assert.equal(aggregate.providerRouteQueryTotals.legacy.unclassifiedQueryCount, 3);
});

test("dogfood aggregate formatter tolerates legacy aggregate objects without provider routes", () => {
  const text = formatDogfoodAggregateEvaluation({
    ok: true,
    status: "limited_positive_signal",
    validReceiptCount: 1,
    invalidReceiptCount: 0,
    receiptCount: 1,
    totals: {
      expectedLowLevelCallsAvoided: 1,
      actualLowLevelCallsAvoided: 1,
      actualLowLevelReadSearchStatusCalls: 0,
      validationCommandsRun: 0,
      validationCommandsRecordedCount: 0,
      validationCommandsMissingCount: 1,
      omissionFollowupsTruncated: 0,
    },
    statusCounts: { matched: 1 },
    packetUtilityRecommendationCounts: {},
    activityTypeCounts: {},
    activityCoverage: { present: [], missing: [], complete: false, nonAuthorization: "legacy" },
    providerOmissionCounts: {},
    omissionFollowupCounts: {},
    omissionFollowupClassCounts: {},
    omissionFollowupClassNextActions: [],
    invalidEntries: [],
    nextAction: "legacy aggregate",
    nonAuthorization: "legacy aggregate only",
  });

  assert.match(text, /Provider routes: 0/);
  assert.match(text, /Provider route query totals/);
});

test("dogfood aggregate requires core activity coverage before stable positive signal", () => {
  const validationOnly = buildDogfoodAggregateEvaluation({
    observations: [
      baseObservation({
        observation: {
          ...baseObservation().observation,
          activityType: "validation",
          runtimeContext: "live_pi_reloaded",
        },
      }),
      baseObservation({
        observation: {
          ...baseObservation().observation,
          activityType: "validation",
          runtimeContext: "live_pi_reloaded",
        },
      }),
      baseObservation({
        observation: {
          ...baseObservation().observation,
          activityType: "validation",
          runtimeContext: "live_pi_reloaded",
        },
      }),
    ],
  });
  const covered = buildDogfoodAggregateEvaluation({
    observations: [
      baseObservation({
        observation: { ...baseObservation().observation, activityType: "implementation" },
      }),
      baseObservation({
        observation: { ...baseObservation().observation, activityType: "review" },
      }),
      baseObservation({
        observation: {
          ...baseObservation().observation,
          activityType: "validation",
          runtimeContext: "live_pi_reloaded",
        },
      }),
    ],
  });
  const noLiveCoverage = buildDogfoodAggregateEvaluation({
    observations: [
      baseObservation({
        observation: { ...baseObservation().observation, activityType: "implementation" },
      }),
      baseObservation({
        observation: { ...baseObservation().observation, activityType: "review" },
      }),
      baseObservation({
        observation: { ...baseObservation().observation, activityType: "validation" },
      }),
    ],
  });
  const validationOnlyText = formatDogfoodAggregateEvaluation(validationOnly);

  assert.equal(validationOnly.ok, true);
  assert.equal(validationOnly.status, "activity_coverage_gap");
  assert.deepEqual(validationOnly.activityCoverage.present, ["validation"]);
  assert.deepEqual(validationOnly.activityCoverage.missing, ["implementation", "review"]);
  assert.equal(validationOnly.activityCoverage.complete, false);
  assert.match(validationOnly.nextAction, /gather implementation\/review receipt/);
  assert.match(validationOnlyText, /Core activity coverage/);
  assert.match(validationOnlyText, /missing: implementation, review/);
  assert.match(validationOnly.activityCoverage.nonAuthorization, /not task completion proof/);
  assert.equal(validationOnly.runtimeCoverage.livePiReloadedCount, 3);
  assert.equal(validationOnly.runtimeCoverage.hasLivePiReloadedReceipt, true);
  assert.match(validationOnly.runtimeCoverage.nonAuthorization, /did not verify install/);

  assert.equal(noLiveCoverage.status, "runtime_coverage_gap");
  assert.equal(noLiveCoverage.runtimeCoverage.status, "live_activation_receipt_missing");
  assert.match(noLiveCoverage.nextAction, /live_pi_reloaded/);

  assert.equal(covered.status, "stable_positive_signal");
  assert.deepEqual(covered.activityCoverage.missing, []);
  assert.equal(covered.activityCoverage.complete, true);
  assert.equal(covered.runtimeCoverage.status, "live_activation_receipt_present");
});

test("dogfood aggregate coverage resists returned-object mutation and prototype pollution", () => {
  const observations = [
    baseObservation({
      observation: { ...baseObservation().observation, activityType: "implementation" },
    }),
    baseObservation({ observation: { ...baseObservation().observation, activityType: "review" } }),
    baseObservation({
      observation: {
        ...baseObservation().observation,
        activityType: "validation",
        runtimeContext: "live_pi_reloaded",
      },
    }),
  ];
  const covered = buildDogfoodAggregateEvaluation({ observations });
  covered.activityCoverage.required.push("planning");
  covered.runtimeCoverage.known.push("forged_runtime");
  const coveredAfterMutation = buildDogfoodAggregateEvaluation({ observations });

  assert.deepEqual(coveredAfterMutation.activityCoverage.required, [
    "implementation",
    "review",
    "validation",
  ]);
  assert.deepEqual(coveredAfterMutation.runtimeCoverage.known, [
    "source_local",
    "installed_artifact",
    "live_pi_reloaded",
    "unknown",
  ]);
  assert.equal(coveredAfterMutation.status, "stable_positive_signal");

  try {
    Object.prototype.implementation = 1;
    Object.prototype.review = 1;
    Object.prototype.live_pi_reloaded = 99;
    const validationOnly = buildDogfoodAggregateEvaluation({
      observations: [
        baseObservation({
          observation: { ...baseObservation().observation, activityType: "validation" },
        }),
        baseObservation({
          observation: { ...baseObservation().observation, activityType: "validation" },
        }),
        baseObservation({
          observation: { ...baseObservation().observation, activityType: "validation" },
        }),
      ],
    });

    assert.equal(validationOnly.status, "activity_coverage_gap");
    assert.deepEqual(validationOnly.activityCoverage.present, ["validation"]);
    assert.deepEqual(validationOnly.activityCoverage.missing, ["implementation", "review"]);
    assert.equal(validationOnly.runtimeCoverage.livePiReloadedCount, 0);
  } finally {
    delete Object.prototype.implementation;
    delete Object.prototype.review;
    delete Object.prototype.live_pi_reloaded;
  }
});

test("dogfood aggregate preserves missing validation-command counts for legacy receipts", () => {
  const legacyObservation = baseObservation({
    observation: {
      actualLowLevelReadSearchStatusCalls: 0,
      actualLowLevelCallsAvoided: 3,
      duplicateReadsObserved: false,
      omissionFollowupsUsed: [],
      recommendationMatchedOutcome: true,
      notes: "legacy receipt before validation count existed",
    },
  });
  const aggregate = buildDogfoodAggregateEvaluation({
    observations: [legacyObservation, baseObservation()],
  });
  const text = formatDogfoodAggregateEvaluation(aggregate);

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.totals.validationCommandsRun, 2);
  assert.equal(aggregate.totals.validationCommandsRecordedCount, 1);
  assert.equal(aggregate.totals.validationCommandsMissingCount, 1);
  assert.equal(aggregate.activityTypeCounts.unspecified, 1);
  assert.deepEqual(aggregate.activityCoverage.missing, ["review", "validation"]);
  assert.match(text, /Validation commands run: 2 \(1 recorded, 1 missing\)/);
  assert.match(text, /Activity type counts/);
  assert.match(text, /- unspecified: 1/);
});

test("dogfood aggregate recomputes stored evaluation status from stored fields", () => {
  const forgedMatchedEvaluation = (activityType) => ({
    kind: "context_pack_dogfood_evaluation_v1",
    sourceKind: "context_pack_dogfood_observation_v1",
    status: "matched",
    expectedLowLevelCallsAvoided: 3,
    activityType,
    runtimeContext: "live_pi_reloaded",
    actualLowLevelReadSearchStatusCalls: 0,
    actualLowLevelCallsAvoided: 3,
    validationCommandsRun: 0,
    duplicateReadsObserved: true,
    omissionFollowupsUsed: [],
    omissionFollowupClasses: [],
    recommendationMatchedOutcome: false,
    packetUtilityRecommendationStatus: "use_packet",
    alreadyLoadedItems: 0,
    freshItemCount: 1,
    duplicateTokensAvoided: 0,
    unwiredProviderOmissions: [],
    providerRoutes: [],
    providerRoutesTruncated: 0,
    notes: "stored status should not be authority",
  });
  const aggregate = buildDogfoodAggregateEvaluation({
    evaluations: [
      forgedMatchedEvaluation("implementation"),
      forgedMatchedEvaluation("review"),
      forgedMatchedEvaluation("validation"),
    ],
  });

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.status, "review_before_tuning");
  assert.equal(aggregate.statusCounts.needs_review, 3);
  assert.equal(aggregate.statusCounts.matched, 0);
  assert.equal(aggregate.evaluations[0].status, "needs_review");
  assert.equal(aggregate.evaluations[0].statusAsSupplied, "matched");
  assert.equal(aggregate.evaluations[0].statusRecomputedFromStoredFields, true);
});

test("dogfood aggregate accepts prior evaluations and reports mixed invalid receipts", async () => {
  const priorEvaluation = buildDogfoodObservationEvaluation({ observation: baseObservation() });
  const legacyPriorEvaluation = {
    ...priorEvaluation,
    omissionFollowupsUsed: ["docs/legacy follow-up"],
    omissionFollowupClasses: undefined,
    omissionFollowupClassCounts: undefined,
    omissionFollowupsTruncated: 0,
  };
  const truncatedEvaluation = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      observation: {
        activityType: "review",
        actualLowLevelReadSearchStatusCalls: 1,
        actualLowLevelCallsAvoided: 1,
        validationCommandsRun: 1,
        duplicateReadsObserved: true,
        omissionFollowupsUsed: Array.from({ length: 20 }, (_, index) => `followup-${index}`),
        recommendationMatchedOutcome: true,
        notes: "many followups",
      },
    }),
  });
  const result = await dogfoodAggregateEvaluationToolResult({
    items: [
      JSON.stringify(priorEvaluation),
      legacyPriorEvaluation,
      { kind: "wrong" },
      truncatedEvaluation,
      baseObservation({
        observation: {
          activityType: "validation",
          actualLowLevelReadSearchStatusCalls: null,
          actualLowLevelCallsAvoided: null,
          validationCommandsRun: 2,
          duplicateReadsObserved: null,
          omissionFollowupsUsed: [],
          recommendationMatchedOutcome: null,
          notes: "",
        },
      }),
    ],
  });
  const aggregate = result.details.dogfoodAggregateEvaluation;

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.status, "review_before_tuning");
  assert.equal(aggregate.validReceiptCount, 4);
  assert.equal(aggregate.invalidReceiptCount, 1);
  assert.equal(aggregate.totals.omissionFollowupsTruncated, 8);
  assert.equal(aggregate.evaluations[1].omissionFollowupClassCounts.legacy_unspecified, 1);
  assert.equal(aggregate.evaluations[2].omissionFollowupsTruncated, 8);
  assert.deepEqual(Object.fromEntries(Object.entries(aggregate.activityTypeCounts)), {
    implementation: 2,
    review: 1,
    validation: 1,
  });
  assert.match(result.content[0].text, /Activity type counts/);
  assert.match(result.content[0].text, /- review: 1/);
  assert.match(result.content[0].text, /Omission follow-up counts/);
  assert.match(result.content[0].text, /Omission follow-up class counts/);
  assert.match(result.content[0].text, /legacy_unspecified/);
  assert.match(result.content[0].text, /Omission follow-ups truncated: 8/);
  assert.match(result.content[0].text, /Validation commands run: 7 \(4 recorded, 0 missing\)/);
  assert.match(result.content[0].text, /followup-0/);
  assert.match(result.content[0].text, /Invalid receipts/);
  assert.match(result.content[0].text, /items\[2\]/);
});

test("dogfood aggregate redacts malicious labels and fails closed on oversized inputs", async () => {
  const malicious = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      prediction: {
        ...baseObservation().prediction,
        packetUtilityRecommendationStatus: "use_packet\n## Forged /tmp/customer-acme TOKEN=secret",
        unwiredProviderOmissions: ["/tmp/customer-acme TOKEN=secret"],
      },
      observation: {
        activityType: "review\n## Forged at /tmp/customer-acme TOKEN=secret",
        actualLowLevelReadSearchStatusCalls: 2,
        actualLowLevelCallsAvoided: null,
        duplicateReadsObserved: true,
        omissionFollowupsUsed: [
          {
            provider: "/tmp/customer-acme",
            reason: "TOKEN=secret",
            classification: "../../forged TOKEN=secret",
          },
        ],
        recommendationMatchedOutcome: false,
        notes: "## Forged section\nTOKEN=secret at /tmp/customer-acme",
      },
    }),
  });

  const maliciousStoredEvaluation = {
    ...malicious,
    omissionFollowupsUsed: ["stored follow-up"],
    omissionFollowupClasses: ["../../forged TOKEN=secret"],
    omissionFollowupClassCounts: undefined,
  };
  const result = await dogfoodAggregateEvaluationToolResult({
    evaluations: [malicious, maliciousStoredEvaluation],
  });
  const huge = await dogfoodAggregateEvaluationToolResult({ items: ["{".padEnd(65_000, "x")] });
  const serialized = JSON.stringify(result.details);

  assert.equal(result.details.dogfoodAggregateEvaluation.ok, true);
  assert.equal(result.details.dogfoodAggregateEvaluation.omissionFollowupClassCounts.other, 2);
  assert.doesNotMatch(result.content[0].text, /TOKEN|customer-acme|\/tmp\//);
  assert.doesNotMatch(result.content[0].text, /^## Forged section/m);
  assert.doesNotMatch(serialized, /TOKEN|customer-acme|\/tmp\//);
  assert.equal(huge.details.dogfoodAggregateEvaluation.ok, false);
  assert.match(huge.content[0].text, /compact evaluator input limit/);
  assert.equal(DOGFOOD_AGGREGATE_EVALUATION_PARAMETERS.additionalProperties, false);
  assert.deepEqual(DOGFOOD_AGGREGATE_EVALUATION_PARAMETERS.anyOf, [
    { required: ["items"] },
    { required: ["observations"] },
    { required: ["observationJsons"] },
    { required: ["evaluations"] },
    { required: ["evaluationJsons"] },
  ]);
  assert.equal(DOGFOOD_AGGREGATE_EVALUATION_PARAMETERS.properties.items.minItems, 1);
  assert.equal(DOGFOOD_AGGREGATE_EVALUATION_PARAMETERS.properties.items.maxItems, 20);
});

test("dogfood aggregate fails closed for non-object top-level input", () => {
  const nullInput = buildDogfoodAggregateEvaluation(null);
  const arrayInput = buildDogfoodAggregateEvaluation([]);

  assert.equal(nullInput.ok, false);
  assert.equal(arrayInput.ok, false);
  assert.match(nullInput.errors[0], /at least one observation or evaluation is required/);
  assert.match(arrayInput.errors[0], /at least one observation or evaluation is required/);
});

test("dogfood aggregate counts prototype-shaped provider route labels without losing them", () => {
  const aggregate = buildDogfoodAggregateEvaluation({
    observations: [
      baseObservation({
        packet: {
          ...baseObservation().packet,
          providerRoutes: [
            {
              provider: "__proto__",
              posture: "required",
              routeRole: "selected",
              selectedQueryCount: 1,
              followupQueryCount: 0,
              seedCount: 1,
              seedCounts: { constructor: 1 },
            },
          ],
        },
      }),
    ],
  });

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.providerRouteCounts.__proto__, 1);
  assert.equal(aggregate.providerRouteQueryTotals.__proto__.selectedQueryCount, 1);
  assert.equal(aggregate.providerRouteSeedKindCounts.constructor, 1);
  assert.match(JSON.stringify(aggregate), /"__proto__"/);
});

test("dogfood aggregate counts prototype-shaped labels without losing them", () => {
  const aggregate = buildDogfoodAggregateEvaluation({
    observations: [
      baseObservation({
        prediction: {
          ...baseObservation().prediction,
          packetUtilityRecommendationStatus: "__proto__",
          unwiredProviderOmissions: ["__proto__"],
        },
        observation: {
          activityType: "implementation",
          actualLowLevelReadSearchStatusCalls: 0,
          actualLowLevelCallsAvoided: 1,
          duplicateReadsObserved: true,
          omissionFollowupsUsed: ["__proto__"],
          recommendationMatchedOutcome: true,
          notes: "prototype-shaped labels should remain countable",
        },
      }),
    ],
  });

  assert.equal(aggregate.ok, true);
  assert.equal(aggregate.packetUtilityRecommendationCounts.__proto__, 1);
  assert.equal(aggregate.providerOmissionCounts.__proto__, 1);
  assert.equal(aggregate.omissionFollowupCounts.__proto__, 1);
  assert.equal(aggregate.omissionFollowupClassCounts.legacy_unspecified, 1);
  assert.equal(aggregate.activityTypeCounts.implementation, 1);
  assert.match(JSON.stringify(aggregate), /"__proto__":1/);
});

test("dogfood aggregate enforces combined item limit before parsing JSON entries", async () => {
  const result = await dogfoodAggregateEvaluationToolResult({
    observationJsons: Array.from({ length: 21 }, () => "{"),
  });

  assert.equal(result.details.dogfoodAggregateEvaluation.ok, false);
  assert.match(result.content[0].text, /aggregate input exceeds 20 receipt item/);
  assert.doesNotMatch(result.content[0].text, /valid JSON/);
});

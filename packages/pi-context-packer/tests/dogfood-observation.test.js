import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(evaluation.actualLowLevelReadSearchStatusCalls, 1);
  assert.equal(evaluation.actualLowLevelCallsAvoided, 3);
  assert.equal(evaluation.validationCommandsRun, 2);
  assert.match(text, /Status: matched/);
  assert.match(text, /Activity type: implementation/);
  assert.match(text, /Validation commands run: 2/);
  assert.match(text, /did not persist evidence/);
  assert.doesNotMatch(JSON.stringify(evaluation), /packet\.sections|provenance|path/);
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
});

test("dogfood evaluator sends contradictory observations to review instead of matching", () => {
  const evaluation = buildDogfoodObservationEvaluation({
    observation: baseObservation({
      observation: {
        actualLowLevelReadSearchStatusCalls: 999,
        actualLowLevelCallsAvoided: 3,
        duplicateReadsObserved: true,
        omissionFollowupsUsed: ["prompt_vault/provider unavailable"],
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
      baseObservation(),
      baseObservation({
        prediction: {
          ...baseObservation().prediction,
          expectedLowLevelCallsAvoided: 2,
          unwiredProviderOmissions: ["ak"],
        },
        observation: {
          activityType: "review",
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
          actualLowLevelReadSearchStatusCalls: 5,
          actualLowLevelCallsAvoided: 0,
          validationCommandsRun: 1,
          duplicateReadsObserved: true,
          omissionFollowupsUsed: [{ provider: "docs", reason: "missing ranking" }],
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
  assert.equal(aggregate.omissionFollowupCounts["docs/missing ranking"], 1);
  assert.equal(aggregate.totals.validationCommandsRun, 6);
  assert.equal(aggregate.totals.validationCommandsRecordedCount, 3);
  assert.equal(aggregate.totals.validationCommandsMissingCount, 0);
  assert.match(aggregate.nonAuthorization, /did not persist evidence/);
});

test("dogfood aggregate requires core activity coverage before stable positive signal", () => {
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
  const covered = buildDogfoodAggregateEvaluation({
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

  assert.equal(covered.status, "stable_positive_signal");
  assert.deepEqual(covered.activityCoverage.missing, []);
  assert.equal(covered.activityCoverage.complete, true);
});

test("dogfood aggregate coverage resists returned-object mutation and prototype pollution", () => {
  const observations = [
    baseObservation({
      observation: { ...baseObservation().observation, activityType: "implementation" },
    }),
    baseObservation({ observation: { ...baseObservation().observation, activityType: "review" } }),
    baseObservation({
      observation: { ...baseObservation().observation, activityType: "validation" },
    }),
  ];
  const covered = buildDogfoodAggregateEvaluation({ observations });
  covered.activityCoverage.required.push("planning");
  const coveredAfterMutation = buildDogfoodAggregateEvaluation({ observations });

  assert.deepEqual(coveredAfterMutation.activityCoverage.required, [
    "implementation",
    "review",
    "validation",
  ]);
  assert.equal(coveredAfterMutation.status, "stable_positive_signal");

  try {
    Object.prototype.implementation = 1;
    Object.prototype.review = 1;
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
  } finally {
    delete Object.prototype.implementation;
    delete Object.prototype.review;
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

test("dogfood aggregate accepts prior evaluations and reports mixed invalid receipts", async () => {
  const priorEvaluation = buildDogfoodObservationEvaluation({ observation: baseObservation() });
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
  assert.equal(aggregate.validReceiptCount, 3);
  assert.equal(aggregate.invalidReceiptCount, 1);
  assert.equal(aggregate.totals.omissionFollowupsTruncated, 8);
  assert.equal(aggregate.evaluations[1].omissionFollowupsTruncated, 8);
  assert.deepEqual(Object.fromEntries(Object.entries(aggregate.activityTypeCounts)), {
    implementation: 1,
    review: 1,
    validation: 1,
  });
  assert.match(result.content[0].text, /Activity type counts/);
  assert.match(result.content[0].text, /- review: 1/);
  assert.match(result.content[0].text, /Omission follow-up counts/);
  assert.match(result.content[0].text, /Omission follow-ups truncated: 8/);
  assert.match(result.content[0].text, /Validation commands run: 5 \(3 recorded, 0 missing\)/);
  assert.match(result.content[0].text, /followup-0/);
  assert.match(result.content[0].text, /Invalid receipts/);
  assert.match(result.content[0].text, /items\[1\]/);
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
        omissionFollowupsUsed: ["/tmp/customer-acme TOKEN=secret"],
        recommendationMatchedOutcome: false,
        notes: "## Forged section\nTOKEN=secret at /tmp/customer-acme",
      },
    }),
  });

  const result = await dogfoodAggregateEvaluationToolResult({ evaluations: [malicious] });
  const huge = await dogfoodAggregateEvaluationToolResult({ items: ["{".padEnd(65_000, "x")] });
  const serialized = JSON.stringify(result.details);

  assert.equal(result.details.dogfoodAggregateEvaluation.ok, true);
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

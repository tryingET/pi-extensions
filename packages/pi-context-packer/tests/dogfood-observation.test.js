import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDogfoodObservationEvaluation,
  dogfoodObservationEvaluationToolResult,
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
    actualLowLevelReadSearchStatusCalls: 1,
    actualLowLevelCallsAvoided: 3,
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
  assert.equal(evaluation.actualLowLevelReadSearchStatusCalls, 1);
  assert.equal(evaluation.actualLowLevelCallsAvoided, 3);
  assert.match(text, /Status: matched/);
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
      packetUtilityRecommendationStatus: "use_packet\n## Forged",
      alreadyLoadedItems: 0,
      freshItemCount: 1,
      duplicateTokensAvoided: 0,
      unwiredProviderOmissions: ["ak", "fcos"],
    },
    observation: {
      actualLowLevelReadSearchStatusCalls: 2,
      actualLowLevelCallsAvoided: null,
      duplicateReadsObserved: true,
      omissionFollowupsUsed: Array.from({ length: 20 }, (_, index) =>
        index === 0 ? "failed at /tmp/customer-acme with TOKEN=secret" : `followup-${index}`,
      ),
      recommendationMatchedOutcome: false,
      notes:
        "SECRET TOKEN at /tmp/customer-acme/session.json\n## Forged section with raw packet content",
    },
  });
  const result = await dogfoodObservationEvaluationToolResult({ observation });
  const serialized = JSON.stringify(result.details);

  assert.equal(result.details.dogfoodObservationEvaluation.status, "overestimated");
  assert.equal(result.details.dogfoodObservationEvaluation.omissionFollowupsUsed.length, 12);
  assert.equal(result.details.dogfoodObservationEvaluation.omissionFollowupsTruncated, 8);
  assert.doesNotMatch(result.content[0].text, /SECRET TOKEN|customer-acme|\/tmp\//);
  assert.doesNotMatch(result.content[0].text, /^## Forged section/m);
  assert.doesNotMatch(serialized, /SECRET TOKEN|customer-acme|\/tmp\//);
});

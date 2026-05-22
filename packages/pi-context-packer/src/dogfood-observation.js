import {
  markdownFence,
  markdownInlineLabel,
  publicOmissionDetail,
} from "./context-intake-safety.js";
import { textResult } from "./context-pack-result.js";

const OBSERVATION_KIND = "context_pack_dogfood_observation_v1";
const MAX_FOLLOWUPS = 12;
const MAX_SAFE_NOTE_LENGTH = 480;
const MAX_SAFE_LABEL_LENGTH = 80;
const MAX_OBSERVATION_JSON_BYTES = 64_000;

const NON_AUTHORIZATION =
  "packet-local dogfood evaluation only; context-packer did not persist evidence, update AK/FCOS, write session memory, read files, call providers, or validate task completion";

const asObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value;
};

const finiteNonNegativeInteger = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;

const readOptionalCount = (value, path, errors) => {
  if (value === null || value === undefined) return undefined;
  const count = finiteNonNegativeInteger(value);
  if (count === undefined) errors.push(`${path} must be a non-negative integer when supplied`);
  return count;
};

const booleanOrNull = (value) => (typeof value === "boolean" ? value : null);

const sanitizeText = (value, fallback, maxLength = MAX_SAFE_NOTE_LENGTH) => {
  if (typeof value !== "string" || !value.trim()) return "";
  const bounded = value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  const publicDetail = publicOmissionDetail(bounded, fallback);
  return markdownInlineLabel(publicDetail, fallback, maxLength);
};

const sanitizeNote = (value) =>
  sanitizeText(value, "observation notes withheld", MAX_SAFE_NOTE_LENGTH);

const sanitizeLabel = (value, fallback = "value") =>
  sanitizeText(value, `${fallback} withheld`, MAX_SAFE_LABEL_LENGTH) || fallback;

const sanitizeFollowups = (values) => {
  if (!Array.isArray(values)) return [];
  return values.slice(0, MAX_FOLLOWUPS).map((value, index) => {
    if (typeof value === "string") return sanitizeNote(value) || `omission follow-up ${index + 1}`;
    if (value && typeof value === "object") {
      const provider = sanitizeLabel(value.provider, "provider");
      const reason = sanitizeLabel(value.reason, "reason");
      return `${provider}/${reason}`;
    }
    return `omission follow-up ${index + 1}`;
  });
};

const parseObservationInput = (input = {}) => {
  const raw = asObject(input) ?? {};
  if (typeof raw.observationJson === "string") {
    if (Buffer.byteLength(raw.observationJson) > MAX_OBSERVATION_JSON_BYTES) {
      return { errors: ["observationJson exceeds the compact evaluator input limit"] };
    }
    try {
      return { observation: JSON.parse(raw.observationJson) };
    } catch {
      return { errors: ["observationJson must be valid JSON"] };
    }
  }
  if (raw.observation !== undefined) return { observation: raw.observation };
  if (raw.kind === OBSERVATION_KIND) return { observation: raw };
  return { errors: ["observation or observationJson is required"] };
};

const classifyCalibration = ({
  expectedAvoided,
  actualAvoided,
  actualResidualCalls,
  duplicateReadsObserved,
  omissionFollowupsUsed,
  recommendationMatchedOutcome,
}) => {
  const contrarySignals =
    recommendationMatchedOutcome === false ||
    duplicateReadsObserved === true ||
    omissionFollowupsUsed.length > 0;
  const unexpectedlyHighResidualCalls =
    actualResidualCalls !== undefined && actualResidualCalls > expectedAvoided;

  if (actualAvoided !== undefined) {
    if (actualAvoided < expectedAvoided) return "overestimated";
    if (contrarySignals || unexpectedlyHighResidualCalls) return "needs_review";
    if (actualAvoided > expectedAvoided) return "underestimated";
    return "matched";
  }

  if (actualResidualCalls === undefined) return "observation_incomplete";
  if (unexpectedlyHighResidualCalls) return "overestimated";
  if (contrarySignals) return "needs_review";
  if (recommendationMatchedOutcome === true) return "matched";
  return "observation_incomplete";
};

const nextActionForStatus = (status) => {
  if (status === "matched") {
    return "Treat this as a useful packet-local dogfood signal; promote only through the owning evidence surface if needed.";
  }
  if (status === "overestimated") {
    return "Review ranking, omissions, or missing provider capability before trusting this packet shape for similar tasks.";
  }
  if (status === "underestimated") {
    return "Record that the packet may be more useful than predicted; consider tuning estimates only after repeated receipts.";
  }
  if (status === "observation_incomplete") {
    return "Fill actual observed counts before using this receipt as usefulness evidence.";
  }
  return "Review duplicate reads, omission follow-ups, and recommendation mismatch before tuning providers.";
};

export const buildDogfoodObservationEvaluation = (input = {}) => {
  const parsed = parseObservationInput(input);
  if (parsed.errors) {
    return { ok: false, errors: parsed.errors, nonAuthorization: NON_AUTHORIZATION };
  }

  const observation = asObject(parsed.observation);
  if (!observation || observation.kind !== OBSERVATION_KIND) {
    return {
      ok: false,
      errors: [`observation kind must be ${OBSERVATION_KIND}`],
      nonAuthorization: NON_AUTHORIZATION,
    };
  }

  const prediction = asObject(observation.prediction) ?? {};
  const filledObservation = asObject(observation.observation) ?? {};
  const errors = [];
  const expectedAvoided = finiteNonNegativeInteger(prediction.expectedLowLevelCallsAvoided);
  if (expectedAvoided === undefined) {
    errors.push("prediction.expectedLowLevelCallsAvoided must be a non-negative integer");
  }

  const actualResidualCalls = readOptionalCount(
    filledObservation.actualLowLevelReadSearchStatusCalls,
    "observation.actualLowLevelReadSearchStatusCalls",
    errors,
  );
  const actualAvoided = readOptionalCount(
    filledObservation.actualLowLevelCallsAvoided,
    "observation.actualLowLevelCallsAvoided",
    errors,
  );
  const duplicateReadsObserved = booleanOrNull(filledObservation.duplicateReadsObserved);
  const recommendationMatchedOutcome = booleanOrNull(
    filledObservation.recommendationMatchedOutcome,
  );
  const alreadyLoadedItems = readOptionalCount(
    prediction.alreadyLoadedItems,
    "prediction.alreadyLoadedItems",
    errors,
  );
  const freshItemCount = readOptionalCount(
    prediction.freshItemCount,
    "prediction.freshItemCount",
    errors,
  );
  const duplicateTokensAvoided = readOptionalCount(
    prediction.duplicateTokensAvoided,
    "prediction.duplicateTokensAvoided",
    errors,
  );
  if (errors.length > 0) {
    return { ok: false, errors, nonAuthorization: NON_AUTHORIZATION };
  }

  const omissionFollowupsUsed = sanitizeFollowups(filledObservation.omissionFollowupsUsed);
  const notes = sanitizeNote(filledObservation.notes);
  const calibrationStatus = classifyCalibration({
    expectedAvoided,
    actualAvoided,
    actualResidualCalls,
    duplicateReadsObserved,
    omissionFollowupsUsed,
    recommendationMatchedOutcome,
  });

  return {
    ok: true,
    kind: "context_pack_dogfood_evaluation_v1",
    sourceKind: OBSERVATION_KIND,
    status: calibrationStatus,
    expectedLowLevelCallsAvoided: expectedAvoided,
    actualLowLevelReadSearchStatusCalls: actualResidualCalls ?? null,
    actualLowLevelCallsAvoided: actualAvoided ?? null,
    duplicateReadsObserved,
    omissionFollowupsUsed,
    omissionFollowupsTruncated: Math.max(
      0,
      Array.isArray(filledObservation.omissionFollowupsUsed)
        ? filledObservation.omissionFollowupsUsed.length - MAX_FOLLOWUPS
        : 0,
    ),
    recommendationMatchedOutcome,
    packetUtilityRecommendationStatus:
      typeof prediction.packetUtilityRecommendationStatus === "string"
        ? sanitizeLabel(prediction.packetUtilityRecommendationStatus, "packet utility status")
        : "unknown",
    alreadyLoadedItems: alreadyLoadedItems ?? null,
    freshItemCount: freshItemCount ?? null,
    duplicateTokensAvoided: duplicateTokensAvoided ?? null,
    unwiredProviderOmissions: sanitizeFollowups(prediction.unwiredProviderOmissions),
    notes,
    nextAction: nextActionForStatus(calibrationStatus),
    countingRule:
      typeof observation.countingRule === "string"
        ? sanitizeNote(observation.countingRule)
        : "Count ad-hoc read/search/list/status probes separately from validation commands.",
    nonAuthorization: NON_AUTHORIZATION,
  };
};

export const formatDogfoodObservationEvaluation = (evaluation) => {
  if (!evaluation.ok) {
    return [
      "# Context-pack dogfood observation evaluation failed",
      "",
      ...(evaluation.errors ?? []).map((error) => `- ${markdownInlineLabel(error, "error")}`),
      "",
      `Non-authorization: ${evaluation.nonAuthorization}`,
    ].join("\n");
  }

  const lines = [
    "# Context-pack dogfood observation evaluation",
    "",
    `Status: ${evaluation.status}`,
    `Expected low-level calls avoided: ${evaluation.expectedLowLevelCallsAvoided}`,
    `Actual low-level read/search/status calls: ${evaluation.actualLowLevelReadSearchStatusCalls ?? "not recorded"}`,
    `Actual low-level calls avoided: ${evaluation.actualLowLevelCallsAvoided ?? "not recorded"}`,
    `Duplicate reads observed: ${evaluation.duplicateReadsObserved ?? "not recorded"}`,
    `Recommendation matched outcome: ${evaluation.recommendationMatchedOutcome ?? "not recorded"}`,
    `Packet utility recommendation: ${evaluation.packetUtilityRecommendationStatus}`,
    "",
    "## Omission follow-ups used",
    evaluation.omissionFollowupsUsed.length
      ? evaluation.omissionFollowupsUsed.map((item) => `- ${item}`).join("\n")
      : "- none recorded",
    "",
    "## Notes",
    evaluation.notes ? `- ${evaluation.notes}` : "- none recorded",
    "",
    "## Next action",
    `- ${evaluation.nextAction}`,
    "",
    "## Counting rule",
    `- ${evaluation.countingRule}`,
    "",
    "## Non-authorization",
    `- ${evaluation.nonAuthorization}`,
  ];

  if (evaluation.unwiredProviderOmissions.length) {
    lines.splice(
      lines.indexOf("## Notes"),
      0,
      "## Unwired provider omissions in prediction",
      evaluation.unwiredProviderOmissions.map((item) => `- ${item}`).join("\n"),
      "",
    );
  }

  return lines.join("\n");
};

export const compactDogfoodObservationEvaluationDetails = (evaluation) => evaluation;

export const dogfoodObservationEvaluationToolResult = async (input = {}) => {
  const evaluation = buildDogfoodObservationEvaluation(input);
  return textResult(formatDogfoodObservationEvaluation(evaluation), {
    dogfoodObservationEvaluation: compactDogfoodObservationEvaluationDetails(evaluation),
  });
};

export const DOGFOOD_OBSERVATION_EVALUATION_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    observation: {
      type: "object",
      additionalProperties: true,
      description: "Filled context_pack_dogfood_observation_v1 object emitted by context_pack.",
    },
    observationJson: {
      type: "string",
      maxLength: MAX_OBSERVATION_JSON_BYTES,
      description:
        "Filled context_pack_dogfood_observation_v1 JSON string emitted by context_pack.",
    },
  },
};

export const dogfoodEvaluationMarkdownFence = (evaluation) =>
  markdownFence(
    "context-pack-dogfood-evaluation.md",
    formatDogfoodObservationEvaluation(evaluation),
  );

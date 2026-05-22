import {
  markdownFence,
  markdownInlineLabel,
  publicOmissionDetail,
} from "./context-intake-safety.js";
import { textResult } from "./context-pack-result.js";

const OBSERVATION_KIND = "context_pack_dogfood_observation_v1";
const EVALUATION_KIND = "context_pack_dogfood_evaluation_v1";
const MAX_FOLLOWUPS = 12;
const MAX_SAFE_NOTE_LENGTH = 480;
const MAX_SAFE_LABEL_LENGTH = 80;
const MAX_OBSERVATION_JSON_BYTES = 64_000;
const MAX_AGGREGATE_ITEMS = 20;
const CALIBRATION_STATUSES = [
  "matched",
  "overestimated",
  "underestimated",
  "needs_review",
  "observation_incomplete",
];

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

const parseAggregateJsonEntry = (value, ref) => {
  if (typeof value !== "string") return { ok: false, errors: [`${ref} must be a JSON string`] };
  if (Buffer.byteLength(value) > MAX_OBSERVATION_JSON_BYTES) {
    return { ok: false, errors: [`${ref} exceeds the compact evaluator input limit`] };
  }
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, errors: [`${ref} must be valid JSON`] };
  }
};

const countValues = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries(
    Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right)),
  );
};

const normalizeStoredEvaluation = (value, ref) => {
  const evaluation = asObject(value);
  if (!evaluation || evaluation.kind !== EVALUATION_KIND) {
    return { ok: false, errors: [`${ref}.kind must be ${EVALUATION_KIND}`] };
  }
  const errors = [];
  const status = CALIBRATION_STATUSES.includes(evaluation.status) ? evaluation.status : undefined;
  if (!status) errors.push(`${ref}.status must be a known calibration status`);
  const expectedLowLevelCallsAvoided = finiteNonNegativeInteger(
    evaluation.expectedLowLevelCallsAvoided,
  );
  if (expectedLowLevelCallsAvoided === undefined) {
    errors.push(`${ref}.expectedLowLevelCallsAvoided must be a non-negative integer`);
  }
  const actualLowLevelReadSearchStatusCalls = readOptionalCount(
    evaluation.actualLowLevelReadSearchStatusCalls,
    `${ref}.actualLowLevelReadSearchStatusCalls`,
    errors,
  );
  const actualLowLevelCallsAvoided = readOptionalCount(
    evaluation.actualLowLevelCallsAvoided,
    `${ref}.actualLowLevelCallsAvoided`,
    errors,
  );
  const alreadyLoadedItems = readOptionalCount(
    evaluation.alreadyLoadedItems,
    `${ref}.alreadyLoadedItems`,
    errors,
  );
  const freshItemCount = readOptionalCount(
    evaluation.freshItemCount,
    `${ref}.freshItemCount`,
    errors,
  );
  const duplicateTokensAvoided = readOptionalCount(
    evaluation.duplicateTokensAvoided,
    `${ref}.duplicateTokensAvoided`,
    errors,
  );
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    kind: EVALUATION_KIND,
    sourceKind:
      typeof evaluation.sourceKind === "string" ? sanitizeLabel(evaluation.sourceKind) : "unknown",
    status,
    expectedLowLevelCallsAvoided,
    actualLowLevelReadSearchStatusCalls: actualLowLevelReadSearchStatusCalls ?? null,
    actualLowLevelCallsAvoided: actualLowLevelCallsAvoided ?? null,
    duplicateReadsObserved: booleanOrNull(evaluation.duplicateReadsObserved),
    omissionFollowupsUsed: sanitizeFollowups(evaluation.omissionFollowupsUsed),
    omissionFollowupsTruncated: Math.max(
      0,
      Array.isArray(evaluation.omissionFollowupsUsed)
        ? evaluation.omissionFollowupsUsed.length - MAX_FOLLOWUPS
        : 0,
    ),
    recommendationMatchedOutcome: booleanOrNull(evaluation.recommendationMatchedOutcome),
    packetUtilityRecommendationStatus:
      typeof evaluation.packetUtilityRecommendationStatus === "string"
        ? sanitizeLabel(evaluation.packetUtilityRecommendationStatus, "packet utility status")
        : "unknown",
    alreadyLoadedItems: alreadyLoadedItems ?? null,
    freshItemCount: freshItemCount ?? null,
    duplicateTokensAvoided: duplicateTokensAvoided ?? null,
    unwiredProviderOmissions: sanitizeFollowups(evaluation.unwiredProviderOmissions),
    notes: sanitizeNote(evaluation.notes),
    nextAction:
      typeof evaluation.nextAction === "string"
        ? sanitizeNote(evaluation.nextAction)
        : nextActionForStatus(status),
    countingRule:
      typeof evaluation.countingRule === "string"
        ? sanitizeNote(evaluation.countingRule)
        : "Count ad-hoc read/search/list/status probes separately from validation commands.",
    nonAuthorization: NON_AUTHORIZATION,
  };
};

const aggregateEntriesFromInput = (input = {}) => {
  const raw = asObject(input) ?? {};
  const entries = [];
  const invalidEntries = [];
  const objectSources = [
    ["items", raw.items],
    ["observations", raw.observations],
    ["evaluations", raw.evaluations],
  ];
  const jsonSources = [
    ["observationJsons", raw.observationJsons],
    ["evaluationJsons", raw.evaluationJsons],
  ];
  const sourceCount = [...objectSources, ...jsonSources].reduce(
    (sum, [, values]) => sum + (Array.isArray(values) ? values.length : 0),
    0,
  );
  if (sourceCount > MAX_AGGREGATE_ITEMS) {
    return {
      entries,
      invalidEntries,
      errors: [`aggregate input exceeds ${MAX_AGGREGATE_ITEMS} receipt item(s)`],
    };
  }

  const pushEntry = (value, ref) => entries.push({ value, ref });
  const pushJsonEntry = (value, ref) => {
    const parsed = parseAggregateJsonEntry(value, ref);
    if (parsed.ok) pushEntry(parsed.value, ref);
    else invalidEntries.push({ ref, errors: parsed.errors });
  };

  for (const [field, values] of objectSources) {
    if (!Array.isArray(values)) continue;
    values.forEach((value, index) => {
      pushEntry(value, `${field}[${index}]`);
    });
  }
  for (const [field, values] of jsonSources) {
    if (!Array.isArray(values)) continue;
    values.forEach((value, index) => {
      pushJsonEntry(value, `${field}[${index}]`);
    });
  }

  return { entries, invalidEntries };
};

const normalizeAggregateEntry = ({ value, ref }) => {
  if (typeof value === "string") {
    const parsed = parseAggregateJsonEntry(value, ref);
    if (!parsed.ok) return { ok: false, ref, errors: parsed.errors };
    return normalizeAggregateEntry({ value: parsed.value, ref });
  }
  const object = asObject(value);
  if (!object) return { ok: false, ref, errors: [`${ref} must be an object or JSON string`] };
  if (object.kind === OBSERVATION_KIND) {
    const evaluation = buildDogfoodObservationEvaluation({ observation: object });
    return evaluation.ok
      ? { ok: true, ref, evaluation }
      : { ok: false, ref, errors: evaluation.errors };
  }
  if (object.kind === EVALUATION_KIND) {
    const evaluation = normalizeStoredEvaluation(object, ref);
    return evaluation.ok
      ? { ok: true, ref, evaluation }
      : { ok: false, ref, errors: evaluation.errors };
  }
  return {
    ok: false,
    ref,
    errors: [`${ref}.kind must be ${OBSERVATION_KIND} or ${EVALUATION_KIND}`],
  };
};

const aggregateStatusFor = ({ validCount, invalidCount, statusCounts }) => {
  if (validCount === 0) return "no_valid_receipts";
  if (invalidCount > 0 || statusCounts.needs_review > 0) return "review_before_tuning";
  if (statusCounts.overestimated > 0) return "ranking_or_provider_gap_suspected";
  if (statusCounts.observation_incomplete > 0) return "needs_more_observations";
  if (statusCounts.underestimated > 0) return "possible_underestimate";
  if (validCount >= 3 && statusCounts.matched === validCount) return "stable_positive_signal";
  return "limited_positive_signal";
};

const aggregateNextAction = (status) => {
  if (status === "stable_positive_signal") {
    return "Repeated redacted receipts matched; keep dogfooding and promote only through the owning evidence surface if needed.";
  }
  if (status === "limited_positive_signal") {
    return "One or two matched receipts are useful calibration, but gather more implementation/review/validation receipts before tuning ranking.";
  }
  if (status === "ranking_or_provider_gap_suspected") {
    return "Review overestimated receipts and omission follow-ups before changing ranking or adding provider adapters.";
  }
  if (status === "possible_underestimate") {
    return "Record that packets may be more useful than predicted; tune estimates only after repeated comparable receipts.";
  }
  if (status === "needs_more_observations") {
    return "Fill observed counts for incomplete receipts before treating the aggregate as usefulness signal.";
  }
  if (status === "review_before_tuning") {
    return "Resolve invalid or needs-review receipts before using this aggregate to tune providers, ranking, or docs.";
  }
  return "Supply at least one valid redacted dogfood observation or evaluation.";
};

export const buildDogfoodAggregateEvaluation = (input = {}) => {
  const { entries, invalidEntries, errors } = aggregateEntriesFromInput(input);
  if (errors) {
    return { ok: false, errors, nonAuthorization: NON_AUTHORIZATION };
  }
  if (entries.length === 0 && invalidEntries.length === 0) {
    return {
      ok: false,
      errors: ["at least one observation or evaluation is required"],
      nonAuthorization: NON_AUTHORIZATION,
    };
  }
  if (entries.length + invalidEntries.length > MAX_AGGREGATE_ITEMS) {
    return {
      ok: false,
      errors: [`aggregate input exceeds ${MAX_AGGREGATE_ITEMS} receipt item(s)`],
      nonAuthorization: NON_AUTHORIZATION,
    };
  }

  const normalized = entries.map(normalizeAggregateEntry);
  const validEvaluations = normalized
    .filter((entry) => entry.ok)
    .map((entry) => ({ ref: entry.ref, evaluation: entry.evaluation }));
  const allInvalidEntries = [
    ...invalidEntries,
    ...normalized
      .filter((entry) => !entry.ok)
      .map((entry) => ({ ref: entry.ref, errors: entry.errors ?? ["invalid receipt"] })),
  ];
  if (validEvaluations.length === 0) {
    return {
      ok: false,
      errors: allInvalidEntries.flatMap((entry) => entry.errors),
      invalidEntries: allInvalidEntries,
      nonAuthorization: NON_AUTHORIZATION,
    };
  }

  const statusCounts = Object.fromEntries(CALIBRATION_STATUSES.map((status) => [status, 0]));
  for (const { evaluation } of validEvaluations) statusCounts[evaluation.status] += 1;

  const evaluations = validEvaluations.map(({ ref, evaluation }) => ({
    ref,
    status: evaluation.status,
    expectedLowLevelCallsAvoided: evaluation.expectedLowLevelCallsAvoided,
    actualLowLevelReadSearchStatusCalls: evaluation.actualLowLevelReadSearchStatusCalls,
    actualLowLevelCallsAvoided: evaluation.actualLowLevelCallsAvoided,
    duplicateReadsObserved: evaluation.duplicateReadsObserved,
    recommendationMatchedOutcome: evaluation.recommendationMatchedOutcome,
    packetUtilityRecommendationStatus: evaluation.packetUtilityRecommendationStatus,
    omissionFollowupCount: evaluation.omissionFollowupsUsed.length,
    unwiredProviderOmissionCount: evaluation.unwiredProviderOmissions.length,
  }));
  const providerOmissionCounts = countValues(
    validEvaluations.flatMap(({ evaluation }) => evaluation.unwiredProviderOmissions),
  );
  const omissionFollowupCounts = countValues(
    validEvaluations.flatMap(({ evaluation }) => evaluation.omissionFollowupsUsed),
  );
  const packetUtilityRecommendationCounts = countValues(
    validEvaluations.map(({ evaluation }) => evaluation.packetUtilityRecommendationStatus),
  );
  const aggregateStatus = aggregateStatusFor({
    validCount: validEvaluations.length,
    invalidCount: allInvalidEntries.length,
    statusCounts,
  });

  return {
    ok: true,
    kind: "context_pack_dogfood_aggregate_evaluation_v1",
    status: aggregateStatus,
    receiptCount: entries.length + invalidEntries.length,
    validReceiptCount: validEvaluations.length,
    invalidReceiptCount: allInvalidEntries.length,
    statusCounts,
    totals: {
      expectedLowLevelCallsAvoided: validEvaluations.reduce(
        (sum, entry) => sum + entry.evaluation.expectedLowLevelCallsAvoided,
        0,
      ),
      actualLowLevelCallsAvoided: validEvaluations.reduce(
        (sum, entry) => sum + (entry.evaluation.actualLowLevelCallsAvoided ?? 0),
        0,
      ),
      actualLowLevelReadSearchStatusCalls: validEvaluations.reduce(
        (sum, entry) => sum + (entry.evaluation.actualLowLevelReadSearchStatusCalls ?? 0),
        0,
      ),
    },
    packetUtilityRecommendationCounts,
    providerOmissionCounts,
    omissionFollowupCounts,
    evaluations,
    invalidEntries: allInvalidEntries,
    nextAction: aggregateNextAction(aggregateStatus),
    nonAuthorization: NON_AUTHORIZATION,
  };
};

export const formatDogfoodAggregateEvaluation = (aggregate) => {
  if (!aggregate.ok) {
    return [
      "# Context-pack dogfood aggregate evaluation failed",
      "",
      ...(aggregate.errors ?? []).map((error) => `- ${markdownInlineLabel(error, "error")}`),
      "",
      `Non-authorization: ${aggregate.nonAuthorization}`,
    ].join("\n");
  }

  const statusLines = CALIBRATION_STATUSES.map(
    (status) => `- ${status}: ${aggregate.statusCounts[status] ?? 0}`,
  );
  const providerLines = Object.entries(aggregate.providerOmissionCounts).map(
    ([provider, count]) => `- ${markdownInlineLabel(provider, "provider")}: ${count}`,
  );
  const utilityLines = Object.entries(aggregate.packetUtilityRecommendationCounts).map(
    ([status, count]) => `- ${markdownInlineLabel(status, "packet utility status")}: ${count}`,
  );
  const invalidLines = aggregate.invalidEntries.map(
    (entry) =>
      `- ${markdownInlineLabel(entry.ref, "receipt")}: ${entry.errors.map((error) => markdownInlineLabel(error, "error")).join("; ")}`,
  );

  return [
    "# Context-pack dogfood aggregate evaluation",
    "",
    `Status: ${aggregate.status}`,
    `Receipts: ${aggregate.validReceiptCount} valid, ${aggregate.invalidReceiptCount} invalid, ${aggregate.receiptCount} total`,
    `Expected low-level calls avoided: ${aggregate.totals.expectedLowLevelCallsAvoided}`,
    `Actual low-level calls avoided: ${aggregate.totals.actualLowLevelCallsAvoided}`,
    `Actual low-level read/search/status calls: ${aggregate.totals.actualLowLevelReadSearchStatusCalls}`,
    "",
    "## Calibration status counts",
    statusLines.join("\n"),
    "",
    "## Packet utility recommendation counts",
    utilityLines.length ? utilityLines.join("\n") : "- none recorded",
    "",
    "## Unwired provider omission counts",
    providerLines.length ? providerLines.join("\n") : "- none recorded",
    "",
    "## Invalid receipts",
    invalidLines.length ? invalidLines.join("\n") : "- none",
    "",
    "## Next action",
    `- ${aggregate.nextAction}`,
    "",
    "## Non-authorization",
    `- ${aggregate.nonAuthorization}`,
  ].join("\n");
};

export const dogfoodAggregateEvaluationToolResult = async (input = {}) => {
  const aggregate = buildDogfoodAggregateEvaluation(input);
  return textResult(formatDogfoodAggregateEvaluation(aggregate), {
    dogfoodAggregateEvaluation: aggregate,
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

export const DOGFOOD_AGGREGATE_EVALUATION_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      maxItems: MAX_AGGREGATE_ITEMS,
      items: {
        oneOf: [
          { type: "object", additionalProperties: true },
          { type: "string", maxLength: MAX_OBSERVATION_JSON_BYTES },
        ],
      },
      description:
        "Mixed redacted context_pack dogfood observations or context_pack dogfood evaluations.",
    },
    observations: {
      type: "array",
      maxItems: MAX_AGGREGATE_ITEMS,
      items: { type: "object", additionalProperties: true },
      description: "Filled context_pack_dogfood_observation_v1 objects emitted by context_pack.",
    },
    observationJsons: {
      type: "array",
      maxItems: MAX_AGGREGATE_ITEMS,
      items: { type: "string", maxLength: MAX_OBSERVATION_JSON_BYTES },
      description: "Filled context_pack_dogfood_observation_v1 JSON strings.",
    },
    evaluations: {
      type: "array",
      maxItems: MAX_AGGREGATE_ITEMS,
      items: { type: "object", additionalProperties: true },
      description: "context_pack_dogfood_evaluation_v1 objects from context_dogfood_evaluate.",
    },
    evaluationJsons: {
      type: "array",
      maxItems: MAX_AGGREGATE_ITEMS,
      items: { type: "string", maxLength: MAX_OBSERVATION_JSON_BYTES },
      description: "context_pack_dogfood_evaluation_v1 JSON strings.",
    },
  },
};

export const dogfoodEvaluationMarkdownFence = (evaluation) =>
  markdownFence(
    "context-pack-dogfood-evaluation.md",
    formatDogfoodObservationEvaluation(evaluation),
  );

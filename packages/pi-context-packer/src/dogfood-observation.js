import {
  markdownFence,
  markdownInlineLabel,
  publicOmissionDetail,
} from "./context-intake-safety.js";
import { textResult } from "./context-pack-result.js";
import {
  DOGFOOD_CONTRARY_OMISSION_FOLLOWUP_CLASSES,
  DOGFOOD_OMISSION_FOLLOWUP_CLASS_NEXT_ACTIONS,
  DOGFOOD_OMISSION_FOLLOWUP_CLASSES,
} from "./dogfood-followup-classes.js";

export { DOGFOOD_OMISSION_FOLLOWUP_CLASSES } from "./dogfood-followup-classes.js";

const OBSERVATION_KIND = "context_pack_dogfood_observation_v1";
const EVALUATION_KIND = "context_pack_dogfood_evaluation_v1";
const MAX_FOLLOWUPS = 12;
const MAX_PROVIDER_ROUTES = 20;
const MAX_PROVIDER_ROUTE_SEED_KINDS = 12;
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
const CORE_ACTIVITY_TYPES = Object.freeze(["implementation", "review", "validation"]);
const KNOWN_ACTIVITY_TYPES = new Set([...CORE_ACTIVITY_TYPES, "planning", "other", "unspecified"]);
const RUNTIME_CONTEXTS = Object.freeze([
  "source_local",
  "installed_artifact",
  "live_pi_reloaded",
  "unknown",
]);
const KNOWN_RUNTIME_CONTEXTS = new Set(RUNTIME_CONTEXTS);
const KNOWN_FOLLOWUP_CLASSES = new Set(DOGFOOD_OMISSION_FOLLOWUP_CLASSES);
const CONTRARY_FOLLOWUP_CLASSES = new Set(DOGFOOD_CONTRARY_OMISSION_FOLLOWUP_CLASSES);

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

const normalizeActivityType = (value) => {
  if (typeof value !== "string" || !value.trim()) return "unspecified";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, "_");
  if (KNOWN_ACTIVITY_TYPES.has(normalized)) return normalized;
  return sanitizeLabel(value, "activity type");
};

const normalizeRuntimeContext = (value) => {
  if (typeof value !== "string" || !value.trim()) return "unknown";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, "_");
  if (KNOWN_RUNTIME_CONTEXTS.has(normalized)) return normalized;
  return sanitizeLabel(value, "runtime context");
};

const normalizeFollowupClass = (value, fallback = "other") => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, "_");
  return KNOWN_FOLLOWUP_CLASSES.has(normalized) ? normalized : "other";
};

const followupClassFromObject = (value) =>
  normalizeFollowupClass(value.classification ?? value.class ?? value.type, "other");

const sanitizeFollowupEntries = (values) => {
  if (!Array.isArray(values)) return [];
  return values.slice(0, MAX_FOLLOWUPS).map((value, index) => {
    if (typeof value === "string") {
      return {
        label: sanitizeNote(value) || `omission follow-up ${index + 1}`,
        classification: "legacy_unspecified",
      };
    }
    if (value && typeof value === "object") {
      const provider = sanitizeLabel(value.provider, "provider");
      const reason = sanitizeLabel(value.reason, "reason");
      return {
        label: `${provider}/${reason}`,
        classification: followupClassFromObject(value),
      };
    }
    return {
      label: `omission follow-up ${index + 1}`,
      classification: "legacy_unspecified",
    };
  });
};

const sanitizeFollowups = (values) => sanitizeFollowupEntries(values).map((entry) => entry.label);

const normalizeStoredFollowupClasses = (classes, followups) => {
  const followupCount = Array.isArray(followups) ? Math.min(followups.length, MAX_FOLLOWUPS) : 0;
  if (!Array.isArray(classes))
    return Array.from({ length: followupCount }, () => "legacy_unspecified");
  return Array.from({ length: followupCount }, (_, index) =>
    normalizeFollowupClass(classes[index], "legacy_unspecified"),
  );
};

const normalizeRouteRole = (value) => {
  if (typeof value !== "string" || !value.trim()) return "unknown";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, "_");
  if (["selected", "followup", "skipped"].includes(normalized)) return normalized;
  return sanitizeLabel(value, "route role");
};

const normalizeSeedCounts = (value, path, errors) => {
  const seedCounts = Object.create(null);
  if (value === null || value === undefined) return { seedCounts, seedCountsTruncated: 0 };
  const raw = asObject(value);
  if (!raw) {
    errors.push(`${path} must be an object when supplied`);
    return { seedCounts, seedCountsTruncated: 0 };
  }

  const entries = Object.entries(raw);
  for (const [index, [seedKind, rawCount]] of entries
    .slice(0, MAX_PROVIDER_ROUTE_SEED_KINDS)
    .entries()) {
    const safeKind = sanitizeLabel(seedKind, "seed kind");
    const count = readOptionalCount(rawCount, `${path}[${index}].${safeKind}`, errors);
    if (count !== undefined) {
      seedCounts[safeKind] = (seedCounts[safeKind] ?? 0) + count;
    }
  }
  return {
    seedCounts,
    seedCountsTruncated: Math.max(0, entries.length - MAX_PROVIDER_ROUTE_SEED_KINDS),
  };
};

const normalizeProviderRoute = (value, path, errors) => {
  const route = asObject(value);
  if (!route) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const queryCount = readOptionalCount(route.queryCount, `${path}.queryCount`, errors);
  const totalQueryCount = readOptionalCount(
    route.totalQueryCount,
    `${path}.totalQueryCount`,
    errors,
  );
  const selectedQueryCount = readOptionalCount(
    route.selectedQueryCount,
    `${path}.selectedQueryCount`,
    errors,
  );
  const followupQueryCount = readOptionalCount(
    route.followupQueryCount,
    `${path}.followupQueryCount`,
    errors,
  );
  const { seedCounts, seedCountsTruncated } = normalizeSeedCounts(
    route.seedCounts,
    `${path}.seedCounts`,
    errors,
  );
  const seedCount = readOptionalCount(route.seedCount, `${path}.seedCount`, errors);
  const routeRole = normalizeRouteRole(route.routeRole);
  const inferredSeedCount = Object.values(seedCounts).reduce((sum, count) => sum + count, 0);
  const rawTotalQueryCount = totalQueryCount ?? queryCount;
  const normalizedSelectedQueryCount =
    selectedQueryCount ?? (routeRole === "selected" ? (rawTotalQueryCount ?? 0) : 0);
  const normalizedFollowupQueryCount =
    followupQueryCount ?? (routeRole === "followup" ? (rawTotalQueryCount ?? 0) : 0);
  const normalizedTotalQueryCount =
    rawTotalQueryCount ?? normalizedSelectedQueryCount + normalizedFollowupQueryCount;
  if (routeRole !== "selected" && normalizedSelectedQueryCount > 0) {
    errors.push(`${path}.selectedQueryCount must be zero unless routeRole is selected`);
  }
  if (routeRole !== "followup" && normalizedFollowupQueryCount > 0) {
    errors.push(`${path}.followupQueryCount must be zero unless routeRole is followup`);
  }
  if (normalizedSelectedQueryCount + normalizedFollowupQueryCount > normalizedTotalQueryCount) {
    errors.push(`${path}.totalQueryCount must cover selected and follow-up query counts`);
  }
  const unclassifiedQueryCount = Math.max(
    0,
    normalizedTotalQueryCount - normalizedSelectedQueryCount - normalizedFollowupQueryCount,
  );

  return {
    provider: sanitizeLabel(route.provider, "provider"),
    posture: sanitizeLabel(route.posture, "posture"),
    routeRole,
    queryCount: normalizedTotalQueryCount,
    totalQueryCount: normalizedTotalQueryCount,
    selectedQueryCount: normalizedSelectedQueryCount,
    followupQueryCount: normalizedFollowupQueryCount,
    unclassifiedQueryCount,
    seedCount: seedCount ?? inferredSeedCount,
    seedCounts,
    seedCountsTruncated,
  };
};

const normalizeProviderRoutes = (value, truncatedValue, path, errors) => {
  const providerRoutesTruncated = readOptionalCount(
    truncatedValue,
    `${path}.providerRoutesTruncated`,
    errors,
  );
  if (value === null || value === undefined) {
    return { providerRoutes: [], providerRoutesTruncated: providerRoutesTruncated ?? 0 };
  }
  if (!Array.isArray(value)) {
    errors.push(`${path}.providerRoutes must be an array when supplied`);
    return { providerRoutes: [], providerRoutesTruncated: providerRoutesTruncated ?? 0 };
  }

  const providerRoutes = value
    .slice(0, MAX_PROVIDER_ROUTES)
    .map((route, index) =>
      normalizeProviderRoute(route, `${path}.providerRoutes[${index}]`, errors),
    )
    .filter(Boolean);
  return {
    providerRoutes,
    providerRoutesTruncated:
      Math.max(0, value.length - MAX_PROVIDER_ROUTES) + (providerRoutesTruncated ?? 0),
  };
};

const routeSeedCountsText = (seedCounts) => {
  const entries = Object.entries(seedCounts ?? {});
  if (!entries.length) return "none";
  return entries
    .map(([seedKind, count]) => `${markdownInlineLabel(seedKind, "seed kind")}: ${count}`)
    .join(", ");
};

const providerRouteLines = (providerRoutes) =>
  providerRoutes.map(
    (route) =>
      `- ${markdownInlineLabel(route.provider, "provider")}: role=${markdownInlineLabel(route.routeRole, "route role")}, posture=${markdownInlineLabel(route.posture, "posture")}, totalQueries=${route.totalQueryCount}, selectedQueries=${route.selectedQueryCount}, followupQueries=${route.followupQueryCount}, unclassifiedQueries=${route.unclassifiedQueryCount}, seeds=${route.seedCount} (${routeSeedCountsText(route.seedCounts)}${route.seedCountsTruncated ? `; ${route.seedCountsTruncated} seed-kind entries truncated` : ""})`,
  );

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
  omissionFollowupClasses = [],
  recommendationMatchedOutcome,
}) => {
  const contraryFollowups = omissionFollowupClasses.length
    ? omissionFollowupClasses.some((classification) =>
        CONTRARY_FOLLOWUP_CLASSES.has(classification),
      )
    : omissionFollowupsUsed.length > 0;
  const contrarySignals =
    recommendationMatchedOutcome === false || duplicateReadsObserved === true || contraryFollowups;
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
  const validationCommandsRun = readOptionalCount(
    filledObservation.validationCommandsRun,
    "observation.validationCommandsRun",
    errors,
  );
  const activityType = normalizeActivityType(filledObservation.activityType);
  const runtimeContext = normalizeRuntimeContext(filledObservation.runtimeContext);
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
  const packet = asObject(observation.packet) ?? {};
  const { providerRoutes, providerRoutesTruncated } = normalizeProviderRoutes(
    packet.providerRoutes,
    packet.providerRoutesTruncated,
    "packet",
    errors,
  );
  if (errors.length > 0) {
    return { ok: false, errors, nonAuthorization: NON_AUTHORIZATION };
  }

  const omissionFollowupEntries = sanitizeFollowupEntries(filledObservation.omissionFollowupsUsed);
  const omissionFollowupsUsed = omissionFollowupEntries.map((entry) => entry.label);
  const omissionFollowupClasses = omissionFollowupEntries.map((entry) => entry.classification);
  const notes = sanitizeNote(filledObservation.notes);
  const calibrationStatus = classifyCalibration({
    expectedAvoided,
    actualAvoided,
    actualResidualCalls,
    duplicateReadsObserved,
    omissionFollowupsUsed,
    omissionFollowupClasses,
    recommendationMatchedOutcome,
  });

  return {
    ok: true,
    kind: "context_pack_dogfood_evaluation_v1",
    sourceKind: OBSERVATION_KIND,
    status: calibrationStatus,
    expectedLowLevelCallsAvoided: expectedAvoided,
    activityType,
    runtimeContext,
    actualLowLevelReadSearchStatusCalls: actualResidualCalls ?? null,
    actualLowLevelCallsAvoided: actualAvoided ?? null,
    validationCommandsRun: validationCommandsRun ?? null,
    duplicateReadsObserved,
    omissionFollowupsUsed,
    omissionFollowupClasses,
    omissionFollowupClassCounts: countValues(omissionFollowupClasses),
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
    providerRoutes,
    providerRoutesTruncated,
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

  const classLines = Object.entries(evaluation.omissionFollowupClassCounts ?? {}).map(
    ([classification, count]) =>
      `- ${markdownInlineLabel(classification, "omission follow-up class")}: ${count}`,
  );

  const lines = [
    "# Context-pack dogfood observation evaluation",
    "",
    `Status: ${evaluation.status}`,
    `Expected low-level calls avoided: ${evaluation.expectedLowLevelCallsAvoided}`,
    `Activity type: ${evaluation.activityType}`,
    `Runtime context: ${evaluation.runtimeContext ?? "unknown"}`,
    `Actual low-level read/search/status calls: ${evaluation.actualLowLevelReadSearchStatusCalls ?? "not recorded"}`,
    `Actual low-level calls avoided: ${evaluation.actualLowLevelCallsAvoided ?? "not recorded"}`,
    `Validation commands run: ${evaluation.validationCommandsRun ?? "not recorded"}`,
    `Duplicate reads observed: ${evaluation.duplicateReadsObserved ?? "not recorded"}`,
    `Recommendation matched outcome: ${evaluation.recommendationMatchedOutcome ?? "not recorded"}`,
    `Packet utility recommendation: ${evaluation.packetUtilityRecommendationStatus}`,
    "",
    "## Provider route telemetry",
    evaluation.providerRoutes?.length
      ? providerRouteLines(evaluation.providerRoutes).join("\n")
      : "- none recorded",
    evaluation.providerRoutesTruncated
      ? `- truncated route entries: ${evaluation.providerRoutesTruncated}`
      : "",
    "",
    "## Omission follow-ups used",
    evaluation.omissionFollowupsUsed.length
      ? evaluation.omissionFollowupsUsed.map((item) => `- ${item}`).join("\n")
      : "- none recorded",
    "",
    "## Omission follow-up class counts",
    classLines.length ? classLines.join("\n") : "- none recorded",
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

function countValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const result = Object.create(null);
  for (const [key, count] of Array.from(counts.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    result[key] = count;
  }
  return result;
}

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
  const runtimeContext = normalizeRuntimeContext(evaluation.runtimeContext);
  const validationCommandsRun = readOptionalCount(
    evaluation.validationCommandsRun,
    `${ref}.validationCommandsRun`,
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
  const omissionFollowupsTruncated = readOptionalCount(
    evaluation.omissionFollowupsTruncated,
    `${ref}.omissionFollowupsTruncated`,
    errors,
  );
  const { providerRoutes, providerRoutesTruncated } = normalizeProviderRoutes(
    evaluation.providerRoutes,
    evaluation.providerRoutesTruncated,
    ref,
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
    activityType: normalizeActivityType(evaluation.activityType),
    runtimeContext,
    actualLowLevelReadSearchStatusCalls: actualLowLevelReadSearchStatusCalls ?? null,
    actualLowLevelCallsAvoided: actualLowLevelCallsAvoided ?? null,
    validationCommandsRun: validationCommandsRun ?? null,
    duplicateReadsObserved: booleanOrNull(evaluation.duplicateReadsObserved),
    omissionFollowupsUsed: sanitizeFollowups(evaluation.omissionFollowupsUsed),
    omissionFollowupClasses: normalizeStoredFollowupClasses(
      evaluation.omissionFollowupClasses,
      evaluation.omissionFollowupsUsed,
    ),
    omissionFollowupClassCounts: countValues(
      normalizeStoredFollowupClasses(
        evaluation.omissionFollowupClasses,
        evaluation.omissionFollowupsUsed,
      ),
    ),
    omissionFollowupsTruncated: omissionFollowupsTruncated ?? 0,
    recommendationMatchedOutcome: booleanOrNull(evaluation.recommendationMatchedOutcome),
    packetUtilityRecommendationStatus:
      typeof evaluation.packetUtilityRecommendationStatus === "string"
        ? sanitizeLabel(evaluation.packetUtilityRecommendationStatus, "packet utility status")
        : "unknown",
    alreadyLoadedItems: alreadyLoadedItems ?? null,
    freshItemCount: freshItemCount ?? null,
    duplicateTokensAvoided: duplicateTokensAvoided ?? null,
    unwiredProviderOmissions: sanitizeFollowups(evaluation.unwiredProviderOmissions),
    providerRoutes,
    providerRoutesTruncated,
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

const activityCoverageFor = (activityTypeCounts) => {
  const present = CORE_ACTIVITY_TYPES.filter(
    (activityType) =>
      Object.hasOwn(activityTypeCounts, activityType) && activityTypeCounts[activityType] > 0,
  );
  const missing = CORE_ACTIVITY_TYPES.filter((activityType) => !present.includes(activityType));
  return {
    required: [...CORE_ACTIVITY_TYPES],
    present,
    missing,
    complete: missing.length === 0,
    nonAuthorization:
      "activity coverage is packet-local calibration metadata only; it is not task completion proof or owner-surface evidence",
  };
};

const runtimeCoverageFor = (runtimeContextCounts) => {
  const livePiReloadedCount = Object.hasOwn(runtimeContextCounts, "live_pi_reloaded")
    ? runtimeContextCounts.live_pi_reloaded
    : 0;
  return {
    known: [...RUNTIME_CONTEXTS],
    livePiReloadedCount,
    hasLivePiReloadedReceipt: livePiReloadedCount > 0,
    nonAuthorization:
      "runtime context is observer-supplied packet-local calibration metadata only; context-packer did not verify install, reload, live activation, or task completion",
  };
};

const aggregateStatusFor = ({ validCount, invalidCount, statusCounts, activityCoverage }) => {
  if (validCount === 0) return "no_valid_receipts";
  if (invalidCount > 0 || statusCounts.needs_review > 0) return "review_before_tuning";
  if (statusCounts.overestimated > 0) return "ranking_or_provider_gap_suspected";
  if (statusCounts.observation_incomplete > 0) return "needs_more_observations";
  if (statusCounts.underestimated > 0) return "possible_underestimate";
  if (validCount >= 3 && statusCounts.matched === validCount) {
    return activityCoverage.complete ? "stable_positive_signal" : "activity_coverage_gap";
  }
  return "limited_positive_signal";
};

const followupClassNextActionsFor = (classCounts) =>
  Object.entries(DOGFOOD_OMISSION_FOLLOWUP_CLASS_NEXT_ACTIONS)
    .filter(([classification]) => (classCounts[classification] ?? 0) > 0)
    .map(([, nextAction]) => nextAction);

const incrementCount = (target, key, count = 1) => {
  target[key] = (target[key] ?? 0) + count;
};

const aggregateProviderRoutes = (validEvaluations) => {
  const providerRouteCounts = Object.create(null);
  const providerRouteRoleCounts = Object.create(null);
  const providerRouteSeedKindCounts = Object.create(null);
  const providerRouteQueryTotals = Object.create(null);
  const totals = {
    providerRouteCount: 0,
    selectedQueryCount: 0,
    followupQueryCount: 0,
    unclassifiedQueryCount: 0,
    seedCount: 0,
    providerRoutesTruncated: 0,
    seedCountsTruncated: 0,
  };

  for (const { evaluation } of validEvaluations) {
    totals.providerRoutesTruncated += evaluation.providerRoutesTruncated ?? 0;
    for (const route of evaluation.providerRoutes ?? []) {
      totals.providerRouteCount += 1;
      totals.selectedQueryCount += route.selectedQueryCount;
      totals.followupQueryCount += route.followupQueryCount;
      totals.unclassifiedQueryCount += route.unclassifiedQueryCount ?? 0;
      totals.seedCount += route.seedCount;
      totals.seedCountsTruncated += route.seedCountsTruncated ?? 0;
      incrementCount(providerRouteCounts, route.provider);
      incrementCount(providerRouteRoleCounts, route.routeRole);
      if (!providerRouteQueryTotals[route.provider]) {
        providerRouteQueryTotals[route.provider] = {
          routeCount: 0,
          selectedQueryCount: 0,
          followupQueryCount: 0,
          unclassifiedQueryCount: 0,
          seedCount: 0,
        };
      }
      const providerTotals = providerRouteQueryTotals[route.provider];
      providerTotals.routeCount += 1;
      providerTotals.selectedQueryCount += route.selectedQueryCount;
      providerTotals.followupQueryCount += route.followupQueryCount;
      providerTotals.unclassifiedQueryCount += route.unclassifiedQueryCount ?? 0;
      providerTotals.seedCount += route.seedCount;
      for (const [seedKind, count] of Object.entries(route.seedCounts ?? {})) {
        incrementCount(providerRouteSeedKindCounts, seedKind, count);
      }
    }
  }

  return {
    providerRouteCounts,
    providerRouteRoleCounts,
    providerRouteSeedKindCounts,
    providerRouteQueryTotals,
    totals,
  };
};

const runtimeActivationSuffix = (runtimeCoverage) =>
  runtimeCoverage?.hasLivePiReloadedReceipt
    ? " At least one observer-supplied live_pi_reloaded receipt is present, but this is still not owner-surface evidence or task completion proof."
    : " No live_pi_reloaded receipt is recorded; do not treat this aggregate as live-session activation proof.";

const aggregateNextAction = (status, activityCoverage, runtimeCoverage) => {
  if (status === "stable_positive_signal") {
    return `Repeated redacted receipts matched as packet-local calibration; keep dogfooding and promote only through the owning evidence surface if needed.${runtimeActivationSuffix(runtimeCoverage)}`;
  }
  if (status === "limited_positive_signal") {
    return `One or two matched receipts are useful calibration, but gather more implementation/review/validation receipts before tuning ranking.${runtimeActivationSuffix(runtimeCoverage)}`;
  }
  if (status === "activity_coverage_gap") {
    return `Repeated receipts matched, but core activity coverage is incomplete; gather ${activityCoverage.missing.join("/")} receipt(s) before treating the signal as stable for ranking or provider tuning.${runtimeActivationSuffix(runtimeCoverage)}`;
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
    activityType: evaluation.activityType,
    runtimeContext: evaluation.runtimeContext ?? "unknown",
    expectedLowLevelCallsAvoided: evaluation.expectedLowLevelCallsAvoided,
    actualLowLevelReadSearchStatusCalls: evaluation.actualLowLevelReadSearchStatusCalls,
    actualLowLevelCallsAvoided: evaluation.actualLowLevelCallsAvoided,
    validationCommandsRun: evaluation.validationCommandsRun,
    duplicateReadsObserved: evaluation.duplicateReadsObserved,
    recommendationMatchedOutcome: evaluation.recommendationMatchedOutcome,
    packetUtilityRecommendationStatus: evaluation.packetUtilityRecommendationStatus,
    omissionFollowupCount: evaluation.omissionFollowupsUsed.length,
    omissionFollowupClassCounts: evaluation.omissionFollowupClassCounts,
    omissionFollowupsTruncated: evaluation.omissionFollowupsTruncated,
    unwiredProviderOmissionCount: evaluation.unwiredProviderOmissions.length,
    providerRouteCount: evaluation.providerRoutes?.length ?? 0,
    providerRoutesTruncated: evaluation.providerRoutesTruncated ?? 0,
  }));
  const routeAggregate = aggregateProviderRoutes(validEvaluations);
  const providerOmissionCounts = countValues(
    validEvaluations.flatMap(({ evaluation }) => evaluation.unwiredProviderOmissions),
  );
  const omissionFollowupCounts = countValues(
    validEvaluations.flatMap(({ evaluation }) => evaluation.omissionFollowupsUsed),
  );
  const omissionFollowupClassCounts = countValues(
    validEvaluations.flatMap(({ evaluation }) => evaluation.omissionFollowupClasses ?? []),
  );
  const omissionFollowupClassNextActions = followupClassNextActionsFor(omissionFollowupClassCounts);
  const packetUtilityRecommendationCounts = countValues(
    validEvaluations.map(({ evaluation }) => evaluation.packetUtilityRecommendationStatus),
  );
  const activityTypeCounts = countValues(
    validEvaluations.map(({ evaluation }) => evaluation.activityType ?? "unspecified"),
  );
  const runtimeContextCounts = countValues(
    validEvaluations.map(({ evaluation }) => evaluation.runtimeContext ?? "unknown"),
  );
  const activityCoverage = activityCoverageFor(activityTypeCounts);
  const runtimeCoverage = runtimeCoverageFor(runtimeContextCounts);
  const aggregateStatus = aggregateStatusFor({
    validCount: validEvaluations.length,
    invalidCount: allInvalidEntries.length,
    statusCounts,
    activityCoverage,
  });
  const validationCommandsRecordedCount = validEvaluations.filter(
    ({ evaluation }) => evaluation.validationCommandsRun !== null,
  ).length;

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
      validationCommandsRun: validEvaluations.reduce(
        (sum, entry) => sum + (entry.evaluation.validationCommandsRun ?? 0),
        0,
      ),
      validationCommandsRecordedCount,
      validationCommandsMissingCount: validEvaluations.length - validationCommandsRecordedCount,
      omissionFollowupsTruncated: validEvaluations.reduce(
        (sum, entry) => sum + (entry.evaluation.omissionFollowupsTruncated ?? 0),
        0,
      ),
      providerRouteCount: routeAggregate.totals.providerRouteCount,
      providerRouteSelectedQueryCount: routeAggregate.totals.selectedQueryCount,
      providerRouteFollowupQueryCount: routeAggregate.totals.followupQueryCount,
      providerRouteUnclassifiedQueryCount: routeAggregate.totals.unclassifiedQueryCount,
      providerRouteSeedCount: routeAggregate.totals.seedCount,
      providerRoutesTruncated: routeAggregate.totals.providerRoutesTruncated,
      providerRouteSeedCountsTruncated: routeAggregate.totals.seedCountsTruncated,
    },
    packetUtilityRecommendationCounts,
    activityTypeCounts,
    activityCoverage,
    runtimeContextCounts,
    runtimeCoverage,
    providerOmissionCounts,
    providerRouteCounts: routeAggregate.providerRouteCounts,
    providerRouteRoleCounts: routeAggregate.providerRouteRoleCounts,
    providerRouteSeedKindCounts: routeAggregate.providerRouteSeedKindCounts,
    providerRouteQueryTotals: routeAggregate.providerRouteQueryTotals,
    omissionFollowupCounts,
    omissionFollowupClassCounts,
    omissionFollowupClassNextActions,
    evaluations,
    invalidEntries: allInvalidEntries,
    nextAction: aggregateNextAction(aggregateStatus, activityCoverage, runtimeCoverage),
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
  const providerRouteQueryTotals = aggregate.providerRouteQueryTotals ?? {};
  const providerRouteRoleCounts = aggregate.providerRouteRoleCounts ?? {};
  const providerRouteSeedKindCounts = aggregate.providerRouteSeedKindCounts ?? {};
  const providerRouteLines = Object.entries(providerRouteQueryTotals).map(
    ([provider, totals]) =>
      `- ${markdownInlineLabel(provider, "provider")}: routes=${totals.routeCount ?? 0}, selectedQueries=${totals.selectedQueryCount ?? 0}, followupQueries=${totals.followupQueryCount ?? 0}, unclassifiedQueries=${totals.unclassifiedQueryCount ?? 0}, seeds=${totals.seedCount ?? 0}`,
  );
  const providerRouteRoleLines = Object.entries(providerRouteRoleCounts).map(
    ([role, count]) => `- ${markdownInlineLabel(role, "route role")}: ${count}`,
  );
  const providerRouteSeedKindLines = Object.entries(providerRouteSeedKindCounts).map(
    ([seedKind, count]) => `- ${markdownInlineLabel(seedKind, "seed kind")}: ${count}`,
  );
  const utilityLines = Object.entries(aggregate.packetUtilityRecommendationCounts).map(
    ([status, count]) => `- ${markdownInlineLabel(status, "packet utility status")}: ${count}`,
  );
  const activityLines = Object.entries(aggregate.activityTypeCounts).map(
    ([activityType, count]) => `- ${markdownInlineLabel(activityType, "activity type")}: ${count}`,
  );
  const runtimeContextLines = Object.entries(aggregate.runtimeContextCounts ?? {}).map(
    ([runtimeContext, count]) =>
      `- ${markdownInlineLabel(runtimeContext, "runtime context")}: ${count}`,
  );
  const followupLines = Object.entries(aggregate.omissionFollowupCounts).map(
    ([followup, count]) => `- ${markdownInlineLabel(followup, "omission follow-up")}: ${count}`,
  );
  const followupClassLines = Object.entries(aggregate.omissionFollowupClassCounts).map(
    ([classification, count]) =>
      `- ${markdownInlineLabel(classification, "omission follow-up class")}: ${count}`,
  );
  const followupClassActionLines = aggregate.omissionFollowupClassNextActions.map(
    (action) => `- ${markdownInlineLabel(action, "omission follow-up next action", 160)}`,
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
    `Validation commands run: ${aggregate.totals.validationCommandsRun} (${aggregate.totals.validationCommandsRecordedCount} recorded, ${aggregate.totals.validationCommandsMissingCount} missing)`,
    `Omission follow-ups truncated: ${aggregate.totals.omissionFollowupsTruncated}`,
    `Provider routes: ${aggregate.totals.providerRouteCount ?? 0} (${aggregate.totals.providerRoutesTruncated ?? 0} route entries truncated, ${aggregate.totals.providerRouteSeedCountsTruncated ?? 0} seed-kind entries truncated), selected queries ${aggregate.totals.providerRouteSelectedQueryCount ?? 0}, follow-up queries ${aggregate.totals.providerRouteFollowupQueryCount ?? 0}, unclassified queries ${aggregate.totals.providerRouteUnclassifiedQueryCount ?? 0}, seeds ${aggregate.totals.providerRouteSeedCount ?? 0}`,
    "",
    "## Calibration status counts",
    statusLines.join("\n"),
    "",
    "## Packet utility recommendation counts",
    utilityLines.length ? utilityLines.join("\n") : "- none recorded",
    "",
    "## Activity type counts",
    activityLines.length ? activityLines.join("\n") : "- none recorded",
    "",
    "## Core activity coverage",
    `- present: ${aggregate.activityCoverage.present.length ? aggregate.activityCoverage.present.map((activityType) => markdownInlineLabel(activityType, "activity type")).join(", ") : "none"}`,
    `- missing: ${aggregate.activityCoverage.missing.length ? aggregate.activityCoverage.missing.map((activityType) => markdownInlineLabel(activityType, "activity type")).join(", ") : "none"}`,
    `- complete: ${aggregate.activityCoverage.complete}`,
    `- non-authorization: ${aggregate.activityCoverage.nonAuthorization}`,
    "",
    "## Runtime context counts",
    runtimeContextLines.length ? runtimeContextLines.join("\n") : "- none recorded",
    "",
    "## Runtime activation coverage",
    `- live_pi_reloaded receipts: ${aggregate.runtimeCoverage?.livePiReloadedCount ?? 0}`,
    `- has live_pi_reloaded receipt: ${aggregate.runtimeCoverage?.hasLivePiReloadedReceipt ?? false}`,
    `- non-authorization: ${aggregate.runtimeCoverage?.nonAuthorization ?? "runtime context is packet-local calibration metadata only"}`,
    "",
    "## Unwired provider omission counts",
    providerLines.length ? providerLines.join("\n") : "- none recorded",
    "",
    "## Provider route query totals",
    providerRouteLines.length ? providerRouteLines.join("\n") : "- none recorded",
    "",
    "## Provider route role counts",
    providerRouteRoleLines.length ? providerRouteRoleLines.join("\n") : "- none recorded",
    "",
    "## Provider route seed-kind counts",
    providerRouteSeedKindLines.length ? providerRouteSeedKindLines.join("\n") : "- none recorded",
    "",
    "## Omission follow-up counts",
    followupLines.length ? followupLines.join("\n") : "- none recorded",
    "",
    "## Omission follow-up class counts",
    followupClassLines.length ? followupClassLines.join("\n") : "- none recorded",
    "",
    "## Omission follow-up class next actions",
    followupClassActionLines.length ? followupClassActionLines.join("\n") : "- none recorded",
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
  anyOf: [{ required: ["observation"] }, { required: ["observationJson"] }],
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
  anyOf: [
    { required: ["items"] },
    { required: ["observations"] },
    { required: ["observationJsons"] },
    { required: ["evaluations"] },
    { required: ["evaluationJsons"] },
  ],
  properties: {
    items: {
      type: "array",
      minItems: 1,
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
      minItems: 1,
      maxItems: MAX_AGGREGATE_ITEMS,
      items: { type: "object", additionalProperties: true },
      description: "Filled context_pack_dogfood_observation_v1 objects emitted by context_pack.",
    },
    observationJsons: {
      type: "array",
      minItems: 1,
      maxItems: MAX_AGGREGATE_ITEMS,
      items: { type: "string", maxLength: MAX_OBSERVATION_JSON_BYTES },
      description: "Filled context_pack_dogfood_observation_v1 JSON strings.",
    },
    evaluations: {
      type: "array",
      minItems: 1,
      maxItems: MAX_AGGREGATE_ITEMS,
      items: { type: "object", additionalProperties: true },
      description: "context_pack_dogfood_evaluation_v1 objects from context_dogfood_evaluate.",
    },
    evaluationJsons: {
      type: "array",
      minItems: 1,
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

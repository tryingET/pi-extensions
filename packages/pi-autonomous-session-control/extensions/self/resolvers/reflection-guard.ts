/**
 * Mirror-only reflection guard for diagnostic/self-evolution queries.
 *
 * The guard can notice repeated self-analysis and require an external check signal,
 * but it must not launch peers, visible loops, campaigns, or write durable owner state.
 */

import { normalizeString, normalizeStringArray } from "../edge-contract-kernel.ts";
import type { SelfQuery } from "../types.ts";

type ReflectionGuardStatus =
  | "not_triggered"
  | "external_check_required"
  | "external_check_observed";

type ExternalCheckStatus = "observed" | "required" | "failed" | "unknown";

interface ReflectionGuardSessionEvidence {
  validationProvenance?: string[];
}

const TEXT_ENTRY_MAX_LENGTH = 300;
const TEXT_TOTAL_MAX_LENGTH = 4000;
const ARRAY_ENTRY_LIMIT = 16;

const REPEATED_REFLECTION_PATTERN =
  /\b(repeated|again|looping|circular|recursive|philosophical)\b[^\n]{0,80}\b(reflection|self-analysis|self analysis|self-evolution|diagnostic review)\b|\b(reflection|self-analysis|self analysis|self-evolution|diagnostic review)\b[^\n]{0,80}\b(repeated|again|looping|circular|recursive|philosophical)\b/u;

const CHECK_SIGNAL_WORDS =
  "external check|external validation|focused regression|package check|live dogfood|scout review|deep review|concrete check|validation signal";

const EXTERNAL_CHECK_STATUS_KEYS = [
  "externalCheckStatus",
  "validationStatus",
  "checkStatus",
  "reflectionCheckStatus",
] as const;

const EXTERNAL_CHECK_SIGNAL_KEYS = [
  "externalCheck",
  "externalValidation",
  "validationSignal",
  "checkSignal",
  "scoutReview",
  "deepReview",
  "focusedRegression",
  "liveDogfood",
  "validationSignals",
] as const;

const EXTERNAL_CHECK_PROVENANCE_KEYS = [
  "externalCheckCommand",
  "validationCommand",
  "checkCommand",
  "externalCheckArtifact",
  "validationArtifact",
  "checkArtifact",
  "externalCheckEvidence",
  "validationEvidence",
  "checkEvidence",
] as const;

const POSITIVE_CHECK_PATTERN = new RegExp(
  `\\b(${CHECK_SIGNAL_WORDS})\\b[^\\n]{0,80}\\b(passed|pass|succeeded|successful|success|ok|green)\\b|\\b(passed|pass|succeeded|successful|success|ok|green)\\b[^\\n]{0,80}\\b(${CHECK_SIGNAL_WORDS})\\b`,
  "u",
);

const REQUIRED_CHECK_PATTERN = new RegExp(
  `\\b(no|without)\\s+(${CHECK_SIGNAL_WORDS})\\b|\\b(missing|absent|required|needed|pending)\\b[^\\n]{0,80}\\b(${CHECK_SIGNAL_WORDS})\\b|\\b(${CHECK_SIGNAL_WORDS})\\b[^\\n]{0,80}\\b(without|missing|absent|required|needed|pending)\\b`,
  "u",
);

const FAILED_CHECK_PATTERN = new RegExp(
  `\\b(not|failed|fails|failing|blocked|incomplete|not complete|not completed|not passed|did not pass|has not passed)\\b[^\\n]{0,80}\\b(${CHECK_SIGNAL_WORDS})\\b|\\b(${CHECK_SIGNAL_WORDS})\\b[^\\n]{0,80}\\b(not|failed|fails|failing|blocked|incomplete|not complete|not completed|not passed|did not pass|has not passed)\\b`,
  "u",
);

function collectText(options: {
  query?: SelfQuery;
  context: Record<string, unknown>;
  keys: string[];
  includeQuery?: boolean;
}): string {
  const text: string[] = [];
  let totalLength = 0;
  const add = (value: unknown): void => {
    if (totalLength >= TEXT_TOTAL_MAX_LENGTH) return;
    const normalized = normalizeString(value, { maxLength: TEXT_ENTRY_MAX_LENGTH });
    if (!normalized) return;
    text.push(normalized);
    totalLength += normalized.length;
  };
  const addArray = (value: unknown): void => {
    const normalized = normalizeStringArray(value);
    if (!normalized) return;
    for (const entry of normalized.slice(0, ARRAY_ENTRY_LIMIT)) {
      add(entry);
    }
  };

  if (options.includeQuery) add(options.query?.query);
  for (const key of options.keys) {
    add(options.context[key]);
    addArray(options.context[key]);
  }

  return text.join("\n").toLowerCase().slice(0, TEXT_TOTAL_MAX_LENGTH);
}

function isRepeatedFlag(value: unknown): boolean {
  if (value === true) return true;
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return false;
  return /^(true|yes|y|1|repeated|loop|looping)$/u.test(normalized);
}

function normalizeExplicitExternalCheckStatus(value: unknown): ExternalCheckStatus | undefined {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (/^(observed|passed|pass|complete|completed|done|ran|run|present)$/u.test(normalized)) {
    return "observed";
  }
  if (
    /^(required|needed|pending|missing|absent|not_observed|not observed|unknown)$/u.test(normalized)
  ) {
    return normalized === "unknown" ? "unknown" : "required";
  }
  if (/^(failed|fail|failing|blocked|not_passed|not passed|incomplete)$/u.test(normalized)) {
    return "failed";
  }
  return undefined;
}

function collectTextEntries(context: Record<string, unknown>, keys: readonly string[]): string[] {
  const text: string[] = [];
  const add = (value: unknown): void => {
    const normalized = normalizeString(value, { maxLength: TEXT_ENTRY_MAX_LENGTH });
    if (normalized) text.push(normalized);
  };

  for (const key of keys) {
    add(context[key]);
    const entries = normalizeStringArray(context[key]);
    if (entries) {
      for (const entry of entries.slice(0, ARRAY_ENTRY_LIMIT)) add(entry);
    }
  }

  return text.slice(0, ARRAY_ENTRY_LIMIT);
}

function collectExternalCheckStatuses(
  context: Record<string, unknown>,
  keys: readonly string[],
): ExternalCheckStatus[] {
  const statuses: ExternalCheckStatus[] = [];
  const addStatus = (value: unknown): void => {
    const status = normalizeExplicitExternalCheckStatus(value);
    if (status) statuses.push(status);
  };

  for (const key of keys) {
    addStatus(context[key]);
    const entries = normalizeStringArray(context[key]);
    if (entries) {
      for (const entry of entries.slice(0, ARRAY_ENTRY_LIMIT)) addStatus(entry);
    }
  }

  return statuses;
}

function normalizeExternalCheckStatus(context: Record<string, unknown>): ExternalCheckStatus {
  const explicitStatuses = collectExternalCheckStatuses(context, EXTERNAL_CHECK_STATUS_KEYS);
  const signalStatuses = collectExternalCheckStatuses(context, EXTERNAL_CHECK_SIGNAL_KEYS).filter(
    (status) => status !== "observed",
  );
  const statuses = [...explicitStatuses, ...signalStatuses];

  const checkText = collectText({
    context,
    keys: [...EXTERNAL_CHECK_SIGNAL_KEYS],
  });
  const checkTextTrimmed = checkText.trim();
  const exactTextStatus = normalizeExplicitExternalCheckStatus(checkTextTrimmed);
  const exactNonObservedTextStatus = exactTextStatus === "observed" ? undefined : exactTextStatus;
  const hasRequiredText = REQUIRED_CHECK_PATTERN.test(checkText);
  const hasFailedText = FAILED_CHECK_PATTERN.test(checkText);
  const hasPositiveCheckSignal = POSITIVE_CHECK_PATTERN.test(checkText);
  const hasExplicitObserved = explicitStatuses.includes("observed");
  const hasObserved = hasExplicitObserved && hasPositiveCheckSignal;
  const hasRequired =
    statuses.includes("required") || exactNonObservedTextStatus === "required" || hasRequiredText;
  const hasFailed =
    statuses.includes("failed") || exactNonObservedTextStatus === "failed" || hasFailedText;
  const hasUnknown = statuses.includes("unknown") || exactNonObservedTextStatus === "unknown";

  // Fail closed on contradictory caller-controlled check signals. Bare booleans,
  // free-form positive check prose, and generic signal values such as "done" are
  // intentionally insufficient: resolving the guard requires both an explicit
  // observed status field and a named positive check signal.
  if (hasFailed || (hasObserved && (hasRequired || hasUnknown))) return "failed";
  if (hasRequired) return "required";
  if (hasUnknown) return "unknown";
  if (hasObserved) return "observed";
  return "unknown";
}

function buildExternalCheckEvidence(
  context: Record<string, unknown>,
  status: ReflectionGuardStatus,
  sessionEvidence: ReflectionGuardSessionEvidence = {},
): Record<string, unknown> {
  const signalEntries = collectTextEntries(context, EXTERNAL_CHECK_SIGNAL_KEYS);
  const positiveSignal = signalEntries.find((entry) =>
    POSITIVE_CHECK_PATTERN.test(entry.toLowerCase()),
  );
  const contextProvenance = collectTextEntries(context, EXTERNAL_CHECK_PROVENANCE_KEYS);
  const sessionProvenance = (sessionEvidence.validationProvenance ?? [])
    .map((entry) => normalizeString(entry, { maxLength: TEXT_ENTRY_MAX_LENGTH }))
    .filter((entry): entry is string => typeof entry === "string");
  const provenance = [...contextProvenance, ...sessionProvenance].slice(0, ARRAY_ENTRY_LIMIT);
  const missingProvenance = status === "external_check_observed" && provenance.length === 0;

  return {
    positiveSignal,
    provenance,
    missingProvenance,
    closeoutInstruction: missingProvenance
      ? "name the owner-appropriate check command/artifact in closeout; do not rely on reflective status alone"
      : "cite the named positive check signal and any command/artifact provenance in closeout",
  };
}

export function buildReflectionGuard(
  query: SelfQuery | undefined,
  context: Record<string, unknown>,
  sessionEvidence: ReflectionGuardSessionEvidence = {},
): Record<string, unknown> {
  const reflectionText = collectText({
    query,
    context,
    includeQuery: true,
    keys: [
      "reflectionGuard",
      "reflectionStatus",
      "reflectionState",
      "repeatedReflection",
      "repeatedSelfAnalysis",
      "reflectionSignals",
    ],
  });
  const repeatedReflection =
    isRepeatedFlag(context.repeatedReflection) ||
    isRepeatedFlag(context.repeatedSelfAnalysis) ||
    REPEATED_REFLECTION_PATTERN.test(reflectionText);
  const externalCheckStatus = normalizeExternalCheckStatus(context);
  const externalCheckObserved = externalCheckStatus === "observed";
  const status: ReflectionGuardStatus = repeatedReflection
    ? externalCheckObserved
      ? "external_check_observed"
      : "external_check_required"
    : "not_triggered";
  const requiresExternalCheck = status === "external_check_required";
  const reason = repeatedReflection
    ? externalCheckObserved
      ? "repeated self-analysis was named, and an explicit positive external check signal was provided"
      : externalCheckStatus === "failed"
        ? "repeated self-analysis was named, but the external check signal is failed, missing, or negated"
        : "repeated self-analysis was named without an explicit positive external validation signal"
    : "no repeated self-analysis cue was detected";
  const nextAction = (() => {
    switch (status) {
      case "external_check_observed":
        return "state the concrete check signal in closeout and stop further reflection unless new evidence appears";
      case "external_check_required":
        return "run a concrete check, scout/deep review, focused regression, or stop; do not continue recursive analysis as completion evidence";
      case "not_triggered":
        return "continue with the named falsifier and metric; trigger this guard if self-analysis repeats without a check";
    }
  })();

  const externalCheckEvidence = buildExternalCheckEvidence(context, status, sessionEvidence);

  return {
    kind: "self.reflection_guard.v1",
    status,
    externalCheckStatus,
    requiresExternalCheck,
    reason,
    nextAction,
    externalCheckEvidence,
    boundary:
      "mirror-only reflection guard; ASC/self does not launch peers, visible loops, measured campaigns, or write durable owner surfaces",
    nonAuthorizations: [
      "no external-check claim from reflection text alone",
      "no visible-loop, scout/deep-review, or measured-campaign launch from this guard",
      "no AK/evidence/KES/ontology/Prompt Vault/agent_vent mutation from this guard",
      "no completion override while repeated self-analysis lacks a concrete check signal",
    ],
  };
}

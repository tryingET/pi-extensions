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

const TEXT_ENTRY_MAX_LENGTH = 300;
const TEXT_TOTAL_MAX_LENGTH = 4000;
const ARRAY_ENTRY_LIMIT = 16;

const REPEATED_REFLECTION_PATTERN =
  /\b(repeated|again|looping|circular|recursive|philosophical)\b[^\n]{0,80}\b(reflection|self-analysis|self analysis|self-evolution|diagnostic review)\b|\b(reflection|self-analysis|self analysis|self-evolution|diagnostic review)\b[^\n]{0,80}\b(repeated|again|looping|circular|recursive|philosophical)\b/u;

const POSITIVE_CHECK_PATTERN =
  /\b(external check|external validation|focused regression|package check|live dogfood|scout review|deep review|concrete check|validation signal)\b[^\n]{0,80}\b(passed|done|observed|present|complete|completed|available|ran|run)\b|\b(passed|done|observed|present|complete|completed|available|ran|run)\b[^\n]{0,80}\b(external check|external validation|focused regression|package check|live dogfood|scout review|deep review|concrete check|validation signal)\b/u;

const NEGATIVE_CHECK_PATTERN =
  /\b(not|no|without|missing|absent|failed|fails|failing|required|needed|pending|blocked|incomplete|not complete|not completed|not passed|did not pass|has not passed)\b[^\n]{0,80}\b(external check|external validation|focused regression|package check|live dogfood|scout review|deep review|concrete check|validation signal)\b|\b(external check|external validation|focused regression|package check|live dogfood|scout review|deep review|concrete check|validation signal)\b[^\n]{0,80}\b(not|no|without|missing|absent|failed|fails|failing|required|needed|pending|blocked|incomplete|not complete|not completed|not passed|did not pass|has not passed)\b/u;

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

function normalizeExternalCheckStatus(context: Record<string, unknown>): ExternalCheckStatus {
  const explicitStatus =
    normalizeExplicitExternalCheckStatus(context.externalCheckStatus) ||
    normalizeExplicitExternalCheckStatus(context.validationStatus) ||
    normalizeExplicitExternalCheckStatus(context.checkStatus) ||
    normalizeExplicitExternalCheckStatus(context.reflectionCheckStatus);
  if (explicitStatus) return explicitStatus;

  for (const key of [
    "externalCheck",
    "externalValidation",
    "validationSignal",
    "checkSignal",
    "scoutReview",
    "deepReview",
    "focusedRegression",
    "liveDogfood",
  ]) {
    if (context[key] === true) return "observed";
  }

  const checkText = collectText({
    context,
    keys: [
      "externalCheck",
      "externalValidation",
      "validationSignal",
      "checkSignal",
      "scoutReview",
      "deepReview",
      "focusedRegression",
      "liveDogfood",
      "validationSignals",
    ],
  });
  if (NEGATIVE_CHECK_PATTERN.test(checkText)) return "failed";
  if (POSITIVE_CHECK_PATTERN.test(checkText)) return "observed";
  return "unknown";
}

export function buildReflectionGuard(
  query: SelfQuery | undefined,
  context: Record<string, unknown>,
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

  return {
    kind: "self.reflection_guard.v1",
    status,
    externalCheckStatus,
    requiresExternalCheck,
    reason,
    nextAction,
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

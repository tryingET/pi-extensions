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

function contextTextIncludes(
  query: SelfQuery | undefined,
  context: Record<string, unknown>,
  pattern: RegExp,
): boolean {
  const text: string[] = [];
  const add = (value: unknown): void => {
    const normalized = normalizeString(value);
    if (normalized) text.push(normalized);
  };
  const addArray = (value: unknown): void => {
    const normalized = normalizeStringArray(value);
    if (normalized) text.push(...normalized);
  };

  add(query?.query);
  add(context.reflectionGuard);
  add(context.reflectionStatus);
  add(context.reflectionState);
  add(context.repeatedReflection);
  add(context.repeatedSelfAnalysis);
  add(context.externalCheck);
  add(context.externalValidation);
  add(context.validationSignal);
  add(context.checkSignal);
  add(context.scoutReview);
  add(context.deepReview);
  add(context.focusedRegression);
  add(context.liveDogfood);
  addArray(context.reflectionSignals);
  addArray(context.validationSignals);

  return pattern.test(text.join("\n").toLowerCase());
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return false;
  return /^(true|yes|y|1|required|observed|present|repeated|loop|looping)$/u.test(normalized);
}

export function buildReflectionGuard(
  query: SelfQuery | undefined,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const repeatedReflection =
    isTruthyFlag(context.repeatedReflection) ||
    isTruthyFlag(context.repeatedSelfAnalysis) ||
    contextTextIncludes(
      query,
      context,
      /\b(repeated|again|looping|circular|recursive|philosophical)\b[^\n]{0,80}\b(reflection|self-analysis|self analysis|self-evolution|diagnostic review)\b|\b(reflection|self-analysis|self analysis|self-evolution|diagnostic review)\b[^\n]{0,80}\b(repeated|again|looping|circular|recursive|philosophical)\b/u,
    );
  const externalCheckObserved =
    isTruthyFlag(context.externalCheck) ||
    isTruthyFlag(context.externalValidation) ||
    isTruthyFlag(context.validationSignal) ||
    isTruthyFlag(context.checkSignal) ||
    isTruthyFlag(context.scoutReview) ||
    isTruthyFlag(context.deepReview) ||
    isTruthyFlag(context.focusedRegression) ||
    isTruthyFlag(context.liveDogfood) ||
    contextTextIncludes(
      query,
      context,
      /\b(external check|external validation|focused regression|package check|live dogfood|scout review|deep review|concrete check|validation signal)\b[^\n]{0,80}\b(passed|done|observed|present|complete|completed|available|ran|run)\b|\b(passed|done|observed|present|complete|completed|available|ran|run)\b[^\n]{0,80}\b(external check|external validation|focused regression|package check|live dogfood|scout review|deep review|concrete check|validation signal)\b/u,
    );
  const status: ReflectionGuardStatus = repeatedReflection
    ? externalCheckObserved
      ? "external_check_observed"
      : "external_check_required"
    : "not_triggered";
  const requiresExternalCheck = status === "external_check_required";
  const reason = repeatedReflection
    ? externalCheckObserved
      ? "repeated self-analysis was named, but an external check signal was also provided"
      : "repeated self-analysis was named without an external validation signal"
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

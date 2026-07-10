/** Tier resolution policy for the ASC live-runtime proof guard. */

import { normalizeString } from "../edge-contract-kernel.ts";
import { ASC_RUNTIME_PACKAGE_NAME } from "../live-runtime-proof-ledger.ts";
import type { SelfQuery } from "../types.ts";
import {
  anyEntryMatches,
  collectContextEvidenceEntries,
  collectExplicitStatuses,
  collectSessionEvidenceEntries,
  collectTextEntries,
  evidenceMatchesOwner,
  evidenceOrderToken,
  evidenceOrderTokenKind,
  firstMatchingEntry,
  normalizeNumber,
} from "./live-runtime-proof-evidence.ts";
import type {
  LiveRuntimeSessionEvidence,
  LiveRuntimeTierStatus,
  OwnerBindingStatus,
  ProofSequenceStatus,
  TierName,
  TierSpec,
} from "./live-runtime-proof-types.ts";

const TEXT_ENTRY_MAX_LENGTH = 500;
const ARRAY_ENTRY_LIMIT = 16;

export function resolveTier(
  context: Record<string, unknown>,
  spec: TierSpec,
  sessionEvidence: LiveRuntimeSessionEvidence,
  expectedPackageName: string,
): Record<string, unknown> {
  const explicitStatuses = collectExplicitStatuses(context, spec.statusKeys);
  const signalEntries = collectTextEntries(context, spec.signalKeys);
  const contextEvidenceEntries = collectContextEvidenceEntries(context, spec).filter((entry) =>
    spec.provenancePattern.test(entry.text.toLowerCase()),
  );
  const sessionEvidenceEntries = collectSessionEvidenceEntries(spec, sessionEvidence).filter(
    (entry) => spec.provenancePattern.test(entry.text.toLowerCase()),
  );
  const evidenceEntries = [
    ...contextEvidenceEntries.slice(0, ARRAY_ENTRY_LIMIT / 2),
    ...sessionEvidenceEntries.slice(0, ARRAY_ENTRY_LIMIT / 2),
  ].slice(0, ARRAY_ENTRY_LIMIT);
  const positiveSignal = firstMatchingEntry(signalEntries, spec.positivePattern);
  const positiveEvidence = evidenceEntries.find((entry) =>
    spec.positivePattern.test(entry.text.toLowerCase()),
  );
  const hasPositiveSignal = Boolean(positiveSignal || positiveEvidence);
  const hasProvenance = evidenceEntries.length > 0;
  const ownerBoundEvidence = spec.ownerBound
    ? evidenceEntries.filter((entry) => evidenceMatchesOwner(entry, expectedPackageName))
    : evidenceEntries;
  const ownerBindingStatus: OwnerBindingStatus = !spec.ownerBound
    ? "observed"
    : !hasProvenance
      ? "unknown"
      : ownerBoundEvidence.length > 0
        ? "observed"
        : "failed";
  const trustedObservedEvidenceEntry = evidenceEntries.find(
    (entry) =>
      entry.status === "observed" &&
      (entry.origin === "session_proof_ledger" ||
        (spec.name === "reload" && entry.origin === "session_lifecycle")),
  );
  const callerObservedStatus = explicitStatuses.includes("observed");
  const trustedObservedEvidence = Boolean(trustedObservedEvidenceEntry);
  const callerObservationAllowed = spec.name === "reload" && callerObservedStatus;
  const orderedEvidence = trustedObservedEvidenceEntry
    ? trustedObservedEvidenceEntry
    : callerObservationAllowed
      ? ownerBoundEvidence.find((entry) => evidenceOrderToken(entry) !== undefined)
      : undefined;
  const orderToken = orderedEvidence ? evidenceOrderToken(orderedEvidence) : undefined;
  const orderTokenKind = orderedEvidence ? evidenceOrderTokenKind(orderedEvidence) : undefined;
  const hasObserved =
    (trustedObservedEvidence || callerObservationAllowed) &&
    hasPositiveSignal &&
    hasProvenance &&
    ownerBindingStatus === "observed";
  const hasRequired =
    explicitStatuses.includes("required") || anyEntryMatches(signalEntries, spec.requiredPattern);
  const hasFailed =
    explicitStatuses.includes("failed") ||
    ownerBindingStatus === "failed" ||
    anyEntryMatches(signalEntries, spec.failedPattern);
  const hasUnknown = explicitStatuses.includes("unknown");

  const status: LiveRuntimeTierStatus = (() => {
    if (hasFailed || (hasObserved && (hasRequired || hasUnknown))) return "failed";
    if (hasRequired) return "required";
    if (hasUnknown) return "unknown";
    if (hasObserved) return "observed";
    return "unknown";
  })();

  return {
    status,
    positiveSignal: positiveSignal ?? positiveEvidence?.text,
    provenance: evidenceEntries.map((entry) => entry.text),
    provenanceOrigins: evidenceEntries.map((entry) => entry.origin),
    ownerBindingStatus,
    orderToken,
    orderTokenKind,
    missingProvenance: explicitStatuses.includes("observed") && hasPositiveSignal && !hasProvenance,
    nextAction: status === "observed" ? "cite this tier's signal and provenance" : spec.nextAction,
  };
}

export function isExplicitLiveBehaviorClaim(value: unknown): boolean {
  if (value === true) return true;
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return false;
  return /^(true|yes|y|1|claimed|claim|active|live|prove|proof)$/u.test(normalized);
}

export function detectsLiveBehaviorClaim(
  query: SelfQuery | undefined,
  context: Record<string, unknown>,
): boolean {
  if (
    isExplicitLiveBehaviorClaim(context.liveBehaviorClaim) ||
    isExplicitLiveBehaviorClaim(context.activeRuntimeBehaviorClaim) ||
    isExplicitLiveBehaviorClaim(context.liveRuntimeClaim)
  ) {
    return true;
  }

  const text = [
    normalizeString(query?.query, { maxLength: TEXT_ENTRY_MAX_LENGTH }),
    normalizeString(context.summary, { maxLength: TEXT_ENTRY_MAX_LENGTH }),
    normalizeString(context.claim, { maxLength: TEXT_ENTRY_MAX_LENGTH }),
    normalizeString(context.objective, { maxLength: TEXT_ENTRY_MAX_LENGTH }),
    normalizeString(context.currentObjective, { maxLength: TEXT_ENTRY_MAX_LENGTH }),
    normalizeString(context.task, { maxLength: TEXT_ENTRY_MAX_LENGTH }),
    normalizeString(context.result, { maxLength: TEXT_ENTRY_MAX_LENGTH }),
    normalizeString(context.closeout, { maxLength: TEXT_ENTRY_MAX_LENGTH }),
  ]
    .filter((entry): entry is string => typeof entry === "string")
    .join("\n")
    .toLowerCase();

  return /\b(active|live|post[- ]reload|after reload)\b[^\n]{0,80}\b(self|runtime|behavior|behaviour|dogfood|extension)\b|\b(self|runtime|behavior|behaviour|dogfood|extension)\b[^\n]{0,80}\b(active|live|post[- ]reload|after reload)\b/u.test(
    text,
  );
}

export const TIER_SPECS: TierSpec[] = [
  {
    name: "packageCheck",
    statusKeys: ["packageCheckStatus", "packageValidationStatus"],
    signalKeys: ["packageCheck", "packageValidation", "validationSignal", "externalValidation"],
    provenanceKeys: ["packageCheckCommand", "validationCommand", "packageCheckArtifact"],
    positivePattern:
      /\b(package check|package validation|focused regression|npm run check|npm run quality:ci|node --test)\b[^\n]{0,100}\b(passed|pass|succeeded|successful|success|ok|green)\b|\b(passed|pass|succeeded|successful|success|ok|green)\b[^\n]{0,100}\b(package check|package validation|focused regression|npm run check|npm run quality:ci|node --test)\b/u,
    provenancePattern:
      /\b(npm\s+run\s+(?:check|quality:ci)|node\s+--test|package check|focused regression|validation command)\b/u,
    requiredPattern:
      /\b(package check|package validation|focused regression)\b[^\n]{0,80}\b(required|needed|pending|missing|absent)\b|\b(required|needed|pending|missing|absent)\b[^\n]{0,80}\b(package check|package validation|focused regression)\b/u,
    failedPattern:
      /\b(package check|package validation|focused regression)\b[^\n]{0,80}\b(failed|failing|blocked|incomplete|not passed)\b|\b(failed|failing|blocked|incomplete|not passed)\b[^\n]{0,80}\b(package check|package validation|focused regression)\b/u,
    nextAction: "run the focused regression/package check and cite the command or artifact",
    ownerBound: true,
  },
  {
    name: "install",
    statusKeys: ["installStatus", "piInstallStatus"],
    signalKeys: ["installSignal", "piInstall", "installCheck"],
    provenanceKeys: ["installCommand", "piInstallCommand", "installArtifact"],
    positivePattern:
      /\b(pi install|package install|local install)\b[^\n]{0,100}\b(passed|pass|succeeded|successful|success|ok|complete|completed)\b|\b(passed|pass|succeeded|successful|success|ok|complete|completed)\b[^\n]{0,100}\b(pi install|package install|local install)\b/u,
    provenancePattern: /\bpi\s+install\b|\bpackage install\b|\blocal install\b/u,
    requiredPattern:
      /\b(pi install|package install|local install)\b[^\n]{0,80}\b(required|needed|pending|missing|absent)\b|\b(required|needed|pending|missing|absent)\b[^\n]{0,80}\b(pi install|package install|local install)\b/u,
    failedPattern:
      /\b(pi install|package install|local install)\b[^\n]{0,80}\b(failed|failing|blocked|incomplete|not passed)\b|\b(failed|failing|blocked|incomplete|not passed)\b[^\n]{0,80}\b(pi install|package install|local install)\b/u,
    nextAction:
      "install the package into Pi from the owning package path and cite the install receipt",
    ownerBound: true,
  },
  {
    name: "reload",
    statusKeys: ["reloadStatus", "piReloadStatus"],
    signalKeys: ["reloadSignal", "piReload", "reloadCheck"],
    provenanceKeys: ["reloadCommand", "piReloadCommand", "reloadArtifact"],
    positivePattern:
      /(?:^|[\s;&|])(\/reload|pi\s+reload|operator\s+reload|reload)\b[^\n]{0,100}\b(passed|pass|succeeded|successful|success|ok|complete|completed|observed)\b|\b(passed|pass|succeeded|successful|success|ok|complete|completed|observed)\b[^\n]{0,100}(?:^|[\s;&|])(\/reload|pi\s+reload|operator\s+reload|reload)\b/u,
    provenancePattern:
      /(?:^|[\s;&|])(\/reload|pi\s+reload|operator\s+reload|reload\s+receipt)(?=$|[\s;&|])/u,
    requiredPattern:
      /(?:^|[\s;&|])(\/reload|pi\s+reload|operator\s+reload|reload)\b[^\n]{0,80}\b(required|needed|pending|missing|absent)\b|\b(required|needed|pending|missing|absent)\b[^\n]{0,80}(?:^|[\s;&|])(\/reload|pi\s+reload|operator\s+reload|reload)\b/u,
    failedPattern:
      /(?:^|[\s;&|])(\/reload|pi\s+reload|operator\s+reload|reload)\b[^\n]{0,80}\b(failed|failing|blocked|incomplete|not passed)\b|\b(failed|failing|blocked|incomplete|not passed)\b[^\n]{0,80}(?:^|[\s;&|])(\/reload|pi\s+reload|operator\s+reload|reload)\b/u,
    nextAction: "reload Pi through the operator-visible /reload path and cite the reload receipt",
    ownerBound: false,
  },
  {
    name: "postReloadDogfood",
    statusKeys: ["postReloadDogfoodStatus", "liveDogfoodStatus"],
    signalKeys: ["postReloadDogfood", "liveDogfood", "dogfoodSignal"],
    provenanceKeys: ["postReloadDogfoodCommand", "liveDogfoodCommand", "dogfoodArtifact"],
    positivePattern:
      /\b(post[- ]reload dogfood|live dogfood|post[- ]reload self|self dogfood)\b[^\n]{0,100}\b(passed|pass|succeeded|successful|success|ok|green)\b|\b(passed|pass|succeeded|successful|success|ok|green)\b[^\n]{0,100}\b(post[- ]reload dogfood|live dogfood|post[- ]reload self|self dogfood)\b/u,
    provenancePattern:
      /\bpost[- ]reload dogfood\b|\blive dogfood\b|\bself\b.*\bdogfood\b|\bdogfood\b.*\bself\b/u,
    requiredPattern:
      /\b(post[- ]reload dogfood|live dogfood|post[- ]reload self|self dogfood)\b[^\n]{0,80}\b(required|needed|pending|missing|absent)\b|\b(required|needed|pending|missing|absent)\b[^\n]{0,80}\b(post[- ]reload dogfood|live dogfood|post[- ]reload self|self dogfood)\b/u,
    failedPattern:
      /\b(post[- ]reload dogfood|live dogfood|post[- ]reload self|self dogfood)\b[^\n]{0,80}\b(failed|failing|blocked|incomplete|not passed)\b|\b(failed|failing|blocked|incomplete|not passed)\b[^\n]{0,80}\b(post[- ]reload dogfood|live dogfood|post[- ]reload self|self dogfood)\b/u,
    nextAction: "run a real post-reload self dogfood query and cite the query/receipt",
    ownerBound: true,
  },
];

export function resolveExpectedPackageName(_context: Record<string, unknown>): string {
  // Runtime ownership is package-defined. Caller context may describe a target,
  // but it cannot redefine which package owns the active `self` extension.
  return ASC_RUNTIME_PACKAGE_NAME;
}

export function resolveSequenceStatus(tiers: Record<TierName, Record<string, unknown>>): {
  status: ProofSequenceStatus;
  reason: string;
} {
  const orderedNames: TierName[] = ["packageCheck", "install", "reload", "postReloadDogfood"];
  const tokens = orderedNames.map((name) => ({
    name,
    token: normalizeNumber(tiers[name].orderToken),
    tokenKind: normalizeString(tiers[name].orderTokenKind),
  }));
  if (tokens.some((entry) => entry.token === undefined || !entry.tokenKind)) {
    return {
      status: "unknown",
      reason: "ordered proof receipts are missing for one or more live-runtime tiers",
    };
  }
  const tokenKinds = new Set(tokens.map((entry) => entry.tokenKind));
  if (tokenKinds.size > 1) {
    return {
      status: "unknown",
      reason:
        "ordered proof receipts use mixed order-token domains; provide a single sequence or timestamp domain for all tiers",
    };
  }
  for (let index = 1; index < tokens.length; index++) {
    const previous = tokens[index - 1];
    const current = tokens[index];
    if ((previous.token ?? 0) >= (current.token ?? 0)) {
      return {
        status: "failed",
        reason: `${previous.name} must be observed before ${current.name}`,
      };
    }
  }
  return {
    status: "observed",
    reason: "proof tiers are ordered package-check -> install -> reload -> post-reload dogfood",
  };
}

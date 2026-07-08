/**
 * Mirror-only live-runtime proof guard for ASC/self diagnostic closeout.
 *
 * Package checks, local install receipts, Pi reload, and post-reload self dogfood
 * are separate trust tiers. This guard makes overclaim risk visible without
 * running reloads, launching tools, or writing durable owner surfaces.
 */

import { normalizeString, normalizeStringArray } from "../edge-contract-kernel.ts";
import type { SelfQuery } from "../types.ts";

type TierName = "packageCheck" | "install" | "reload" | "postReloadDogfood";
type LiveRuntimeTierStatus = "observed" | "required" | "failed" | "unknown";
type ProofSequenceStatus = "observed" | "required" | "failed" | "unknown";
type OwnerBindingStatus = "observed" | "failed" | "unknown";
type EvidenceInput = string | Record<string, unknown>;
type EvidenceOrigin =
  | "caller_context"
  | "session_command"
  | "session_validation"
  | "session_lifecycle";

interface LiveRuntimeSessionEvidence {
  commandProvenance?: EvidenceInput[];
  validationProvenance?: EvidenceInput[];
  lifecycleProvenance?: EvidenceInput[];
}

interface TierSpec {
  name: TierName;
  statusKeys: readonly string[];
  signalKeys: readonly string[];
  provenanceKeys: readonly string[];
  positivePattern: RegExp;
  provenancePattern: RegExp;
  requiredPattern: RegExp;
  failedPattern: RegExp;
  nextAction: string;
  ownerBound: boolean;
}

interface EvidenceEntry {
  text: string;
  source: string;
  origin: EvidenceOrigin;
  tier?: string;
  packageName?: string;
  observedAt?: number;
  sequence?: number;
  status?: LiveRuntimeTierStatus;
}

const TEXT_ENTRY_MAX_LENGTH = 500;
const ARRAY_ENTRY_LIMIT = 16;

function collectTextEntries(context: Record<string, unknown>, keys: readonly string[]): string[] {
  const text: string[] = [];
  const add = (value: unknown): void => {
    const normalized = normalizeString(value, { maxLength: TEXT_ENTRY_MAX_LENGTH });
    if (normalized) text.push(normalized);
  };

  for (const key of keys) {
    add(context[key]);
    const entries = normalizeStringArray(valueToArray(context[key]));
    if (entries) {
      for (const entry of entries.slice(0, ARRAY_ENTRY_LIMIT)) add(entry);
    }
  }

  return text.slice(0, ARRAY_ENTRY_LIMIT);
}

function valueToArray(value: unknown): unknown {
  return Array.isArray(value) ? value : undefined;
}

function normalizeExplicitTierStatus(value: unknown): LiveRuntimeTierStatus | undefined {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (/^(observed|passed|pass|complete|completed|done|ran|run|present)$/u.test(normalized)) {
    return "observed";
  }
  if (/^(required|needed|pending|missing|absent|not_observed|not observed)$/u.test(normalized)) {
    return "required";
  }
  if (/^(failed|fail|failing|blocked|not_passed|not passed|incomplete)$/u.test(normalized)) {
    return "failed";
  }
  if (/^unknown$/u.test(normalized)) return "unknown";
  return undefined;
}

function collectExplicitStatuses(
  context: Record<string, unknown>,
  keys: readonly string[],
): LiveRuntimeTierStatus[] {
  const statuses: LiveRuntimeTierStatus[] = [];
  for (const key of keys) {
    const status = normalizeExplicitTierStatus(context[key]);
    if (status) statuses.push(status);
    const entries = normalizeStringArray(valueToArray(context[key]));
    if (entries) {
      for (const entry of entries.slice(0, ARRAY_ENTRY_LIMIT)) {
        const entryStatus = normalizeExplicitTierStatus(entry);
        if (entryStatus) statuses.push(entryStatus);
      }
    }
  }
  return statuses;
}

function anyEntryMatches(entries: readonly string[], pattern: RegExp): boolean {
  return entries.some((entry) => pattern.test(entry.toLowerCase()));
}

function firstMatchingEntry(entries: readonly string[], pattern: RegExp): string | undefined {
  return entries.find((entry) => pattern.test(entry.toLowerCase()));
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = normalizeString(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeEvidenceInput(
  value: unknown,
  source: string,
  origin: EvidenceOrigin,
): EvidenceEntry | undefined {
  if (typeof value === "string") {
    const text = normalizeString(value, { maxLength: TEXT_ENTRY_MAX_LENGTH });
    return text ? { text, source, origin } : undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const text =
    normalizeString(input.text, { maxLength: TEXT_ENTRY_MAX_LENGTH }) ||
    normalizeString(input.command, { maxLength: TEXT_ENTRY_MAX_LENGTH }) ||
    normalizeString(input.artifact, { maxLength: TEXT_ENTRY_MAX_LENGTH }) ||
    normalizeString(input.provenance, { maxLength: TEXT_ENTRY_MAX_LENGTH }) ||
    normalizeString(input.receipt, { maxLength: TEXT_ENTRY_MAX_LENGTH });
  if (!text) return undefined;
  return {
    text,
    source: normalizeString(input.source, { maxLength: 80 }) || source,
    origin,
    tier: normalizeString(input.tier, { maxLength: 80 }),
    packageName: normalizeString(input.packageName, { maxLength: 160 }),
    observedAt: normalizeNumber(input.observedAt) ?? normalizeNumber(input.timestamp),
    sequence: normalizeNumber(input.sequence) ?? normalizeNumber(input.order),
    status: normalizeExplicitTierStatus(input.status),
  };
}

function collectEvidenceArray(
  value: unknown,
  source: string,
  origin: EvidenceOrigin,
): EvidenceEntry[] {
  if (!Array.isArray(value)) {
    const entry = normalizeEvidenceInput(value, source, origin);
    return entry ? [entry] : [];
  }
  return value
    .slice(0, ARRAY_ENTRY_LIMIT)
    .map((entry) => normalizeEvidenceInput(entry, source, origin))
    .filter((entry): entry is EvidenceEntry => Boolean(entry));
}

function collectContextEvidenceEntries(
  context: Record<string, unknown>,
  spec: TierSpec,
): EvidenceEntry[] {
  const observedAt = normalizeNumber(context[`${spec.name}ObservedAt`]);
  const sequence = normalizeNumber(context[`${spec.name}Sequence`]);
  const directEntries = spec.provenanceKeys.flatMap((key) =>
    collectEvidenceArray(context[key], `context.${key}`, "caller_context").map((entry) => ({
      ...entry,
      tier: entry.tier ?? spec.name,
      observedAt: entry.observedAt ?? observedAt,
      sequence: entry.sequence ?? sequence,
    })),
  );
  const receiptEntries = collectEvidenceArray(
    context.liveRuntimeProofReceipts,
    "context.receipt",
    "caller_context",
  )
    .filter((entry) => entry.tier === spec.name)
    .map((entry) => ({
      ...entry,
      observedAt: entry.observedAt ?? observedAt,
      sequence: entry.sequence ?? sequence,
    }));
  return [...directEntries, ...receiptEntries].slice(0, ARRAY_ENTRY_LIMIT);
}

function collectSessionEvidenceEntries(
  spec: TierSpec,
  sessionEvidence: LiveRuntimeSessionEvidence,
): EvidenceEntry[] {
  const commandEntries = collectEvidenceArray(
    sessionEvidence.commandProvenance,
    "session.command",
    "session_command",
  );
  const validationEntries =
    spec.name === "packageCheck"
      ? collectEvidenceArray(
          sessionEvidence.validationProvenance,
          "session.validation",
          "session_validation",
        )
      : [];
  const lifecycleEntries =
    spec.name === "reload"
      ? collectEvidenceArray(
          sessionEvidence.lifecycleProvenance,
          "session.lifecycle",
          "session_lifecycle",
        )
      : [];
  return [...commandEntries, ...validationEntries, ...lifecycleEntries].slice(0, ARRAY_ENTRY_LIMIT);
}

function packageNamePattern(packageName: string): RegExp {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[/@\\s])${escaped}(?:$|[/\\s])`, "iu");
}

function evidenceMatchesOwner(entry: EvidenceEntry, expectedPackageName: string): boolean {
  if (entry.packageName === expectedPackageName) return true;
  return packageNamePattern(expectedPackageName).test(entry.text);
}

function evidenceOrderToken(entry: EvidenceEntry): number | undefined {
  return entry.sequence ?? entry.observedAt;
}

function evidenceOrderTokenKind(entry: EvidenceEntry): "sequence" | "observedAt" | undefined {
  if (entry.sequence !== undefined) return "sequence";
  if (entry.observedAt !== undefined) return "observedAt";
  return undefined;
}

function resolveTier(
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
      spec.name === "reload" && entry.origin === "session_lifecycle" && entry.status === "observed",
  );
  const callerObservedStatus = explicitStatuses.includes("observed");
  const trustedObservedEvidence = Boolean(trustedObservedEvidenceEntry);
  const orderedEvidence =
    trustedObservedEvidenceEntry && !callerObservedStatus
      ? trustedObservedEvidenceEntry
      : ownerBoundEvidence.find((entry) => evidenceOrderToken(entry) !== undefined);
  const orderToken = orderedEvidence ? evidenceOrderToken(orderedEvidence) : undefined;
  const orderTokenKind = orderedEvidence ? evidenceOrderTokenKind(orderedEvidence) : undefined;
  const hasObserved =
    (callerObservedStatus || trustedObservedEvidence) &&
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

function isExplicitLiveBehaviorClaim(value: unknown): boolean {
  if (value === true) return true;
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return false;
  return /^(true|yes|y|1|claimed|claim|active|live|prove|proof)$/u.test(normalized);
}

function detectsLiveBehaviorClaim(
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

const TIER_SPECS: TierSpec[] = [
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

function resolveExpectedPackageName(context: Record<string, unknown>): string {
  return (
    normalizeString(context.packageName, { maxLength: 160 }) ||
    normalizeString(context.package, { maxLength: 160 }) ||
    normalizeString(context.owner, { maxLength: 160 }) ||
    "pi-autonomous-session-control"
  );
}

function resolveSequenceStatus(tiers: Record<TierName, Record<string, unknown>>): {
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

export function buildLiveRuntimeProofGuard(
  query: SelfQuery | undefined,
  context: Record<string, unknown>,
  sessionEvidence: LiveRuntimeSessionEvidence = {},
): Record<string, unknown> {
  const expectedPackageName = resolveExpectedPackageName(context);
  const tiers = Object.fromEntries(
    TIER_SPECS.map((spec) => [
      spec.name,
      resolveTier(context, spec, sessionEvidence, expectedPackageName),
    ]),
  ) as Record<TierName, Record<string, unknown>>;
  const liveBehaviorClaimed = detectsLiveBehaviorClaim(query, context);
  const missingTiers = TIER_SPECS.filter((spec) => tiers[spec.name].status !== "observed").map(
    (spec) => spec.name,
  );
  const failedTiers = TIER_SPECS.filter((spec) => tiers[spec.name].status === "failed").map(
    (spec) => spec.name,
  );
  const ownerBindingFailures = TIER_SPECS.filter(
    (spec) => spec.ownerBound && tiers[spec.name].ownerBindingStatus === "failed",
  ).map((spec) => spec.name);
  const sequence = resolveSequenceStatus(tiers);
  const liveBehaviorClaimAllowed =
    missingTiers.length === 0 &&
    failedTiers.length === 0 &&
    ownerBindingFailures.length === 0 &&
    sequence.status === "observed";
  const requiredBeforeCompletion = liveBehaviorClaimed && !liveBehaviorClaimAllowed;
  const nextAction = (() => {
    if (liveBehaviorClaimAllowed) {
      return "cite ordered package-check, install, reload, and post-reload self dogfood receipts before claiming active runtime behavior";
    }
    if (ownerBindingFailures.length > 0) {
      return `rerun proof for the owning package (${expectedPackageName}); wrong-owner receipts do not prove active behavior`;
    }
    if (missingTiers.length === 0 && sequence.status !== "observed") {
      return "provide ordered proof receipts showing package check before install before reload before post-reload self dogfood";
    }
    const nextMissing = missingTiers[0];
    const spec = TIER_SPECS.find((entry) => entry.name === nextMissing);
    return (
      spec?.nextAction ??
      "complete the missing live-runtime proof tier before claiming active behavior"
    );
  })();

  return {
    kind: "self.live_runtime_proof_guard.v1",
    liveBehaviorClaimed,
    liveBehaviorClaimAllowed,
    requiredBeforeCompletion,
    expectedPackageName,
    packageCheckStatus: tiers.packageCheck.status,
    installStatus: tiers.install.status,
    reloadStatus: tiers.reload.status,
    postReloadDogfoodStatus: tiers.postReloadDogfood.status,
    ownerBindingFailures,
    proofSequenceStatus: sequence.status,
    proofSequenceReason: sequence.reason,
    missingTiers,
    failedTiers,
    tiers,
    nextAction,
    boundary:
      "mirror-only live-runtime proof guard; ASC/self does not install packages, reload Pi, launch dogfood, or write durable owner surfaces",
    nonAuthorizations: [
      "no active-runtime claim from package checks, install receipts, reload prose, or caller text alone",
      "no active-runtime claim from wrong-owner or unordered proof receipts",
      "no pi install or /reload execution from diagnostic/self-evolution queries",
      "no hidden post-reload dogfood launch from this guard",
      "no AK/evidence/KES/ontology/Prompt Vault/agent_vent mutation from this guard",
    ],
  };
}

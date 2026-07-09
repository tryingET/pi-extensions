/** Evidence collection helpers for the ASC live-runtime proof guard. */

import { normalizeString, normalizeStringArray } from "../edge-contract-kernel.ts";
import type {
  EvidenceEntry,
  EvidenceOrigin,
  LiveRuntimeSessionEvidence,
  LiveRuntimeTierStatus,
  TierSpec,
} from "./live-runtime-proof-types.ts";

const TEXT_ENTRY_MAX_LENGTH = 500;
const ARRAY_ENTRY_LIMIT = 16;

export function collectTextEntries(
  context: Record<string, unknown>,
  keys: readonly string[],
): string[] {
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

export function valueToArray(value: unknown): unknown {
  return Array.isArray(value) ? value : undefined;
}

export function normalizeExplicitTierStatus(value: unknown): LiveRuntimeTierStatus | undefined {
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

export function collectExplicitStatuses(
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

export function anyEntryMatches(entries: readonly string[], pattern: RegExp): boolean {
  return entries.some((entry) => pattern.test(entry.toLowerCase()));
}

export function firstMatchingEntry(
  entries: readonly string[],
  pattern: RegExp,
): string | undefined {
  return entries.find((entry) => pattern.test(entry.toLowerCase()));
}

export function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = normalizeString(value);
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeEvidenceInput(
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

export function collectEvidenceArray(
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

export function collectContextEvidenceEntries(
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

export function collectSessionEvidenceEntries(
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

export function packageNamePattern(packageName: string): RegExp {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:^|[/@\\s])${escaped}(?:$|[/\\s])`, "iu");
}

export function evidenceMatchesOwner(entry: EvidenceEntry, expectedPackageName: string): boolean {
  if (entry.packageName === expectedPackageName) return true;
  return packageNamePattern(expectedPackageName).test(entry.text);
}

export function evidenceOrderToken(entry: EvidenceEntry): number | undefined {
  return entry.sequence ?? entry.observedAt;
}

export function evidenceOrderTokenKind(
  entry: EvidenceEntry,
): "sequence" | "observedAt" | undefined {
  if (entry.sequence !== undefined) return "sequence";
  if (entry.observedAt !== undefined) return "observedAt";
  return undefined;
}

// ---
// summary: normalize metadata-only compaction quality and recall telemetry events.
// read_when:
//   - emitting or changing compaction quality/recall metrics.
// ---
import {
  type CompactionQualityMode,
  type CompactionQualityTelemetryEvent,
  type CompactionRecallMode,
  type CompactionRecallScope,
  type CompactionRecallTelemetryEvent,
  TELEMETRY_SCHEMA_VERSION,
} from "./events.ts";

const QUALITY_MODES = new Set<CompactionQualityMode>([
  "model",
  "deterministic_fallback",
  "deterministic_repair",
  "minimal_emergency",
  "other",
]);
const RECALL_SCOPES = new Set<CompactionRecallScope>(["lineage", "all", "degraded"]);
const RECALL_MODES = new Set<CompactionRecallMode>(["hybrid", "files", "failures", "commands"]);
const MAX_COUNTER = 1_000_000_000;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_SESSION_ID_CHARS = 160;

function counter(value: unknown, max = MAX_COUNTER): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(0, Math.floor(value)))
    : 0;
}

function optionalDuration(value: unknown): { durationMs?: number } {
  return typeof value === "number" && Number.isFinite(value)
    ? { durationMs: counter(value, MAX_DURATION_MS) }
    : {};
}

function sessionId(value: unknown): { sessionId?: string } {
  if (typeof value !== "string" || !value.trim()) return {};
  const basename = value.trim().replace(/\\/gu, "/").split("/").pop()?.trim();
  return basename ? { sessionId: basename.slice(0, MAX_SESSION_ID_CHARS) } : {};
}

export interface CompactionQualityInput {
  mode?: unknown;
  validationOk?: unknown;
  fallback?: unknown;
  repaired?: unknown;
  splitTurn?: unknown;
  summaryChars?: unknown;
  compactedMessages?: unknown;
  selectedMessages?: unknown;
  omittedMessages?: unknown;
  omittedManagedRecords?: unknown;
  omittedManagedBlocks?: unknown;
  continuityRecords?: unknown;
  evidenceAnchors?: unknown;
  redactions?: unknown;
  truncatedRecords?: unknown;
  inputTokenBudget?: unknown;
  finalTokenBudget?: unknown;
  worktreeVerified?: unknown;
  durationMs?: unknown;
  sessionId?: unknown;
  ts?: unknown;
}

export interface CompactionRecallInput {
  scope?: unknown;
  mode?: unknown;
  queryTokens?: unknown;
  sourceEntries?: unknown;
  sourceEntriesOmitted?: unknown;
  candidateCount?: unknown;
  totalHits?: unknown;
  hitCount?: unknown;
  page?: unknown;
  expandedCount?: unknown;
  directRefCount?: unknown;
  scopeWidened?: unknown;
  durationMs?: unknown;
  sessionId?: unknown;
  ts?: unknown;
}

function qualityMode(value: unknown): CompactionQualityMode {
  const normalized = typeof value === "string" ? value : "";
  if (QUALITY_MODES.has(normalized as CompactionQualityMode)) {
    return normalized as CompactionQualityMode;
  }
  if (/^model/iu.test(normalized)) return "model";
  if (/minimal_emergency/iu.test(normalized)) return "minimal_emergency";
  if (/repair/iu.test(normalized)) return "deterministic_repair";
  if (/fallback/iu.test(normalized)) return "deterministic_fallback";
  return "other";
}

export function createCompactionQualityTelemetryEvent(
  input: CompactionQualityInput = {},
): CompactionQualityTelemetryEvent {
  const mode = qualityMode(input.mode);
  return {
    v: TELEMETRY_SCHEMA_VERSION,
    kind: "compaction_quality",
    ts: counter(input.ts ?? Date.now(), Number.MAX_SAFE_INTEGER),
    source: "live",
    mode,
    validationOk: input.validationOk === true,
    fallback:
      input.fallback === true || mode === "deterministic_fallback" || mode === "minimal_emergency",
    repaired:
      input.repaired === true || mode === "deterministic_repair" || mode === "minimal_emergency",
    splitTurn: input.splitTurn === true,
    summaryChars: counter(input.summaryChars),
    compactedMessages: counter(input.compactedMessages),
    selectedMessages: counter(input.selectedMessages),
    omittedMessages: counter(input.omittedMessages),
    omittedManagedRecords: counter(input.omittedManagedRecords),
    omittedManagedBlocks: counter(input.omittedManagedBlocks),
    continuityRecords: counter(input.continuityRecords),
    evidenceAnchors: counter(input.evidenceAnchors),
    redactions: counter(input.redactions),
    truncatedRecords: counter(input.truncatedRecords),
    inputTokenBudget: counter(input.inputTokenBudget),
    finalTokenBudget: counter(input.finalTokenBudget),
    worktreeVerified: input.worktreeVerified === true,
    ...optionalDuration(input.durationMs),
    ...sessionId(input.sessionId),
  };
}

export function createCompactionRecallTelemetryEvent(
  input: CompactionRecallInput = {},
): CompactionRecallTelemetryEvent {
  const scope = RECALL_SCOPES.has(input.scope as CompactionRecallScope)
    ? (input.scope as CompactionRecallScope)
    : "degraded";
  const mode = RECALL_MODES.has(input.mode as CompactionRecallMode)
    ? (input.mode as CompactionRecallMode)
    : "hybrid";
  return {
    v: TELEMETRY_SCHEMA_VERSION,
    kind: "compaction_recall",
    ts: counter(input.ts ?? Date.now(), Number.MAX_SAFE_INTEGER),
    source: "live",
    scope,
    mode,
    queryTokens: counter(input.queryTokens, 10_000),
    sourceEntries: counter(input.sourceEntries),
    sourceEntriesOmitted: counter(input.sourceEntriesOmitted),
    candidateCount: counter(input.candidateCount),
    totalHits: counter(input.totalHits),
    hitCount: counter(input.hitCount),
    page: Math.max(1, counter(input.page, 100_000)),
    expandedCount: counter(input.expandedCount, 10_000),
    directRefCount: counter(input.directRefCount, 10_000),
    scopeWidened: input.scopeWidened === true || scope === "all",
    ...optionalDuration(input.durationMs),
    ...sessionId(input.sessionId),
  };
}

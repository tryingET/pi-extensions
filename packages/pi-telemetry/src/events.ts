// ---
// summary: pi.telemetry.v1 event schema — metadata-only runtime telemetry records.
// read_when:
//   - changing telemetry event kinds, fields, or the no-payload boundary.
// ---

/**
 * Telemetry records are metadata-only projections for observability.
 * Hard boundary: never store message text, tool payloads, file contents,
 * queries, environment values, absolute paths, or secrets. Bounded derived
 * labels are allowed (tool names, skill names, error first-line signatures).
 */

export const TELEMETRY_SCHEMA_VERSION = 1;

/**
 * Causal-era revision marker for compaction-family records.
 * Records carrying `rev >= CAUSAL_SCHEMA_REV` include host-event correlation
 * (composite `(sessionId, compactionSeq)` keying and causal failure causes);
 * records without `rev` predate causal correlation and are treated as
 * version 0 by consumers. Introduced with `session_compact_failed` adoption
 * (ADR 2026-08-24-pi-0.84.x-adoption P0-A).
 */
export const CAUSAL_SCHEMA_REV = 2;

export type TelemetryKind =
  | "tool_call"
  | "compaction"
  | "compaction_begin"
  | "compaction_failure"
  | "compaction_quality"
  | "compaction_recall"
  | "skill_load"
  | "vault_query"
  | "follow_up"
  | "subagent"
  | "turn";

export interface TelemetryEventBase {
  v: typeof TELEMETRY_SCHEMA_VERSION;
  kind: TelemetryKind;
  ts: number;
  sessionId?: string;
  cwd?: string;
  /** "live" events are measured at runtime; "backfill" events are derived from persisted session JSONL. */
  source?: "live" | "backfill";
  /** Causal-era revision marker; absent on pre-causal records (treated as version 0). */
  rev?: number;
}

export interface ToolCallTelemetryEvent extends TelemetryEventBase {
  kind: "tool_call";
  tool: string;
  ok: boolean;
  durationMs?: number;
  errorSignature?: string;
}

export interface CompactionTelemetryEvent extends TelemetryEventBase {
  kind: "compaction";
  reason: string;
  willRetry: boolean;
  fromExtension: boolean;
  tokensBefore?: number;
  summaryChars?: number;
  /** Composite correlation key half; paired with sessionId. Absent on orphan success. */
  compactionSeq?: number;
  /** True when at least one causal failure was recorded for this seq before terminal success. */
  retriedAfterFailure?: boolean;
}

export interface CompactionBeginTelemetryEvent extends TelemetryEventBase {
  kind: "compaction_begin";
  reason: string;
  willRetry: boolean;
  /** Composite correlation key half; paired with sessionId. */
  compactionSeq?: number;
}

export interface CompactionFailureTelemetryEvent extends TelemetryEventBase {
  kind: "compaction_failure";
  stage: "preset" | "preset_directive" | "default_preset" | "stock_fallback" | "final" | "host";
  errorSignature: string;
  /** Host-sourced failures only (stage === "host"): what triggered the compaction. */
  reason?: string;
  /** Host-sourced failures only: true when compaction was cancelled or aborted. */
  aborted?: boolean;
  /** True when no matching begin existed under the current session context. */
  orphan?: boolean;
  /** True when aborted && willRetry — recoverable class, excluded from hard-failure counts. */
  recoverable?: boolean;
  /** Composite correlation key half; paired with sessionId. Absent when orphan. */
  compactionSeq?: number;
}

export type CompactionQualityMode =
  | "model"
  | "deterministic_fallback"
  | "deterministic_repair"
  | "minimal_emergency"
  | "other";

export interface CompactionQualityTelemetryEvent extends TelemetryEventBase {
  kind: "compaction_quality";
  mode: CompactionQualityMode;
  validationOk: boolean;
  fallback: boolean;
  repaired: boolean;
  splitTurn: boolean;
  summaryChars: number;
  /** Total messages in the compacted span before deterministic selection. */
  compactedMessages?: number;
  selectedMessages: number;
  omittedMessages: number;
  omittedManagedRecords: number;
  omittedManagedBlocks?: number;
  continuityRecords?: number;
  evidenceAnchors?: number;
  redactions: number;
  truncatedRecords: number;
  inputTokenBudget: number;
  finalTokenBudget: number;
  worktreeVerified: boolean;
  durationMs?: number;
}

export type CompactionRecallScope = "lineage" | "all" | "degraded";
export type CompactionRecallMode = "hybrid" | "files" | "failures" | "commands";

export interface CompactionRecallTelemetryEvent extends TelemetryEventBase {
  kind: "compaction_recall";
  scope: CompactionRecallScope;
  mode: CompactionRecallMode;
  queryTokens: number;
  sourceEntries?: number;
  sourceEntriesOmitted?: number;
  candidateCount: number;
  totalHits?: number;
  hitCount: number;
  page: number;
  expandedCount: number;
  directRefCount?: number;
  scopeWidened: boolean;
  durationMs?: number;
}

export interface SkillLoadTelemetryEvent extends TelemetryEventBase {
  kind: "skill_load";
  skill: string;
}

export interface VaultQueryTelemetryEvent extends TelemetryEventBase {
  kind: "vault_query";
  tool: string;
  ok: boolean;
  durationMs?: number;
}

export interface FollowUpTelemetryEvent extends TelemetryEventBase {
  kind: "follow_up";
  sent: boolean;
  dispatchMode: string;
  blockedReason?: string;
}

export interface SubagentTelemetryEvent extends TelemetryEventBase {
  kind: "subagent";
  profile: string;
  ok: boolean;
  durationMs?: number;
}

export interface TurnTelemetryEvent extends TelemetryEventBase {
  kind: "turn";
  index: number;
}

export type TelemetryEvent =
  | ToolCallTelemetryEvent
  | CompactionTelemetryEvent
  | CompactionBeginTelemetryEvent
  | CompactionFailureTelemetryEvent
  | CompactionQualityTelemetryEvent
  | CompactionRecallTelemetryEvent
  | SkillLoadTelemetryEvent
  | VaultQueryTelemetryEvent
  | FollowUpTelemetryEvent
  | SubagentTelemetryEvent
  | TurnTelemetryEvent;

const MAX_ERROR_SIGNATURE_CHARS = 160;
const MAX_TOOL_NAME_CHARS = 80;
const MAX_SKILL_NAME_CHARS = 120;

export function normalizeToolName(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, MAX_TOOL_NAME_CHARS)
    : "unknown";
}

export function normalizeSkillName(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, MAX_SKILL_NAME_CHARS)
    : "unknown";
}

/**
 * Error signature: first non-empty line of the error text, whitespace-collapsed,
 * with digits collapsed so retries of the same failure collapse to one signature.
 */
export function deriveErrorSignature(content: unknown): string | undefined {
  const text = extractText(content);
  if (!text) return undefined;
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return undefined;
  return firstLine.replace(/\d+/g, "N").replace(/\s+/g, " ").slice(0, MAX_ERROR_SIGNATURE_CHARS);
}

function extractText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        parts.push((block as { text: string }).text);
      }
    }
    return parts.length > 0 ? parts.join("\n") : undefined;
  }
  return undefined;
}

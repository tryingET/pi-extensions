// ---
// summary: pi.telemetry.v1 event schema — metadata-only runtime telemetry records.
// read_when:
//   - changing telemetry event kinds, fields, or the no-payload boundary.
// ---

/**
 * Telemetry records are metadata-only projections for observability.
 * Hard boundary: never store message text, tool payloads, file contents,
 * environment values, or secrets. Bounded derived labels are allowed
 * (tool names, skill names, error first-line signatures).
 */

export const TELEMETRY_SCHEMA_VERSION = 1;

export type TelemetryKind =
  | "tool_call"
  | "compaction"
  | "compaction_begin"
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
}

export interface ToolCallTelemetryEvent extends TelemetryEventBase {
  kind: "tool_call";
  tool: string;
  ok: boolean;
  durationMs: number;
  errorSignature?: string;
}

export interface CompactionTelemetryEvent extends TelemetryEventBase {
  kind: "compaction";
  reason: string;
  willRetry: boolean;
  fromExtension: boolean;
  tokensBefore?: number;
  summaryChars?: number;
}

export interface CompactionBeginTelemetryEvent extends TelemetryEventBase {
  kind: "compaction_begin";
  reason: string;
  willRetry: boolean;
}

export interface SkillLoadTelemetryEvent extends TelemetryEventBase {
  kind: "skill_load";
  skill: string;
}

export interface VaultQueryTelemetryEvent extends TelemetryEventBase {
  kind: "vault_query";
  tool: string;
  ok: boolean;
  durationMs: number;
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
  durationMs: number;
}

export interface TurnTelemetryEvent extends TelemetryEventBase {
  kind: "turn";
  index: number;
}

export type TelemetryEvent =
  | ToolCallTelemetryEvent
  | CompactionTelemetryEvent
  | CompactionBeginTelemetryEvent
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

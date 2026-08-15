// ---
// summary: passive pi-event collector mapping tool, compaction, vault, skill, follow-up, and subagent activity to telemetry events.
// read_when:
//   - changing which pi events are captured, payload-free boundaries, or event correlation.
// ---

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  deriveErrorSignature,
  normalizeSkillName,
  normalizeToolName,
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryEvent,
} from "./events.ts";
import { appendTelemetryEvent, resolveTelemetryDir } from "./store.ts";

const MAX_INFLIGHT_TOOL_CALLS = 512;
const VAULT_TOOL_PREFIX = "vault_";
const SKILL_PATH_PATTERN = /(^|\/)([^/]+)\/SKILL\.md$/u;

interface InflightToolCall {
  tool: string;
  startedAt: number;
  profile?: string;
  skill?: string;
  path?: string;
  completed: boolean;
}

export interface TelemetryCollectorOptions {
  dir?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  sessionId?: () => string | undefined;
  cwd?: () => string | undefined;
  append?: (dir: string, event: TelemetryEvent) => Promise<void>;
}

export function createTelemetryCollector(options: TelemetryOptionsBound = {}): {
  handle: (event: CollectorEvent, ctx?: CollectorContext) => void;
  dir: string;
} {
  const dir = options.dir ?? resolveTelemetryDir(options.env);
  const now = options.now ?? (() => Date.now());
  const append = options.append ?? appendTelemetryEvent;
  const inflight = new Map<string, InflightToolCall>();
  let currentCtx: CollectorContext | undefined;

  const base = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    v: TELEMETRY_SCHEMA_VERSION,
    ts: now(),
    ...(options.sessionId?.() ? { sessionId: options.sessionId() } : withSessionId(currentCtx)),
    ...(options.cwd?.() ? { cwd: options.cwd() } : readCtxCwd(currentCtx)),
    ...extra,
  });

  const record = (event: TelemetryEvent): void => {
    void append(dir, event).catch(() => {
      // Telemetry must never break the host session.
    });
  };

  const handleToolCall = (event: CollectorEvent, ctx?: CollectorContext): void => {
    const toolCallId = event.toolCallId;
    if (!toolCallId) return;
    if (inflight.size >= MAX_INFLIGHT_TOOL_CALLS) {
      const oldest = inflight.keys().next().value;
      if (oldest !== undefined) inflight.delete(oldest);
    }

    const tool = normalizeToolName(event.toolName);
    const input = (event.input ?? {}) as Record<string, unknown>;
    const rawPath = typeof input.path === "string" ? input.path : undefined;
    const skillMatch = rawPath ? SKILL_PATH_PATTERN.exec(rawPath) : null;

    inflight.set(toolCallId, {
      tool,
      startedAt: now(),
      completed: false,
      ...(tool === "dispatch_subagent" && typeof input.profile === "string"
        ? { profile: input.profile.slice(0, 40) }
        : {}),
      ...(skillMatch ? { skill: normalizeSkillName(skillMatch[2]), path: rawPath } : {}),
    });
    void ctx;
  };

  const handleToolCompletion = (
    event: CollectorEvent & {
      toolCallId?: string;
      isError?: boolean;
      content?: unknown;
      result?: unknown;
    },
  ): void => {
    const toolCallId = event.toolCallId;
    if (!toolCallId) return;
    const inflightEntry = inflight.get(toolCallId);
    if (!inflightEntry || inflightEntry.completed) return;
    inflightEntry.completed = true;
    inflight.delete(toolCallId);

    const durationMs = Math.max(0, now() - inflightEntry.startedAt);
    const ok = event.isError !== true;
    const errorSignature = ok ? undefined : deriveErrorSignature(readErrorText(event));

    if (inflightEntry.skill) {
      record({ ...(base({ kind: "skill_load", skill: inflightEntry.skill }) as TelemetryEvent) });
    }

    if (inflightEntry.tool.startsWith(VAULT_TOOL_PREFIX)) {
      record({
        ...(base({
          kind: "vault_query",
          tool: inflightEntry.tool,
          ok,
          durationMs,
          ...(errorSignature ? { errorSignature } : {}),
        }) as TelemetryEvent),
      });
    } else {
      record({
        ...(base({
          kind: "tool_call",
          tool: inflightEntry.tool,
          ok,
          durationMs,
          ...(errorSignature ? { errorSignature } : {}),
        }) as TelemetryEvent),
      });
    }

    if (inflightEntry.tool === "self") {
      const followUp = extractFollowUpOutcome(event.result);
      if (followUp) record({ ...(base({ kind: "follow_up", ...followUp }) as TelemetryEvent) });
    }

    if (inflightEntry.tool === "dispatch_subagent") {
      record({
        ...(base({
          kind: "subagent",
          profile: inflightEntry.profile ?? "unknown",
          ok,
          durationMs,
          ...(errorSignature ? { errorSignature } : {}),
        }) as TelemetryEvent),
      });
    }
  };

  const handle = (event: CollectorEvent, ctx?: CollectorContext): void => {
    currentCtx = ctx;
    switch (event.type) {
      case "tool_call":
        handleToolCall(event, ctx);
        return;
      case "tool_execution_end":
      case "tool_result":
        handleToolCompletion(event);
        return;
      case "turn_start":
        record({
          ...(base({
            kind: "turn",
            index: typeof event.turnIndex === "number" ? event.turnIndex : -1,
          }) as TelemetryEvent),
        });
        return;
      case "session_before_compact":
        record({
          ...(base({
            kind: "compaction_begin",
            reason: typeof event.reason === "string" ? event.reason : "unknown",
            willRetry: event.willRetry === true,
          }) as TelemetryEvent),
        });
        return;
      case "session_compact": {
        const entry = (event.compactionEntry ?? {}) as Record<string, unknown>;
        record({
          ...(base({
            kind: "compaction",
            reason: typeof event.reason === "string" ? event.reason : "unknown",
            willRetry: event.willRetry === true,
            fromExtension: event.fromExtension === true,
            ...(typeof entry.tokensBefore === "number" ? { tokensBefore: entry.tokensBefore } : {}),
            ...(typeof entry.summary === "string" ? { summaryChars: entry.summary.length } : {}),
          }) as TelemetryEvent),
        });
        return;
      }
      default:
        return;
    }
  };

  return { handle, dir };
}

export interface CollectorEvent {
  type: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  isError?: boolean;
  content?: unknown;
  result?: unknown;
  turnIndex?: number;
  reason?: string;
  willRetry?: boolean;
  fromExtension?: boolean;
  compactionEntry?: unknown;
}

export interface CollectorContext {
  cwd?: string;
  sessionManager?: unknown;
}

function readCtxCwd(ctx: CollectorContext | undefined): { cwd?: string } {
  return typeof ctx?.cwd === "string" && ctx.cwd.trim() ? { cwd: ctx.cwd } : {};
}

function withSessionId(ctx: CollectorContext | undefined): { sessionId?: string } {
  const manager = ctx?.sessionManager as Record<string, unknown> | undefined;
  const getSessionFile = manager?.getSessionFile;
  if (typeof getSessionFile !== "function") return {};
  try {
    const file = (getSessionFile as () => unknown).call(manager);
    if (typeof file === "string" && file.trim()) {
      const base = file.split("/").pop() ?? "";
      return base ? { sessionId: base } : {};
    }
  } catch {
    // Session identity is best-effort; stall detection degrades to cross-session matching.
  }
  return {};
}

export interface TelemetryOptionsBound {
  dir?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  sessionId?: () => string | undefined;
  cwd?: () => string | undefined;
  append?: (dir: string, event: TelemetryEvent) => Promise<void>;
}

interface FollowUpOutcome {
  sent: boolean;
  dispatchMode: string;
  blockedReason?: string;
}

/**
 * Reads the self tool's delivery outcome from its tool result details.
 * Payload-free: only the typed delivery booleans/modes are extracted.
 */
function readErrorText(event: { content?: unknown; result?: unknown }): unknown {
  if (event.content) return event.content;
  const result = event.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const inner = (result as { content?: unknown }).content;
    if (inner) return inner;
  }
  return result;
}

export function extractFollowUpOutcome(result: unknown): FollowUpOutcome | undefined {
  const data = readSelfResultData(result);
  if (!data) return undefined;
  const hasDeliveryField =
    data.userMessageSent === true ||
    data.userMessageSent === false ||
    typeof data.userMessageBlockedReason === "string";
  if (!hasDeliveryField) return undefined;
  return {
    sent: data.userMessageSent === true,
    dispatchMode: typeof data.dispatchMode === "string" ? data.dispatchMode : "unknown",
    ...(typeof data.userMessageBlockedReason === "string"
      ? { blockedReason: data.userMessageBlockedReason }
      : {}),
  };
}

function readSelfResultData(result: unknown): Record<string, unknown> | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const data = (details as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  return data as Record<string, unknown>;
}

/**
 * Wire the collector into a live pi extension API.
 */
export function registerTelemetryCollector(
  pi: ExtensionAPI,
  options: TelemetryOptionsBound = {},
): void {
  if (options.env?.PI_TELEMETRY_DISABLED === "1" && !options.dir) return;

  const collector = createTelemetryCollector(options);
  const handler = (event: CollectorEvent, ctx?: CollectorContext): void =>
    collector.handle(event, ctx);

  pi.on("tool_call", handler as never);
  pi.on("tool_result", handler as never);
  pi.on("tool_execution_end", handler as never);
  pi.on("turn_start", handler as never);
  pi.on("session_before_compact", handler as never);
  pi.on("session_compact", handler as never);
}

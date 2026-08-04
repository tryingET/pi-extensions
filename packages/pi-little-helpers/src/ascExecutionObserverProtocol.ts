// summary: validates the bounded cross-extension ASC execution observation event protocol.
// read_when:
//   - changing ASC observation event fields, privacy boundaries, or parser compatibility.

import { isAbsolute } from "node:path";

export const ASC_EXECUTION_OBSERVATION_EVENT = "asc:execution-observation:v1";
export const ASC_EXECUTION_OBSERVATION_SCHEMA = "asc.execution_observation.v1";

const MAX_ID_CHARS = 160;
const MAX_LABEL_CHARS = 120;
const MAX_PATH_CHARS = 4096;
const MAX_PHASES = 64;
const MAX_TOOL_CHARS = 160;

export interface ObserverUsage {
  turns: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
}

export type ObserverTerminalStatus = "done" | "error" | "timed_out" | "aborted";

export interface ObservationEvent {
  schema: typeof ASC_EXECUTION_OBSERVATION_SCHEMA;
  event: "dispatch_progress" | "dispatch_terminal" | "group_terminal";
  observedAt: string;
  producer: "dispatch_subagent" | "loop_execute" | "workflow_execute";
  cwd: string;
  group: {
    id: string;
    kind: "dispatch" | "loop" | "workflow";
    label: string;
  };
  phase?: {
    name: string;
    index: number;
    count: number;
    agent?: string;
    cognitiveTool?: string;
  };
  dispatch?: {
    dispatchId?: string;
    attemptId?: string;
    profile?: string;
  };
  progress?: {
    status: "done" | "error" | "timed_out" | "aborted" | "spawning" | "running";
    phase?: "preparing" | "spawning" | "running" | "finalizing" | "completed";
    sequence?: number;
    lastActivityAt?: number;
    latestTool?: string;
    usage?: ObserverUsage;
  };
  terminal?: {
    ok: boolean;
    status: ObserverTerminalStatus;
    failureKind?: string;
    effectDisposition?: "settled" | "confirmed_no_effects" | "effect_indeterminate";
    elapsedMs?: number;
  };
}

interface OptionalParse<T> {
  valid: boolean;
  value?: T;
}

export function parseObservationEvent(raw: unknown): ObservationEvent | undefined {
  if (!isRecord(raw) || raw.schema !== ASC_EXECUTION_OBSERVATION_SCHEMA) return undefined;
  if (!isObservationEventName(raw.event) || !isProducer(raw.producer)) return undefined;

  const observedAt = strictString(raw.observedAt, 64);
  const cwd = strictPath(raw.cwd);
  const group = parseGroup(raw.group);
  if (
    !observedAt ||
    !Number.isFinite(Date.parse(observedAt)) ||
    !cwd ||
    !group ||
    !producerMatchesGroup(raw.producer, group.kind)
  ) {
    return undefined;
  }

  const phase = parseOptional(raw.phase, parsePhase);
  const dispatch = parseOptional(raw.dispatch, parseDispatch);
  const progress = parseOptional(raw.progress, parseProgress);
  const terminal = parseOptional(raw.terminal, parseTerminal);
  if (!phase.valid || !dispatch.valid || !progress.valid || !terminal.valid) return undefined;

  if (raw.event === "dispatch_progress") {
    if (!progress.value || terminal.value) return undefined;
  } else if (!terminal.value || progress.value) {
    return undefined;
  }

  if (group.kind === "dispatch" && phase.value) return undefined;
  if (group.kind === "loop" && raw.event !== "group_terminal" && !phase.value) {
    return undefined;
  }
  if (raw.event === "group_terminal" && (phase.value || dispatch.value)) return undefined;

  return {
    schema: ASC_EXECUTION_OBSERVATION_SCHEMA,
    event: raw.event,
    observedAt,
    producer: raw.producer,
    cwd,
    group,
    ...(phase.value ? { phase: phase.value } : {}),
    ...(dispatch.value ? { dispatch: dispatch.value } : {}),
    ...(progress.value ? { progress: progress.value } : {}),
    ...(terminal.value ? { terminal: terminal.value } : {}),
  };
}

function parseGroup(value: unknown): ObservationEvent["group"] | undefined {
  if (!isRecord(value) || !isGroupKind(value.kind)) return undefined;
  const id = strictString(value.id, MAX_ID_CHARS);
  const label = boundString(value.label, MAX_LABEL_CHARS);
  return id && label ? { id, kind: value.kind, label } : undefined;
}

function parsePhase(value: unknown): ObservationEvent["phase"] | undefined {
  if (!isRecord(value)) return undefined;
  const name = boundString(value.name, MAX_LABEL_CHARS);
  const index = positiveInteger(value.index);
  const count = positiveInteger(value.count);
  if (!name || index === undefined || count === undefined || index > count || count > MAX_PHASES) {
    return undefined;
  }
  const agent = boundString(value.agent, MAX_LABEL_CHARS);
  const cognitiveTool = boundString(value.cognitiveTool, MAX_LABEL_CHARS);
  return {
    name,
    index,
    count,
    ...(agent ? { agent } : {}),
    ...(cognitiveTool ? { cognitiveTool } : {}),
  };
}

function parseDispatch(value: unknown): ObservationEvent["dispatch"] | undefined {
  if (!isRecord(value)) return undefined;
  const dispatchId = strictOptionalIdentity(value.dispatchId, MAX_ID_CHARS);
  const attemptId = strictOptionalIdentity(value.attemptId, MAX_ID_CHARS);
  const profile = boundString(value.profile, MAX_LABEL_CHARS);
  if (dispatchId === null || attemptId === null) return undefined;
  return dispatchId || attemptId || profile
    ? {
        ...(dispatchId ? { dispatchId } : {}),
        ...(attemptId ? { attemptId } : {}),
        ...(profile ? { profile } : {}),
      }
    : undefined;
}

function parseProgress(value: unknown): ObservationEvent["progress"] | undefined {
  if (!isRecord(value) || !isRuntimeStatus(value.status)) return undefined;
  const phase = isProgressPhase(value.phase) ? value.phase : undefined;
  const usage = parseUsage(value.usage);
  const sequence = nonNegative(value.sequence);
  const lastActivityAt = nonNegative(value.lastActivityAt);
  const latestTool = boundString(value.latestTool, MAX_TOOL_CHARS);
  return {
    status: value.status,
    ...(phase ? { phase } : {}),
    ...(sequence !== undefined ? { sequence } : {}),
    ...(lastActivityAt !== undefined ? { lastActivityAt } : {}),
    ...(latestTool ? { latestTool } : {}),
    ...(usage ? { usage } : {}),
  };
}

function parseTerminal(value: unknown): ObservationEvent["terminal"] | undefined {
  if (!isRecord(value) || typeof value.ok !== "boolean" || !isTerminalStatus(value.status)) {
    return undefined;
  }
  const disposition = isEffectDisposition(value.effectDisposition)
    ? value.effectDisposition
    : undefined;
  const failureKind = boundString(value.failureKind, MAX_LABEL_CHARS);
  const elapsedMs = nonNegative(value.elapsedMs);
  return {
    ok: value.ok,
    status: value.status,
    ...(failureKind ? { failureKind } : {}),
    ...(disposition ? { effectDisposition: disposition } : {}),
    ...(elapsedMs !== undefined ? { elapsedMs } : {}),
  };
}

function parseUsage(value: unknown): ObserverUsage | undefined {
  if (!isRecord(value)) return undefined;
  const keys: Array<keyof ObserverUsage> = [
    "turns",
    "input",
    "output",
    "cacheRead",
    "cacheWrite",
    "cost",
    "contextTokens",
  ];
  if (keys.some((key) => nonNegative(value[key]) === undefined)) return undefined;
  return Object.fromEntries(
    keys.map((key) => [key, nonNegative(value[key])]),
  ) as unknown as ObserverUsage;
}

function parseOptional<T>(
  value: unknown,
  parser: (candidate: unknown) => T | undefined,
): OptionalParse<T> {
  if (value === undefined) return { valid: true };
  const parsed = parser(value);
  return parsed === undefined ? { valid: false } : { valid: true, value: parsed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isObservationEventName(value: unknown): value is ObservationEvent["event"] {
  return (
    value === "dispatch_progress" || value === "dispatch_terminal" || value === "group_terminal"
  );
}

function isProducer(value: unknown): value is ObservationEvent["producer"] {
  return value === "dispatch_subagent" || value === "loop_execute" || value === "workflow_execute";
}

function isGroupKind(value: unknown): value is ObservationEvent["group"]["kind"] {
  return value === "dispatch" || value === "loop" || value === "workflow";
}

function producerMatchesGroup(
  producer: ObservationEvent["producer"],
  groupKind: ObservationEvent["group"]["kind"],
): boolean {
  if (producer === "dispatch_subagent") return groupKind === "dispatch";
  if (producer === "loop_execute") return groupKind === "loop";
  return groupKind === "workflow";
}

function isRuntimeStatus(
  value: unknown,
): value is NonNullable<ObservationEvent["progress"]>["status"] {
  return (
    value === "done" ||
    value === "error" ||
    value === "timed_out" ||
    value === "aborted" ||
    value === "spawning" ||
    value === "running"
  );
}

function isTerminalStatus(value: unknown): value is ObserverTerminalStatus {
  return value === "done" || value === "error" || value === "timed_out" || value === "aborted";
}

function isProgressPhase(
  value: unknown,
): value is NonNullable<ObservationEvent["progress"]>["phase"] {
  return (
    value === "preparing" ||
    value === "spawning" ||
    value === "running" ||
    value === "finalizing" ||
    value === "completed"
  );
}

function isEffectDisposition(
  value: unknown,
): value is NonNullable<ObservationEvent["terminal"]>["effectDisposition"] {
  return (
    value === "settled" || value === "confirmed_no_effects" || value === "effect_indeterminate"
  );
}

function boundString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = sanitizeSingleLine(value.slice(0, maxChars));
  return normalized || undefined;
}

function strictOptionalIdentity(value: unknown, maxChars: number): string | undefined | null {
  if (value === undefined) return undefined;
  return strictString(value, maxChars) ?? null;
}

function strictString(value: unknown, maxChars: number): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxChars ||
    value.trim() !== value ||
    hasControlCharacters(value)
  ) {
    return undefined;
  }
  return value;
}

function strictPath(value: unknown): string | undefined {
  const path = strictString(value, MAX_PATH_CHARS);
  return path && isAbsolute(path) ? path : undefined;
}

function sanitizeSingleLine(value: string): string {
  let sanitized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    sanitized += codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
  }
  return sanitized.replace(/\s+/gu, " ").trim();
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function nonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

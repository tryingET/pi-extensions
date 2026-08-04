import { isAbsolute } from "node:path";
import type {
  DispatchSubagentExecutionResult,
  DispatchSubagentExecutionUpdate,
  DispatchSubagentStatus,
  DispatchUsage,
} from "./subagent-runtime-types.ts";

export const ASC_EXECUTION_OBSERVATION_EVENT = "asc:execution-observation:v1";
export const ASC_EXECUTION_OBSERVATION_SCHEMA = "asc.execution_observation.v1";

const MAX_ID_CHARS = 160;
const MAX_LABEL_CHARS = 120;
const MAX_PATH_CHARS = 4096;
const MAX_PHASES = 64;
const MAX_TOOL_CHARS = 160;

export type AscExecutionObservationProducer =
  | "dispatch_subagent"
  | "loop_execute"
  | "workflow_execute";
export type AscExecutionObservationGroupKind = "dispatch" | "loop" | "workflow";
export type AscExecutionTerminalStatus = "done" | "error" | "timed_out" | "aborted";

export interface AscExecutionObservationContext {
  producer: AscExecutionObservationProducer;
  cwd: string;
  group: {
    id: string;
    kind: AscExecutionObservationGroupKind;
    label: string;
  };
  phase?: {
    name: string;
    index: number;
    count: number;
    agent?: string;
    cognitiveTool?: string;
  };
}

interface AscExecutionObservationBase {
  schema: typeof ASC_EXECUTION_OBSERVATION_SCHEMA;
  event: "dispatch_progress" | "dispatch_terminal" | "group_terminal";
  observedAt: string;
  producer: AscExecutionObservationProducer;
  cwd: string;
  group: {
    id: string;
    kind: AscExecutionObservationGroupKind;
    label: string;
  };
  phase?: {
    name: string;
    index: number;
    count: number;
    agent?: string;
    cognitiveTool?: string;
  };
}

export interface AscExecutionProgressObservation extends AscExecutionObservationBase {
  event: "dispatch_progress";
  dispatch: {
    dispatchId?: string;
    attemptId?: string;
    profile?: string;
  };
  progress: {
    status: DispatchSubagentStatus;
    phase?: "preparing" | "spawning" | "running" | "finalizing" | "completed";
    sequence?: number;
    lastActivityAt?: number;
    latestTool?: string;
    usage?: DispatchUsage;
  };
}

export interface AscExecutionTerminalObservation extends AscExecutionObservationBase {
  event: "dispatch_terminal" | "group_terminal";
  dispatch?: {
    dispatchId?: string;
    attemptId?: string;
    profile?: string;
  };
  terminal: {
    ok: boolean;
    status: AscExecutionTerminalStatus;
    failureKind?: string;
    effectDisposition?: "settled" | "confirmed_no_effects" | "effect_indeterminate";
    elapsedMs?: number;
  };
}

export type AscExecutionObservation =
  | AscExecutionProgressObservation
  | AscExecutionTerminalObservation;

export function projectAscExecutionUpdate(
  update: DispatchSubagentExecutionUpdate,
  context: AscExecutionObservationContext,
  now = Date.now(),
): AscExecutionProgressObservation | undefined {
  const normalizedContext = normalizeContext(context);
  const details = update.details;
  if (!normalizedContext || !details?.status) return undefined;

  const sequence = finiteNonNegative(details.progressSequence);
  const lastActivityAt = finiteNonNegative(details.lastActivityAt);
  const latestTool = boundString(details.latestTool, MAX_TOOL_CHARS);
  return {
    schema: ASC_EXECUTION_OBSERVATION_SCHEMA,
    event: "dispatch_progress",
    observedAt: new Date(now).toISOString(),
    ...normalizedContext,
    dispatch: compactDispatch(details),
    progress: {
      status: details.status,
      ...(details.progressPhase ? { phase: details.progressPhase } : {}),
      ...(sequence !== undefined ? { sequence } : {}),
      ...(lastActivityAt !== undefined ? { lastActivityAt } : {}),
      ...(latestTool ? { latestTool } : {}),
      ...(details.usage ? { usage: compactUsage(details.usage) } : {}),
    },
  };
}

export function projectAscExecutionResult(
  result: DispatchSubagentExecutionResult,
  context: AscExecutionObservationContext,
  now = Date.now(),
): AscExecutionTerminalObservation | undefined {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext) return undefined;
  const details = result.details;
  const failureKind = boundString(details.failureKind, MAX_LABEL_CHARS);
  const elapsedMs = finiteNonNegative(details.elapsed);
  return {
    schema: ASC_EXECUTION_OBSERVATION_SCHEMA,
    event: "dispatch_terminal",
    observedAt: new Date(now).toISOString(),
    ...normalizedContext,
    dispatch: compactDispatch(details),
    terminal: {
      ok: result.ok,
      status: normalizeTerminalStatus(details.status, result.ok),
      ...(failureKind ? { failureKind } : {}),
      ...(details.effectReceipt?.disposition
        ? { effectDisposition: details.effectReceipt.disposition }
        : {}),
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    },
  };
}

export function projectAscExecutionFailure(
  context: AscExecutionObservationContext,
  failureKind = "execution_rejected",
  now = Date.now(),
): AscExecutionTerminalObservation | undefined {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext) return undefined;
  return {
    schema: ASC_EXECUTION_OBSERVATION_SCHEMA,
    event: "dispatch_terminal",
    observedAt: new Date(now).toISOString(),
    ...normalizedContext,
    terminal: {
      ok: false,
      status: "error",
      failureKind: boundString(failureKind, MAX_LABEL_CHARS) || "execution_rejected",
    },
  };
}

export function projectAscExecutionGroupTerminal(
  context: AscExecutionObservationContext,
  terminal: {
    ok: boolean;
    status: AscExecutionTerminalStatus;
    failureKind?: string;
    effectDisposition?: "settled" | "confirmed_no_effects" | "effect_indeterminate";
    elapsedMs?: number;
  },
  now = Date.now(),
): AscExecutionTerminalObservation | undefined {
  const normalizedContext = normalizeContext(context);
  if (!normalizedContext) return undefined;
  const failureKind = boundString(terminal.failureKind, MAX_LABEL_CHARS);
  const elapsedMs = finiteNonNegative(terminal.elapsedMs);
  return {
    schema: ASC_EXECUTION_OBSERVATION_SCHEMA,
    event: "group_terminal",
    observedAt: new Date(now).toISOString(),
    ...normalizedContext,
    terminal: {
      ok: terminal.ok,
      status: terminal.status,
      ...(failureKind ? { failureKind } : {}),
      ...(terminal.effectDisposition ? { effectDisposition: terminal.effectDisposition } : {}),
      ...(elapsedMs !== undefined ? { elapsedMs } : {}),
    },
  };
}

function normalizeContext(
  context: AscExecutionObservationContext,
): Omit<AscExecutionObservationBase, "schema" | "event" | "observedAt"> | undefined {
  if (expectedGroupKind(context.producer) !== context.group.kind) return undefined;
  const cwd = strictPath(context.cwd);
  const groupId = strictIdentity(context.group.id, MAX_ID_CHARS);
  const groupLabel = boundString(context.group.label, MAX_LABEL_CHARS);
  if (!cwd || !groupId || !groupLabel) return undefined;

  const phaseName = boundString(context.phase?.name, MAX_LABEL_CHARS);
  const phaseIndex = finitePositiveInteger(context.phase?.index);
  const phaseCount = finitePositiveInteger(context.phase?.count);
  const phase =
    phaseName &&
    phaseIndex !== undefined &&
    phaseCount !== undefined &&
    phaseIndex <= phaseCount &&
    phaseCount <= MAX_PHASES
      ? {
          name: phaseName,
          index: phaseIndex,
          count: phaseCount,
          ...(boundString(context.phase?.agent, MAX_LABEL_CHARS)
            ? { agent: boundString(context.phase?.agent, MAX_LABEL_CHARS) }
            : {}),
          ...(boundString(context.phase?.cognitiveTool, MAX_LABEL_CHARS)
            ? { cognitiveTool: boundString(context.phase?.cognitiveTool, MAX_LABEL_CHARS) }
            : {}),
        }
      : undefined;

  if (context.phase && !phase) return undefined;
  if (context.group.kind === "dispatch" && phase) return undefined;

  return {
    producer: context.producer,
    cwd,
    group: {
      id: groupId,
      kind: context.group.kind,
      label: groupLabel,
    },
    ...(phase ? { phase } : {}),
  };
}

function compactDispatch(details: DispatchSubagentExecutionResult["details"]): {
  dispatchId?: string;
  attemptId?: string;
  profile?: string;
} {
  const dispatchId = strictIdentity(details.dispatchId, MAX_ID_CHARS);
  const attemptId = strictIdentity(details.attemptId, MAX_ID_CHARS);
  const profile = boundString(details.profile, MAX_LABEL_CHARS);
  return {
    ...(dispatchId ? { dispatchId } : {}),
    ...(attemptId ? { attemptId } : {}),
    ...(profile ? { profile } : {}),
  };
}

function compactUsage(usage: DispatchUsage): DispatchUsage {
  return {
    turns: finiteNonNegative(usage.turns) ?? 0,
    input: finiteNonNegative(usage.input) ?? 0,
    output: finiteNonNegative(usage.output) ?? 0,
    cacheRead: finiteNonNegative(usage.cacheRead) ?? 0,
    cacheWrite: finiteNonNegative(usage.cacheWrite) ?? 0,
    cost: finiteNonNegative(usage.cost) ?? 0,
    contextTokens: finiteNonNegative(usage.contextTokens) ?? 0,
  };
}

function expectedGroupKind(
  producer: AscExecutionObservationProducer,
): AscExecutionObservationGroupKind {
  if (producer === "dispatch_subagent") return "dispatch";
  if (producer === "loop_execute") return "loop";
  return "workflow";
}

function normalizeTerminalStatus(
  status: DispatchSubagentStatus | undefined,
  ok: boolean,
): AscExecutionTerminalStatus {
  return status === "done" || status === "error" || status === "timed_out" || status === "aborted"
    ? status
    : ok
      ? "done"
      : "error";
}

function boundString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = sanitizeSingleLine(value.slice(0, maxChars));
  return normalized || undefined;
}

function strictIdentity(value: unknown, maxChars: number): string | undefined {
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
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PATH_CHARS ||
    value.trim() !== value ||
    hasControlCharacters(value) ||
    !isAbsolute(value)
  ) {
    return undefined;
  }
  return value;
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

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function finitePositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

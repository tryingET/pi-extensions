export interface EvalResultMessage {
  type: "eval_result";
  id: string;
  ok: boolean;
  value?: unknown;
  state?: unknown;
  stdout?: string;
  stderr?: string;
  error?: string;
  elapsedMs?: number;
}

export type WorkerMessage =
  | { type: "ready"; runtime: string }
  | { type: "protocol_error"; error: string }
  | { type: "eval_complete"; id: string; token: string }
  | EvalResultMessage
  | {
      type: "capability_call";
      evalId: string;
      callId: string;
      name: string;
      input: unknown;
    };

export const MAX_PROTOCOL_FRAME_BYTES = 2_000_000;
const MAX_STATE_BYTES = 1_000_000;

export function parseWorkerMessage(line: string): WorkerMessage {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error("frame is not valid JSON.");
  }
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("frame must be an object with a string type.");
  }
  if (value.type === "ready") {
    if (typeof value.runtime !== "string") throw new Error("ready frame is malformed.");
    return { type: "ready", runtime: value.runtime };
  }
  if (value.type === "protocol_error") {
    if (typeof value.error !== "string") throw new Error("protocol error frame is malformed.");
    return { type: "protocol_error", error: value.error.slice(0, 4_096) };
  }
  if (value.type === "eval_complete") {
    if (typeof value.id !== "string" || typeof value.token !== "string") {
      throw new Error("eval completion frame is malformed.");
    }
    return { type: "eval_complete", id: value.id, token: value.token };
  }
  if (value.type === "eval_result") {
    if (
      typeof value.id !== "string" ||
      typeof value.ok !== "boolean" ||
      !optionalString(value.stdout) ||
      !optionalString(value.stderr) ||
      !optionalString(value.error) ||
      !optionalElapsedMs(value.elapsedMs)
    ) {
      throw new Error("eval result frame is malformed.");
    }
    return value as unknown as EvalResultMessage;
  }
  if (value.type === "capability_call") {
    if (
      typeof value.evalId !== "string" ||
      typeof value.callId !== "string" ||
      typeof value.name !== "string"
    ) {
      throw new Error("capability call frame is malformed.");
    }
    return {
      type: "capability_call",
      evalId: value.evalId,
      callId: value.callId,
      name: value.name,
      input: value.input,
    };
  }
  throw new Error(`unknown frame type: ${value.type.slice(0, 64)}.`);
}

export function validateCommittedState(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Kernel state must be a JSON object.");
  const pending: Array<{ value: unknown; exiting: boolean }> = [{ value, exiting: false }];
  const active = new Set<object>();
  let visited = 0;
  while (pending.length > 0) {
    const frame = pending.pop();
    if (!frame) break;
    const current = frame.value;
    if (frame.exiting) {
      if (current && typeof current === "object") active.delete(current);
      continue;
    }
    visited += 1;
    if (visited > 100_000) throw new Error("Kernel state exceeds the structural node limit.");
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean" ||
      (typeof current === "number" && Number.isFinite(current))
    ) {
      continue;
    }
    if (!current || typeof current !== "object") {
      throw new Error("Kernel state must contain only JSON-compatible values.");
    }
    if (active.has(current)) throw new Error("Kernel state must not contain cycles.");
    active.add(current);
    pending.push({ value: current, exiting: true });
    if (Array.isArray(current)) {
      pending.push(...current.map((entry) => ({ value: entry, exiting: false })));
      continue;
    }
    if (Object.getPrototypeOf(current) !== Object.prototype) {
      throw new Error("Kernel state objects must use plain JSON object semantics.");
    }
    pending.push(...Object.values(current).map((entry) => ({ value: entry, exiting: false })));
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) {
    throw new Error(`Kernel state exceeds the ${MAX_STATE_BYTES}-byte limit.`);
  }
  return value;
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalElapsedMs(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

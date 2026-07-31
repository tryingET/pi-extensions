// summary: validates bounded visible-loop terminal dispositions and their deferred owner references.
// read_when:
//   - changing deferred/blocked loop closure, terminal-record schemas, or relaunch guidance.

export const VISIBLE_LOOP_TERMINAL_DISPOSITIONS = ["deferred", "blocked"] as const;
export const VISIBLE_LOOP_DEFERRED_ITEM_KINDS = [
  "ak_task",
  "decision",
  "owner_gate",
  "trigger",
  "other",
] as const;
export const VISIBLE_LOOP_DEFERRED_ITEM_STATES = ["deferred", "blocked", "waiting"] as const;

export type VisibleLoopTerminalDisposition = (typeof VISIBLE_LOOP_TERMINAL_DISPOSITIONS)[number];
export type VisibleLoopDeferredItemKind = (typeof VISIBLE_LOOP_DEFERRED_ITEM_KINDS)[number];
export type VisibleLoopDeferredItemState = (typeof VISIBLE_LOOP_DEFERRED_ITEM_STATES)[number];

export interface VisibleLoopDeferredItem {
  kind: VisibleLoopDeferredItemKind;
  ref: string;
  state: VisibleLoopDeferredItemState;
  nextAction: string;
}

export interface VisibleLoopTerminalDispositionRequest {
  configPath: string;
  iteration: number;
  disposition: VisibleLoopTerminalDisposition;
  reason: string;
  items: VisibleLoopDeferredItem[];
}

export interface VisibleLoopTerminalDispositionRecord {
  schemaVersion: 1;
  runId: string;
  iteration: number;
  disposition: VisibleLoopTerminalDisposition;
  reason: string;
  items: VisibleLoopDeferredItem[];
  createdAt: string;
  authority: "local_loop_control_only_non_authoritative";
}

const MAX_REASON_LENGTH = 500;
const MAX_ITEM_COUNT = 16;
const MAX_REF_LENGTH = 200;
const MAX_NEXT_ACTION_LENGTH = 500;

export function parseVisibleLoopTerminalDispositionRequest(
  value: unknown,
): { ok: true; request: VisibleLoopTerminalDispositionRequest } | { ok: false; error: string } {
  if (!isRecord(value)) return failure("terminal disposition request must be an object");
  const allowed = new Set(["configPath", "iteration", "disposition", "reason", "items"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return failure("terminal disposition request has unknown fields");
  }
  const configPath = boundedSingleLine(value.configPath, "configPath", 4_096);
  if (!configPath.ok) return configPath;
  const iteration = boundedIteration(value.iteration);
  if (!iteration.ok) return iteration;
  const disposition = parseEnum(
    value.disposition,
    VISIBLE_LOOP_TERMINAL_DISPOSITIONS,
    "disposition",
  );
  if (!disposition.ok) return disposition;
  const reason = boundedSingleLine(value.reason, "reason", MAX_REASON_LENGTH);
  if (!reason.ok) return reason;
  const items = parseItems(value.items);
  if (!items.ok) return items;
  return {
    ok: true,
    request: {
      configPath: configPath.value,
      iteration: iteration.value,
      disposition: disposition.value,
      reason: reason.value,
      items: items.value,
    },
  };
}

export function parseVisibleLoopTerminalDispositionRecord(
  value: unknown,
): { ok: true; record: VisibleLoopTerminalDispositionRecord } | { ok: false; error: string } {
  if (!isRecord(value)) return failure("terminal disposition record must be an object");
  const allowed = new Set([
    "schemaVersion",
    "runId",
    "iteration",
    "disposition",
    "reason",
    "items",
    "createdAt",
    "authority",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return failure("terminal disposition record has unknown fields");
  }
  if (value.schemaVersion !== 1) return failure("unsupported terminal disposition schemaVersion");
  const runId = boundedSingleLine(value.runId, "runId", 160);
  if (!runId.ok || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u.test(runId.value)) {
    return failure("runId is invalid");
  }
  const iteration = boundedIteration(value.iteration);
  if (!iteration.ok) return iteration;
  const disposition = parseEnum(
    value.disposition,
    VISIBLE_LOOP_TERMINAL_DISPOSITIONS,
    "disposition",
  );
  if (!disposition.ok) return disposition;
  const reason = boundedSingleLine(value.reason, "reason", MAX_REASON_LENGTH);
  if (!reason.ok) return reason;
  const items = parseItems(value.items);
  if (!items.ok) return items;
  const createdAt = boundedSingleLine(value.createdAt, "createdAt", 64);
  if (!createdAt.ok || !Number.isFinite(Date.parse(createdAt.value))) {
    return failure("createdAt is invalid");
  }
  if (value.authority !== "local_loop_control_only_non_authoritative") {
    return failure("terminal disposition authority marker is invalid");
  }
  return {
    ok: true,
    record: {
      schemaVersion: 1,
      runId: runId.value,
      iteration: iteration.value,
      disposition: disposition.value,
      reason: reason.value,
      items: items.value,
      createdAt: createdAt.value,
      authority: "local_loop_control_only_non_authoritative",
    },
  };
}

function parseItems(
  value: unknown,
): { ok: true; value: VisibleLoopDeferredItem[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ITEM_COUNT) {
    return failure(`items must contain between 1 and ${MAX_ITEM_COUNT} entries`);
  }
  const parsed: VisibleLoopDeferredItem[] = [];
  const refs = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return failure(`items[${index}] must be an object`);
    const allowed = new Set(["kind", "ref", "state", "nextAction"]);
    if (Object.keys(item).some((key) => !allowed.has(key))) {
      return failure(`items[${index}] has unknown fields`);
    }
    const kind = parseEnum(item.kind, VISIBLE_LOOP_DEFERRED_ITEM_KINDS, `items[${index}].kind`);
    if (!kind.ok) return kind;
    const ref = boundedSingleLine(item.ref, `items[${index}].ref`, MAX_REF_LENGTH);
    if (!ref.ok) return ref;
    if (refs.has(ref.value)) return failure("deferred item refs must be unique");
    refs.add(ref.value);
    const state = parseEnum(item.state, VISIBLE_LOOP_DEFERRED_ITEM_STATES, `items[${index}].state`);
    if (!state.ok) return state;
    const nextAction = boundedSingleLine(
      item.nextAction,
      `items[${index}].nextAction`,
      MAX_NEXT_ACTION_LENGTH,
    );
    if (!nextAction.ok) return nextAction;
    parsed.push({
      kind: kind.value,
      ref: ref.value,
      state: state.value,
      nextAction: nextAction.value,
    });
  }
  return { ok: true, value: parsed };
}

function boundedIteration(
  value: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100) {
    return failure("iteration must be an integer between 1 and 100");
  }
  return { ok: true, value };
}

function boundedSingleLine(
  value: unknown,
  label: string,
  maxLength: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") return failure(`${label} must be a string`);
  const normalized = value.trim();
  const hasControlCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  if (!normalized || normalized.length > maxLength || hasControlCharacter) {
    return failure(`${label} must be a non-empty bounded single-line string`);
  }
  return { ok: true, value: normalized };
}

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  values: T,
  label: string,
): { ok: true; value: T[number] } | { ok: false; error: string } {
  if (typeof value !== "string" || !values.includes(value)) {
    return failure(`${label} must be one of: ${values.join(", ")}`);
  }
  return { ok: true, value: value as T[number] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

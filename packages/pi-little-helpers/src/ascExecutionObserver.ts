// summary: owns private read-only Ghostty observer state for ASC execution progress events.
// read_when:
//   - changing automatic ASC observer launch, state privacy, grouping, or headless fallback.

import { createHash, randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
  type ObservationEvent,
  type ObserverTerminalStatus,
  type ObserverUsage,
  parseObservationEvent,
} from "./ascExecutionObserverProtocol.ts";

export { ASC_EXECUTION_OBSERVATION_EVENT } from "./ascExecutionObserverProtocol.ts";

export const ASC_EXECUTION_OBSERVER_STATE_SCHEMA = "pi.asc_execution_observer_state.v1";

const MAX_STATE_BYTES = 64 * 1024;
const MAX_ID_CHARS = 160;
const MAX_LABEL_CHARS = 120;
const MAX_PATH_CHARS = 4096;
const MAX_PHASES = 64;
const MAX_RETAINED_GROUPS = 128;
const TERMINAL_RETENTION_MS = 10 * 60 * 1000;
const INACTIVE_GROUP_RETENTION_MS = 24 * 60 * 60 * 1000;
const STALE_SNAPSHOT_RETENTION_MS = 10 * 60 * 1000;
const ORPHAN_SNAPSHOT_RETENTION_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_NAME_PATTERN = /^[a-f0-9]{64}\.json$/u;

export type AscObserverPolicy = "auto" | "ghostty" | "off";
export type AscObserverLaunchStatus = "pending" | "launched" | "failed";
export type AscObserverHostMode = "tui" | "rpc" | "json" | "print";

export interface AscObserverLaunchRequest {
  statePath: string;
  cwd: string;
  title: string;
  controllerInstanceId: string;
}

export interface AscObserverLaunchOutcome {
  ok: boolean;
  launchMode?: "tab" | "window";
  note?: string;
  failure?: string;
}

export interface AscObserverHostContext {
  mode: AscObserverHostMode;
  hasUI: boolean;
  cwd: string;
  sessionId?: string;
}

export interface AscExecutionObserverState {
  schema: typeof ASC_EXECUTION_OBSERVER_STATE_SCHEMA;
  group: ObservationEvent["group"];
  producer: ObservationEvent["producer"];
  cwd: string;
  ownerPid: number;
  controllerInstanceId: string;
  controllerActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastObservationAt: number;
  status: "spawning" | "running" | ObserverTerminalStatus;
  lastActivityAt?: number;
  activeDispatch?: {
    dispatchId?: string;
    attemptId?: string;
    profile?: string;
    progressPhase?: string;
    sequence?: number;
    latestTool?: string;
    usage?: ObserverUsage;
  };
  phases: Array<{
    name: string;
    index: number;
    count: number;
    agent?: string;
    cognitiveTool?: string;
    status: "pending" | "spawning" | "running" | ObserverTerminalStatus;
    elapsedMs?: number;
    failureKind?: string;
    effectDisposition?: "settled" | "confirmed_no_effects" | "effect_indeterminate";
  }>;
  terminal?: {
    ok: boolean;
    status: ObserverTerminalStatus;
    failureKind?: string;
    effectDisposition?: "settled" | "confirmed_no_effects" | "effect_indeterminate";
    elapsedMs?: number;
  };
  observer: {
    launchStatus: AscObserverLaunchStatus;
    launchMode?: "tab" | "window";
    note?: string;
    failure?: string;
  };
  notice: "Read-only observer. ASC remains execution truth; closing this tab does not cancel work.";
}

export interface AscExecutionObserverController {
  setHostContext(context: AscObserverHostContext): void;
  handle(rawEvent: unknown): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
  statePathFor(
    groupId: string,
    producer?: ObservationEvent["producer"],
    groupKind?: ObservationEvent["group"]["kind"],
  ): string;
}

export interface AscExecutionObserverOptions {
  env?: NodeJS.ProcessEnv;
  processId?: number;
  stateRoot?: string;
  launch(request: AscObserverLaunchRequest): Promise<AscObserverLaunchOutcome>;
  onLaunchFailure?: (message: string) => void;
  now?: () => number;
}

interface ObserverEntry {
  state: AscExecutionObserverState;
  statePath: string;
  terminalAt?: number;
}

export function resolveAscObserverPolicy(env: NodeJS.ProcessEnv = process.env): AscObserverPolicy {
  const value = env.PI_ASC_OBSERVER?.trim().toLowerCase();
  if (["0", "off", "false", "headless", "disabled"].includes(value || "")) return "off";
  if (["1", "on", "true", "ghostty"].includes(value || "")) return "ghostty";
  return "auto";
}

export function resolveAscObserverStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.PI_ASC_OBSERVER_STATE_DIR?.trim();
  if (override && isAbsolute(override)) return resolve(override);
  const runtimeDir = env.XDG_RUNTIME_DIR?.trim();
  if (runtimeDir && isAbsolute(runtimeDir)) return join(resolve(runtimeDir), "pi-asc-observers");
  return join(homedir(), ".local", "state", "pi-asc-observers");
}

export function createAscExecutionObserverController(
  options: AscExecutionObserverOptions,
): AscExecutionObserverController {
  const env = options.env ?? process.env;
  const ownerPid = options.processId ?? process.pid;
  const stateRoot = resolve(options.stateRoot ?? resolveAscObserverStateRoot(env));
  const now = options.now ?? Date.now;
  const policy = resolveAscObserverPolicy(env);
  const controllerInstanceId = randomUUID();
  const groups = new Map<string, ObserverEntry>();
  const queues = new Map<string, Promise<void>>();
  let hostContext: AscObserverHostContext = {
    mode: "print",
    hasUI: false,
    cwd: resolve(process.cwd()),
  };
  let disposed = false;
  let staleSnapshotsPruned = false;

  function isEnabled(): boolean {
    if (disposed || hostContext.mode !== "tui" || !hostContext.hasUI || policy === "off") {
      return false;
    }
    return policy === "ghostty" || env.TERM_PROGRAM?.trim().toLowerCase() === "ghostty";
  }

  function statePathFor(
    groupId: string,
    producer: ObservationEvent["producer"] = "loop_execute",
    groupKind: ObservationEvent["group"]["kind"] = "loop",
  ): string {
    const scope = hostContext.sessionId?.trim() || `pid-${ownerPid}`;
    const digest = createHash("sha256")
      .update(`${scope}\0${producer}\0${groupKind}\0${groupId}`)
      .digest("hex");
    return join(stateRoot, `${digest}.json`);
  }

  function pruneExpiredGroups(at: number): void {
    for (const [key, entry] of groups) {
      const terminalExpired =
        entry.terminalAt !== undefined && at - entry.terminalAt >= TERMINAL_RETENTION_MS;
      const inactiveExpired =
        entry.terminalAt === undefined &&
        entry.state.activeDispatch === undefined &&
        at - entry.state.lastObservationAt >= INACTIVE_GROUP_RETENTION_MS;
      if (!terminalExpired && !inactiveExpired) continue;
      groups.delete(key);
      safeUnlinkPrivateState(entry.statePath, stateRoot);
    }
  }

  function retainedOrQueuedGroupCount(): number {
    let count = groups.size;
    for (const key of queues.keys()) {
      if (!groups.has(key)) count += 1;
    }
    return count;
  }

  async function applyEvent(event: ObservationEvent): Promise<void> {
    if (!isEnabled() || resolve(event.cwd) !== hostContext.cwd) return;
    const at = now();
    if (!staleSnapshotsPruned) {
      staleSnapshotsPruned = true;
      pruneStaleObserverSnapshots(stateRoot, at);
    }
    pruneExpiredGroups(at);

    const key = observationGroupKey(event);
    let entry = groups.get(key);
    if (!entry) {
      if (event.event !== "dispatch_progress" || groups.size >= MAX_RETAINED_GROUPS) return;
      const timestamp = new Date(at).toISOString();
      entry = {
        statePath: statePathFor(event.group.id, event.producer, event.group.kind),
        state: {
          schema: ASC_EXECUTION_OBSERVER_STATE_SCHEMA,
          group: event.group,
          producer: event.producer,
          cwd: hostContext.cwd,
          ownerPid,
          controllerInstanceId,
          controllerActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastObservationAt: at,
          status: "spawning",
          phases: [],
          observer: { launchStatus: "pending" },
          notice:
            "Read-only observer. ASC remains execution truth; closing this tab does not cancel work.",
        },
      };
      groups.set(key, entry);
    }

    if (isRedundantProgress(entry.state, event)) return;
    entry.state.controllerActive = true;
    const completedGroup = updateState(entry.state, event, at);
    if (completedGroup) entry.terminalAt = at;
    else if (event.event === "dispatch_progress") entry.terminalAt = undefined;
    writePrivateState(entry.statePath, entry.state, stateRoot);

    if (entry.state.observer.launchStatus !== "pending") return;
    let outcome: AscObserverLaunchOutcome;
    try {
      outcome = await options.launch({
        statePath: entry.statePath,
        cwd: entry.state.cwd,
        title: `ASC · ${entry.state.group.label}`,
        controllerInstanceId,
      });
    } catch (error) {
      outcome = {
        ok: false,
        failure: boundedErrorMessage(error, "Ghostty observer launch rejected"),
      };
    }

    const note = boundString(outcome.note, MAX_LABEL_CHARS);
    const failure = boundString(outcome.failure, MAX_LABEL_CHARS);
    entry.state.observer = outcome.ok
      ? {
          launchStatus: "launched",
          ...(outcome.launchMode ? { launchMode: outcome.launchMode } : {}),
          ...(note ? { note } : {}),
        }
      : {
          launchStatus: "failed",
          failure: failure || "Ghostty observer launch failed",
        };
    entry.state.updatedAt = new Date(now()).toISOString();
    writePrivateState(entry.statePath, entry.state, stateRoot);
    if (!outcome.ok) {
      try {
        options.onLaunchFailure?.(
          `ASC observer launch failed; execution continues headlessly: ${entry.state.observer.failure}`,
        );
      } catch {
        // A presentation notification is best-effort and never reopens launch or execution state.
      }
    }
  }

  return {
    setHostContext(context) {
      if (disposed) return;
      hostContext = {
        mode: context.mode,
        hasUI: context.hasUI === true,
        cwd: normalizeHostCwd(context.cwd),
        ...(strictIdentity(context.sessionId, MAX_ID_CHARS)
          ? { sessionId: strictIdentity(context.sessionId, MAX_ID_CHARS) }
          : {}),
      };
    },
    handle(rawEvent) {
      if (disposed || !isEnabled()) return;
      const event = parseObservationEvent(rawEvent);
      if (!event || resolve(event.cwd) !== hostContext.cwd) return;
      pruneExpiredGroups(now());
      const key = observationGroupKey(event);
      if (
        !groups.has(key) &&
        !queues.has(key) &&
        retainedOrQueuedGroupCount() >= MAX_RETAINED_GROUPS
      ) {
        return;
      }
      const previous = queues.get(key) ?? Promise.resolve();
      const next = previous
        .catch(() => undefined)
        .then(() => applyEvent(event))
        .catch(() => undefined);
      queues.set(key, next);
      void next.finally(() => {
        if (queues.get(key) === next) queues.delete(key);
      });
    },
    async flush() {
      await Promise.all([...queues.values()].map((queue) => queue.catch(() => undefined)));
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await Promise.all([...queues.values()].map((queue) => queue.catch(() => undefined)));
      const timestamp = new Date(now()).toISOString();
      for (const entry of groups.values()) {
        entry.state.controllerActive = false;
        entry.state.updatedAt = timestamp;
        try {
          writePrivateState(entry.statePath, entry.state, stateRoot);
        } catch {
          // The renderer also detects unavailable state; teardown remains best-effort.
        }
      }
      groups.clear();
      queues.clear();
    },
    statePathFor,
  };
}

function updateState(
  state: AscExecutionObserverState,
  event: ObservationEvent,
  now: number,
): boolean {
  state.updatedAt = new Date(now).toISOString();
  state.lastObservationAt = now;
  if (event.event === "dispatch_progress" && event.progress) {
    state.status = event.progress.status === "spawning" ? "spawning" : "running";
    state.lastActivityAt = event.progress.lastActivityAt ?? state.lastActivityAt;
    state.activeDispatch = {
      ...event.dispatch,
      ...(event.progress.phase ? { progressPhase: event.progress.phase } : {}),
      ...(event.progress.sequence !== undefined ? { sequence: event.progress.sequence } : {}),
      ...(event.progress.latestTool ? { latestTool: event.progress.latestTool } : {}),
      ...(event.progress.usage ? { usage: event.progress.usage } : {}),
    };
    if (state.terminal) state.terminal = undefined;
    if (event.phase) upsertPhase(state, event.phase, state.status);
    return false;
  }

  if (!event.terminal) return false;
  if (event.phase) {
    upsertPhase(state, event.phase, event.terminal.status, {
      elapsedMs: event.terminal.elapsedMs,
      failureKind: event.terminal.failureKind,
      effectDisposition: event.terminal.effectDisposition,
    });
  }
  state.activeDispatch = undefined;

  const completesGroup = event.event === "group_terminal" || state.group.kind === "dispatch";
  if (!completesGroup) return false;
  state.status = event.terminal.status;
  state.terminal = {
    ok: event.terminal.ok,
    status: event.terminal.status,
    ...(event.terminal.failureKind ? { failureKind: event.terminal.failureKind } : {}),
    ...(event.terminal.effectDisposition
      ? { effectDisposition: event.terminal.effectDisposition }
      : {}),
    ...(event.terminal.elapsedMs !== undefined ? { elapsedMs: event.terminal.elapsedMs } : {}),
  };
  return true;
}

function isRedundantProgress(state: AscExecutionObserverState, event: ObservationEvent): boolean {
  if (event.event !== "dispatch_progress" || event.progress?.sequence === undefined) return false;
  const current = state.activeDispatch;
  if (current?.sequence === undefined || event.progress.sequence > current.sequence) return false;
  return (
    current.dispatchId === event.dispatch?.dispatchId &&
    current.attemptId === event.dispatch?.attemptId
  );
}

function upsertPhase(
  state: AscExecutionObserverState,
  phase: NonNullable<ObservationEvent["phase"]>,
  status: AscExecutionObserverState["phases"][number]["status"],
  terminal: {
    elapsedMs?: number;
    failureKind?: string;
    effectDisposition?: "settled" | "confirmed_no_effects" | "effect_indeterminate";
  } = {},
): void {
  const next = {
    name: phase.name,
    index: phase.index,
    count: phase.count,
    ...(phase.agent ? { agent: phase.agent } : {}),
    ...(phase.cognitiveTool ? { cognitiveTool: phase.cognitiveTool } : {}),
    status,
    ...(terminal.elapsedMs !== undefined ? { elapsedMs: terminal.elapsedMs } : {}),
    ...(terminal.failureKind ? { failureKind: terminal.failureKind } : {}),
    ...(terminal.effectDisposition ? { effectDisposition: terminal.effectDisposition } : {}),
  };
  const index = state.phases.findIndex((candidate) => candidate.index === phase.index);
  if (index >= 0) state.phases[index] = next;
  else if (state.phases.length < MAX_PHASES) state.phases.push(next);
  state.phases.sort((left, right) => left.index - right.index);
}

function observationGroupKey(event: ObservationEvent): string {
  return `${event.producer}\0${event.group.kind}\0${event.group.id}`;
}

function normalizeHostCwd(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PATH_CHARS ||
    value.trim() !== value ||
    !isAbsolute(value) ||
    hasControlCharacters(value)
  ) {
    return resolve(process.cwd());
  }
  return resolve(value);
}

function pruneStaleObserverSnapshots(stateRoot: string, now: number): void {
  try {
    if (!existsSync(stateRoot)) return;
    assertPrivateStateRoot(stateRoot);
    for (const name of readdirSync(stateRoot)) {
      if (!SNAPSHOT_NAME_PATTERN.test(name)) continue;
      const candidate = join(stateRoot, name);
      try {
        const stat = lstatSync(candidate);
        if (!isPrivateOwnedRegularFile(stat) || stat.size <= 0 || stat.size > MAX_STATE_BYTES) {
          continue;
        }
        const parsed = JSON.parse(readFileSync(candidate, "utf8")) as Record<string, unknown>;
        const updatedAt = typeof parsed.updatedAt === "string" ? Date.parse(parsed.updatedAt) : NaN;
        const inactive = parsed.controllerActive === false;
        const ageMs = now - updatedAt;
        if (
          parsed.schema === ASC_EXECUTION_OBSERVER_STATE_SCHEMA &&
          Number.isFinite(updatedAt) &&
          ((inactive && ageMs >= STALE_SNAPSHOT_RETENTION_MS) ||
            ageMs >= ORPHAN_SNAPSHOT_RETENTION_MS)
        ) {
          unlinkSync(candidate);
        }
      } catch {
        // Ignore files that are concurrently replaced or are not this controller's safe format.
      }
    }
  } catch {
    // Cleanup is opportunistic and never blocks a new observer or ASC execution.
  }
}

function writePrivateState(
  statePath: string,
  state: AscExecutionObserverState,
  stateRoot: string,
): void {
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  assertPrivateStateRoot(stateRoot);
  const resolvedPath = resolve(statePath);
  if (!resolvedPath.startsWith(`${resolve(stateRoot)}/`)) {
    throw new Error("ASC observer state path escaped its private root");
  }
  if (existsSync(resolvedPath)) {
    const existing = lstatSync(resolvedPath);
    if (!isPrivateOwnedRegularFile(existing)) {
      throw new Error("ASC observer state target is not a private owned regular file");
    }
  }
  const content = `${JSON.stringify(state)}\n`;
  if (Buffer.byteLength(content, "utf8") > MAX_STATE_BYTES) {
    throw new Error("ASC observer state exceeded its bounded file budget");
  }
  const temporaryPath = join(
    stateRoot,
    `.${createHash("sha256").update(resolvedPath).digest("hex")}.${randomUUID()}.tmp`,
  );
  const descriptor = openSync(temporaryPath, "wx", 0o600);
  try {
    try {
      writeFileSync(descriptor, content, "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporaryPath, resolvedPath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Best-effort cleanup of this writer's private unpublished temporary inode.
    }
    throw error;
  }
}

function assertPrivateStateRoot(stateRoot: string): void {
  const rootStat = lstatSync(stateRoot);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    (typeof process.getuid === "function" && rootStat.uid !== process.getuid())
  ) {
    throw new Error("ASC observer state root is not a private owned directory");
  }
  if ((rootStat.mode & 0o077) !== 0) chmodSync(stateRoot, 0o700);
}

function isPrivateOwnedRegularFile(stat: Stats): boolean {
  return (
    stat.isFile() &&
    !stat.isSymbolicLink() &&
    stat.nlink === 1 &&
    (stat.mode & 0o077) === 0 &&
    (typeof process.getuid !== "function" || stat.uid === process.getuid())
  );
}

function safeUnlinkPrivateState(statePath: string, stateRoot: string): void {
  try {
    const resolvedPath = resolve(statePath);
    if (!resolvedPath.startsWith(`${resolve(stateRoot)}/`)) return;
    const stat = lstatSync(resolvedPath);
    if (isPrivateOwnedRegularFile(stat)) unlinkSync(resolvedPath);
  } catch {
    // Retention is best-effort and never affects execution or current observer state.
  }
}

function boundedErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return boundString(message, MAX_LABEL_CHARS) || fallback;
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

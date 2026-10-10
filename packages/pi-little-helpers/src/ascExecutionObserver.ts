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
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  matchesRenderer,
  type ObservationEvent,
  type ObserverTerminalStatus,
  type ObserverUsage,
  parseObservationEvent,
  processStart,
  readPrivateObserverJson,
  readStartupReceipt,
  sanitizeSingleLine,
  strictString as strictIdentity,
  strictPath,
  updateState,
} from "./ascExecutionObserverProtocol.ts";

export { ASC_EXECUTION_OBSERVATION_EVENT } from "./ascExecutionObserverProtocol.ts";

export const ASC_EXECUTION_OBSERVER_STATE_SCHEMA = "pi.asc_execution_observer_state.v1";
export const ASC_EXECUTION_OBSERVER_SESSION_SCHEMA = "pi.asc_execution_observer_session.v1";
const MAX_SESSION_BYTES = 8 * 1024 * 1024;
const ACK_POLL_MS = 50;
const NOTICE =
  "Read-only observer. ASC remains execution truth; closing this tab does not cancel work.";
const hashIdentity = (value: string) => createHash("sha256").update(value).digest("hex");

const MAX_STATE_BYTES = 64 * 1024;
const MAX_ID_CHARS = 160;
const MAX_LABEL_CHARS = 120;
const MAX_RETAINED_GROUPS = 128;
const TERMINAL_RETENTION_MS = 10 * 60 * 1000;
const INACTIVE_GROUP_RETENTION_MS = 24 * 60 * 60 * 1000;
const STALE_SNAPSHOT_RETENTION_MS = 10 * 60 * 1000;
const ORPHAN_SNAPSHOT_RETENTION_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_NAME_PATTERN = /^[a-f0-9]{64}\.json$/u;

export type AscObserverPolicy = "auto" | "ghostty" | "off";
export type AscObserverLaunchStatus = "pending" | "unconfirmed" | "launched" | "failed" | "closed";
export type AscObserverHostMode = "tui" | "rpc" | "json" | "print";

export interface AscObserverLaunchRequest {
  statePath: string;
  cwd: string;
  title: string;
  controllerInstanceId: string;
  sessionId: string;
  startupToken: string;
  startupReceiptPath: string;
}

export interface AscObserverLaunchOutcome {
  ok: boolean;
  launchMode?: "tab" | "window";
  note?: string;
  failure?: string;
  effectDisposition?: "settled" | "confirmed_no_effects" | "effect_indeterminate";
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
  ownerProcessStart?: string;
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
  observer: Omit<AscObserverLaunchOutcome, "ok"> & {
    launchStatus: AscObserverLaunchStatus;
    rendererPid?: number;
  };
  notice: typeof NOTICE;
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
  startupTimeoutMs?: number;
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
  const ownerProcessStart = processStart(ownerPid);
  const createdAt = new Date(now()).toISOString();
  const groups = new Map<string, ObserverEntry>();
  const queues = new Map<string, Promise<void>>();
  let hostContext: AscObserverHostContext = {
    mode: "print",
    hasUI: false,
    cwd: resolve(process.cwd()),
  };
  let disposed = false;
  let staleSnapshotsPruned = false;
  let request: AscObserverLaunchRequest | undefined;
  let launchPromise: Promise<void> | undefined;
  let observer: AscExecutionObserverState["observer"] = { launchStatus: "pending" };
  let rendererStart: string | undefined;
  let monitor: ReturnType<typeof setInterval> | undefined;
  let reservationPath: string | undefined;
  let ownsReservation = false;
  const startupTimeoutMs = Math.min(5000, Math.max(0, options.startupTimeoutMs ?? 2000));

  function reservationState(): Record<string, unknown> {
    return {
      schema: "pi.asc_execution_observer_reservation.v1",
      sessionId: request?.sessionId,
      controllerInstanceId,
      observer,
    };
  }

  function publishSession(): void {
    if (!request) return;
    const path = reservationPath;
    if (ownsReservation && path)
      observational(() => writePrivateState(path, reservationState(), stateRoot));
    writePrivateState(
      request.statePath,
      {
        schema: ASC_EXECUTION_OBSERVER_SESSION_SCHEMA,
        sessionId: request.sessionId,
        controllerInstanceId,
        ownerPid,
        ownerProcessStart,
        controllerActive: !disposed,
        createdAt,
        updatedAt: new Date(now()).toISOString(),
        observer,
        groups: [...groups.values()].map((entry) => entry.state),
        notice: NOTICE,
      },
      stateRoot,
    );
  }

  function publishObserver(): void {
    for (const entry of groups.values()) {
      entry.state.observer = { ...observer };
      writePrivateState(entry.statePath, entry.state, stateRoot);
    }
    publishSession();
  }

  function checkReceipt(): void {
    if (
      !request ||
      !ownsReservation ||
      disposed ||
      observer.launchStatus === "failed" ||
      observer.launchStatus === "closed"
    )
      return;
    if (observer.launchStatus === "launched") {
      if (!observer.rendererPid || !matchesRenderer(observer.rendererPid, rendererStart, request)) {
        observer = { ...observer, launchStatus: "closed" };
        publishObserver();
        if (monitor) clearInterval(monitor);
      }
      return;
    }
    const receipt = readStartupReceipt(request);
    if (!receipt) return;
    rendererStart = receipt.rendererStart;
    observer = { ...observer, launchStatus: "launched", rendererPid: receipt.rendererPid };
    publishObserver();
  }

  function notifyFailure(message: string): void {
    observational(() => options.onLaunchFailure?.(message));
  }

  async function launchSession(): Promise<void> {
    if (!request || disposed) return;
    let outcome: AscObserverLaunchOutcome;
    try {
      outcome = await options.launch(request);
    } catch (error) {
      outcome = {
        ok: false,
        failure: boundedErrorMessage(error, "Ghostty observer launch rejected"),
      };
    }
    if (disposed) return;
    // A rejected callback or unclassified failure may settle after terminal dispatch. Only an
    // explicit no-effects receipt rules out that attempt; keep immediate/late ACK inspection.
    if (!outcome.ok && outcome.effectDisposition !== "confirmed_no_effects") {
      outcome = { ...outcome, effectDisposition: "effect_indeterminate" };
    }
    const note = boundString(outcome.note, MAX_LABEL_CHARS);
    const failure =
      boundString(outcome.failure, MAX_LABEL_CHARS) || "Ghostty observer launch failed";
    observer = {
      launchStatus:
        outcome.ok || outcome.effectDisposition === "effect_indeterminate" ? "pending" : "failed",
      ...(outcome.effectDisposition ? { effectDisposition: outcome.effectDisposition } : {}),
      ...(outcome.launchMode ? { launchMode: outcome.launchMode } : {}),
      ...(note ? { note } : {}),
      ...(!outcome.ok ? { failure } : {}),
    };
    publishObserver();
    if (!outcome.ok && outcome.effectDisposition !== "effect_indeterminate") {
      notifyFailure(
        `ASC observer launch failed; execution continues headlessly: ${observer.failure}`,
      );
      return;
    }
    const deadline = Date.now() + startupTimeoutMs;
    do {
      checkReceipt();
      if (disposed || observer.launchStatus === "launched") break;
      await delay(Math.min(ACK_POLL_MS, Math.max(0, deadline - Date.now())));
    } while (Date.now() < deadline);
    if (disposed) return;
    if (observer.launchStatus !== "launched") {
      observer = { ...observer, launchStatus: "unconfirmed" };
      publishObserver();
      notifyFailure(
        "ASC observer startup unconfirmed; no renderer ACK. Execution continues headlessly; no retry.",
      );
    }
    // Observe late ACK/closure only. This monitor never creates another tab or signals work.
    monitor = setInterval(() => observational(checkReceipt), ACK_POLL_MS);
    monitor.unref();
  }

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
    const digest = hashIdentity(`${scope}\0${producer}\0${groupKind}\0${groupId}`);
    return join(stateRoot, `${digest}.json`);
  }

  function pruneExpiredGroups(at: number): void {
    let changed = false;
    for (const [key, entry] of groups) {
      const terminalExpired =
        entry.terminalAt !== undefined && at - entry.terminalAt >= TERMINAL_RETENTION_MS;
      const inactiveExpired =
        entry.terminalAt === undefined &&
        entry.state.activeDispatch === undefined &&
        at - entry.state.lastObservationAt >= INACTIVE_GROUP_RETENTION_MS;
      if (!terminalExpired && !inactiveExpired) continue;
      groups.delete(key);
      changed = true;
      safeUnlinkPrivateState(entry.statePath, stateRoot);
    }
    if (changed) observational(publishSession);
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
          ownerProcessStart,
          controllerInstanceId,
          controllerActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastObservationAt: at,
          status: "spawning",
          phases: [],
          observer: { ...observer },
          notice: NOTICE,
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

    if (!request) {
      const sessionId = hostContext.sessionId || `pid-${ownerPid}`;
      const digest = hashIdentity(`${sessionId}\0${controllerInstanceId}`);
      const statePath = join(stateRoot, `${digest}.json`);
      request = {
        statePath,
        cwd: hostContext.cwd,
        title: "ASC · controller session",
        controllerInstanceId,
        sessionId,
        startupToken: randomUUID(),
        startupReceiptPath: `${statePath}.startup.json`,
      };
      // Session-scoped, exclusive durable reservation; never expires on generation teardown.
      reservationPath = join(stateRoot, `${hashIdentity(sessionId)}.reservation.json`);
      try {
        writePrivateState(reservationPath, reservationState(), stateRoot, true);
        ownsReservation = true;
      } catch {
        const prior = readPrivateObserverJson(reservationPath);
        const valid =
          prior?.schema === "pi.asc_execution_observer_reservation.v1" &&
          prior.sessionId === sessionId &&
          strictIdentity(prior.controllerInstanceId, 80);
        const status =
          valid && prior.observer && typeof prior.observer === "object"
            ? (prior.observer as AscExecutionObserverState["observer"]).launchStatus
            : undefined;
        observer = {
          launchStatus:
            status === "closed" || status === "failed" ? status : valid ? "unconfirmed" : "failed",
          note: valid
            ? "Session observer already attempted; no relaunch on reload."
            : "Private session reservation unavailable; no launch attempted.",
        };
      }
      entry.state.observer = { ...observer };
      writePrivateState(entry.statePath, entry.state, stateRoot);
    }
    publishSession();
    // Reservation is synchronous before any launch await, across ALL group queues.
    if (ownsReservation)
      launchPromise ??= Promise.resolve()
        .then(launchSession)
        .catch(() => undefined);
  }

  return {
    setHostContext(context) {
      if (disposed) return;
      if (
        request &&
        ((strictIdentity(context.sessionId, MAX_ID_CHARS) || `pid-${ownerPid}`) !==
          request.sessionId ||
          normalizeHostCwd(context.cwd) !== request.cwd)
      ) {
        // A controller generation cannot absorb a replacement session's groups.
        void this.dispose();
        return;
      }
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
        new Set([...groups.keys(), ...queues.keys()]).size >= MAX_RETAINED_GROUPS
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
      await launchPromise;
      observational(checkReceipt);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      if (monitor) clearInterval(monitor);
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
      observational(publishSession);
      // Detach the guarded transport drain: eventual settlement sees disposed and cannot revive.
      launchPromise = undefined;
      groups.clear();
      queues.clear();
    },
    statePathFor,
  };
}

function observational(action: () => void): void {
  try {
    action();
  } catch {
    /* Diagnostics never fail ASC execution. */
  }
}

function isRedundantProgress(state: AscExecutionObserverState, event: ObservationEvent): boolean {
  const current = state.activeDispatch;
  return (
    event.event === "dispatch_progress" &&
    event.progress?.sequence !== undefined &&
    current?.sequence !== undefined &&
    event.progress.sequence <= current.sequence &&
    current.dispatchId === event.dispatch?.dispatchId &&
    current.attemptId === event.dispatch?.attemptId
  );
}

function observationGroupKey(event: ObservationEvent): string {
  return `${event.producer}\0${event.group.kind}\0${event.group.id}`;
}

function normalizeHostCwd(value: unknown): string {
  return resolve(strictPath(value) || process.cwd());
}

function pruneStaleObserverSnapshots(stateRoot: string, now: number): void {
  try {
    if (!existsSync(stateRoot)) return;
    assertPrivateStateRoot(stateRoot);
    for (const name of readdirSync(stateRoot)) {
      if (!SNAPSHOT_NAME_PATTERN.test(name)) continue;
      const candidate = join(stateRoot, name);
      try {
        const parsed = readPrivateObserverJson(candidate, MAX_SESSION_BYTES);
        if (!parsed) continue;
        const updatedAt = typeof parsed.updatedAt === "string" ? Date.parse(parsed.updatedAt) : NaN;
        const shared = parsed.schema === ASC_EXECUTION_OBSERVER_SESSION_SCHEMA;
        const ownerAlive =
          typeof parsed.ownerProcessStart === "string" &&
          processStart(Number(parsed.ownerPid)) === parsed.ownerProcessStart;
        if (parsed.controllerActive === true && ownerAlive) continue;
        const inactive = parsed.controllerActive === false;
        const ageMs = now - updatedAt;
        if (
          (shared || parsed.schema === ASC_EXECUTION_OBSERVER_STATE_SCHEMA) &&
          Number.isFinite(updatedAt) &&
          ((inactive && ageMs >= STALE_SNAPSHOT_RETENTION_MS) ||
            ageMs >= ORPHAN_SNAPSHOT_RETENTION_MS)
        ) {
          unlinkSync(candidate);
          if (shared) safeUnlinkPrivateState(`${candidate}.startup.json`, stateRoot);
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
  state: AscExecutionObserverState | Record<string, unknown>,
  stateRoot: string,
  exclusive = false,
): void {
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  assertPrivateStateRoot(stateRoot);
  const resolvedPath = resolve(statePath);
  if (!resolvedPath.startsWith(`${resolve(stateRoot)}/`)) {
    throw new Error("ASC observer state path escaped its private root");
  }
  if (existsSync(resolvedPath) && !isPrivateOwnedRegularFile(lstatSync(resolvedPath))) {
    throw new Error("ASC observer state target is not a private owned regular file");
  }
  const content = `${JSON.stringify(state)}\n`;
  const budget =
    state.schema === "pi.asc_execution_observer_reservation.v1"
      ? 4096
      : state.schema === ASC_EXECUTION_OBSERVER_SESSION_SCHEMA
        ? MAX_SESSION_BYTES
        : MAX_STATE_BYTES;
  if (Buffer.byteLength(content, "utf8") > budget) {
    throw new Error("ASC observer state exceeded its bounded file budget");
  }
  const temporaryPath = join(
    stateRoot,
    `.${createHash("sha256").update(resolvedPath).digest("hex")}.${randomUUID()}.tmp`,
  );
  const descriptor = openSync(exclusive ? resolvedPath : temporaryPath, "wx", 0o600);
  try {
    try {
      writeFileSync(descriptor, content, "utf8");
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    if (!exclusive) renameSync(temporaryPath, resolvedPath);
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
    (typeof process.getuid === "function" && rootStat.uid !== process.getuid())
  ) {
    throw new Error("ASC observer state root is not a private owned directory");
  }
  if ((rootStat.mode & 0o077) !== 0) chmodSync(stateRoot, 0o700);
}

function isPrivateOwnedRegularFile(stat: Stats): boolean {
  return (
    stat.isFile() &&
    stat.nlink === 1 &&
    (stat.mode & 0o077) === 0 &&
    (typeof process.getuid !== "function" || stat.uid === process.getuid())
  );
}

function safeUnlinkPrivateState(statePath: string, stateRoot: string): void {
  try {
    const resolvedPath = resolve(statePath);
    if (!resolvedPath.startsWith(`${resolve(stateRoot)}/`)) return;
    if (isPrivateOwnedRegularFile(lstatSync(resolvedPath))) unlinkSync(resolvedPath);
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

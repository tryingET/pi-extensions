#!/usr/bin/env node
// Read-only renderer for private pi.asc_execution_observer_state.v1 snapshots.

import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  isEffectDisposition,
  isRuntimeStatus,
  isTerminalStatus,
  processStart,
  sanitizeSingleLine,
} from "../src/ascExecutionObserverProtocol.ts";

const STATE_SCHEMA = "pi.asc_execution_observer_state.v1";
const SESSION_SCHEMA = "pi.asc_execution_observer_session.v1";
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const MAX_PHASES = 64;
const POLL_MS = 500;
const LIVENESS_LEASE_MS = positiveEnv("PI_ASC_OBSERVER_LIVENESS_LEASE_MS", 15_000);
const QUIET_AFTER_MS = positiveEnv("PI_ASC_OBSERVER_QUIET_MS", 60_000);
const STALLED_AFTER_MS = positiveEnv("PI_ASC_OBSERVER_STALLED_MS", 5 * 60_000);
const SUCCESS_HOLD_MS = positiveEnv("PI_ASC_OBSERVER_SUCCESS_HOLD_MS", 15_000);
const FAILURE_HOLD_MS = positiveEnv("PI_ASC_OBSERVER_FAILURE_HOLD_MS", 60_000);
const DISCONNECTED_HOLD_MS = positiveEnv("PI_ASC_OBSERVER_DISCONNECTED_HOLD_MS", 30_000);

const { statePath, controllerInstanceId, sessionId, startupToken, startupReceiptPath } =
  parseArguments(process.argv.slice(2));
let acknowledged = false;
let ticking = false;
let terminalSeenAt;
let disconnectedSeenAt;
let unavailableSeenAt;
let lastKnownState;
let lastRendered = "";

const timer = setInterval(tick, POLL_MS);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
await tick();

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const state = readPrivateState(statePath);
    if (
      state.controllerInstanceId !== controllerInstanceId ||
      (state.schema === SESSION_SCHEMA && state.sessionId !== sessionId)
    )
      return shutdown();
    lastKnownState = state;
    unavailableSeenAt = undefined;
    const controllerAlive =
      state.controllerActive === true && processAlive(state.ownerPid, state.ownerProcessStart);
    const shared = state.schema === SESSION_SCHEMA;
    if (shared && !controllerAlive) return shutdown();
    const now = Date.now();
    const rendered = renderSnapshot(state, now, controllerAlive);
    if (rendered !== lastRendered) {
      await new Promise((done, reject) =>
        process.stdout.write(`\u001b[2J\u001b[H${rendered}\n`, (error) =>
          error ? reject(error) : done(),
        ),
      );
      lastRendered = rendered;
    }
    if (shared && !acknowledged) {
      // ACK only after this renderer validated its exact generation and wrote its first frame.
      // Not proof of terminal visibility, correct window placement, or ASC execution.
      writeStartupReceipt();
      acknowledged = true;
    }
    if (shared) return; // Session viewers stay alive through terminal/idle batches.

    terminalSeenAt = state.terminal ? (terminalSeenAt ?? now) : undefined;
    disconnectedSeenAt = controllerAlive ? undefined : (disconnectedSeenAt ?? now);
    const holdMs = state.terminal
      ? state.terminal.ok
        ? SUCCESS_HOLD_MS
        : FAILURE_HOLD_MS
      : DISCONNECTED_HOLD_MS;
    const seenAt = state.terminal ? terminalSeenAt : disconnectedSeenAt;
    if (seenAt !== undefined && now - seenAt >= holdMs) shutdown();
  } catch (error) {
    const now = Date.now();
    unavailableSeenAt ??= now;
    const rendered = renderUnavailable(error, now);
    if (rendered !== lastRendered) {
      process.stdout.write(`\u001b[2J\u001b[H${rendered}\n`);
      lastRendered = rendered;
    }
    if (!knownSessionAlive() && now - unavailableSeenAt >= DISCONNECTED_HOLD_MS) shutdown();
  } finally {
    ticking = false;
  }
}

function knownSessionAlive() {
  return (
    lastKnownState?.schema === SESSION_SCHEMA &&
    lastKnownState.controllerActive === true &&
    processAlive(lastKnownState.ownerPid, lastKnownState.ownerProcessStart)
  );
}

function renderUnavailable(error, now) {
  // Never infer expiration, controller death or execution failure from a read error.
  const explanation =
    error?.code === "ENOENT"
      ? "The observer status file is no longer available."
      : "The observer cannot read its status updates.";
  // JSON parser diagnostics can contain snapshot contents; do not display those excerpts.
  const message =
    error instanceof SyntaxError
      ? "State snapshot is not valid JSON."
      : error instanceof Error
        ? error.message
        : String(error);
  return [
    "ASC execution observer",
    "",
    "Progress updates unavailable",
    explanation,
    "Check the parent Pi session for the execution result.",
    "Closing this tab does not cancel work.",
    "",
    ...(lastKnownState
      ? [renderSnapshot(lastKnownState, now, false, true)]
      : ["No progress snapshot has been read yet."]),
    "",
    ...(lastKnownState
      ? ["Progress updates unavailable — all progress above is stale, not live."]
      : []),
    knownSessionAlive()
      ? "Observer waits for updates while its controller is live."
      : countdown(DISCONNECTED_HOLD_MS, unavailableSeenAt, now),
    `Technical details: ${singleLine(message, 180)}`,
  ].join("\n");
}

function renderSnapshot(state, now, controllerAlive, stale = false) {
  if (state.schema !== SESSION_SCHEMA) return renderState(state, now, controllerAlive, stale);
  const active = state.groups.filter((group) => group.activeDispatch && !group.terminal).length;
  const unsettled = state.groups.filter((group) => !group.terminal).length;
  return [
    stale
      ? "Last known progress (stale — no longer live)"
      : "ASC execution observer · controller session",
    stale
      ? "Session snapshot is stale"
      : active
        ? `active dispatches: ${active}`
        : unsettled
          ? "between dispatches"
          : "session idle — waiting for later batches",
    `retained groups: ${state.groups.length}/128`,
    "Closing this tab does not cancel work. No automatic relaunch.",
    "",
    ...state.groups.map((group) => renderState(group, now, controllerAlive, stale, true)),
  ].join("\n");
}

function writeStartupReceipt() {
  const rendererStart = processStart(process.pid);
  const descriptor = openSync(startupReceiptPath, "wx", 0o600);
  try {
    writeFileSync(
      descriptor,
      JSON.stringify({
        schema: "pi.asc_execution_observer_startup.v1",
        sessionId,
        controllerInstanceId,
        startupToken,
        rendererPid: process.pid,
        rendererStart,
      }),
    );
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function renderState(state, now, controllerAlive, stale = false, shared = false) {
  const terminal = normalizeTerminal(state.terminal);
  const observationAt = numberOrUndefined(state.lastObservationAt) ?? Date.parse(state.updatedAt);
  const heartbeatAgeMs = Number.isFinite(observationAt)
    ? Math.max(0, now - observationAt)
    : undefined;
  const activityAt = numberOrUndefined(state.lastActivityAt) ?? Date.parse(state.updatedAt);
  const quietForMs = Number.isFinite(activityAt) ? Math.max(0, now - activityAt) : undefined;
  const livenessLeaseExpired =
    controllerAlive && heartbeatAgeMs !== undefined && heartbeatAgeMs >= LIVENESS_LEASE_MS;
  let supervision = "healthy";
  if (quietForMs >= QUIET_AFTER_MS) {
    supervision =
      quietForMs < STALLED_AFTER_MS ? "quiet" : "suspected stall — inspect before cancelling";
  }
  if (livenessLeaseExpired) supervision = "telemetry lease expired — execution truth remains ASC";
  if (shared && !state.activeDispatch) supervision = "between dispatches";
  if (!controllerAlive) supervision = "controller disconnected";
  if (terminal) supervision = terminal.ok ? "complete" : "terminal failure";
  const groupLabel = singleLine(state.group.label, 120) || "execution";
  const activeDispatch = normalizeActiveDispatch(state.activeDispatch);
  const lines = [
    stale ? "Last known progress (stale — no longer live)" : undefined,
    `ASC execution observer · ${groupLabel}`,
    "═".repeat(Math.min(72, Math.max(24, groupLabel.length + 24))),
    `${stale ? "last known status" : "status"}: ${isRuntimeStatus(state.status) ? state.status : "error"}`,
    stale
      ? `snapshot age: ${formatDuration(now - Date.parse(state.updatedAt))}`
      : `supervision: ${supervision}`,
    stale
      ? `elapsed at last snapshot: ${formatDuration(Date.parse(state.updatedAt) - Date.parse(state.createdAt))}`
      : `elapsed: ${formatDuration(now - Date.parse(state.createdAt))}`,
    heartbeatAgeMs === undefined
      ? undefined
      : `telemetry heartbeat: ${formatDuration(heartbeatAgeMs)} ago`,
    quietForMs === undefined
      ? undefined
      : `last semantic activity: ${formatDuration(quietForMs)} ago`,
    activeDispatch.latestTool ? `latest tool: ${activeDispatch.latestTool}` : undefined,
    activeDispatch.profile ? `profile: ${activeDispatch.profile}` : undefined,
    activeDispatch.dispatchId ? `dispatch: ${activeDispatch.dispatchId}` : undefined,
    activeDispatch.attemptId ? `attempt: ${activeDispatch.attemptId}` : undefined,
    renderUsage(activeDispatch.usage),
    "",
  ].filter((line) => line !== undefined);

  const phases = Array.isArray(state.phases) ? state.phases.slice(0, MAX_PHASES) : [];
  if (phases.length > 0) {
    lines.push("phases:");
    for (const rawPhase of phases) {
      const phase = normalizePhase(rawPhase);
      if (!phase) continue;
      const icon = { done: "✓", running: "▶", spawning: "▶" }[phase.status] ?? "✗";
      const details = [phase.agent, phase.cognitiveTool].filter(Boolean).join("/");
      lines.push(
        `  ${icon} ${phase.index}/${phase.count} ${phase.name}: ${phase.status}${details ? ` · ${details}` : ""}${phase.elapsedMs === undefined ? "" : ` · ${formatDuration(phase.elapsedMs)}`}`,
      );
      if (phase.failureKind) lines.push(`      failure: ${phase.failureKind}`);
      if (phase.effectDisposition) {
        lines.push(`      ASC effect disposition: ${phase.effectDisposition}`);
      }
    }
    lines.push("");
  }

  if (terminal) {
    lines.push(
      `${stale ? "last known terminal" : "terminal"}: ${terminal.ok ? "settled successfully" : terminal.status}`,
    );
    if (terminal.failureKind) lines.push(`failure: ${terminal.failureKind}`);
    if (terminal.effectDisposition) {
      lines.push(`last ASC dispatch effect disposition: ${terminal.effectDisposition}`);
    }
    if (!stale && !shared) {
      lines.push(countdown(terminal.ok ? SUCCESS_HOLD_MS : FAILURE_HOLD_MS, terminalSeenAt, now));
    }
  } else if (!stale && !controllerAlive) {
    lines.push("The controller is inactive. No cancellation or effect conclusion is inferred.");
    lines.push(countdown(DISCONNECTED_HOLD_MS, disconnectedSeenAt, now));
  } else if (!stale) {
    lines.push("Progress state is observational only; ASC owns execution and effect receipts.");
  }

  if (!stale) lines.push("Closing this tab does not cancel the agent.");
  return lines.join("\n");
}

function countdown(hold, seenAt, now) {
  return `observer closes in: ${Math.ceil(Math.max(0, hold - (now - (seenAt ?? now))) / 1000)}s`;
}

function normalizeActiveDispatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    dispatchId: optionalLine(value.dispatchId, 160),
    attemptId: optionalLine(value.attemptId, 160),
    profile: optionalLine(value.profile, 120),
    latestTool: optionalLine(value.latestTool, 160),
    usage: value.usage,
  };
}

function normalizePhase(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const name = optionalLine(value.name, 120);
  const index = positiveInteger(value.index);
  const count = positiveInteger(value.count);
  if (!name || index === undefined || count === undefined || index > count || count > MAX_PHASES) {
    return undefined;
  }
  return {
    name,
    index,
    count,
    status: isRuntimeStatus(value.status) ? value.status : "error",
    agent: optionalLine(value.agent, 120),
    cognitiveTool: optionalLine(value.cognitiveTool, 120),
    elapsedMs: numberOrUndefined(value.elapsedMs),
    failureKind: optionalLine(value.failureKind, 120),
    effectDisposition: normalizeEffectDisposition(value.effectDisposition),
  };
}

function normalizeTerminal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (typeof value.ok !== "boolean") return undefined;
  return {
    ok: value.ok,
    status: isTerminalStatus(value.status) ? value.status : "error",
    failureKind: optionalLine(value.failureKind, 120),
    effectDisposition: normalizeEffectDisposition(value.effectDisposition),
  };
}

function renderUsage(usage) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return undefined;
  const turns = numberOrUndefined(usage.turns);
  const input = numberOrUndefined(usage.input);
  const output = numberOrUndefined(usage.output);
  if (turns === undefined && input === undefined && output === undefined) return undefined;
  return `usage: ${turns ?? 0} turns · ${input ?? 0} input · ${output ?? 0} output`;
}

function readPrivateState(path) {
  const parent = lstatSync(dirname(path));
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    (parent.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && parent.uid !== process.getuid())
  ) {
    throw new Error("state directory is not private and owned");
  }

  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let text;
  let size;
  try {
    const stat = fstatSync(descriptor);
    size = stat.size;
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      size <= 0 ||
      size > MAX_STATE_BYTES ||
      (typeof process.getuid === "function" && stat.uid !== process.getuid())
    )
      throw new Error("state file is not a bounded private owned regular file");
    if ((stat.mode & 0o777) !== 0o600)
      throw new Error("state file is not private (expected mode 0600)");
    const buffer = Buffer.alloc(stat.size + 1);
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytes !== stat.size) throw new Error("state size changed during bounded read");
    text = buffer.subarray(0, bytes).toString("utf8");
  } finally {
    closeSync(descriptor);
  }
  const state = JSON.parse(text);
  if (state?.schema === SESSION_SCHEMA) {
    if (
      typeof state.sessionId !== "string" ||
      !Array.isArray(state.groups) ||
      state.groups.length > 128 ||
      !state.groups.every(
        (group) =>
          validGroup(group) &&
          group.controllerInstanceId === state.controllerInstanceId &&
          group.ownerPid === state.ownerPid,
      )
    )
      throw new Error("session state schema is not supported");
  } else if (size > 64 * 1024 || !validGroup(state)) {
    throw new Error("group state schema is not supported");
  }
  if (
    typeof state.controllerInstanceId !== "string" ||
    !Number.isSafeInteger(state.ownerPid) ||
    state.ownerPid <= 0 ||
    !Number.isFinite(Date.parse(state.createdAt)) ||
    !Number.isFinite(Date.parse(state.updatedAt))
  ) {
    throw new Error("state schema is not supported");
  }
  return state;
}

function validGroup(state) {
  return (
    state?.schema === STATE_SCHEMA &&
    typeof state.group?.label === "string" &&
    Array.isArray(state.phases) &&
    state.phases.length <= MAX_PHASES
  );
}

function parseArguments(args) {
  const argument = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const candidatePath = argument("--state");
  const candidateInstance = argument("--controller-instance");
  if (
    !candidatePath ||
    !isAbsolute(candidatePath) ||
    !candidateInstance ||
    candidateInstance.length > 80 ||
    singleLine(candidateInstance, 80) !== candidateInstance
  ) {
    process.stderr.write("Invalid --state or --controller-instance arguments\n");
    process.exit(2);
  }
  const sessionId = argument("--session-id");
  const startupToken = argument("--startup-token");
  const startupReceiptPath = argument("--startup-receipt");
  if (
    args.includes("--session-id") &&
    (!sessionId ||
      sessionId.length > 160 ||
      singleLine(sessionId, 160) !== sessionId ||
      !/^[a-f0-9-]{36}$/.test(startupToken ?? "") ||
      startupReceiptPath !== `${resolve(candidatePath)}.startup.json`)
  ) {
    process.stderr.write("Invalid session startup arguments\n");
    process.exit(2);
  }
  return {
    statePath: resolve(candidatePath),
    controllerInstanceId: candidateInstance,
    sessionId,
    startupToken,
    startupReceiptPath,
  };
}

function processAlive(pid, expectedStart) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return expectedStart === undefined || processStart(pid) === expectedStart;
  } catch {
    return false;
  }
}

function positiveEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeEffectDisposition(value) {
  return isEffectDisposition(value) ? value : undefined;
}

function optionalLine(value, maxChars) {
  return typeof value === "string" ? singleLine(value, maxChars) || undefined : undefined;
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${rest}s`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

function singleLine(value, maxChars) {
  return sanitizeSingleLine(String(value).slice(0, maxChars));
}

function shutdown() {
  clearInterval(timer);
  process.stdout.write("\u001b[0m");
  process.exit(0);
}

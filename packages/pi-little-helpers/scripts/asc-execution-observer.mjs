#!/usr/bin/env node
// Read-only renderer for private pi.asc_execution_observer_state.v1 snapshots.

import { closeSync, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const STATE_SCHEMA = "pi.asc_execution_observer_state.v1";
const MAX_STATE_BYTES = 64 * 1024;
const MAX_PHASES = 64;
const POLL_MS = 500;
const LIVENESS_LEASE_MS = positiveEnv("PI_ASC_OBSERVER_LIVENESS_LEASE_MS", 15_000);
const QUIET_AFTER_MS = positiveEnv("PI_ASC_OBSERVER_QUIET_MS", 60_000);
const STALLED_AFTER_MS = positiveEnv("PI_ASC_OBSERVER_STALLED_MS", 5 * 60_000);
const SUCCESS_HOLD_MS = positiveEnv("PI_ASC_OBSERVER_SUCCESS_HOLD_MS", 15_000);
const FAILURE_HOLD_MS = positiveEnv("PI_ASC_OBSERVER_FAILURE_HOLD_MS", 60_000);
const DISCONNECTED_HOLD_MS = positiveEnv("PI_ASC_OBSERVER_DISCONNECTED_HOLD_MS", 30_000);

const { statePath, controllerInstanceId } = parseArguments(process.argv.slice(2));
let terminalSeenAt;
let disconnectedSeenAt;
let unavailableSeenAt;
let lastRendered = "";

const timer = setInterval(tick, POLL_MS);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);
await tick();
await new Promise((resolvePromise) => {
  process.once("exit", resolvePromise);
});

async function tick() {
  try {
    const state = readPrivateState(statePath);
    if (state.controllerInstanceId !== controllerInstanceId) {
      shutdown();
      return;
    }
    unavailableSeenAt = undefined;
    const controllerAlive = state.controllerActive === true && processAlive(state.ownerPid);
    const now = Date.now();
    const rendered = renderState(state, now, controllerAlive);
    if (rendered !== lastRendered) {
      process.stdout.write(`\u001b[2J\u001b[H${rendered}\n`);
      lastRendered = rendered;
    }

    if (state.terminal) {
      terminalSeenAt ??= now;
      const holdMs = state.terminal.ok ? SUCCESS_HOLD_MS : FAILURE_HOLD_MS;
      if (now - terminalSeenAt >= holdMs) shutdown();
      return;
    }
    terminalSeenAt = undefined;

    if (!controllerAlive) {
      disconnectedSeenAt ??= now;
      if (now - disconnectedSeenAt >= DISCONNECTED_HOLD_MS) shutdown();
    } else {
      disconnectedSeenAt = undefined;
    }
  } catch (error) {
    const now = Date.now();
    unavailableSeenAt ??= now;
    const message = error instanceof Error ? error.message : String(error);
    const rendered = [
      "ASC execution observer",
      "",
      "state: unavailable",
      `reason: ${singleLine(message, 180)}`,
      "",
      "Execution may still be running. This observer is not execution authority.",
      "Closing this tab does not cancel work.",
    ].join("\n");
    if (rendered !== lastRendered) {
      process.stdout.write(`\u001b[2J\u001b[H${rendered}\n`);
      lastRendered = rendered;
    }
    if (now - unavailableSeenAt >= DISCONNECTED_HOLD_MS) shutdown();
  }
}

function renderState(state, now, controllerAlive) {
  const terminal = normalizeTerminal(state.terminal);
  const observationAt = numberOrUndefined(state.lastObservationAt) ?? Date.parse(state.updatedAt);
  const heartbeatAgeMs = Number.isFinite(observationAt)
    ? Math.max(0, now - observationAt)
    : undefined;
  const activityAt = numberOrUndefined(state.lastActivityAt) ?? Date.parse(state.updatedAt);
  const quietForMs = Number.isFinite(activityAt) ? Math.max(0, now - activityAt) : undefined;
  const livenessLeaseExpired =
    controllerAlive && heartbeatAgeMs !== undefined && heartbeatAgeMs >= LIVENESS_LEASE_MS;
  const supervision = terminal
    ? terminal.ok
      ? "complete"
      : "terminal failure"
    : !controllerAlive
      ? "controller disconnected"
      : livenessLeaseExpired
        ? "telemetry lease expired — execution truth remains ASC"
        : quietForMs === undefined || quietForMs < QUIET_AFTER_MS
          ? "healthy"
          : quietForMs < STALLED_AFTER_MS
            ? "quiet"
            : "suspected stall — inspect before cancelling";
  const groupLabel = singleLine(state.group.label, 120) || "execution";
  const activeDispatch = normalizeActiveDispatch(state.activeDispatch);
  const lines = [
    `ASC execution observer · ${groupLabel}`,
    "═".repeat(Math.min(72, Math.max(24, groupLabel.length + 24))),
    `status: ${normalizeStatus(state.status)}`,
    `supervision: ${supervision}`,
    `elapsed: ${formatDuration(now - Date.parse(state.createdAt))}`,
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
      const icon =
        phase.status === "done"
          ? "✓"
          : phase.status === "running" || phase.status === "spawning"
            ? "▶"
            : "✗";
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
    lines.push(`terminal: ${terminal.ok ? "settled successfully" : terminal.status}`);
    if (terminal.failureKind) lines.push(`failure: ${terminal.failureKind}`);
    if (terminal.effectDisposition) {
      lines.push(`last ASC dispatch effect disposition: ${terminal.effectDisposition}`);
    }
    const remaining = Math.max(
      0,
      (terminal.ok ? SUCCESS_HOLD_MS : FAILURE_HOLD_MS) - (now - (terminalSeenAt ?? now)),
    );
    lines.push(`observer closes in: ${Math.ceil(remaining / 1000)}s`);
  } else if (!controllerAlive) {
    lines.push("The controller is inactive. No cancellation or effect conclusion is inferred.");
    const remaining = Math.max(0, DISCONNECTED_HOLD_MS - (now - (disconnectedSeenAt ?? now)));
    lines.push(`observer closes in: ${Math.ceil(remaining / 1000)}s`);
  } else {
    lines.push("Progress state is observational only; ASC owns execution and effect receipts.");
  }

  lines.push("Closing this tab does not cancel the agent.");
  return lines.join("\n");
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
    status: normalizeStatus(value.status),
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
    status: normalizeTerminalStatus(value.status),
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

  const lstat = lstatSync(path);
  if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.nlink !== 1) {
    throw new Error("state path is not a private regular file");
  }
  if (lstat.size <= 0 || lstat.size > MAX_STATE_BYTES) {
    throw new Error("state file size is outside the observer budget");
  }
  if ((lstat.mode & 0o077) !== 0) throw new Error("state file is not private (expected mode 0600)");
  if (typeof process.getuid === "function" && lstat.uid !== process.getuid()) {
    throw new Error("state file owner does not match observer user");
  }

  const descriptor = openSync(path, "r");
  let text;
  try {
    const stat = fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.dev !== lstat.dev ||
      stat.ino !== lstat.ino ||
      stat.size !== lstat.size
    ) {
      throw new Error("state file changed during verified open");
    }
    text = readFileSync(descriptor, "utf8");
  } finally {
    closeSync(descriptor);
  }
  const state = JSON.parse(text);
  if (
    !state ||
    state.schema !== STATE_SCHEMA ||
    typeof state.group?.label !== "string" ||
    typeof state.controllerInstanceId !== "string" ||
    !Number.isSafeInteger(state.ownerPid) ||
    !Number.isFinite(Date.parse(state.createdAt)) ||
    !Number.isFinite(Date.parse(state.updatedAt)) ||
    !Array.isArray(state.phases) ||
    state.phases.length > MAX_PHASES
  ) {
    throw new Error("state schema is not supported");
  }
  return state;
}

function parseArguments(args) {
  const stateIndex = args.indexOf("--state");
  const instanceIndex = args.indexOf("--controller-instance");
  const candidatePath = stateIndex >= 0 ? args[stateIndex + 1] : undefined;
  const candidateInstance = instanceIndex >= 0 ? args[instanceIndex + 1] : undefined;
  if (
    !candidatePath ||
    !isAbsolute(candidatePath) ||
    !candidateInstance ||
    candidateInstance.length > 80 ||
    singleLine(candidateInstance, 80) !== candidateInstance
  ) {
    process.stderr.write(
      "Usage: asc-execution-observer.mjs --state /absolute/private-state.json --controller-instance <id>\n",
    );
    process.exit(2);
  }
  return {
    statePath: resolve(candidatePath),
    controllerInstanceId: candidateInstance,
  };
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
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

function normalizeStatus(value) {
  return value === "spawning" ||
    value === "running" ||
    value === "done" ||
    value === "error" ||
    value === "timed_out" ||
    value === "aborted"
    ? value
    : "error";
}

function normalizeTerminalStatus(value) {
  return value === "done" || value === "error" || value === "timed_out" || value === "aborted"
    ? value
    : "error";
}

function normalizeEffectDisposition(value) {
  return value === "settled" || value === "confirmed_no_effects" || value === "effect_indeterminate"
    ? value
    : undefined;
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
  let sanitized = "";
  for (const character of String(value).slice(0, maxChars)) {
    const codePoint = character.codePointAt(0) ?? 0;
    sanitized += codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
  }
  return sanitized.replace(/\s+/gu, " ").trim();
}

function shutdown() {
  clearInterval(timer);
  process.stdout.write("\u001b[0m");
  process.exit(0);
}

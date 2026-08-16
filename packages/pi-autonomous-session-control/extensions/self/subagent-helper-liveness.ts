import type { ChildProcess } from "node:child_process";
import { getProcessStartTicks } from "./subagent-session-status.ts";

const CHILD_FORCE_KILL_GRACE_MS = 250;
const HELPER_FORCE_EXIT_GRACE_MS = 400;
const DEFAULT_BACKPRESSURE_TIMEOUT_MS = 60_000;
const PARENT_LIVENESS_POLL_MS = 1_000;

export interface SubagentHelperLivenessController {
  writeProtocolLine(line: string): void;
  writeDiagnosticChunk(chunk: string): void;
  markTransportReady(): void;
  start(): void;
  handleChildClose(code: number | null, signal: NodeJS.Signals | null): void;
  handleChildError(): void;
  handleHelperFailure(exitCode?: number): void;
}

export function createSubagentHelperLivenessController(options: {
  child: ChildProcess;
  startupTimeoutMs: number;
  executionTimeoutMs: number;
  cleanupSync: () => void;
  parentPid?: number;
  parentPidStartedAt?: number;
  backpressureTimeoutMs?: number;
}): SubagentHelperLivenessController {
  const { child } = options;
  let childExited = false;
  let childStopRequested = false;
  let terminationSignal: NodeJS.Signals | undefined;
  let childForceKillHandle: ReturnType<typeof setTimeout> | null = null;
  let helperDeadlineHandle: ReturnType<typeof setTimeout> | null = null;
  let helperForceExitHandle: ReturnType<typeof setTimeout> | null = null;
  let backpressureTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let parentLivenessHandle: ReturnType<typeof setInterval> | null = null;
  let helperDeadlineExpired = false;
  let forcedExitCode: number | undefined;
  let stdoutBackpressured = false;
  let stderrBackpressured = false;

  const clearChildForceKill = () => {
    if (!childForceKillHandle) return;
    clearTimeout(childForceKillHandle);
    childForceKillHandle = null;
  };

  const clearHelperDeadline = () => {
    if (!helperDeadlineHandle) return;
    clearTimeout(helperDeadlineHandle);
    helperDeadlineHandle = null;
  };

  const clearHelperForceExit = () => {
    if (!helperForceExitHandle) return;
    clearTimeout(helperForceExitHandle);
    helperForceExitHandle = null;
  };

  const clearBackpressureTimeout = () => {
    if (!backpressureTimeoutHandle) return;
    clearTimeout(backpressureTimeoutHandle);
    backpressureTimeoutHandle = null;
  };

  const clearParentLiveness = () => {
    if (!parentLivenessHandle) return;
    clearInterval(parentLivenessHandle);
    parentLivenessHandle = null;
  };

  const scheduleHelperForceExit = (exitCode: number) => {
    forcedExitCode ??= exitCode;
    if (helperForceExitHandle) return;
    helperForceExitHandle = setTimeout(() => {
      options.cleanupSync();
      process.exit(forcedExitCode ?? exitCode);
    }, HELPER_FORCE_EXIT_GRACE_MS);
  };

  const killRawChild = (signal: NodeJS.Signals) => {
    try {
      if (process.platform !== "win32" && typeof child.pid === "number" && child.pid > 0) {
        process.kill(-child.pid, signal);
        return;
      }
      child.kill(signal);
    } catch {
      // Best effort raw-child group shutdown.
    }
  };

  const requestChildStop = (signal: NodeJS.Signals) => {
    terminationSignal = signal;
    if (childExited || childStopRequested) return;
    childStopRequested = true;
    killRawChild("SIGTERM");
    childForceKillHandle = setTimeout(() => {
      if (!childExited) killRawChild("SIGKILL");
    }, CHILD_FORCE_KILL_GRACE_MS);
    childForceKillHandle.unref?.();
  };

  const stopForHelperFailure = (exitCode: number) => {
    requestChildStop("SIGTERM");
    scheduleHelperForceExit(exitCode);
  };

  const parentIdentityIsLive = () => {
    const parentPid = options.parentPid;
    const parentPidStartedAt = options.parentPidStartedAt;
    if (
      !Number.isSafeInteger(parentPid) ||
      (parentPid as number) <= 0 ||
      !Number.isSafeInteger(parentPidStartedAt) ||
      (parentPidStartedAt as number) < 0
    ) {
      return true;
    }
    try {
      process.kill(parentPid as number, 0);
    } catch (error) {
      return getErrorCode(error) !== "ESRCH";
    }
    const currentStartedAt = getProcessStartTicks(parentPid as number);
    return currentStartedAt === null || currentStartedAt === parentPidStartedAt;
  };

  const startParentLivenessMonitor = () => {
    if (parentLivenessHandle) return;
    parentLivenessHandle = setInterval(() => {
      if (!parentIdentityIsLive()) stopForHelperFailure(125);
    }, PARENT_LIVENESS_POLL_MS);
    parentLivenessHandle.unref?.();
  };

  const armBackpressureTimeout = () => {
    if (backpressureTimeoutHandle) return;
    const timeoutMs = options.backpressureTimeoutMs ?? DEFAULT_BACKPRESSURE_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return;
    backpressureTimeoutHandle = setTimeout(() => {
      stopForHelperFailure(125);
    }, timeoutMs);
    backpressureTimeoutHandle.unref?.();
  };

  const clearBackpressureWhenDrained = () => {
    if (!stdoutBackpressured && !stderrBackpressured) clearBackpressureTimeout();
  };

  const armDeadline = (timeoutMs: number) => {
    clearHelperDeadline();
    if (timeoutMs <= 0) return;
    helperDeadlineHandle = setTimeout(() => {
      helperDeadlineExpired = true;
      requestChildStop("SIGTERM");
      scheduleHelperForceExit(124);
    }, timeoutMs);
  };

  process.once("SIGTERM", () => {
    requestChildStop("SIGTERM");
    scheduleHelperForceExit(143);
  });
  process.once("SIGINT", () => {
    requestChildStop("SIGINT");
    scheduleHelperForceExit(130);
  });
  process.once("exit", () => {
    clearChildForceKill();
    clearHelperDeadline();
    clearBackpressureTimeout();
    clearParentLiveness();
    options.cleanupSync();
    if (!childExited) killRawChild("SIGKILL");
  });
  process.stdout.on("drain", () => {
    stdoutBackpressured = false;
    clearBackpressureWhenDrained();
    child.stdout?.resume();
    if (childExited && !helperDeadlineExpired && !stderrBackpressured) clearHelperForceExit();
  });
  process.stdout.on("error", () => {
    requestChildStop("SIGTERM");
    scheduleHelperForceExit(1);
  });
  process.stderr.on("drain", () => {
    stderrBackpressured = false;
    clearBackpressureWhenDrained();
    child.stderr?.resume();
    if (childExited && !helperDeadlineExpired && !stdoutBackpressured) clearHelperForceExit();
  });
  process.stderr.on("error", () => {
    requestChildStop("SIGTERM");
    scheduleHelperForceExit(1);
  });

  const finish = (exitCode: number) => {
    childExited = true;
    clearChildForceKill();
    clearHelperDeadline();
    clearBackpressureTimeout();
    clearParentLiveness();
    process.exitCode = forcedExitCode ?? exitCode;
    if (
      stdoutBackpressured ||
      stderrBackpressured ||
      process.stdout.writableNeedDrain ||
      process.stderr.writableNeedDrain
    ) {
      scheduleHelperForceExit(process.exitCode);
    }
  };

  return {
    writeProtocolLine(line) {
      try {
        if (!process.stdout.write(line)) {
          stdoutBackpressured = true;
          child.stdout?.pause();
          armBackpressureTimeout();
        }
      } catch {
        requestChildStop("SIGTERM");
        scheduleHelperForceExit(1);
      }
    },
    writeDiagnosticChunk(chunk) {
      try {
        if (!process.stderr.write(chunk)) {
          stderrBackpressured = true;
          child.stderr?.pause();
          armBackpressureTimeout();
        }
      } catch {
        requestChildStop("SIGTERM");
        scheduleHelperForceExit(1);
      }
    },
    markTransportReady() {
      armDeadline(options.executionTimeoutMs);
    },
    start() {
      startParentLivenessMonitor();
      armDeadline(options.startupTimeoutMs);
    },
    handleChildClose(code, signal) {
      // The supervisor tears down its own complete group while it is still the live leader.
      finish(signalToExitCode(terminationSignal) ?? code ?? signalToExitCode(signal) ?? 0);
    },
    handleChildError() {
      finish(signalToExitCode(terminationSignal) ?? 1);
    },
    handleHelperFailure(exitCode = 1) {
      stopForHelperFailure(exitCode);
    },
  };
}

function getErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as NodeJS.ErrnoException).code ?? "")
    : "";
}

function signalToExitCode(signal: NodeJS.Signals | null | undefined): number | undefined {
  switch (signal) {
    case "SIGINT":
      return 130;
    case "SIGTERM":
      return 143;
    default:
      return undefined;
  }
}
